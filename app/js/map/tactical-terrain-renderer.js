import { loadMinimapTileset, renderMinimapTileset } from "./minimap-tileset.js";

let atlasPromise;
const atlas = () =>
  (atlasPromise ??= loadMinimapTileset().catch((error) => {
    atlasPromise = null;
    throw error;
  }));

/** Réoriente seulement la présentation de la carte reçue du serveur. */
export function battlefieldPresentation(battlefield, flip = false) {
  const cells = flip
    ? battlefield.cells.toReversed().map((row) => row.toReversed())
    : battlefield.cells;
  const objects = [];
  const grid = cells.map((row, y) =>
    row.map((cell, x) => {
      if (cell.structure)
        objects.push({
          kind: cell.structure.kind,
          col: x,
          row: y,
          rotation: (cell.structure.rotation ?? 0) + (flip ? 180 : 0),
        });
      return cell.terrain;
    }),
  );
  return { grid, objects };
}

export async function renderTacticalTerrain(canvas, battlefield, flip = false) {
  const images = await atlas();
  // Une réponse lente ne doit pas repeindre un écran déjà remplacé.
  if (!canvas.isConnected) return;
  const { grid, objects } = battlefieldPresentation(battlefield, flip);
  renderMinimapTileset(canvas, images, grid, objects, { size: 128 });
  canvas.closest(".tactics-map")?.classList.add("has-terrain");
}
