/** Catalogue partagé de présentation : aucune statistique de combat implicite. */
export const AUTONOMOUS_GROUP_ARCHETYPES = Object.freeze(
  [
    { id: "goblins", name: "Groupe de gobelins" },
    { id: "orcs", name: "Groupe d’orcs" },
    { id: "wolves", name: "Meute de loups" },
    { id: "bear", name: "Ours" },
    { id: "boar", name: "Sanglier" },
    { id: "deer", name: "Cerf" },
  ].map((entry) =>
    Object.freeze({ ...entry, sprite: `${entry.id}-map-front-back-v1.png` }),
  ),
);

export const AUTONOMOUS_GROUP_ALIGNMENTS = Object.freeze([
  "enemy",
  "neutral",
  "ally",
]);

export function getAutonomousGroupArchetype(id) {
  return AUTONOMOUS_GROUP_ARCHETYPES.find((entry) => entry.id === id) ?? null;
}
