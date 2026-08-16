import assert from "node:assert/strict";
import test from "node:test";
import { BattleEngine, BattleState } from "../app/js/core/battle.js";

const createBattle = () => new BattleEngine({ id: "battle-1", teams: [
  { id: "red", heroes: [{ id: "hero-red", playerId: "red", attack: 5, defense: 2, speed: 2 }], units: [{ id: "unit-red", playerId: "red", attack: 20, defense: 3, speed: 3, range: 1, quantity: 10, maxQuantity: 10 }] },
  { id: "blue", heroes: [{ id: "hero-blue", playerId: "blue", attack: 5, defense: 2, speed: 2 }], units: [] },
] });

test("BattleState expose trois lignes abstraites et sérialisables", () => {
  const battle = createBattle();
  assert.equal(battle.state instanceof BattleState, true); assert.equal(battle.teams[0].lines.length, 3);
  assert.equal(battle.teams[0].units[0].lane, 1); assert.equal("position" in battle.teams[0].units[0], false);
  assert.doesNotThrow(() => JSON.stringify(battle.toJSON()));
});

test("les ticks automatisent l'approche, l'attaque et la victoire", () => {
  const battle = createBattle();
  for (let index = 0; index < 100 && battle.status !== "finished"; index += 1) battle.tick(500);
  assert.equal(battle.status, "finished"); assert.equal(battle.winnerTeamId, "red");
  assert.ok(battle.eventLog.some((event) => event.type === "target_acquired"));
  assert.ok(battle.state.contributions.red.total > 0);
});

test("une unité avance selon son comportement propre sans ordre joueur", () => {
  const battle = createBattle(); const unit = battle.teams[0].units[0];
  battle.tick(500);
  assert.equal(unit.behavior, "advance"); assert.ok(unit.progress > 0);
  assert.equal(typeof battle.issueOrder, "undefined");
});

test("après une percée, une unité reste sur sa ligne et inflige des dégâts multipliés au héros ennemi", () => {
  const battle = createBattle(); const unit = battle.teams[0].units[0];
  unit.lane = null;
  battle.assignUnit(unit.id, battle.teams[0].heroes[0].id, 0);
  for (let index = 0; index < 10 && !battle.eventLog.some((event) => event.type === "breakthrough_attack"); index += 1) battle.tick(500);
  const attack = battle.eventLog.find((event) => event.type === "breakthrough_attack");
  assert.equal(unit.lane, 0); assert.equal(attack.targetId, "hero-blue"); assert.equal(attack.multiplier, 1.5);
});

test("une unité déjà déployée ne peut plus changer de ligne", () => {
  const battle = createBattle(); const unit = battle.teams[0].units[0];
  assert.deepEqual(battle.assignUnit(unit.id, battle.teams[0].heroes[0].id, 2), { success: false, reason: "unit_already_deployed" });
  assert.equal(unit.lane, 1);
});

test("deux unités opposées sur la même ligne s'infligent des pertes", () => {
  const battle = new BattleEngine({ id: "unit-damage", teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red", attack: 1, defense: 1, speed: 1 }], units: [{ id: "ur", playerId: "red", attack: 10, defense: 1, speed: 3, range: 1, quantity: 10, maxQuantity: 10 }] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue", attack: 1, defense: 1, speed: 1 }], units: [{ id: "ub", playerId: "blue", attack: 10, defense: 1, speed: 3, range: 1, quantity: 10, maxQuantity: 10 }] },
  ] });
  for (let index = 0; index < 12 && battle.getEntity("ur").quantity === 10; index += 1) battle.tick(500);
  assert.ok(battle.getEntity("ur").quantity < 10); assert.ok(battle.getEntity("ub").quantity < 10);
});

test("la reddition termine immédiatement la bataille au profit de l'adversaire", () => {
  const battle = createBattle(); battle.start();
  const result = battle.surrender("red");
  assert.deepEqual(result, { success: true, winnerTeamId: "blue" });
  assert.equal(battle.status, "finished"); assert.equal(battle.teams[0].heroes[0].state, "surrendered");
  assert.equal(battle.teams[0].units[0].state, "captured");
  assert.ok(battle.eventLog.some((event) => event.type === "team_surrendered"));
});
