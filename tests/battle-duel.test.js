import assert from "node:assert/strict";
import test from "node:test";
import {
  createBattleDuelForGame,
  duelPlayerView,
  nextDuelEncounter,
} from "../app/js/core/battle-duel/state.js";
import {
  submitDuelChoice,
  lockDuelChoice,
} from "../app/js/core/battle-duel/commands.js";
import { techniqueBonuses } from "../app/js/core/battle-duel/resolver.js";
import { ensureTroopHealth } from "../app/js/core/battle-duel/health.js";

function fixture() {
  return createBattleDuelForGame({
    id: "duel-test",
    teams: ["a", "b"].map((id) => ({
      id,
      heroes: [
        {
          id: `hero-${id}`,
          name: id,
          health: 12,
          maxHealth: 12,
          attack: 8,
          defense: 2,
          maxCommandPoints: 2,
        },
      ],
      units: [
        {
          id: `unit-${id}`,
          typeId: id === "a" ? "light-cavalry" : "militia",
          typeName: id,
          combatantCount: 5,
          morale: 8,
          attack: 8,
          defense: 2,
          range: 1,
          speed: 3,
        },
      ],
    })),
  });
}
function duel(state, a, b) {
  state = lockDuelChoice(submitDuelChoice(state, "a", a), "a");
  return lockDuelChoice(submitDuelChoice(state, "b", b), "b");
}

function neutral(state = fixture()) {
  state.encounter = {
    terrain: { id: "PLAIN" },
    weather: { id: "DRY" },
    twist: { id: "NORMAL" },
    reward: { id: "NONE" },
  };
  return state;
}

test("les pertes accélérées restent simultanées et font chuter le moral", () => {
  const state = fixture();
  state.encounter.terrain = { id: "PLAIN" };
  state.encounter.weather = { id: "DRY" };
  state.encounter.twist = { id: "NO_TECHNIQUE" };
  for (const troop of state.troops) {
    Object.assign(troop, {
      count: 25,
      attack: 10,
      defense: 5,
      morale: 10,
      soldierHealth: Array(25).fill(10),
    });
  }
  const result = duel(state, { cards: ["unit-a"] }, { cards: ["unit-b"] });
  assert.equal(result.lastResult.passes.length, 3);
  for (const troop of result.lastResult.passes[0].troops) {
    assert.equal(troop.count, 19);
    assert.equal(troop.woundedCount, 1);
    assert.equal(troop.deadCount, 5);
    assert.equal(troop.morale, 8);
  }
  assert.deepEqual(
    result.lastResult.events.slice(0, 2).map((e) => e.damage),
    [57, 57],
  );
  assert.equal(state.troops[0].count, 25);
});

test("deux héros terminent leur affrontement après deux passes simultanées", () => {
  const state = fixture();
  state.encounter.terrain = { id: "PLAIN" };
  state.encounter.weather = { id: "DRY" };
  state.encounter.twist = { id: "NO_TECHNIQUE" };
  const result = duel(state, { cards: ["HERO"] }, { cards: ["HERO"] });
  assert.equal(result.lastResult.passes.length, 2);
  assert.equal(result.phase, "FINISHED");
  assert.equal(result.winnerId, null);
  assert.deepEqual(
    result.players.map((player) => player.hero.health),
    [0, 0],
  );
});

test("le bonus de duel héroïque ne modifie pas les échanges avec les troupes", () => {
  const state = fixture();
  state.encounter.terrain = { id: "PLAIN" };
  state.encounter.weather = { id: "DRY" };
  state.encounter.twist = { id: "NO_TECHNIQUE" };
  const result = duel(state, { cards: ["HERO"] }, { cards: ["unit-b"] });
  assert.equal(result.lastResult.heroDamage.a, 12);
  assert.equal(result.lastResult.troopDamage["unit-b"], 2);
  assert.equal(result.lastResult.casualties["unit-b"], 0);
  assert.equal(result.lastResult.passes.length, 1);
});

test("deux héros très protégés infligent au moins trois dégâts par coup", () => {
  const state = fixture();
  state.encounter.twist = { id: "HERO_ONLY" };
  for (const player of state.players) player.hero.defense = 100;
  const result = duel(state, { cards: ["HERO"] }, { cards: ["HERO"] });
  assert.deepEqual(
    result.players.map((player) => player.hero.health),
    [3, 3],
  );
});
test("choix cachés jusqu'au verrouillage et résolution déterministe", () => {
  let state = fixture();
  state = lockDuelChoice(
    submitDuelChoice(state, "a", { cards: ["unit-a"] }),
    "a",
  );
  assert.equal(duelPlayerView(state, "b").pendingChoices.a, undefined);
  assert.equal(
    duelPlayerView(state, "b").troops.find((card) => card.id === "unit-a")
      .count,
    undefined,
  );
  assert.equal(state.round, 1);
  const first = lockDuelChoice(
    submitDuelChoice(state, "b", { cards: ["unit-b"] }),
    "b",
  );
  const second = lockDuelChoice(
    submitDuelChoice(state, "b", { cards: ["unit-b"] }),
    "b",
  );
  assert.deepEqual(first, second);
  assert.equal(first.round, 2);
  assert.equal(
    first.troops.find((card) => card.id === "unit-a").count,
    5 -
      (first.lastResult.casualties["unit-a"] ?? 0) -
      first.troops[0].woundedCount,
  );
});
test("la règle cavalerie supprime son attaque sans interdire la carte", () => {
  const state = fixture();
  state.encounter.twist = {
    kind: "RULE",
    id: "NO_CAVALRY",
    label: "Sans cavalerie",
  };
  const result = duel(state, { cards: ["unit-a"] }, { cards: ["unit-b"] });
  assert.equal(result.lastResult.impact.a, 0);
  assert.ok(result.lastResult.impact.b > 0);
});
test("passer expose le héros; double passe provoque de la fatigue", () => {
  const state = fixture();
  const exposed = duel(state, { cards: [] }, { cards: ["unit-b"] });
  assert.ok(exposed.players[0].hero.health < 12);
  assert.equal(exposed.lastResult.winnerId, "b");
  const fatigue = duel(state, { cards: [] }, { cards: [] });
  assert.equal(fatigue.players[0].hero.health, 11);
  assert.equal(fatigue.players[1].hero.health, 11);
});
test("héros seul, fuite et PC", () => {
  const state = fixture();
  state.players[0].commandPointsMax = 1;
  assert.throws(
    () => submitDuelChoice(state, "a", { cards: ["HERO"], order: "DEFEND" }),
    /PC/,
  );
  const flee = duel(state, { flee: true }, { cards: ["unit-b"] });
  assert.equal(flee.phase, "FINISHED");
  assert.equal(flee.winnerId, "b");
  assert.equal(flee.finishReason, "FLEE");
  assert.deepEqual(flee.troops, state.troops);
  assert.deepEqual(
    flee.players.map((player) => player.hero.health),
    [12, 12],
  );
});

test("les rencontres ne génèrent que des règles", () => {
  const state = fixture();
  for (let round = 1; round <= 40; round += 1) {
    state.round = round;
    assert.equal(nextDuelEncounter(state).twist.kind, "RULE");
  }
});

test("la règle héros seul neutralise les attaques des troupes", () => {
  const state = fixture();
  state.encounter.twist = {
    kind: "RULE",
    id: "HERO_ONLY",
    label: "Héros seuls",
  };
  const result = duel(state, { cards: ["unit-a"] }, { cards: ["unit-b"] });
  assert.equal(result.lastResult.impact.a, 0);
  assert.equal(result.lastResult.impact.b, 0);
});

test("la vitesse entière se répartit ; la charge ne dure que la première passe", () => {
  const cavalry = { speed: 6, typeId: "light-cavalry", range: 1 };
  assert.deepEqual(techniqueBonuses(cavalry, "ATTACK"), {
    attack: 3,
    defense: 3,
  });
  assert.deepEqual(techniqueBonuses(cavalry, "DEFEND"), {
    attack: 0,
    defense: 6,
  });
  assert.deepEqual(techniqueBonuses(cavalry, "CHARGE", 1), {
    attack: 6,
    defense: 0,
  });
  assert.deepEqual(techniqueBonuses(cavalry, "CHARGE", 2), {
    attack: 3,
    defense: 3,
  });
  assert.deepEqual(techniqueBonuses(cavalry, "CHARGE", 3), {
    attack: 3,
    defense: 3,
  });
});

test("charge : bonus de première passe puis retour à la normale sans multiplicateur ancien", () => {
  const state = neutral();
  for (const troop of state.troops) {
    troop.healthPerSoldier = 1000;
    troop.soldierHealth.fill(1000);
  }
  const normal = duel(state, { cards: ["unit-a"] }, { cards: ["unit-b"] });
  const charged = duel(
    state,
    { cards: ["unit-a"], order: "CHARGE" },
    { cards: ["unit-b"] },
  );
  const hits = (s, id) =>
    s.lastResult.events.filter((e) => e.attackerId === id).map((e) => e.damage);
  assert.ok(hits(charged, "unit-a")[0] > hits(normal, "unit-a")[0]);
  assert.ok(hits(charged, "unit-b")[0] > hits(normal, "unit-b")[0]);
  assert.deepEqual(
    hits(charged, "unit-a").slice(1),
    hits(normal, "unit-a").slice(1),
  );
  state.encounter.twist.id = "NO_TECHNIQUE";
  const without = duel(
    state,
    { cards: ["unit-a"], order: "CHARGE" },
    { cards: ["unit-b"], order: "DEFEND" },
  );
  assert.deepEqual(without.lastResult.events, normal.lastResult.events);
});

test("volée gratuite : bonus 200 % et exposition par rapport des vitesses", () => {
  const state = neutral();
  Object.assign(state.troops[0], {
    range: 3,
    speed: 3,
    attack: 4,
    morale: 7,
    typeId: "archer",
    count: 6,
    soldierHealth: Array(6).fill(10),
  });
  // Moral 7 : 6 × (0,65 + 7/20) = 6.
  state.troops[1].speed = 2;
  const slow = duel(state, { cards: ["unit-a"] }, { cards: ["unit-b"] });
  const opening = slow.lastResult.events.filter((e) => e.opening);
  assert.equal(opening.length, 1);
  assert.equal(opening[0].attackerId, "unit-a");
  assert.equal(opening[0].damage, 22);
  state.troops[1].speed = 6;
  const fast = duel(state, { cards: ["unit-a"] }, { cards: ["unit-b"] });
  assert.equal(fast.lastResult.events.find((e) => e.opening).damage, 6);
});

test("deux tireurs ont une volée simultanée suivie de trois passes", () => {
  const state = neutral();
  for (const troop of state.troops) {
    troop.range = 3;
    troop.healthPerSoldier = 1000;
    troop.soldierHealth.fill(1000);
  }
  const result = duel(state, { cards: ["unit-a"] }, { cards: ["unit-b"] });
  assert.deepEqual(
    result.lastResult.passes.map((p) => p.pass),
    [0, 1, 2, 3],
  );
  const volley = result.lastResult.events.filter((e) => e.opening);
  assert.equal(volley.length, 2);
  assert.equal(volley[0].damage, volley[1].damage);
});

test("la volée qui détruit la cible arrête les passes sans toucher le héros", () => {
  const state = neutral();
  Object.assign(state.troops[0], { range: 3, attack: 1000 });
  const result = duel(state, { cards: ["unit-a"] }, { cards: ["unit-b"] });
  assert.equal(result.lastResult.passes.length, 1);
  assert.equal(result.troops[1].tacticalState, "DESTROYED");
  assert.equal(result.players[1].hero.health, 12);
  assert.equal(result.lastResult.winnerId, "a");
  assert.equal(result.lastResult.heroDamage.b, 0);
});

test("un dernier soldat apte reste jouable, même seul", () => {
  const state = neutral();
  for (const troop of state.troops) {
    troop.count = 1;
    troop.soldierHealth = [10];
    troop.attack = 0;
    troop.defense = 100;
  }
  const result = duel(state, { cards: ["unit-a"] }, { cards: ["unit-b"] });
  assert.equal(result.lastResult.passes.length, 3);
  for (const troop of result.troops) {
    assert.equal(troop.count, 1);
    assert.deepEqual(troop.soldierHealth, [7]);
    assert.equal(troop.tacticalState, "READY");
  }
});

test("migration d'un ancien duel : conserve les blessures et les pertes", () => {
  const troop = { count: 2, woundedCount: 1, tacticalState: "READY" };
  const source = {
    healthPerSoldier: 10,
    combatHealthThreshold: 4,
    soldierHealth: [10, 8, 9, 3, 0],
    deadCount: 1,
  };
  ensureTroopHealth(troop, source);
  assert.deepEqual(troop.soldierHealth, [10, 8, 0, 3, 0]);
  assert.equal(troop.count, 2);
  assert.equal(troop.woundedCount, 1);
  assert.equal(troop.deadCount, 2);
  const saved = structuredClone(troop);
  ensureTroopHealth(troop, source);
  assert.deepEqual(troop, saved);
});
