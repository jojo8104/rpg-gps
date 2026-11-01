import test from "node:test";
import assert from "node:assert/strict";
import { equipmentDisplay } from "../app/js/ui/equipment-display.js";

test("l'anticipation déplace seulement les données visuelles et ne double pas une confirmation reçue", () => {
  const hero = {
    id: "h",
    equipment: { mainHand: "iron_sword" },
    carriedLoot: [{ id: "new", itemId: "steel_sword", quantity: 1 }],
    equipmentModifiers: { attack: 2 },
  };
  const before = structuredClone(hero);
  const intent = {
    heroId: "h",
    type: "equip",
    slot: "mainHand",
    packageId: "new",
    itemId: "steel_sword",
  };
  const display = equipmentDisplay(hero, intent);
  assert.deepEqual(hero, before);
  assert.equal(display.equipment.mainHand, "steel_sword");
  assert.equal(display.carriedLoot.length, 1);
  assert.equal(display.carriedLoot[0].itemId, "iron_sword");
  const official = { ...hero, ...display };
  assert.deepEqual(equipmentDisplay(official, intent), display);
  const removal = { heroId: "h", type: "unequip", slot: "mainHand" };
  const removed = equipmentDisplay(hero, removal);
  assert.equal(removed.equipment.mainHand, undefined);
  assert.equal(removed.carriedLoot.length, 2);
  assert.deepEqual(equipmentDisplay({ ...hero, ...removed }, removal), removed);
});
