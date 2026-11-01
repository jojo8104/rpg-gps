import { HERO_ITEM_DEFINITIONS } from "./hero-item-catalog.js";
import { normalizeVisual } from "./visual-definition.js";
import { EQUIPMENT_ART } from "./equipment-art.js";

const LEGACY_ITEM_DEFINITIONS = Object.freeze({
  ...Object.fromEntries(
    [
      ["message", "Message écrit"],
      ["written_message", "Message écrit"],
      ["sealed_fort_message", "Message scellé"],
      ["parchment", "Parchemin"],
      ["paper", "Papier"],
      ["scroll", "Parchemin"],
      ["letter", "Lettre"],
    ].map(([id, name]) => [
      id,
      item(id, name, "document", 1, "📜", {
        bagSlots: 0,
        description:
          "Un document écrit conservé hors de la capacité des bagages.",
        usage: "Peut être lu, transporté ou remis selon son contenu.",
      }),
    ]),
  ),
  authority_writ: item(
    "authority_writ",
    "Mandat d’autorité",
    "equipment",
    1,
    "📜",
    {
      unique: true,
      rarity: "rare",
      equipmentSlot: "accessory",
      modifiers: { authority: 3 },
      description:
        "Un mandat royal autorisant le commandement de renforts. Conservé après la mission.",
      usage:
        "Équiper dans un emplacement d’accessoire : +3 autorité, soit une unité de lanciers au grade Soldat.",
    },
  ),
  royal_boss_head: item(
    "royal_boss_head",
    "Couronne du souverain",
    "equipment",
    1,
    "♛",
    { unique: true, equipmentSlot: "head", modifiers: { defense: 3 } },
  ),
  royal_boss_neck: item(
    "royal_boss_neck",
    "Sceau du commandement royal",
    "equipment",
    1,
    "◆",
    { unique: true, equipmentSlot: "neck", modifiers: { command: 2 } },
  ),
  royal_boss_torso: item(
    "royal_boss_torso",
    "Armure du dernier rempart",
    "equipment",
    1,
    "♜",
    { unique: true, equipmentSlot: "torso", modifiers: { defense: 5 } },
  ),
  royal_boss_mainHand: item(
    "royal_boss_mainHand",
    "Lame du serment brisé",
    "equipment",
    1,
    "⚔",
    { unique: true, equipmentSlot: "mainHand", modifiers: { attack: 6 } },
  ),
  royal_boss_offHand: item(
    "royal_boss_offHand",
    "Égide de la capitale",
    "equipment",
    1,
    "◉",
    { unique: true, equipmentSlot: "offHand", modifiers: { defense: 4 } },
  ),
  royal_boss_feet: item(
    "royal_boss_feet",
    "Solerets de marche royale",
    "equipment",
    1,
    "♞",
    { unique: true, equipmentSlot: "feet", modifiers: { mobility: 2 } },
  ),
  royal_boss_accessory1: item(
    "royal_boss_accessory1",
    "Anneau du maréchal",
    "equipment",
    1,
    "◌",
    { unique: true, equipmentSlot: "accessory", modifiers: { morale: 3 } },
  ),
  royal_boss_accessory2: item(
    "royal_boss_accessory2",
    "Insigne du conquérant",
    "equipment",
    1,
    "✦",
    {
      unique: true,
      equipmentSlot: "accessory",
      modifiers: { attack: 2, command: 1 },
    },
  ),
  gold: item("gold", "Or", "resource", 100, "🪙", {
    description: "Une réserve de monnaie et de métal précieux.",
    usage: "Sert à recruter, commercer et financer certains développements.",
  }),
  wood: item("wood", "Bois", "resource", 20, "🪵", {
    description: "Du bois équarri prêt à être transporté.",
    usage: "Sert principalement à construire et améliorer les bâtiments.",
  }),
  stone: item("stone", "Pierre", "resource", 10, "🪨", {
    description: "Des blocs solides extraits des carrières.",
    usage: "Sert aux constructions durables et aux fortifications.",
  }),
  iron: item("iron", "Fer", "resource", 10, "◈", {
    description: "Du minerai et des lingots utilisables par les artisans.",
    usage:
      "Sert à fabriquer ou renforcer l’équipement et les installations militaires.",
  }),
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
  horse: item("horse", "Chevaux", "livestock", 5, "🐎", {
    description: "Des montures élevées et préparées par les écuries.",
    usage:
      "Utilisables pour les convois, la prospection et le recrutement des unités de cavalerie.",
  }),
  exploration_tools: item(
    "exploration_tools",
    "Outils d’exploration",
    "equipment-supply",
    1,
    "⛏",
    {
      description: "Un nécessaire de mesure, de relevé et de prélèvement.",
      usage: "Requis pour lancer une mission de prospection.",
    },
  ),
  specialist_geologist: item(
    "specialist_geologist",
    "Géologue",
    "specialist",
    1,
    "🧭",
    {
      description: "Un spécialiste des filons, mines et carrières.",
      usage: "Peut diriger une mission de prospection.",
    },
  ),
  specialist_cartographer: item(
    "specialist_cartographer",
    "Cartographe",
    "specialist",
    1,
    "🗺",
    {
      description: "Un spécialiste des cartes et du relevé de terrain.",
      usage: "Peut diriger une mission de prospection.",
    },
  ),
  specialist_adventurer: item(
    "specialist_adventurer",
    "Aventurier",
    "specialist",
    1,
    "🥾",
    {
      description: "Un explorateur habitué aux régions inconnues.",
      usage: "Peut diriger une mission de prospection.",
    },
  ),
  specialist_miner: item(
    "specialist_miner",
    "Mineur aguerri",
    "specialist",
    1,
    "⛏",
    {
      usage:
        "Augmente la production de fer lorsqu’il est déposé dans un lieu producteur.",
    },
  ),
  specialist_lumberjack: item(
    "specialist_lumberjack",
    "Bûcheron aguerri",
    "specialist",
    1,
    "🪓",
    {
      usage:
        "Augmente la production de bois lorsqu’il est déposé dans un lieu producteur.",
    },
  ),
  specialist_farmer: item(
    "specialist_farmer",
    "Maître fermier",
    "specialist",
    1,
    "🌾",
    {
      usage:
        "Augmente la production de nourriture lorsqu’il est déposé dans un lieu producteur.",
    },
  ),
  officer_drill: item(
    "officer_drill",
    "Officier instructeur",
    "specialist",
    1,
    "🎖",
    { usage: "Peut être appliqué à une unité pour lui donner 40 XP." },
  ),
  officer_veteran: item(
    "officer_veteran",
    "Capitaine vétéran",
    "specialist",
    1,
    "🎖",
    { usage: "Peut être appliqué à une unité pour lui donner 80 XP." },
  ),
  population: item("population", "Population", "population", 5, "👥", {
    description: "Des habitants placés sous la protection du héros.",
    usage: "Doit être conduit vers un lieu sûr pouvant les accueillir.",
  }),
  royal_geologist: item(
    "royal_geologist",
    "Géologue royal",
    "character",
    1,
    "🧭",
    {
      unique: true,
      description: "Un spécialiste royal des mines et des filons.",
      usage: "Personnage de quête à escorter jusqu’à sa destination.",
    },
  ),
  incomplete_mine_report: item(
    "incomplete_mine_report",
    "Rapport incomplet des prospecteurs",
    "unique",
    1,
    "📜",
    {
      unique: true,
      description: "Des notes fragmentaires laissées par les prospecteurs.",
      usage: "Objet de quête fournissant un indice sur leur disparition.",
    },
  ),
  abandoned_mine_report: item(
    "abandoned_mine_report",
    "Rapport sur la mine",
    "unique",
    1,
    "📜",
    {
      unique: true,
      description: "Le compte rendu des événements survenus dans la mine.",
      usage: "Objet de quête à remettre aux autorités royales.",
    },
  ),
  iron_sword: item("iron_sword", "Épée de fer", "equipment", 1, "⚔", {
    unique: true,
    image: "assets/equipment/iron-sword.png",
    description: "Une épée robuste forgée pour le combat rapproché.",
    usage: "S’équipe en main principale et accorde +2 attaque.",
    equipmentSlot: "mainHand",
    modifiers: { attack: 2 },
  }),
  steel_sword: item("steel_sword", "Épée d’acier", "equipment", 1, "⚔", {
    unique: true,
    image: "assets/equipment/steel-sword.png",
    description:
      "Une lame d’acier ouvragée, plus tranchante et mieux équilibrée que l’épée de fer.",
    usage: "S’équipe en main principale et accorde +4 attaque.",
    equipmentSlot: "mainHand",
    modifiers: { attack: 4 },
  }),
  round_shield: item("round_shield", "Bouclier rond", "equipment", 1, "◉", {
    unique: true,
    image: "assets/equipment/round-shield.png",
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
    image: "assets/equipment/scout-hood.png",
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
    {
      unique: true,
      description:
        "Des bottes solides conçues pour parcourir de longues distances.",
      usage: "S’équipent aux pieds et accordent +2 mobilité.",
      equipmentSlot: "feet",
      modifiers: { mobility: 2 },
    },
  ),
  command_amulet: item(
    "command_amulet",
    "Amulette de commandement",
    "equipment",
    1,
    "✦",
    {
      unique: true,
      description:
        "Un talisman porté par les chefs capables de rallier leurs troupes.",
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

export const ITEM_DEFINITIONS = Object.freeze({
  ...Object.fromEntries(
    Object.entries(LEGACY_ITEM_DEFINITIONS).map(([id, definition]) => [
      id,
      EQUIPMENT_ART[id]
        ? Object.freeze({ ...definition, image: EQUIPMENT_ART[id] })
        : definition,
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(HERO_ITEM_DEFINITIONS).map(([id, definition]) => [
      id,
      Object.freeze({ ...LEGACY_ITEM_DEFINITIONS[id], ...definition }),
    ]),
  ),
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
  if (
    typeof itemId === "string" &&
    /^(?:clue-(?:localization|search)-|exploration-clue-)/.test(itemId)
  ) {
    const localization = itemId.startsWith("clue-localization-");
    return item(
      itemId,
      localization ? "Carte de localisation" : "Parchemin indice",
      "clue",
      1,
      localization ? "🗺️" : "📜",
      {
        unique: true,
        bagSlots: 0,
        description:
          "Un indice réutilisable. Son contenu autorisé figure sur le parchemin.",
        usage:
          "Lire sans consommer. Un indice de localisation indique où aller ; un indice de recherche aide uniquement à chercher sur place.",
      },
    );
  }
  if (typeof itemId === "string" && itemId.startsWith("reinforced:")) {
    const base = ITEM_DEFINITIONS[itemId.slice(11)];
    if (!base || !["shield", "helmet", "heavyArmor"].includes(base.family))
      return null;
    const modifiers = { ...base.modifiers };
    for (const stat of ["attack", "defense"])
      if (modifiers[stat] > 0) modifiers[stat] += 1;
    return {
      ...base,
      id: itemId,
      baseItemId: base.id,
      name: `${base.name} renforcé`,
      modifiers,
    };
  }
  return ITEM_DEFINITIONS[itemId] ?? null;
}

export function createUniqueItemDefinition({
  id,
  name,
  category = "unique",
  icon = "◆",
  visual = null,
  equipmentSlot = null,
  modifiers = {},
  description = "Un objet unique.",
  usage = "Son utilité dépend de sa provenance et de la quête associée.",
}) {
  if (!["unique", "equipment", "character"].includes(category))
    throw new RangeError("La catégorie unique est inconnue.");
  return item(id, name, category, 1, icon, {
    unique: true,
    ...(visual ? { visual: normalizeVisual(visual) } : {}),
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
