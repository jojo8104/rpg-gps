import assert from "node:assert/strict";
import test from "node:test";

import { Army } from "../app/js/core/army.js";
import { Unit } from "../app/js/core/unit.js";
import { UnitDefinition } from "../app/js/core/unit-definition.js";

test("une définition d'unité est configurable et sérialisable", () => {
  const definition = new UnitDefinition({
    id: "archer", name: "Archer", faction: "kingdom", maxQuantity: 10,
    stats: { attack: 4, defense: 2, speed: 3, range: 3, morale: 5 },
    retreat: { attack: 3, defense: 2, speed: 4, range: 3 },
    abilities: ["ranged_attack"], costs: { gold: 30, wood: 10, iron: 5 }, tags: ["infantry", "ranged"],
  });
  assert.equal(definition.toJSON().stats.range, 3);
  assert.deepEqual(definition.toJSON().retreat, { attack: 3, defense: 2, speed: 4, range: 3 });
  assert.deepEqual(definition.abilities, ["ranged_attack"]);
});

test("une unité conserve son identité après des pertes et des renforts", () => {
  const unit = new Unit({ id: "unit-1", ownerPlayerId: "player-1", typeId: "archer", name: "Diables rouges", number: 3, quantity: 8, rank: "corporal" });
  assert.equal(unit.lose(3), 3);
  assert.equal(unit.quantity, 5);
  assert.equal(unit.reinforce(8), 5);
  assert.equal(unit.quantity, 10);
  assert.equal(unit.lose(12), 10);
  assert.equal(unit.state, "defeated");
  assert.equal(unit.toJSON().name, "Diables rouges");
  assert.equal(unit.toJSON().number, 3);
});

test("une armée contient des unités aux identifiants uniques", () => {
  const army = new Army();
  assert.equal(army.addUnit({ id: "unit-1", ownerPlayerId: "player-1", typeId: "archer", quantity: 6 }), true);
  assert.equal(army.addUnit({ id: "unit-1", ownerPlayerId: "player-1", typeId: "archer", quantity: 6 }), false);
  assert.equal(army.getUnit("unit-1").typeId, "archer");
  assert.equal(army.removeUnit("unit-1").id, "unit-1");
});

test("une unité monte en grade par expérience ou par nomination d'un PNJ", () => {
  const unit = new Unit({ id: "ranked", ownerPlayerId: "player-1", typeId: "militia", quantity: 6 });
  assert.equal(unit.rank, "soldier"); assert.equal(unit.maxQuantity, 6);
  unit.addExperience(100); assert.equal(unit.rank, "corporal"); assert.equal(unit.maxQuantity, 10); assert.equal(unit.quantity, 6);
  assert.equal(unit.appointOfficer("lieutenant"), true); assert.equal(unit.maxQuantity, 24);
  assert.equal(unit.appointOfficer("sergeant"), false);
});

test("les PV individuels distinguent soldats aptes et blessés", () => {
  const unit = new Unit({ id: "health", ownerPlayerId: "player-1", typeId: "militia", quantity: 3, healthPerSoldier: 10, combatHealthThreshold: 4, soldierHealth: [10, 4, 1] });
  assert.equal(unit.combatantCount, 1);
  assert.equal(unit.woundedCount, 2);
  assert.equal(unit.unavailableCount, 3);
  assert.deepEqual(unit.applyBattleHealth([8, 3, 0]), { quantity: 2, combatants: 1, wounded: 1 });
  assert.equal(unit.unavailableCount, 4);
  assert.deepEqual(unit.toJSON().soldierHealth, [8, 3]);
});

test("une définition complète expose dégâts, santé et cadence", () => {
  const definition = new UnitDefinition({
    id: "horse-archer", name: "Archer monté", faction: "kingdom", maxQuantity: 10,
    stats: { attack: 4, defense: 2, damageMin: 2, damageMax: 4, healthPerSoldier: 9, combatHealthThreshold: 4, attackIntervalMs: 900, speed: 5, range: 3, morale: 6 },
  });
  assert.deepEqual(
    Object.fromEntries(["damageMin", "damageMax", "healthPerSoldier", "combatHealthThreshold", "attackIntervalMs"].map((key) => [key, definition.stats[key]])),
    { damageMin: 2, damageMax: 4, healthPerSoldier: 9, combatHealthThreshold: 4, attackIntervalMs: 900 },
  );
});
