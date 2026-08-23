import { getItemDefinition } from "./item-catalog.js";

export const HERO_EQUIPMENT_SLOTS = Object.freeze([
  Object.freeze({ id: "head", name: "Tête" }),
  Object.freeze({ id: "neck", name: "Cou" }),
  Object.freeze({ id: "torso", name: "Torse" }),
  Object.freeze({ id: "mainHand", name: "Main droite" }),
  Object.freeze({ id: "offHand", name: "Main gauche" }),
  Object.freeze({ id: "feet", name: "Pieds" }),
  Object.freeze({ id: "accessory1", name: "Accessoire I" }),
  Object.freeze({ id: "accessory2", name: "Accessoire II" }),
]);

const STAT_IDS = Object.freeze(["attack", "defense", "morale", "mobility", "command", "health"]);

export class EquipmentService {
  equip(hero, packageId, requestedSlot = null) {
    const index = hero.carriedLoot.findIndex((entry) => entry.id === packageId);
    if (index === -1) return { success: false, reason: "item_not_carried" };
    const entry = hero.carriedLoot[index]; const definition = getItemDefinition(entry.itemId);
    if (definition?.category !== "equipment") return { success: false, reason: "item_not_equipment" };
    const slot = requestedSlot ?? this.firstCompatibleFreeSlot(hero, definition);
    if (!slot || !this.isCompatible(definition, slot)) return { success: false, reason: "incompatible_slot" };
    const previousItemId = hero.equipment[slot] ?? null;
    hero.carriedLoot.splice(index, 1);
    if (previousItemId) hero.addCarriedLoot([{ id: `unequipped-${slot}-${Date.now()}`, itemId: previousItemId, quantity: 1, valuePerUnit: 1 }]);
    hero.equipment[slot] = entry.itemId; this.recalculateModifiers(hero);
    return { success: true, slot, itemId: entry.itemId, previousItemId, modifiers: { ...hero.equipmentModifiers } };
  }

  unequip(hero, slot, { freeSlots = Infinity, id = `unequipped-${slot}-${Date.now()}` } = {}) {
    if (!HERO_EQUIPMENT_SLOTS.some((entry) => entry.id === slot)) return { success: false, reason: "invalid_slot" };
    const itemId = hero.equipment[slot]; if (!itemId) return { success: false, reason: "empty_slot" };
    if (freeSlots < 1) return { success: false, reason: "insufficient_slots" };
    delete hero.equipment[slot]; hero.addCarriedLoot([{ id, itemId, quantity: 1, valuePerUnit: 1 }]); this.recalculateModifiers(hero);
    return { success: true, slot, itemId, modifiers: { ...hero.equipmentModifiers } };
  }

  recalculateModifiers(hero) {
    const totals = Object.fromEntries(STAT_IDS.map((stat) => [stat, 0]));
    Object.values(hero.equipment).forEach((itemId) => { const modifiers = getItemDefinition(itemId)?.modifiers ?? {}; STAT_IDS.forEach((stat) => { totals[stat] += modifiers[stat] ?? 0; }); });
    hero.equipmentModifiers = totals; return totals;
  }

  isCompatible(definition, slot) { return definition.equipmentSlot === slot || definition.equipmentSlot === "accessory" && slot.startsWith("accessory"); }
  firstCompatibleFreeSlot(hero, definition) { return HERO_EQUIPMENT_SLOTS.find((slot) => !hero.equipment[slot.id] && this.isCompatible(definition, slot.id))?.id ?? null; }
}
