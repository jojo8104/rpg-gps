import { PlayArea } from "../../app/js/core/play-area.js";

/** Même contrôle pour un terrain tracé dans le jeu ou importé depuis l’éditeur. */
export function validateLobbyPlayArea(playArea, code) {
  if (
    !playArea ||
    !Array.isArray(playArea.polygon) ||
    playArea.polygon.length > 50
  )
    throw new RangeError(
      "La zone GPS doit contenir entre trois et cinquante points.",
    );
  const area = new PlayArea({
    id: `lobby-area-${code}`,
    name: playArea.name || "Zone GPS multijoueur",
    polygon: playArea.polygon,
    excludedPolygons: playArea.excludedPolygons ?? [],
  });
  if (area.getAreaSquareMeters() <= 0)
    throw new RangeError("La zone doit avoir une surface positive.");
  return area.toJSON();
}
