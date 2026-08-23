import { HERO_EQUIPMENT_SLOTS } from "../core/equipment-service.js";
import { getItemDefinition } from "../core/item-catalog.js";

export function renderEquipmentView({ hero }) {
  const equipmentSlots = HERO_EQUIPMENT_SLOTS.map((slot) => equipmentSlot(hero, slot)).join("");
  const available = hero.carriedLoot.filter((entry) => getItemDefinition(entry.itemId)?.category === "equipment");
  return `<section class="hero-equipment-panel"><header><div><p class="eyebrow">Équipement du héros</p><h4>Armurerie</h4></div><small>Bonus fixes et cumulés</small></header><div class="hero-equipment-layout"><div class="hero-equipment-silhouette" aria-hidden="true">♞</div><div class="hero-equipment-slots">${equipmentSlots}</div></div><h5>Dans les bagages</h5><div class="equipment-bag-list">${available.map(equipmentBagItem).join("") || '<span class="text-muted">Aucun équipement transporté.</span>'}</div></section>`;
}

export function bindEquipmentView(element, { onEquip, onUnequip }) {
  element.querySelectorAll("[data-equip-package]").forEach((button) => button.addEventListener("click", () => onEquip(button.dataset.equipPackage)));
  element.querySelectorAll("[data-unequip-slot]").forEach((button) => button.addEventListener("click", () => onUnequip(button.dataset.unequipSlot)));
}

function equipmentSlot(hero, slot) {
  const itemId = hero.equipment[slot.id]; const definition = itemId ? getItemDefinition(itemId) : null;
  return `<button type="button" class="hero-equipment-slot${definition ? " is-equipped" : ""}" ${definition ? `data-unequip-slot="${slot.id}"` : "disabled"} title="${definition ? `Retirer ${definition.name}` : slot.name}"><span>${definition?.icon ?? "＋"}</span><strong>${slot.name}</strong><small>${definition ? modifierLabel(definition.modifiers) : "Vide"}</small></button>`;
}

function equipmentBagItem(entry) { const definition = getItemDefinition(entry.itemId); return `<button type="button" class="equipment-bag-item" data-equip-package="${entry.id}"><span>${definition.icon}</span><strong>${definition.name}</strong><small>${modifierLabel(definition.modifiers)}</small></button>`; }
function modifierLabel(modifiers = {}) { const labels = { attack: "ATQ", defense: "DÉF", morale: "MOR", mobility: "MOB", command: "CMD", health: "PV" }; return Object.entries(modifiers).map(([stat, value]) => `${labels[stat] ?? stat} ${value >= 0 ? "+" : ""}${value}`).join(" · ") || "Aucun bonus"; }
