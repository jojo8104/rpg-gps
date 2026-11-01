import test from "node:test";
import assert from "node:assert/strict";
import { BattleEngine } from "../app/js/core/battle-engine.js";
import {
  refreshTacticalOptions,
  submitTacticalChoice,
  lockTacticalChoice,
  aiTacticalChoice,
} from "../app/js/core/battle-tactics.js";
import { duelPlayerView } from "../app/js/core/battle-duel/state.js";
import { setArmyFormation } from "../app/js/core/army-formation.js";
import { Unit } from "../app/js/core/unit.js";
import { renderTacticalBattleView } from "../app/js/ui/tactical-battle-view.js";
import {
  spawnTacticalBonus,
  collectTacticalBonus,
  tacticalBuff,
  tacticalBonusLoot,
} from "../app/js/core/tactical-bonuses.js";
import {
  attackValue,
  techniqueBonuses,
} from "../app/js/core/battle-duel/resolver.js";
import {
  combatModifiers,
  attackRange,
  terrainSpeed,
} from "../app/js/core/tactical-terrain-rules.js";

function fixture({ command = 3 } = {}) {
  const battle = new BattleEngine({
    id: "tactical",
    config: { tactical: true, humanPlayerIds: ["p-a", "p-b"] },
    teams: ["a", "b"].map((id) => ({
      id,
      heroes: [
        {
          id: `hero-${id}`,
          playerId: `p-${id}`,
          health: 100,
          maxHealth: 100,
          attack: 3,
          defense: 10,
          tacticalCommand: command,
        },
      ],
      units: [0, 1, 2].map((index) => ({
        id: `${id}${index}`,
        playerId: `p-${id}`,
        typeId:
          index === 1 ? "archer" : index === 2 ? "light-cavalry" : "militia",
        quantity: 5,
        maxQuantity: 5,
        healthPerSoldier: 10,
        combatHealthThreshold: 4,
        attack: 3,
        defense: 10,
        morale: 10,
        range: index === 1 ? 3 : 1,
        battleSlot: index === 2 ? null : index,
      })),
    })),
  });
  battle.start(0);
  battle.duel.tactics.battlefield.terrainEffectsEnabled = false;
  refreshTacticalOptions(battle.duel);
  battle.duel.encounter.terrain = { id: "PLAIN", label: "Plaine" };
  battle.duel.encounter.weather = { id: "DRY", label: "Temps sec" };
  return battle;
}
function turn(battle, a = [], b = []) {
  battle.submitDuelChoice("a", { orders: a });
  battle.lockDuelChoice("a", 1000);
  battle.submitDuelChoice("b", { orders: b });
  battle.lockDuelChoice("b", 1000);
  return battle.duel;
}
function positions(battle, values) {
  Object.assign(battle.duel.tactics.positions, values);
  refreshTacticalOptions(battle.duel);
}

function flatBattle() {
  const battle = fixture();
  battle.duel.tactics.battlefield.terrainEffectsEnabled = true;
  for (const row of battle.duel.tactics.battlefield.cells)
    for (const cell of row) {
      cell.terrain = "grass";
      cell.structure = null;
    }
  refreshTacticalOptions(battle.duel);
  return battle;
}

test("le rapport fournit les pertes individuelles avant retrait des unités, sans calcul dans la vue", () => {
  const battle = flatBattle();
  positions(battle, { a0: { x: 0, y: 3 }, b0: { x: 0, y: 2 } });
  battle.duel.troops.find((actor) => actor.id === "a0").attack = 999;
  const before = structuredClone(
    battle.duel.troops.find((actor) => actor.id === "b0"),
  );
  turn(battle, [{ actorId: "a0", type: "ATTACK", targetId: "b0" }]);
  const loss = battle.duel.lastResult.steps[0].events.find(
    (event) => event.type === "loss" && event.actorId === "b0",
  );
  assert.equal(loss.dead, 5);
  assert.equal(loss.wounded, 0);
  assert.equal(
    loss.healthLost,
    before.soldierHealth.reduce((sum, value) => sum + value, 0),
  );
  assert.deepEqual(loss.to, { x: 0, y: 2 });
});

test("la vue compacte garde la validation en haut, une notice et les repères d'ordres sans panneaux textuels", () => {
  const battle = flatBattle();
  battle.duel.encounter.terrain = { id: "RIVER", label: "Rivière" };
  const element = {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  renderTacticalBattleView({
    element,
    battle,
    teamId: "a",
    orders: [{ actorId: "a0", type: "MOVE", to: { x: 0, y: 3 } }],
    selected: "a0",
    message: "",
    fanOpen: false,
  });
  assert.ok(!element.innerHTML.includes("tactics-resolution"));
  assert.ok(!element.innerHTML.includes("tactics-order-list"));
  assert.ok(!element.innerHTML.includes("Rivière"));
  assert.ok(element.innerHTML.includes("data-tactics-info"));
  assert.ok(
    element.innerHTML.indexOf("data-tactics-lock") <
      element.innerHTML.indexOf('class="tactics-map'),
  );
  assert.ok(element.innerHTML.includes('class="tactics-priority">1</b>'));
});

test("case contestée : le seul survivant occupe la destination et capture son bonus", () => {
  const battle = flatBattle();
  positions(battle, { a0: { x: 0, y: 3 }, b0: { x: 0, y: 1 } });
  battle.duel.troops.find((actor) => actor.id === "a0").attack = 999;
  battle.duel.tactics.bonuses.pickup = {
    id: "test",
    type: "DEFENSE",
    position: { x: 0, y: 2 },
  };
  turn(
    battle,
    [{ actorId: "a0", type: "MOVE", to: { x: 0, y: 2 } }],
    [{ actorId: "b0", type: "MOVE", to: { x: 0, y: 2 } }],
  );
  assert.deepEqual(battle.duel.tactics.positions.a0, { x: 0, y: 2 });
  assert.equal(battle.duel.tactics.positions.b0, undefined);
  assert.equal(battle.duel.tactics.bonuses.pickup, null);
  assert.equal(tacticalBuff(battle.duel, "a0", "DEFENSE"), 1.2);
  assert.ok(
    battle.duel.lastResult.steps[0].events.some(
      (event) => event.type === "advance" && event.contested,
    ),
  );
});

test("case contestée : deux survivants ou deux pertes laissent la case et son bonus libres", () => {
  for (const lethal of [false, true]) {
    const battle = flatBattle();
    positions(battle, { a0: { x: 0, y: 3 }, b0: { x: 0, y: 1 } });
    for (const actor of battle.duel.troops.filter((actor) =>
      ["a0", "b0"].includes(actor.id),
    ))
      actor.attack = lethal ? 999 : 3;
    battle.duel.tactics.bonuses.pickup = {
      id: "test",
      type: "MORALE",
      position: { x: 0, y: 2 },
    };
    turn(
      battle,
      [{ actorId: "a0", type: "MOVE", to: { x: 0, y: 2 } }],
      [{ actorId: "b0", type: "MOVE", to: { x: 0, y: 2 } }],
    );
    assert.ok(
      !Object.values(battle.duel.tactics.positions).some(
        (p) => p.x === 0 && p.y === 2,
      ),
    );
    assert.ok(battle.duel.tactics.bonuses.pickup);
    assert.deepEqual(
      battle.duel.tactics.positions.a0,
      lethal ? undefined : { x: 0, y: 3 },
    );
    assert.deepEqual(
      battle.duel.tactics.positions.b0,
      lethal ? undefined : { x: 0, y: 1 },
    );
  }
});

test("case contestée : terrain de destination et vitesse de déplacement s'appliquent aux deux combattants", () => {
  const battle = flatBattle(),
    state = battle.duel;
  state.tactics.battlefield.cells[2][0].terrain = "hill";
  const a = state.troops.find((actor) => actor.id === "a0"),
    b = state.troops.find((actor) => actor.id === "b0");
  for (const actor of [a, b]) {
    actor.attack = 10;
    actor.defense = 5;
    actor.speed = 8;
  }
  positions(battle, { a0: { x: 0, y: 3 }, b0: { x: 0, y: 1 } });
  const expected = attackValue(
    { ...a, speed: 6 },
    { ...b, speed: 6 },
    "ATTACK",
    "ATTACK",
    state.encounter,
    0,
    1,
    false,
    1.15,
  );
  turn(
    battle,
    [{ actorId: "a0", type: "MOVE", to: { x: 0, y: 2 } }],
    [{ actorId: "b0", type: "MOVE", to: { x: 0, y: 2 } }],
  );
  const hits = battle.duel.lastResult.steps[0].events.filter(
    (event) => event.type === "attack",
  );
  assert.equal(hits.length, 2);
  assert.ok(
    hits.every(
      (event) =>
        event.damage === expected && event.to.x === 0 && event.to.y === 2,
    ),
  );
});

test("un trajet de charge déjà obstrué ne conteste pas la destination d'un mouvement valide", () => {
  const battle = flatBattle();
  positions(battle, {
    a2: { x: 0, y: 4 },
    a0: { x: 0, y: 3 },
    b0: { x: 0, y: 1 },
  });
  turn(
    battle,
    [{ actorId: "a2", type: "CHARGE", to: { x: 0, y: 2 } }],
    [{ actorId: "b0", type: "MOVE", to: { x: 0, y: 2 } }],
  );
  assert.deepEqual(battle.duel.tactics.positions.b0, { x: 0, y: 2 });
  assert.deepEqual(battle.duel.tactics.positions.a2, { x: 0, y: 4 });
  assert.equal(
    battle.duel.lastResult.steps[0].events.some(
      (event) => event.type === "contest",
    ),
    false,
  );
});

test("bonus : apparition reproductible sur une case centrale libre, PvP sans XP ni objet", () => {
  const a = flatBattle(),
    b = flatBattle();
  assert.deepEqual(a.duel.tactics.bonuses, b.duel.tactics.bonuses);
  const pickup = a.duel.tactics.bonuses.pickup;
  assert.ok(pickup.position.y >= 1 && pickup.position.y <= 3);
  assert.ok(!["ITEM", "XP"].includes(pickup.type));
  const before = structuredClone(pickup);
  a.duel.round = 4;
  spawnTacticalBonus(a.duel);
  assert.deepEqual(a.duel.tactics.bonuses.pickup, before);
  assert.deepEqual(
    new BattleEngine(a.toJSON()).duel.tactics.bonuses,
    a.duel.tactics.bonuses,
  );
});

test("bonus : capture à l'arrivée, pas de cumul et expiration après le tour suivant", () => {
  const battle = flatBattle(),
    state = battle.duel;
  state.tactics.bonuses.pickup = {
    id: "test",
    type: "ATTACK",
    position: { x: 0, y: 3 },
  };
  turn(battle, [{ actorId: "a0", type: "MOVE", to: { x: 0, y: 3 } }]);
  assert.equal(battle.duel.tactics.bonuses.pickup, null);
  assert.equal(tacticalBuff(battle.duel, "a0", "ATTACK"), 1.2);
  assert.ok(
    battle.duel.lastResult.steps[0].events.some(
      (event) => event.type === "pickup",
    ),
  );
  const clone = structuredClone(battle.duel);
  clone.tactics.bonuses.pickup = {
    id: "other",
    type: "ATTACK",
    position: { x: 0, y: 3 },
  };
  collectTacticalBonus(
    clone,
    [clone.troops.find((actor) => actor.id === "a0")],
    [{ type: "move", actorId: "a0" }],
  );
  assert.equal(tacticalBuff(clone, "a0", "ATTACK"), 1.2);
  turn(battle);
  assert.equal(battle.duel.round, 3);
  assert.equal(tacticalBuff(battle.duel, "a0", "ATTACK"), 1);
});

test("bonus : le harcèlement ne capture pas, le moral est plafonné et les gains permanents restent différés", () => {
  const battle = flatBattle(),
    state = battle.duel;
  const actor = state.troops.find((entry) => entry.id === "a0");
  state.tactics.positions.a0 = { x: 0, y: 3 };
  state.tactics.bonuses.pickup = {
    id: "morale",
    type: "MORALE",
    position: { x: 0, y: 3 },
  };
  collectTacticalBonus(
    state,
    [actor],
    [{ type: "move", actorId: "a0", harassment: true }],
  );
  assert.ok(state.tactics.bonuses.pickup);
  actor.morale = 9;
  collectTacticalBonus(state, [actor], [{ type: "move", actorId: "a0" }]);
  assert.equal(actor.morale, 10);
  state.tactics.bonuses.rewardTeams = ["a"];
  state.tactics.bonuses.pickup = {
    id: "xp",
    type: "XP",
    position: { x: 0, y: 3 },
  };
  collectTacticalBonus(state, [actor], [{ type: "move", actorId: "a0" }]);
  assert.equal(state.players[0].spoils.xp, 10);
  state.tactics.bonuses.pickup = {
    id: "item",
    type: "ITEM",
    position: { x: 0, y: 3 },
  };
  collectTacticalBonus(state, [actor], [{ type: "move", actorId: "a0" }]);
  assert.equal(tacticalBonusLoot(battle).length, 0);
  battle.state.winnerTeamId = "a";
  assert.equal(tacticalBonusLoot(battle)[0].itemId, "iron_sword");
});

test("mur de lances : spécialité réservée, bonus renforcés, riposte et immobilisation après victoire", () => {
  const battle = flatBattle(),
    state = battle.duel;
  const spear = state.troops.find((actor) => actor.id === "a0"),
    horse = state.troops.find((actor) => actor.id === "b2");
  spear.typeId = "spearman";
  spear.attack = 999;
  positions(battle, { a0: { x: 1, y: 3 }, b2: { x: 1, y: 2 } });
  assert.ok(state.tactics.options.a0.specials.includes("SPEAR_WALL"));
  assert.throws(() =>
    submitTacticalChoice(state, "a", {
      orders: [{ actorId: "a1", type: "SPEAR_WALL" }],
    }),
  );
  const normal = combatModifiers(
    state,
    horse,
    spear,
    { x: 1, y: 2 },
    { x: 1, y: 3 },
    "ATTACK",
    "DEFEND",
  );
  const wall = combatModifiers(
    state,
    horse,
    spear,
    { x: 1, y: 2 },
    { x: 1, y: 3 },
    "ATTACK",
    "SPEAR_WALL",
  );
  assert.equal(normal.defense, 1.5);
  assert.equal(wall.defense, 2);
  assert.equal(
    combatModifiers(
      state,
      spear,
      horse,
      { x: 1, y: 3 },
      { x: 1, y: 2 },
      "SPEAR_WALL",
      "ATTACK",
    ).damage,
    1.5,
  );
  turn(
    battle,
    [{ actorId: "a0", type: "SPEAR_WALL" }],
    [{ actorId: "b2", type: "ATTACK", targetId: "a0" }],
  );
  assert.ok(
    battle.duel.lastResult.steps[0].events.some(
      (event) => event.type === "attack" && event.actorId === "a0",
    ),
  );
  assert.equal(battle.duel.tactics.positions.b2, undefined);
  assert.deepEqual(battle.duel.tactics.positions.a0, { x: 1, y: 3 });
  assert.equal(
    battle.duel.lastResult.steps[0].events.some(
      (event) => event.type === "advance" && event.actorId === "a0",
    ),
    false,
  );
});

test("infanterie lourde : protection contre les tirs, eau interdite et pont accessible", () => {
  const battle = flatBattle(),
    state = battle.duel;
  const heavy = state.troops.find((actor) => actor.id === "a0"),
    archer = state.troops.find((actor) => actor.id === "b1");
  heavy.typeId = "heavy-infantry";
  state.tactics.battlefield.cells[3][0].terrain = "water";
  refreshTacticalOptions(state);
  assert.equal(
    state.tactics.options.a0.move.some((p) => p.x === 0 && p.y === 3),
    false,
  );
  assert.throws(() =>
    submitTacticalChoice(state, "a", {
      orders: [{ actorId: "a0", type: "MOVE", to: { x: 0, y: 3 } }],
    }),
  );
  assert.equal(
    combatModifiers(
      state,
      archer,
      heavy,
      { x: 1, y: 0 },
      { x: 0, y: 4 },
      "ATTACK",
      "DEFEND",
    ).defense,
    1.5,
  );
  state.tactics.battlefield.cells[3][0].structure = { kind: "bridge" };
  refreshTacticalOptions(state);
  assert.ok(state.tactics.options.a0.move.some((p) => p.x === 0 && p.y === 3));
  turn(battle, [{ actorId: "a0", type: "MOVE", to: { x: 0, y: 3 } }]);
  assert.deepEqual(battle.duel.tactics.positions.a0, { x: 0, y: 3 });
});

test("infanterie lourde : une victoire contre un défenseur dans l'eau ne provoque pas d'entrée interdite", () => {
  const battle = flatBattle(),
    state = battle.duel;
  const heavy = state.troops.find((actor) => actor.id === "a0");
  heavy.typeId = "heavy-infantry";
  heavy.attack = 999;
  state.tactics.battlefield.cells[2][1].terrain = "water";
  positions(battle, { a0: { x: 1, y: 3 }, b0: { x: 1, y: 2 } });
  turn(battle, [{ actorId: "a0", type: "ATTACK", targetId: "b0" }]);
  assert.equal(battle.duel.tactics.positions.b0, undefined);
  assert.deepEqual(battle.duel.tactics.positions.a0, { x: 1, y: 3 });
});

test("épéiste : déplacement diagonal et bonus d'assaut des villes, barricades et tours", () => {
  const battle = flatBattle(),
    state = battle.duel;
  const sword = state.troops.find((actor) => actor.id === "a0"),
    target = state.troops.find((actor) => actor.id === "b0");
  sword.typeId = "swordsman";
  positions(battle, { a0: { x: 0, y: 3 } });
  assert.ok(state.tactics.options.a0.move.some((p) => p.x === 1 && p.y === 2));
  for (const kind of ["village", "barricade", "tower"]) {
    state.tactics.battlefield.cells[2][1].structure = { kind };
    assert.equal(
      combatModifiers(
        state,
        sword,
        target,
        { x: 0, y: 3 },
        { x: 1, y: 2 },
        "ATTACK",
        "DEFEND",
      ).attack,
      1.25,
    );
  }
  assert.equal(
    combatModifiers(
      state,
      sword,
      target,
      { x: 1, y: 2 },
      { x: 0, y: 3 },
      "ATTACK",
      "DEFEND",
    ).attack,
    1,
  );
  turn(battle, [{ actorId: "a0", type: "MOVE", to: { x: 1, y: 2 } }]);
  assert.deepEqual(battle.duel.tactics.positions.a0, { x: 1, y: 2 });
});

test("les terrains difficiles ralentissent uniquement le déplacement et limitent les cavaliers à une case", () => {
  for (const terrain of ["forest", "hill", "rock"]) {
    const battle = flatBattle(),
      state = battle.duel;
    const rider = state.troops.find((actor) => actor.id === "a2");
    rider.speed = 8;
    state.tactics.battlefield.cells[3][1].terrain = terrain;
    positions(battle, { a2: { x: 1, y: 3 } });
    const effective = {
      ...rider,
      speed: terrainSpeed(state, rider, { x: 1, y: 3 }, true),
    };
    assert.equal(effective.speed, 6);
    assert.equal(terrainSpeed(state, rider, { x: 1, y: 3 }), 8);
    assert.deepEqual(
      techniqueBonuses(
        { ...rider, speed: terrainSpeed(state, rider, { x: 1, y: 3 }) },
        "DEFEND",
      ),
      { attack: 0, defense: 8 },
    );
    assert.deepEqual(techniqueBonuses(effective, "ATTACK"), {
      attack: 3,
      defense: 3,
    });
    assert.deepEqual(techniqueBonuses(effective, "DEFEND"), {
      attack: 0,
      defense: 6,
    });
    assert.equal(rider.speed, 8);
    assert.ok(
      state.tactics.options.a2.move.every(
        (p) => Math.max(Math.abs(p.x - 1), Math.abs(p.y - 3)) === 1,
      ),
    );
    assert.equal(state.tactics.options.a2.charge.length, 0);
  }
});

test("l'eau réduit de 75 % la défense technique incluse et un pont supprime ce malus", () => {
  const battle = flatBattle(),
    state = battle.duel;
  const attacker = {
    ...state.troops[0],
    attack: 10,
    speed: 4,
    count: 5,
    morale: 10,
  };
  const target = { ...state.troops[1], defense: 10, speed: 8 };
  const ground = state.tactics.battlefield.cells[2][1];
  ground.terrain = "water";
  let modifiers = combatModifiers(
    state,
    attacker,
    target,
    { x: 1, y: 3 },
    { x: 1, y: 2 },
    "ATTACK",
  );
  assert.equal(modifiers.defense, 0.25);
  const damage = attackValue(
    attacker,
    target,
    "ATTACK",
    "DEFEND",
    state.encounter,
    0,
    1,
    false,
    modifiers.defense,
  );
  const power = (10 + 4 / 2) * 5 * (0.65 + 10 / 20);
  assert.equal(damage, Math.floor((power * 2) / ((10 + 8) * 0.25 + 5)));
  ground.structure = { kind: "bridge" };
  modifiers = combatModifiers(
    state,
    attacker,
    target,
    { x: 1, y: 3 },
    { x: 1, y: 2 },
    "ATTACK",
  );
  assert.equal(modifiers.defense, 1);
});

test("un allié doit partir plus tôt et un déplacement bloqué annule celui qui le suit", () => {
  const battle = flatBattle();
  positions(battle, {
    a0: { x: 0, y: 3 },
    a1: { x: 0, y: 4 },
    b0: { x: 0, y: 2 },
  });
  assert.throws(
    () =>
      submitTacticalChoice(battle.duel, "a", {
        orders: [{ actorId: "a1", type: "MOVE", to: { x: 0, y: 3 } }],
      }),
    /plus tôt/,
  );
  const state = turn(battle, [
    { actorId: "a0", type: "MOVE", to: { x: 0, y: 2 } },
    { actorId: "a1", type: "MOVE", to: { x: 0, y: 3 } },
  ]);
  assert.deepEqual(state.tactics.positions.a1, { x: 0, y: 4 });
  assert.ok(
    state.lastResult.steps[1].events.some(
      (event) => event.type === "blocked" && event.actorId === "a1",
    ),
  );
});

test("les cavaleries se déplacent en diagonale et l'infanterie reste orthogonale", () => {
  const battle = flatBattle();
  positions(battle, { a2: { x: 1, y: 3 }, a0: { x: 0, y: 3 } });
  assert.ok(
    battle.duel.tactics.options.a2.move.some((p) => p.x === 2 && p.y === 2),
  );
  assert.equal(
    battle.duel.tactics.options.a0.move.some((p) => p.x === 1 && p.y === 2),
    false,
  );
  turn(battle, [{ actorId: "a2", type: "MOVE", to: { x: 2, y: 2 } }]);
  assert.deepEqual(battle.duel.tactics.positions.a2, { x: 2, y: 2 });
});

test("un attaquant de mêlée détruit le défenseur et avance, un archer reste sur sa case", () => {
  for (const id of ["a0", "a1"]) {
    const battle = flatBattle();
    positions(battle, { [id]: { x: 1, y: 3 }, b0: { x: 1, y: 2 } });
    battle.duel.troops.find((actor) => actor.id === id).attack = 999;
    turn(battle, [{ actorId: id, type: "ATTACK", targetId: "b0" }]);
    assert.equal(battle.duel.tactics.positions.b0, undefined);
    assert.deepEqual(battle.duel.tactics.positions[id], {
      x: 1,
      y: id === "a0" ? 2 : 3,
    });
  }
});

test("le harcèlement léger fait un aller-retour et provoque une riposte de mêlée", () => {
  const battle = flatBattle();
  positions(battle, { a2: { x: 0, y: 4 }, b0: { x: 1, y: 1 } });
  assert.ok(battle.duel.tactics.options.a2.harass.includes("b0"));
  turn(battle, [{ actorId: "a2", type: "HARASS", targetId: "b0" }]);
  const step = battle.duel.lastResult.steps[0];
  assert.equal(
    step.events.filter((event) => event.type === "attack").length,
    2,
  );
  assert.ok(step.events.some((event) => event.type === "return"));
  assert.deepEqual(battle.duel.tactics.positions.a2, { x: 0, y: 4 });
});

test("les archers montés harcèlent à distance sans riposte de mêlée", () => {
  const battle = flatBattle();
  const rider = battle.duel.troops.find((actor) => actor.id === "a2");
  rider.typeId = "mounted-archer";
  rider.range = 3;
  positions(battle, { a2: { x: 0, y: 4 }, b0: { x: 1, y: 0 } });
  turn(battle, [{ actorId: "a2", type: "HARASS", targetId: "b0" }]);
  const attacks = battle.duel.lastResult.steps[0].events.filter(
    (event) => event.type === "attack",
  );
  assert.equal(attacks.length, 1);
  assert.equal(attacks[0].ranged, true);
  assert.deepEqual(battle.duel.tactics.positions.a2, { x: 0, y: 4 });
});

test("terrain : eau franchissable et exposée, pont protecteur, forêt protégée, tour pour les archers et harcèlement refusé hors plaine", () => {
  const battle = flatBattle(),
    state = battle.duel;
  const ground = state.tactics.battlefield.cells;
  ground[3][0].terrain = "water";
  refreshTacticalOptions(state);
  assert.equal(
    state.tactics.options.a0.move.some((p) => p.x === 0 && p.y === 3),
    true,
  );
  ground[3][0].structure = { kind: "bridge" };
  refreshTacticalOptions(state);
  assert.ok(state.tactics.options.a0.move.some((p) => p.x === 0 && p.y === 3));
  ground[4][1].structure = { kind: "tower" };
  const archer = state.troops.find((actor) => actor.id === "a1");
  assert.equal(attackRange(state, archer, { x: 1, y: 4 }), 4);
  ground[1][0].terrain = "forest";
  const cavalry = state.troops.find((actor) => actor.id === "a2");
  const modifiers = combatModifiers(
    state,
    cavalry,
    archer,
    { x: 0, y: 1 },
    { x: 0, y: 1 },
    "ATTACK",
  );
  assert.equal(modifiers.attack, 0.75);
  assert.equal(modifiers.defense, 1.25);
  positions(battle, { a2: { x: 0, y: 1 }, b0: { x: 1, y: 3 } });
  assert.equal(state.tactics.options.a2.harass.length, 0);
});

test("la résolution fournit des instantanés indépendants avant mouvement et après chaque ordre", () => {
  const battle = fixture();
  const start = structuredClone(battle.duel.tactics.positions);
  const state = turn(battle, [
    { actorId: "a0", type: "MOVE", to: { x: 0, y: 3 } },
  ]);
  const report = state.lastResult;
  assert.deepEqual(report.initial.positions, start);
  assert.deepEqual(report.steps[0].movement.positions.a0, { x: 0, y: 3 });
  assert.deepEqual(report.steps[0].after.positions.a0, { x: 0, y: 3 });
  report.steps[0].movement.positions.a0.y = 0;
  assert.equal(report.steps[0].after.positions.a0.y, 3);
  assert.equal(state.tactics.positions.a0.y, 3);
});

test("la carte officielle reste identique après un tour, une projection et une restauration", () => {
  const battle = fixture();
  const map = structuredClone(battle.duel.tactics.battlefield);
  assert.ok(map);
  turn(battle);
  assert.deepEqual(battle.duel.tactics.battlefield, map);
  assert.deepEqual(duelPlayerView(battle.duel, "a").tactics.battlefield, map);
  assert.deepEqual(duelPlayerView(battle.duel, "b").tactics.battlefield, map);
  assert.deepEqual(
    new BattleEngine(battle.toJSON()).duel.tactics.battlefield,
    map,
  );
});

test("la formation est sérialisée, les réserves restent hors du plateau, le budget suit Commandement", () => {
  const battle = fixture({ command: 8 });
  assert.deepEqual(battle.duel.tactics.positions.a0, { x: 0, y: 4 });
  assert.equal(battle.duel.tactics.positions.a2, undefined);
  assert.equal(battle.duel.players[0].orderBudget, 5);
  assert.equal(fixture({ command: 1 }).duel.players[0].orderBudget, 2);
  assert.deepEqual(new BattleEngine(battle.toJSON()).duel, battle.duel);
  assert.equal(battle.decisionDeadlineAt, 30000);
});

test("le serveur refuse unités adverses, doublons, téléportations, dépassements et charges invalides", () => {
  const state = fixture().duel;
  for (const orders of [
    [{ actorId: "b0", type: "DEFEND" }],
    [
      { actorId: "a0", type: "DEFEND" },
      { actorId: "a0", type: "RALLY" },
    ],
    [{ actorId: "a0", type: "MOVE", to: { x: 0, y: 0 } }],
    [{ actorId: "a0", type: "CHARGE", to: { x: 0, y: 2 } }],
    [{ actorId: "a2", type: "DEPLOY", to: { x: 0, y: 4 } }],
    [{ actorId: "a0", type: "ATTACK", targetId: "b0" }],
    [{ actorId: "a0", type: "ATTACK_BASE" }],
  ])
    assert.throws(() => submitTacticalChoice(state, "a", { orders }));
  assert.deepEqual(state.pendingChoices, {});
});

test("les deux mouvements de même priorité et les dégâts de rencontre sont simultanés", () => {
  const battle = fixture();
  positions(battle, { a0: { x: 0, y: 3 }, b0: { x: 0, y: 1 } });
  const state = turn(
    battle,
    [{ actorId: "a0", type: "MOVE", to: { x: 0, y: 2 } }],
    [{ actorId: "b0", type: "MOVE", to: { x: 0, y: 2 } }],
  );
  assert.deepEqual(state.tactics.positions.a0, { x: 0, y: 3 });
  assert.deepEqual(state.tactics.positions.b0, { x: 0, y: 1 });
  assert.equal(
    state.lastResult.steps[0].events.filter((event) => event.type === "attack")
      .length,
    2,
  );
  assert.deepEqual(
    state.troops.find((troop) => troop.id === "a0").soldierHealth,
    state.troops.find((troop) => troop.id === "b0").soldierHealth,
  );
});

test("une priorité antérieure ouvre un passage allié à la suivante", () => {
  const battle = fixture();
  positions(battle, { a0: { x: 0, y: 3 }, a1: { x: 0, y: 4 } });
  const state = turn(battle, [
    { actorId: "a0", type: "MOVE", to: { x: 0, y: 2 } },
    { actorId: "a1", type: "MOVE", to: { x: 0, y: 3 } },
  ]);
  assert.deepEqual(state.tactics.positions.a1, { x: 0, y: 3 });
  assert.equal(state.lastResult.steps.length, 2);
});

test("les archers tirent à distance et une cible déplacée hors portée échappe au tir", () => {
  const battle = fixture();
  positions(battle, {
    a1: { x: 1, y: 3 },
    b0: { x: 1, y: 0 },
    b1: { x: 2, y: 0 },
  });
  const state = turn(
    battle,
    [{ actorId: "a1", type: "ATTACK", targetId: "b0" }],
    [{ actorId: "b0", type: "MOVE", to: { x: 0, y: 0 } }],
  );
  assert.ok(
    state.lastResult.steps[0].events.some((event) => event.type === "miss"),
  );
  assert.equal(
    state.troops
      .find((troop) => troop.id === "b0")
      .soldierHealth.reduce((a, b) => a + b),
    50,
  );
});

test("défense réduit les pertes et l'intrusion baisse le moral du camp avec un plafond", () => {
  const defend = fixture(),
    normal = fixture();
  for (const battle of [defend, normal])
    positions(battle, { a0: { x: 0, y: 1 }, b0: { x: 0, y: 0 } });
  const defensive = turn(
    defend,
    [{ actorId: "a0", type: "ATTACK", targetId: "b0" }],
    [{ actorId: "b0", type: "DEFEND" }],
  );
  const offensive = turn(
    normal,
    [{ actorId: "a0", type: "ATTACK", targetId: "b0" }],
    [{ actorId: "b0", type: "ATTACK", targetId: "a0" }],
  );
  assert.ok(
    defensive.lastResult.steps[0].events.find(
      (event) => event.actorId === "a0" && event.type === "attack",
    ).damage <=
      offensive.lastResult.steps[0].events.find(
        (event) => event.actorId === "a0" && event.type === "attack",
      ).damage,
  );
  const invade = fixture();
  positions(invade, { a0: { x: 2, y: 0 }, b0: { x: 0, y: 1 } });
  assert.equal(turn(invade).players[1].cohesion, 19);
});

test("projection : unités déployées visibles, réserves et ordres adverses secrets", () => {
  const battle = fixture();
  battle.submitDuelChoice("b", { orders: [{ actorId: "b0", type: "DEFEND" }] });
  const view = duelPlayerView(battle.duel, "a");
  assert.equal(view.troops.find((troop) => troop.id === "b0").count, 5);
  assert.equal(view.troops.find((troop) => troop.id === "b2").count, undefined);
  assert.equal(view.pendingChoices.b, undefined);
  assert.equal(view.tactics.options.b0, undefined);
});

test("l'IA génère des ordres valides et une fuite conserve les blessures officielles", () => {
  const battle = fixture();
  assert.doesNotThrow(() =>
    submitTacticalChoice(battle.duel, "b", aiTacticalChoice(battle.duel, "b")),
  );
  battle.submitDuelChoice("a", { orders: [], flee: true });
  battle.lockDuelChoice("a");
  battle.submitDuelChoice("b", { orders: [] });
  battle.lockDuelChoice("b");
  assert.equal(battle.status, "finished");
  assert.equal(battle.winnerTeamId, "b");
  assert.deepEqual(
    battle.teams[0].units[0].soldierHealth,
    [10, 10, 10, 10, 10],
  );
});

test("le choix et le verrouillage ne modifient pas leur entrée", () => {
  const state = fixture().duel;
  const locked = lockTacticalChoice(
    submitTacticalChoice(state, "a", { orders: [] }),
    "a",
  );
  assert.equal(state.players[0].locked, false);
  assert.equal(locked.players[0].locked, true);
  assert.throws(() => lockTacticalChoice(locked, "a"));
});

test("une charge bloquée par une unité intermédiaire n'attaque pas au travers", () => {
  const battle = fixture();
  positions(battle, {
    a2: { x: 2, y: 3 },
    a1: { x: 1, y: 3 },
    b0: { x: 0, y: 3 },
  });
  const state = turn(battle, [
    { actorId: "a2", type: "CHARGE", to: { x: 0, y: 3 } },
  ]);
  assert.deepEqual(state.tactics.positions.a2, { x: 2, y: 3 });
  assert.equal(
    state.lastResult.steps[0].events.filter((event) => event.type === "attack")
      .length,
    0,
  );
});

test("une unité ne frappe qu'une fois quand son attaque et une interception coïncident", () => {
  const battle = fixture();
  positions(battle, { a0: { x: 0, y: 3 }, b0: { x: 0, y: 2 } });
  const state = turn(
    battle,
    [{ actorId: "a0", type: "ATTACK", targetId: "b0" }],
    [{ actorId: "b0", type: "MOVE", to: { x: 0, y: 3 } }],
  );
  assert.equal(
    state.lastResult.steps[0].events.filter((event) => event.type === "attack")
      .length,
    2,
  );
});

test("une unité neutralisée perd son ordre d'une priorité suivante", () => {
  const battle = fixture();
  positions(battle, { a0: { x: 0, y: 3 }, b0: { x: 0, y: 2 } });
  battle.duel.troops.find((troop) => troop.id === "b0").attack = 999;
  const state = turn(
    battle,
    [
      { actorId: "a1", type: "RALLY" },
      { actorId: "a0", type: "MOVE", to: { x: 1, y: 3 } },
    ],
    [{ actorId: "b0", type: "ATTACK", targetId: "a0" }],
  );
  assert.equal(state.tactics.positions.a0, undefined);
  assert.equal(
    state.lastResult.steps[1].events.some((event) => event.actorId === "a0"),
    false,
  );
});

test("les deux commandants peuvent tomber simultanément sans avantage d'ordre", () => {
  const battle = fixture();
  positions(battle, { a0: { x: 2, y: 0 }, b0: { x: 2, y: 4 } });
  for (const player of battle.duel.players) player.hero.health = 1;
  turn(
    battle,
    [{ actorId: "a0", type: "ATTACK_BASE" }],
    [{ actorId: "b0", type: "ATTACK_BASE" }],
  );
  assert.equal(battle.status, "finished");
  assert.equal(battle.winnerTeamId, null);
  assert.ok(battle.teams.every((team) => team.heroes[0].health === 0));
});

test("la limite de tours termine aussi une bataille sans ordres", () => {
  const battle = fixture();
  battle.duel.round = 25;
  turn(battle);
  assert.equal(battle.status, "finished");
  assert.equal(battle.duel.finishReason, "TURN_LIMIT");
  assert.equal(battle.winnerTeamId, null);
});

test("un commandant déployé n'est plus une cible fictive derrière le camp", () => {
  const battle = fixture();
  positions(battle, { a0: { x: 2, y: 0 }, "HERO:b": { x: 1, y: 3 } });
  assert.equal(battle.duel.tactics.options.a0.base, false);
  assert.throws(() =>
    battle.submitDuelChoice("a", {
      orders: [{ actorId: "a0", type: "ATTACK_BASE" }],
    }),
  );
});

test("préparation d'armée : propriété, case unique, combat actif et sauvegarde", () => {
  const a = new Unit({
    id: "a",
    ownerPlayerId: "p",
    typeId: "militia",
    quantity: 1,
  });
  const b = new Unit({
    id: "b",
    ownerPlayerId: "p",
    typeId: "militia",
    quantity: 1,
  });
  const game = {
    battles: [],
    getHero: () => ({
      army: {
        units: [a, b],
        getUnit: (id) => [a, b].find((unit) => unit.id === id),
      },
    }),
  };
  setArmyFormation(game, { heroId: "h", unitId: "a", slot: 1 });
  assert.throws(() =>
    setArmyFormation(game, { heroId: "h", unitId: "b", slot: 1 }),
  );
  assert.throws(() =>
    setArmyFormation(game, { heroId: "h", unitId: "x", slot: 0 }),
  );
  assert.equal(new Unit(a.toJSON()).battleSlot, 1);
  game.battles.push({
    status: "active",
    teams: [{ heroes: [{ sourceId: "h" }] }],
  });
  assert.throws(() =>
    setArmyFormation(game, { heroId: "h", unitId: "a", slot: null }),
  );
});
