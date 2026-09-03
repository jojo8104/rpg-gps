import { HERO_EQUIPMENT_SLOTS } from "../core/equipment-service.js";
import { getItemDefinition } from "../core/item-catalog.js";

export function renderEquipmentView({ hero, openSlotId = null }) {
  const equipmentSlots = HERO_EQUIPMENT_SLOTS.map((slot) =>
    equipmentSlot(hero, slot),
  ).join("");
  const openSlot = HERO_EQUIPMENT_SLOTS.find((slot) => slot.id === openSlotId);
  const menu = openSlot ? equipmentMenu(hero, openSlot) : "";
  return `<section class="hero-equipment-panel" aria-label="Équipement du héros"><div class="hero-equipment-layout"><div class="hero-equipment-silhouette" aria-hidden="true"><svg viewBox="0 0 180 420" role="presentation"><circle cx="90" cy="45" r="31"/><path d="M60 88 Q90 72 120 88 L139 190 L119 247 L112 399 L72 399 L65 247 L42 190 Z"/><path d="M55 105 L20 218 L42 229 L72 151 M125 105 L160 218 L138 229 L108 151"/><path d="M68 245 L47 397 L78 397 L91 274 L102 397 L133 397 L112 245"/></svg></div><div class="hero-equipment-slots">${equipmentSlots}</div></div><aside class="equipment-slot-menu" data-equipment-menu-slot="${openSlotId ?? ""}" ${openSlot ? "" : "hidden"}>${menu}</aside></section>`;
}

export function bindEquipmentView(element, { onEquip, onUnequip, onMenuChange = () => {} }) {
  const menu = element.querySelector(".equipment-slot-menu");
  const bindMenu = () => {
    const slotId = menu.dataset.equipmentMenuSlot;
    menu.querySelector(".equipment-menu-close")?.addEventListener("click", () => {
      menu.hidden = true;
      onMenuChange(null);
    });
    menu.querySelectorAll("[data-equip-package]").forEach((choice) =>
      choice.addEventListener("click", () => onEquip(choice.dataset.equipPackage, slotId)),
    );
    menu.querySelector("[data-remove-equipment]")?.addEventListener("click", () => onUnequip(slotId));
  };
  if (!menu.hidden) bindMenu();
  element.querySelectorAll("[data-equipment-slot]").forEach((button) =>
    button.addEventListener("click", () => {
      const slotId = button.dataset.equipmentSlot;
      const choices = JSON.parse(
        decodeURIComponent(button.dataset.equipmentChoices),
      );
      const current = button.dataset.currentItem;
      menu.innerHTML = `<button type="button" class="equipment-menu-close" aria-label="Fermer">×</button><div>${choices.map(equipmentChoice).join("")}${current ? `<button type="button" class="equipment-menu-choice is-remove" data-remove-equipment="${slotId}"><span>−</span><strong>Retirer</strong></button>` : ""}</div>`;
      menu.dataset.equipmentMenuSlot = slotId;
      menu.hidden = false;
      onMenuChange(slotId);
      bindMenu();
    }),
  );
}

function equipmentMenu(hero, slot) {
  const state = equipmentSlotState(hero, slot);
  const choices = state.available.map((entry) => ({ id: entry.id, itemId: entry.itemId, name: entry.definition.name, icon: entry.definition.icon, modifiers: modifierLabel(entry.definition.modifiers) }));
  return `<button type="button" class="equipment-menu-close" aria-label="Fermer">×</button><div>${choices.map(equipmentChoice).join("")}${state.definition ? `<button type="button" class="equipment-menu-choice is-remove" data-remove-equipment="${slot.id}"><span>−</span><strong>Retirer</strong></button>` : ""}</div>`;
}

function equipmentSlot(hero, slot) {
  const state = equipmentSlotState(hero, slot);
  const choices = state.available.map((entry) => ({
    id: entry.id,
    itemId: entry.itemId,
    name: entry.definition.name,
    icon: entry.definition.icon,
    modifiers: modifierLabel(entry.definition.modifiers),
  }));
  return `<button type="button" class="hero-equipment-slot ${state.className}" data-equipment-slot="${slot.id}" data-equipment-choices="${encodeURIComponent(JSON.stringify(choices))}" data-current-item="${state.definition?.id ?? ""}" aria-label="${slot.name}${state.definition ? `, ${state.definition.name}` : ", vide"}${state.available.length ? `, ${state.available.length} choix disponible${state.available.length > 1 ? "s" : ""}` : ""}" ${!state.definition && state.available.length === 0 ? "disabled" : ""}><span>${state.definition?.icon ?? "＋"}</span><strong>${slot.name}</strong><small>${state.definition ? modifierLabel(state.definition.modifiers) : "Vide"}</small></button>`;
}

export function equipmentSlotState(hero, slot) {
  const itemId = hero.equipment[slot.id];
  const definition = itemId ? getItemDefinition(itemId) : null;
  const available = hero.carriedLoot
    .map((entry) => ({ ...entry, definition: getItemDefinition(entry.itemId) }))
    .filter(
      (entry) =>
        entry.definition?.category === "equipment" &&
        isCompatible(entry.definition, slot.id),
    );
  const betterAvailable =
    definition !== null &&
    available.some(
      (entry) => equipmentScore(entry.definition) > equipmentScore(definition),
    );
  const className = definition
    ? `is-equipped ${betterAvailable ? "has-upgrade" : "is-best"}`
    : available.length
      ? "has-available"
      : "is-empty";
  return { definition, available, betterAvailable, className };
}

function equipmentChoice(choice) {
  return `<button type="button" class="equipment-menu-choice" data-equip-package="${choice.id}"><span>${choice.icon}</span><strong>${choice.name}</strong><small>${choice.modifiers}</small></button>`;
}
function isCompatible(definition, slotId) {
  return (
    definition.equipmentSlot === slotId ||
    (definition.equipmentSlot === "accessory" && slotId.startsWith("accessory"))
  );
}
function equipmentScore(definition) {
  return Object.values(definition.modifiers ?? {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
}
function modifierLabel(modifiers = {}) {
  const labels = {
    attack: "ATQ",
    defense: "DÉF",
    morale: "MOR",
    mobility: "MOB",
    command: "CMD",
    health: "PV",
  };
  return (
    Object.entries(modifiers)
      .map(
        ([stat, value]) =>
          `${labels[stat] ?? stat} ${value >= 0 ? "+" : ""}${value}`,
      )
      .join(" · ") || "Aucun bonus"
  );
}
