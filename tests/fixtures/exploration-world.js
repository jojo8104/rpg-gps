import { socialGame } from "./player-social-game.js";
import { PlayArea } from "../../app/js/core/play-area.js";
import { PlayAreaGrid } from "../../app/js/core/play-area-grid.js";
import { Location } from "../../app/js/core/location.js";
import { ExplorationState } from "../../app/js/core/exploration-state.js";
import { generateLocalization } from "../../app/js/core/exploration-localization.js";
import { initializeClueItems } from "../../app/js/core/exploration-clue-service.js";

export function explorationWorld({ mode = "gps" } = {}) {
  const {
    game,
    heroes: [hero, other],
    advance,
  } = socialGame();
  game.coordinateMode = mode;
  const span = mode === "gps" ? 0.001 : 1;
  game.setup.playArea = new PlayArea({
    id: "small",
    name: "Parc",
    polygon: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: span },
      { latitude: span, longitude: span },
      { latitude: span, longitude: 0 },
    ],
  });
  const grid = new PlayAreaGrid({
    playArea: game.setup.playArea,
    cellSizeMeters: mode === "gps" ? 15 : 15000,
  });
  const at = (row, column) =>
    grid.cells.find((cell) => cell.row === row && cell.column === column);
  const location = new Location({
    id: "village",
    name: "Valombre",
    type: "village",
    source: "test",
    ownerId: "a",
    controllerId: "a",
    position: at(0, 0).center,
    heroIds: [hero.id],
    population: 20,
    features: { trade: true },
    infrastructure: { tavern: 1, prospecting_post: 1 },
    resources: {
      stock: { specialist_geologist: 1, food: 10, exploration_tools: 2 },
    },
  });
  game.locations = [location];
  hero.updatePosition(location.position);
  hero.resources.gold = 30;
  game.explorationState = new ExplorationState({
    grid: {
      playAreaId: "small",
      coordinateMode: mode,
      cellSizeMeters: grid.cellSizeMeters,
    },
    generation: {
      seed: "private-test",
      generatedAt: 1000,
      playArea: game.setup.playArea.toJSON(),
    },
    cells: grid.cells.map((cell) => ({
      id: cell.id,
      row: cell.row,
      column: cell.column,
      resource:
        cell.row === 2
          ? ({ 1: "stone", 2: "iron", 3: "wood", 4: "fertile-land", 5: "gold" }[
              cell.column
            ] ?? "none")
          : "none",
      suppressedByLocationIds:
        cell.row === 2 && cell.column === 1 ? [location.id] : [],
    })),
    sites: [
      {
        id: "hosted",
        cellId: at(0, 0).id,
        type: "dungeon",
        hostLocationId: location.id,
        position: location.position,
      },
      {
        id: "outside",
        cellId: at(2, 3).id,
        type: "artifact",
        position: at(2, 3).center,
      },
    ],
  });
  game.explorationState = initializeClueItems(
    game,
    generateLocalization(game, game.explorationState),
  );
  return {
    game,
    hero,
    other,
    location,
    grid,
    at,
    advance,
    context: () =>
      game.itemAcquisitionContext({
        playerId: "a",
        heroId: hero.id,
        locationId: location.id,
      }),
    carryMap(siteId = "hosted") {
      const clue = game.explorationState.clues.find(
        (clue) => clue.siteId === siteId && clue.kind === "localization",
      );
      game.explorationClueService.receive(hero, clue);
      return clue;
    },
  };
}
