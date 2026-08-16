import assert from "node:assert/strict";
import test from "node:test";

import { Army } from "../app/js/core/army.js";
import { Unit } from "../app/js/core/unit.js";
import { UnitDefinition } from "../app/js/core/unit-definition.js";

test("une définition d'unité est configurable et sérialisable", () => {
  const definition = new UnitDefinition({
    id: "archer", name: "Archer", faction: "kingdom", maxQuantity: 10,
    stats: { attack: 4, defense: 2, ranged: 6, mobility: 3, morale: 5 },
    abilities: ["ranged_attack"], costs: { gold: 30, wood: 10, iron: 5, population: 2 }, tags: ["infantry", "ranged"],
  });
  assert.equal(definition.toJSON().stats.ranged, 6);
  assert.deepEqual(definition.abilities, ["ranged_attack"]);
});

test("une unité conserve son identité après des pertes et des renforts", () => {
  const unit = new Unit({ id: "unit-1", ownerPlayerId: "player-1", typeId: "archer", quantity: 8, maxQuantity: 10 });
  assert.equal(unit.lose(3), 3);
  assert.equal(unit.quantity, 5);
  assert.equal(unit.reinforce(8), 5);
  assert.equal(unit.quantity, 10);
  assert.equal(unit.lose(12), 10);
  assert.equal(unit.state, "defeated");
});

test("une armée contient des unités aux identifiants uniques", () => {
  const army = new Army();
  assert.equal(army.addUnit({ id: "unit-1", ownerPlayerId: "player-1", typeId: "archer", quantity: 8, maxQuantity: 10 }), true);
  assert.equal(army.addUnit({ id: "unit-1", ownerPlayerId: "player-1", typeId: "archer", quantity: 8, maxQuantity: 10 }), false);
  assert.equal(army.getUnit("unit-1").typeId, "archer");
  assert.equal(army.removeUnit("unit-1").id, "unit-1");
});
