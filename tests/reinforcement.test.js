import assert from "node:assert/strict";
import test from "node:test";
import { BattleEngine } from "../app/js/core/battle-engine.js";

const hero = (id, playerId) => ({ id, playerId, attack: 1, defense: 1, speed: 1 });
test("un renfort rejoint automatiquement la première ligne libre après son délai", () => {
  const battle = new BattleEngine({ id: "b", config: { reinforcementDelayMs: 1000 }, teams: [
    { id: "red", heroes: [hero("red-hero", "red")] }, { id: "blue", heroes: [hero("blue-hero", "blue")] },
  ] }); battle.start();
  const result = battle.addReinforcement({ teamId: "red", heroes: [hero("reinforcement", "p3")], units: [{ id: "unit", playerId: "p3", attack: 1, defense: 1, speed: 1, quantity: 2, maxQuantity: 2 }] });
  assert.deepEqual(result, { success: true, lane: 0, arrivalAtMs: 1000 }); battle.tick(999);
  assert.equal(battle.getEntity("reinforcement"), null); battle.tick(1);
  assert.equal(battle.getEntity("reinforcement").lane, 0); assert.equal(battle.getEntity("unit").lane, 0);
});

test("une quatrième arrivée est refusée quand les trois lignes sont occupées", () => {
  const battle = new BattleEngine({ id: "b", teams: [{ id: "red", heroes: [hero("r1", "r1"), hero("r2", "r2"), hero("r3", "r3")] }, { id: "blue", heroes: [hero("b1", "b1")] }] });
  assert.equal(battle.addReinforcement({ teamId: "red", heroes: [hero("r4", "r4")] }).reason, "no_free_line");
});
