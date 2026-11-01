import assert from "node:assert/strict";
import test from "node:test";
import { BattleEngine } from "../app/js/core/battle-engine.js";
import { AmbushService } from "../app/js/core/ambush-service.js";

function fixture() {
  const battle = new BattleEngine({
    id: "ambush",
    teams: ["a", "b"].map((id) => ({
      id,
      heroes: [
        {
          id: `hero-${id}`,
          sourceId: id,
          playerId: id,
          health: 100,
          maxHealth: 100,
        },
      ],
      units: [
        {
          id: `unit-${id}`,
          playerId: id,
          typeId: "militia",
          quantity: 10,
          maxQuantity: 10,
          healthPerSoldier: 100,
          combatHealthThreshold: 4,
          attack: 5,
          defense: 10,
          speed: 1,
          range: 1,
          morale: 10,
        },
      ],
    })),
  });
  battle.start();
  return battle;
}
const effects = {
  rounds: 1,
  attackerAttackMultiplier: 1.2,
  defenderDefenseMultiplier: 0.85,
};
function round(battle) {
  battle.duel.encounter = {
    terrain: { id: "PLAIN" },
    weather: { id: "DRY" },
    twist: { id: "NO_TECHNIQUE" },
    reward: { id: "NONE" },
  };
  for (const id of ["a", "b"])
    battle.submitDuelChoice(id, { cards: [`unit-${id}`] });
  for (const id of ["a", "b"]) battle.lockDuelChoice(id);
}

test("l'embuscade modifie les dégâts du premier duel et expire au suivant", () => {
  const normal = fixture();
  const ambushed = fixture();
  new AmbushService().applyEffects({
    battle: ambushed,
    effects,
    sourceHeroId: "b",
  });
  const originalStats = structuredClone(
    ambushed.duel.troops.map(({ attack, defense }) => ({ attack, defense })),
  );
  round(normal);
  round(ambushed);
  assert.ok(
    ambushed.duel.lastResult.impact.b > normal.duel.lastResult.impact.b,
  );
  assert.deepEqual(
    ambushed.duel.troops.map(({ attack, defense }) => ({ attack, defense })),
    originalStats,
  );
  assert.equal(ambushed.duel.round, 2);
  const withoutAmbush = new BattleEngine(ambushed.toJSON());
  delete withoutAmbush.duel.ambush;
  round(ambushed);
  round(withoutAmbush);
  assert.deepEqual(ambushed.duel.lastResult, withoutAmbush.duel.lastResult);
});

test("la sauvegarde conserve l'embuscade avant la résolution sans la cumuler", () => {
  const battle = fixture();
  const service = new AmbushService();
  service.applyEffects({ battle, effects, attackerTeamId: "a" });
  const restored = new BattleEngine(
    JSON.parse(JSON.stringify(battle.toJSON())),
  );
  assert.deepEqual(restored.duel.ambush, battle.duel.ambush);
  assert.throws(
    () =>
      service.applyEffects({ battle: restored, effects, attackerTeamId: "a" }),
    /avant les choix/,
  );
  round(battle);
  round(restored);
  assert.deepEqual(restored.duel, battle.duel);
});

test("une embuscade annulée ne modifie pas le duel et un camp absent est refusé", () => {
  const battle = fixture();
  const service = new AmbushService();
  service.applyEffects({
    battle,
    attackerTeamId: "a",
    effects: { ...effects, rounds: 0 },
  });
  assert.equal(battle.duel.ambush, undefined);
  assert.throws(
    () => service.applyEffects({ battle, effects, attackerTeamId: "absent" }),
    /camp/,
  );
});

test("une sauvegarde incompatible est refusée sans conversion silencieuse", () => {
  const saved = fixture().toJSON();
  saved.duel.version = 0;
  assert.throws(() => new BattleEngine(saved), /incompatible/);
  delete saved.duel;
  assert.throws(() => new BattleEngine(saved), /requis/);
});
