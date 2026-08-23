import test from "node:test";
import assert from "node:assert/strict";
import { Hero } from "../app/js/core/hero.js";
import { EquipmentService } from "../app/js/core/equipment-service.js";

const hero = () => new Hero({ id: "h", playerId: "p", name: "Ada", carriedLoot: [{ id: "sword-1", itemId: "iron_sword", quantity: 1 }, { id: "ring-1", itemId: "lucky_ring", quantity: 1 }] });

test("équiper retire l'objet des bagages et applique ses bonus", () => {
  const subject = hero(); const result = new EquipmentService().equip(subject, "sword-1");
  assert.equal(result.success, true); assert.equal(subject.equipment.mainHand, "iron_sword"); assert.equal(subject.equipmentModifiers.attack, 2); assert.equal(subject.carriedLoot.some((entry) => entry.id === "sword-1"), false);
});

test("les accessoires occupent le premier emplacement compatible et cumulent leurs bonus", () => {
  const subject = hero(); const service = new EquipmentService(); service.equip(subject, "sword-1"); service.equip(subject, "ring-1");
  assert.equal(subject.equipment.accessory1, "lucky_ring"); assert.equal(subject.finalStats.attack, subject.baseStats.attack + 2); assert.equal(subject.finalStats.morale, subject.baseStats.morale + 1);
});

test("retirer un équipement exige un slot libre et le remet dans les bagages", () => {
  const subject = hero(); const service = new EquipmentService(); service.equip(subject, "sword-1");
  assert.equal(service.unequip(subject, "mainHand", { freeSlots: 0 }).success, false);
  assert.equal(service.unequip(subject, "mainHand", { freeSlots: 1, id: "returned" }).success, true); assert.equal(subject.carriedLoot.at(-1).id, "returned"); assert.equal(subject.equipmentModifiers.attack, 0);
});
