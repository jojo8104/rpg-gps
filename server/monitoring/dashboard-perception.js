import { PlayAreaGrid } from "../../app/js/core/play-area-grid.js";
import { playAreaCellSizeMeters } from "../../app/js/core/play-area-grid-config.js";
const grids = new WeakMap();
function gridFor(lobby) {
  const game = lobby.game;
  const area = lobby.playArea ?? game?.setup?.playArea;
  if (!area?.polygon?.length) return null;
  const mode = game?.coordinateMode ?? lobby.configuration.positionMode;
  const signature = JSON.stringify([mode, area.polygon, area.excludedPolygons]);
  let cached = grids.get(lobby);
  if (cached?.signature !== signature) {
    try {
      cached = {
        signature,
        grid: new PlayAreaGrid({
          playArea: area,
          cellSizeMeters: playAreaCellSizeMeters(mode, area),
        }),
      };
      grids.set(lobby, cached);
    } catch {
      return null;
    }
  }
  return cached;
}
/** Trace d’exploration de supervision, alimentée uniquement par les positions officielles. */
export function recordDashboardExploration(lobby, playerId, position, at) {
  const game = lobby.game,
    hero = game?.heroes.find((h) => h.playerId === playerId);
  if (!hero || !position || !game.heroClassFeatureService) return;
  const cached = gridFor(lobby);
  if (!cached) return;
  if (lobby.dashboardExploration?.signature !== cached.signature)
    lobby.dashboardExploration = { signature: cached.signature, players: {} };
  const records = lobby.dashboardExploration.players;
  const record = (records[playerId] ??= { since: at, cells: {} });
  const radius =
    game.heroClassFeatureService.visionRadius(hero) *
    (game.coordinateMode === "simulation" ? 32 / 150 : 1);
  // Une grille indépendante par visite évite de partager l’exploration entre joueurs.
  const ids = cached.grid.revealWithinRadius(position, {
    radius,
    coordinateMode: game.coordinateMode,
  });
  for (const id of ids) {
    record.cells[id] ??= at;
  }
  for (const cell of cached.grid.cells) cell.explored = false;
}
export function dashboardPerception(lobby) {
  const game = lobby.game,
    cached = gridFor(lobby);
  if (!game) return null;
  const records =
    cached && lobby.dashboardExploration?.signature === cached.signature
      ? lobby.dashboardExploration.players
      : {};
  return {
    cells: (cached?.grid.cells ?? []).map((cell) => ({
      id: cell.id,
      bounds: cell.bounds.map((point) => ({ ...point })),
      center: { ...cell.center },
    })),
    players: Object.fromEntries(
      [...lobby.players.keys()].map((id) => {
        const hero = game.heroes.find((h) => h.playerId === id);
        const divination =
          hero && game.heroClassFeatureService?.activeDivination(hero);
        return [
          id,
          {
            position: hero?.position ? { ...hero.position } : null,
            visionRadius: hero
              ? (game.heroClassFeatureService?.visionRadius(hero) ?? 45)
              : 45,
            revealedZones: structuredClone([
              ...(game.getLocationWatchZones?.(id) ?? []),
              ...(divination ? [divination] : []),
            ]),
            since: records?.[id]?.since ?? null,
            exploredCellTimes: { ...records?.[id]?.cells },
          },
        ];
      }),
    ),
  };
}
