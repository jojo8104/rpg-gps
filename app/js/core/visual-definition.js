/** Métadonnées de présentation uniquement, sans effet sur les règles du jeu. */
export function normalizeVisual(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("Le visuel doit être un objet.");
  const result = {};
  for (const [key, reference] of Object.entries(value)) {
    if (!["icon", "illustration"].includes(key))
      throw new Error("Champ de visuel inconnu.");
    if (reference == null || reference === "") continue;
    if (
      typeof reference !== "string" ||
      !/^(assets\/images\/|\/editor-media\/editor-[a-zA-Z0-9-]+\/)[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(
        reference,
      )
    )
      throw new Error("Référence d’image locale invalide.");
    result[key] = reference;
  }
  return Object.keys(result).length ? result : null;
}
