import test from "node:test";
import assert from "node:assert/strict";
import { ItemStack } from "../app/js/core/item-stack.js";
import { SlotContainer, createStacksForQuantity } from "../app/js/core/slot-container.js";
import { InventoryService } from "../app/js/core/inventory-service.js";

test("les quantités sont découpées en paquets complets et incomplets", () => {
  assert.deepEqual(createStacksForQuantity({ itemId: "food", quantity: 24 }).map((stack) => stack.quantity), [10, 10, 4]);
});

test("deux paquets compatibles fusionnent dans un slot", () => {
  const container = new SlotContainer({ id: "bag", name: "Bagages", slotCount: 2, slots: [{ id: "a", itemId: "wood", quantity: 12 }] });
  container.add(new ItemStack({ id: "b", itemId: "wood", quantity: 8 }));
  assert.equal(container.usedSlots, 1); assert.equal(container.slots[0].quantity, 20);
});

test("un transfert conserve un paquet lorsque la destination est pleine", () => {
  const source = new SlotContainer({ id: "a", name: "A", slotCount: 1, slots: [{ id: "food", itemId: "food", quantity: 10 }] });
  const target = new SlotContainer({ id: "b", name: "B", slotCount: 1, slots: [{ id: "stone", itemId: "stone", quantity: 10 }] });
  assert.equal(source.moveTo(target, 0).success, false); assert.equal(source.quantityOf("food"), 10);
});

test("la population devient des paquets puis réintègre la localisation", () => {
  let sequence = 0; const service = new InventoryService({ idGenerator: () => `group-${++sequence}` });
  const location = { population: 12, resources: { infrastructureStorage: 3 } }; const bag = new SlotContainer({ id: "bag", name: "Bagages", slotCount: 8 });
  const result = service.createPopulationPackages({ location, container: bag, people: 7 });
  assert.equal(result.success, true); assert.equal(location.population, 5); assert.deepEqual(bag.slots.filter(Boolean).map((stack) => stack.quantity), [5, 2]);
  service.settlePopulation({ location, container: bag, slotIndex: 1 }); assert.equal(location.population, 7);
});

test("la capacité universelle utilise un demi-slot par habitant, les infrastructures et ses bornes", () => {
  const service = new InventoryService();
  assert.equal(service.getLocationSlotCount({ population: 4, resources: { infrastructureStorage: 0 } }), 4);
  assert.equal(service.getLocationSlotCount({ population: 24, resources: { infrastructureStorage: 3 } }), 15);
  assert.equal(service.getLocationSlotCount({ population: 100, resources: { infrastructureStorage: 20 } }), 40);
});

test("la consommation vaut une unité par formation et par grade", () => {
  assert.equal(new InventoryService().getArmyConsumption([{ rank: "soldier" }, { rank: "veteran" }, { rank: "elite" }]), 6);
});

test("les slots utilisés du héros respectent la taille de chaque paquet", () => {
  const service = new InventoryService();
  assert.equal(service.getUsedHeroBagSlots({ resources: { gold: 101, wood: 20, food: 4 }, carriedLoot: [{ itemId: "message", quantity: 1 }] }), 5);
});
