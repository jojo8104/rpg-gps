import { createPortraitAppearance } from "./portrait-catalog.js";

/** Conversations de base indexées par l'identifiant de leur infrastructure. */
export const BUILDING_DIALOGUES = Object.freeze({
  forge: {
    name: "Forgeron",
    title: "Forge",
    openingLine:
      "Je forge votre équipement contre du fer, du bois et de l’or. {availability} Vous pouvez aussi acheter mes outils d’exploration pour 2 pièces d’or.",
  },
  tavern: {
    name: "Taverne de",
    title: "Tavernier",
    openingLine: "Une petite mission vous intéresse ?",
  },
});

export function buildingConversation({
  buildingId,
  location,
  remaining = 0,
  options = [],
}) {
  const definition = BUILDING_DIALOGUES[buildingId];
  if (!definition || !(location.infrastructure?.[buildingId] >= 1)) return null;
  return {
    locationId: location.id,
    name:
      buildingId === "tavern"
        ? `${definition.name} ${location.name}`
        : `${definition.name} · ${location.name}`,
    title: definition.title,
    portrait: null,
    appearance: createPortraitAppearance({
      identity: `${buildingId}:${location.id}`,
      locationType: location.type,
      role: buildingId,
    }),
    openingLines: [
      definition.openingLine.replace(
        "{availability}",
        remaining > 0
          ? `Je peux encore prendre ${remaining === 1 ? "une commande" : `${remaining} commandes`}.`
          : "Je ne peux plus prendre de commande pour le moment.",
      ),
    ],
    options,
  };
}
