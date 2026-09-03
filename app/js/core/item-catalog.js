export const ITEM_DEFINITIONS = Object.freeze({
  gold: item("gold", "Or", "resource", 100, "🪙", { description: "Une réserve de monnaie et de métal précieux.", usage: "Sert à recruter, commercer et financer certains développements." }),
  wood: item("wood", "Bois", "resource", 20, "🪵", { description: "Du bois équarri prêt à être transporté.", usage: "Sert principalement à construire et améliorer les bâtiments." }),
  stone: item("stone", "Pierre", "resource", 10, "🪨", { description: "Des blocs solides extraits des carrières.", usage: "Sert aux constructions durables et aux fortifications." }),
  iron: item("iron", "Fer", "resource", 10, "◈", { description: "Du minerai et des lingots utilisables par les artisans.", usage: "Sert à fabriquer ou renforcer l’équipement et les installations militaires." }),
  food: item("food", "Nourriture", "consumable", 10, "🥖", {
    description: "Des rations destinées aux troupes et aux voyageurs.",
    usage: "Évite la faim et accorde +1 moral pendant sa période d’effet.",
    effectId: "supplied",
    consumptionPeriodTicks: 6,
  }),
  beer: item("beer", "Bière", "consumable", 6, "🍺", {
    description: "Une boisson appréciée des soldats après une longue marche.",
    usage: "Accorde +2 moral mais réduit temporairement la défense de 1.",
    effectId: "enthusiasm",
    consumptionPeriodTicks: 6,
  }),
  horse: item("horse", "Cheval", "livestock", 1, "🐎", { description: "Une monture apte au voyage et au service militaire.", usage: "Ressource logistique destinée au transport et aux unités montées." }),
  population: item("population", "Population", "population", 5, "👥", { description: "Des habitants placés sous la protection du héros.", usage: "Doit être conduit vers un lieu sûr pouvant les accueillir." }),
  royal_geologist: item(
    "royal_geologist",
    "Géologue royal",
    "character",
    1,
    "🧭",
    { unique: true, description: "Un spécialiste royal des mines et des filons.", usage: "Personnage de quête à escorter jusqu’à sa destination." },
  ),
  incomplete_mine_report: item(
    "incomplete_mine_report",
    "Rapport incomplet des prospecteurs",
    "unique",
    1,
    "📜",
    { unique: true, description: "Des notes fragmentaires laissées par les prospecteurs.", usage: "Objet de quête fournissant un indice sur leur disparition." },
  ),
  abandoned_mine_report: item(
    "abandoned_mine_report",
    "Rapport sur la mine",
    "unique",
    1,
    "📜",
    { unique: true, description: "Le compte rendu des événements survenus dans la mine.", usage: "Objet de quête à remettre aux autorités royales." },
  ),
  iron_sword: item("iron_sword", "Épée de fer", "equipment", 1, "⚔", {
    unique: true,
    description: "Une épée robuste forgée pour le combat rapproché.",
    usage: "S’équipe en main principale et accorde +2 attaque.",
    equipmentSlot: "mainHand",
    modifiers: { attack: 2 },
  }),
  round_shield: item("round_shield", "Bouclier rond", "equipment", 1, "◉", {
    unique: true,
    description: "Un bouclier maniable cerclé de métal.",
    usage: "S’équipe en main secondaire et accorde +2 défense.",
    equipmentSlot: "offHand",
    modifiers: { defense: 2 },
  }),
  leather_armor: item("leather_armor", "Armure de cuir", "equipment", 1, "🛡", {
    unique: true,
    description: "Une protection légère qui préserve la liberté de mouvement.",
    usage: "S’équipe sur le torse et accorde +1 défense et +1 mobilité.",
    equipmentSlot: "torso",
    modifiers: { defense: 1, mobility: 1 },
  }),
  scout_hood: item("scout_hood", "Capuche d'éclaireur", "equipment", 1, "⌃", {
    unique: true,
    description: "Une capuche discrète adaptée aux longues reconnaissances.",
    usage: "S’équipe sur la tête et accorde +1 mobilité.",
    equipmentSlot: "head",
    modifiers: { mobility: 1 },
  }),
  marching_boots: item(
    "marching_boots",
    "Bottes de marche",
    "equipment",
    1,
    "♟",
    { unique: true, description: "Des bottes solides conçues pour parcourir de longues distances.", usage: "S’équipent aux pieds et accordent +2 mobilité.", equipmentSlot: "feet", modifiers: { mobility: 2 } },
  ),
  command_amulet: item(
    "command_amulet",
    "Amulette de commandement",
    "equipment",
    1,
    "✦",
    {
      unique: true,
      description: "Un talisman porté par les chefs capables de rallier leurs troupes.",
      usage: "S’équipe au cou et accorde +1 commandement et +1 moral.",
      equipmentSlot: "neck",
      modifiers: { command: 1, morale: 1 },
    },
  ),
  lucky_ring: item("lucky_ring", "Anneau de chance", "equipment", 1, "○", {
    unique: true,
    description: "Un anneau auquel son porteur prête une heureuse influence.",
    usage: "S’équipe comme accessoire et accorde +1 moral.",
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
  description = "Un objet unique.",
  usage = "Son utilité dépend de sa provenance et de la quête associée.",
}) {
  if (!["unique", "equipment", "character"].includes(category))
    throw new RangeError("La catégorie unique est inconnue.");
  return item(id, name, category, 1, icon, {
    unique: true,
    equipmentSlot,
    modifiers: { ...modifiers },
    description,
    usage,
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
