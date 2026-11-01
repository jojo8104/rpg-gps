import { normalizeVisual } from "./visual-definition.js";
export const MODIFICATION_PROPERTIES = {
  hero: ["resource", "item", "xp", "stat", "appearance"],
  location: ["appearance"],
  ga: ["appearance", "existence"],
};
export function validateQuestModification(v) {
  if (!v || !MODIFICATION_PROPERTIES[v.target]?.includes(v.property))
    throw new Error("Cible ou propriété de modification invalide.");
  if (
    v.target !== "hero" &&
    !(typeof v.targetId === "string" && v.targetId.trim())
  )
    throw new Error("Cible manquante.");
  if (
    ["resource", "item", "xp"].includes(v.property) &&
    (!Number.isSafeInteger(v.amount) || v.amount <= 0)
  )
    throw new Error("Quantité entière positive requise.");
  if (
    v.property === "resource" &&
    !["gold", "food", "wood", "stone", "iron"].includes(v.key)
  )
    throw new Error("Ressource inconnue.");
  if (
    ["resource", "item"].includes(v.property) &&
    !["add", "remove"].includes(v.operation)
  )
    throw new Error("Opération inconnue.");
  if (v.property === "item" && !(typeof v.key === "string" && v.key.trim()))
    throw new Error("Objet manquant.");
  if (
    v.property === "stat" &&
    (!["attack", "defense", "morale", "mobility", "command", "health"].includes(
      v.key,
    ) ||
      !Number.isSafeInteger(v.amount))
  )
    throw new Error("Statistique ou variation invalide.");
  if (v.property === "appearance") {
    if (v.target === "hero") {
      if (!["male", "female"].includes(v.key))
        throw new Error("Genre du portrait invalide.");
    } else normalizeVisual(v.visual);
  }
  if (v.property === "existence" && v.operation !== "remove")
    throw new Error(
      "Seul le retrait du GA est disponible ; utiliser une création pour le faire apparaître.",
    );
  return v;
}
