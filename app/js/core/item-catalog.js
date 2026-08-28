export const ITEM_DEFINITIONS = Object.freeze({
  gold: item("gold", "Or", "resource", 100, "🪙"),
  wood: item("wood", "Bois", "resource", 20, "🪵"),
  stone: item("stone", "Pierre", "resource", 10, "🪨"),
  iron: item("iron", "Fer", "resource", 10, "◈"),
  food: item("food", "Nourriture", "consumable", 10, "🥖", {
    effectId: "supplied",
    consumptionPeriodTicks: 6,
  }),
  beer: item("beer", "Bière", "consumable", 6, "🍺", {
    effectId: "enthusiasm",
    consumptionPeriodTicks: 6,
  }),
  horse: item("horse", "Cheval", "livestock", 1, "🐎"),
  population: item("population", "Population", "population", 5, "👥"),
  royal_geologist: item(
    "royal_geologist",
    "Géologue royal",
    "character",
    1,
    "🧭",
    { unique: true },
  ),
  incomplete_mine_report: item(
    "incomplete_mine_report",
    "Rapport incomplet des prospecteurs",
    "unique",
    1,
    "📜",
    { unique: true },
  ),
  abandoned_mine_report: item(
    "abandoned_mine_report",
    "Rapport sur la mine",
    "unique",
    1,
    "📜",
    { unique: true },
  ),
  iron_sword: item("iron_sword", "Épée de fer", "equipment", 1, "⚔", {
    unique: true,
    equipmentSlot: "mainHand",
    modifiers: { attack: 2 },
  }),
  round_shield: item("round_shield", "Bouclier rond", "equipment", 1, "◉", {
    unique: true,
    equipmentSlot: "offHand",
    modifiers: { defense: 2 },
  }),
  leather_armor: item("leather_armor", "Armure de cuir", "equipment", 1, "🛡", {
    unique: true,
    equipmentSlot: "torso",
    modifiers: { defense: 1, mobility: 1 },
  }),
  scout_hood: item("scout_hood", "Capuche d'éclaireur", "equipment", 1, "⌃", {
    unique: true,
    equipmentSlot: "head",
    modifiers: { mobility: 1 },
  }),
  marching_boots: item(
    "marching_boots",
    "Bottes de marche",
    "equipment",
    1,
    "♟",
    { unique: true, equipmentSlot: "feet", modifiers: { mobility: 2 } },
  ),
  command_amulet: item(
    "command_amulet",
    "Amulette de commandement",
    "equipment",
    1,
    "✦",
    {
      unique: true,
      equipmentSlot: "neck",
      modifiers: { command: 1, morale: 1 },
    },
  ),
  lucky_ring: item("lucky_ring", "Anneau de chance", "equipment", 1, "○", {
    unique: true,
    equipmentSlot: "accessory",
    modifiers: { morale: 1 },
  }),
});

export const CONSUMABLE_EFFECTS = Object.freeze({
  supplied: Object.freeze({
    morale: 1,
    description: "+1 moral et aucun malus de faim.",
  }),
  enthusiasm: Object.freeze({
    morale: 2,
    defense: -1,
    description: "+2 moral, -1 défense.",
  }),
});

export function getItemDefinition(itemId) {
  return ITEM_DEFINITIONS[itemId] ?? null;
}

export function createUniqueItemDefinition({
  id,
  name,
  category = "unique",
  icon = "◆",
  equipmentSlot = null,
  modifiers = {},
}) {
  if (!["unique", "equipment", "character"].includes(category))
    throw new RangeError("La catégorie unique est inconnue.");
  return item(id, name, category, 1, icon, {
    unique: true,
    equipmentSlot,
    modifiers: { ...modifiers },
  });
}

function item(id, name, category, bundleSize, icon, extra = {}) {
  return Object.freeze({
    id,
    name,
    category,
    bundleSize,
    icon,
    unique: false,
    ...extra,
  });
}
