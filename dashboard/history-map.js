import { PlayAreaGrid } from "../app/js/core/play-area-grid.js";
import { playAreaCellSizeMeters } from "../app/js/core/play-area-grid-config.js";
import { coordinates } from "./map-geometry.js";

/** Projection de supervision ; aucune règle de jeu n’est exécutée ici. */
export function buildHistoryMap(party, history, percent = 100) {
  const index = Math.max(
    0,
    Math.ceil((history.length * Number(percent)) / 100) - 1,
  );
  const visible = history.slice(0, index + 1);
  const last = visible.at(-1);
  const samples = [],
    players = new Map(),
    groupTrails = new Map();
  for (const sample of visible) {
    for (const hero of sample.heroes ?? []) {
      if (!hero.position) continue;
      if (!party.players.some((player) => player.id === hero.playerId))
        continue;
      players.set(hero.playerId, hero.position);
      if (hero.connected === false) continue;
      samples.push({
        playerId: hero.playerId,
        position: hero.position,
        at: sample.at,
      });
      players.set(hero.playerId, hero.position);
    }
    for (const group of sample.groups ?? []) {
      const point = coordinates(group.position);
      if (!point) continue;
      if (!groupTrails.has(group.id)) groupTrails.set(group.id, []);
      groupTrails.get(group.id).push(point);
    }
  }
  let heatmap = party.heatmap;
  const area = party.playArea;
  if (area?.polygon?.length && visible.length) {
    try {
      const mode = party.coordinateMode ?? party.configuration.positionMode;
      const grid = new PlayAreaGrid({
        playArea: area,
        cellSizeMeters: playAreaCellSizeMeters(mode),
      });
      const counts = new Map();
      for (const sample of samples) {
        const cell = grid.getCellAt(sample.position);
        if (cell) counts.set(cell.id, (counts.get(cell.id) ?? 0) + 1);
      }
      heatmap = grid.cells
        .filter((cell) => counts.has(cell.id))
        .map((cell) => ({
          bounds: cell.bounds.map((point) => [point.latitude, point.longitude]),
          visits: counts.get(cell.id),
        }));
    } catch {
      /* Le fond reste consultable si le terrain est absent ou invalide. */
    }
  }
  return {
    samples: visible.length ? samples : party.samples,
    players,
    groupTrails,
    heatmap,
    groups: Number(percent) < 100 ? last?.groups : null,
    label: last
      ? `${Number(percent) === 100 ? "Direct · " : ""}${new Date(last.at).toLocaleTimeString("fr-FR")}`
      : "Aucun relevé",
  };
}
