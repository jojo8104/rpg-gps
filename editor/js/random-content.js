import { addAsset } from "./asset-model.js";
import { addLocation } from "./project.js";

const items = [
  {
    name: "Épée",
    category: "equipment",
    icon: "⚔",
    equipmentSlot: "mainHand",
    stat: "attack",
  },
  {
    name: "Bouclier",
    category: "equipment",
    icon: "◆",
    equipmentSlot: "offHand",
    stat: "defense",
  },
  {
    name: "Casque",
    category: "equipment",
    icon: "◆",
    equipmentSlot: "head",
    stat: "defense",
  },
  {
    name: "Bottes",
    category: "equipment",
    icon: "◆",
    equipmentSlot: "feet",
    stat: "mobility",
  },
  {
    name: "Amulette",
    category: "equipment",
    icon: "◆",
    equipmentSlot: "neck",
    stat: "command",
  },
  { name: "Relique", category: "unique", icon: "◆", equipmentSlot: null },
  { name: "Parchemin", category: "unique", icon: "📜", equipmentSlot: null },
];
const places = [
  { name: "Village", type: "village" },
  { name: "Camp", type: "camp" },
  { name: "Mine", type: "mine" },
  { name: "Camp de bûcherons", type: "lumber-camp" },
  { name: "Carrière", type: "quarry" },
  { name: "Fort", type: "fort" },
];
const npcs = [
  { name: "Marchand", role: "Marchand itinérant" },
  { name: "Éclaireur", role: "Guide" },
  { name: "Érudit", role: "Conseiller" },
  { name: "Artisan", role: "Artisan" },
  { name: "Voyageur", role: "Témoin" },
  { name: "Intendant", role: "Intendant" },
];
function pick(entries, random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1)
    throw new Error(
      "La source aléatoire doit fournir une valeur entre 0 inclus et 1 exclu.",
    );
  return entries[Math.floor(value * entries.length)];
}
/** Point de raccordement futur du générateur de noms par dictionnaires. */
export function provisionalName({ profile, id }) {
  return `${profile.name} ${id.split("-").at(-1)}`;
}
/** Génère une fiche d’édition ; ne crée rien dans une partie ni dans le catalogue actif. */
export function generateRandomContent(
  project,
  kind,
  { random = Math.random, generateName = provisionalName } = {},
) {
  if (!["items", "npcs", "locations"].includes(kind))
    throw new Error("Type de fiche non pris en charge.");
  const profile = pick(
    kind === "items" ? items : kind === "npcs" ? npcs : places,
    random,
  );
  const bonus =
    kind === "items" && profile.stat ? pick([1, 2, 3, 4], random) : null;
  const radius = kind === "locations" ? pick([15, 20, 25, 30], random) : null;
  const location =
    kind === "npcs" && project.world.locations.length
      ? pick(project.world.locations, random)
      : null;
  const entry =
    kind === "locations"
      ? addLocation(project, profile.type)
      : addAsset(project, kind);
  entry.name = generateName({ kind, profile: { ...profile }, id: entry.id });
  if (kind === "items")
    Object.assign(entry, {
      category: profile.category,
      icon: profile.icon,
      equipmentSlot: profile.equipmentSlot,
      modifiers: profile.stat ? { [profile.stat]: bonus } : {},
      description: `${profile.name} généré pour cette aventure.`,
      usage:
        profile.category === "equipment"
          ? "À équiper après intégration au catalogue serveur."
          : "À relier aux actions de la quête selon son utilité.",
    });
  if (kind === "npcs")
    Object.assign(entry, {
      role: profile.role,
      locationId: location?.id ?? "",
      dialogueId: "",
      description: `${profile.name} à rencontrer${location ? ` à ${location.name}` : ""}. Sa conversation reste à écrire.`,
    });
  if (kind === "locations")
    Object.assign(entry, {
      interactionRadius: radius,
      detectionRadius: radius * 3,
    });
  return entry;
}
