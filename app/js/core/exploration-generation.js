import { configureExceptionalSite } from "./exceptional-site-rules.js";
import { ExplorationState } from "./exploration-state.js";
import { PlayAreaGrid } from "./play-area-grid.js";
import { playAreaCellSizeMeters } from "./play-area-grid-config.js";
import {
  LocationSpacingPolicy,
  placedLocations,
  isSpacedLocation,
} from "./location-spacing-policy.js";
import { identifier, nonnegative } from "./exploration-validation.js";

export const NATURAL_RESOURCE_DISTRIBUTION = Object.freeze({
  none: 45,
  wood: 20,
  stone: 15,
  "fertile-land": 12,
  iron: 6,
  gold: 2,
});
export const EXCEPTIONAL_SITE_DISTRIBUTION = Object.freeze({
  none: 94,
  treasure: 3,
  artifact: 2,
  dungeon: 1,
});

/** Génération pure ; appelée par le serveur après placement du monde initial. */
export function generateExplorationState(game, { seed, generatedAt }) {
  identifier(seed, "La graine privée d’exploration");
  nonnegative(generatedAt, "La date de génération", true);
  const playArea = game.setup.playArea;
  const grid = new PlayAreaGrid({
    playArea,
    cellSizeMeters: playAreaCellSizeMeters(game.coordinateMode, playArea),
  });
  const policy = new LocationSpacingPolicy({
    setup: game.setup,
    coordinateMode: game.coordinateMode,
  });
  const locations = placedLocations(game)
    .filter(
      (location) =>
        location.state !== "destroyed" &&
        isSpacedLocation(location) &&
        !location.roles?.includes("clue"),
    )
    .map((location) => ({ location, radius: policy.radius(location) }))
    .sort((a, b) => a.location.id.localeCompare(b.location.id));
  const cells = [],
    sites = [];
  for (const cell of grid.cells) {
    const influences = locations
      .filter(({ location, radius }) =>
        intersects(cell, location.position, radius, policy),
      )
      .map(({ location }) => ({
        location,
        distance: policy.distance(cell.center, location.position),
      }))
      .sort(
        (a, b) =>
          a.distance - b.distance || a.location.id.localeCompare(b.location.id),
      );
    const resource = draw(
      seed,
      cell.id,
      "natural",
      NATURAL_RESOURCE_DISTRIBUTION,
    );
    cells.push({
      id: cell.id,
      row: cell.row,
      column: cell.column,
      resource: influences.length ? "none" : resource,
      suppressedByLocationIds: influences.map(({ location }) => location.id),
    });
    // Aucun site exceptionnel dans une cellule touchant un lieu normal.
    const type = draw(
      seed,
      cell.id,
      "exceptional",
      EXCEPTIONAL_SITE_DISTRIBUTION,
    );
    if (type !== "none" && influences.length === 0)
      sites.push(
        configureExceptionalSite(
          {
            id: `exceptional-${cell.id}`,
            name: `${{ treasure: "Trésor", artifact: "Artefact", dungeon: "Donjon" }[type]} ${sites.length + 1}`,
            cellId: cell.id,
            type,
            hostLocationId: null,
            position: { ...cell.center },
          },
          seed,
        ),
      );
  }
  return new ExplorationState({
    grid: {
      playAreaId: playArea.id,
      coordinateMode: game.coordinateMode,
      cellSizeMeters: grid.cellSizeMeters,
    },
    generation: {
      seed,
      generatedAt,
      algorithm: "exploration-v2-exterior-only",
      playArea: playArea.toJSON(),
      naturalDistribution: { ...NATURAL_RESOURCE_DISTRIBUTION },
      exceptionalDistribution: { ...EXCEPTIONAL_SITE_DISTRIBUTION },
      influencePolicy: "normal-location-range-intersects-cell",
    },
    cells,
    sites,
  });
}

function intersects(cell, position, radius, policy) {
  const [southWest, northEast] = cell.bounds;
  const nearest = {
    latitude: Math.max(
      southWest.latitude,
      Math.min(northEast.latitude, position.latitude),
    ),
    longitude: Math.max(
      southWest.longitude,
      Math.min(northEast.longitude, position.longitude),
    ),
  };
  return policy.distance(position, nearest) <= radius;
}

function draw(seed, cellId, channel, distribution) {
  // Flux séparés par cellule et contenu : indépendant de l’ordre des lieux et
  // des suppressions. La graine reste privée ; ce n’est pas la graine du lobby.
  let hash = 2166136261;
  for (const char of JSON.stringify([seed, cellId, channel]))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  let roll = ((hash >>> 0) / 2 ** 32) * 100;
  for (const [value, weight] of Object.entries(distribution)) {
    if (roll < weight) return value;
    roll -= weight;
  }
  throw new RangeError("Répartition d’exploration incomplète.");
}
