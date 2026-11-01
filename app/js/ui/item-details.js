import { itemModifierLabel } from "../core/hero-item-catalog.js";

export function itemRarityLabel(definition) {
  return (
    {
      common: "Commun",
      uncommon: "Peu commun",
      rare: "Rare",
      epic: "Épique",
      legendary: "Légendaire",
    }[definition?.rarity] ?? "Non renseignée"
  );
}

export function itemStatsLabel(definition) {
  return (
    itemModifierLabel(definition?.modifiers ?? {}) ||
    "Aucune statistique modifiée"
  );
}
