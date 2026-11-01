import assert from "node:assert/strict";
import test from "node:test";
import { BattleEngine } from "../app/js/core/battle-engine.js";
import { BattleService } from "../app/js/core/battle-service.js";
import { Unit } from "../app/js/core/unit.js";
import { duelPlayerView } from "../app/js/core/battle-duel/state.js";

function battleFixture() {
  const battle = new BattleEngine({
    id: "health-duel",
    teams: ["a", "b"].map((id) => ({
      id,
      heroes: [{ id: `hero-${id}`, playerId: id, attack: 1, defense: 2 }],
      units: [
        {
          id: `unit-${id}`,
          sourceId: `unit-${id}`,
          playerId: id,
          typeId: "militia",
          quantity: 6,
          maxQuantity: 6,
          soldierHealth: [10, 10, 10, 10, 10, 3],
          healthPerSoldier: 10,
          combatHealthThreshold: 4,
          attack: 4,
          defense: 2,
          speed: 2,
          range: 1,
          morale: 10,
        },
      ],
    })),
  });
  battle.start();
  battle.duel.encounter = {
    terrain: { id: "PLAIN" },
    weather: { id: "DRY" },
    twist: { id: "NORMAL" },
    reward: { id: "NONE" },
  };
  return battle;
}

function fight(battle) {
  for (const id of ["a", "b"]) {
    battle.submitDuelChoice(id, { cards: [`unit-${id}`] });
    battle.lockDuelChoice(id);
  }
}

test("les PV et blessures traversent sauvegarde, fuite et retour aux unités", () => {
  const battle = battleFixture();
  fight(battle);
  const health = battle.duel.troops.map((troop) => [...troop.soldierHealth]);
  assert.ok(battle.duel.troops.some((troop) => troop.woundedCount > 0));
  assert.notDeepEqual(health[0], [10, 10, 10, 10, 10, 3]);
  const restored = new BattleEngine(
    JSON.parse(JSON.stringify(battle.toJSON())),
  );
  assert.deepEqual(restored.duel, battle.duel);
  restored.submitDuelChoice("a", { flee: true });
  restored.lockDuelChoice("a");
  restored.submitDuelChoice("b", { cards: [] });
  restored.lockDuelChoice("b");
  assert.equal(restored.status, "finished");
  for (const [index, team] of restored.teams.entries()) {
    const unit = team.units[0];
    assert.deepEqual(unit.soldierHealth, health[index]);
    assert.equal(unit.quantity, health[index].filter((hp) => hp > 0).length);
    assert.equal(
      unit.combatantCount,
      health[index].filter((hp) => hp > 4).length,
    );
    assert.equal(
      unit.woundedCount,
      health[index].filter((hp) => hp > 0 && hp <= 4).length,
    );
  }
  const units = new Map(
    ["a", "b"].map((id) => [
      `unit-${id}`,
      new Unit({
        id: `unit-${id}`,
        typeId: "militia",
        ownerPlayerId: id,
        quantity: 6,
        maxQuantity: 6,
        healthPerSoldier: 10,
        combatHealthThreshold: 4,
      }),
    ]),
  );
  new BattleService(new Map()).applyOutcome({
    battle: restored,
    game: {
      getHero: () => null,
      findUnit: (id) => units.get(id) ?? null,
    },
  });
  for (const [index, id] of ["a", "b"].entries())
    assert.deepEqual(
      units.get(`unit-${id}`).soldierHealth,
      health[index].filter((hp) => hp > 0),
    );
});

test("restaurer une projection ne crée pas de PV pour les cartes cachées", () => {
  const battle = battleFixture();
  const saved = battle.toJSON();
  saved.duel = duelPlayerView(battle.duel, "a");
  const hidden = structuredClone(
    saved.duel.troops.find((troop) => troop.ownerId === "b"),
  );
  const restored = new BattleEngine(saved);
  assert.deepEqual(
    restored.duel.troops.find((troop) => troop.ownerId === "b"),
    hidden,
  );
  assert.equal(hidden.count, undefined);
  assert.equal(hidden.soldierHealth, undefined);
});
