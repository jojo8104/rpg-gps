import { PlayAreaGrid } from "../../app/js/core/play-area-grid.js";
import { playAreaCellSizeMeters } from "../../app/js/core/play-area-grid-config.js";

const grids = new WeakMap();

export function dashboardHeatmap(lobby, samples) {
  const mode = lobby.game?.coordinateMode ?? lobby.configuration.positionMode;
  const area = lobby.playArea ?? lobby.game?.setup?.playArea;
  if (!area?.polygon?.length) return [];
  const key = JSON.stringify([mode, area.polygon, area.excludedPolygons]);
  let cached = grids.get(lobby);
  if (cached?.key !== key) {
    try {
      const grid = new PlayAreaGrid({
        playArea: area,
        cellSizeMeters: playAreaCellSizeMeters(mode, area),
      });
      cached = { key, grid };
      grids.set(lobby, cached);
    } catch {
      return [];
    }
  }
  const counts = new Map();
  for (const sample of samples) {
    const cell = cached.grid.getCellAt(sample.position);
    if (cell) counts.set(cell.id, (counts.get(cell.id) ?? 0) + 1);
  }
  return cached.grid.cells.map((cell) => ({
    id: cell.id,
    bounds: cell.bounds.map((point) => [point.latitude, point.longitude]),
    visits: counts.get(cell.id) ?? 0,
  }));
}
