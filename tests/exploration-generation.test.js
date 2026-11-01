import { retireInteriorExceptionalSites } from "../app/js/core/exploration-exterior-migration.js";
import assert from "node:assert/strict";
import test from "node:test";
import { PlayArea } from "../app/js/core/play-area.js";
import { PlayAreaGrid } from "../app/js/core/play-area-grid.js";
import { ExplorationState } from "../app/js/core/exploration-state.js";
import {
  generateExplorationState,
  NATURAL_RESOURCE_DISTRIBUTION,
  EXCEPTIONAL_SITE_DISTRIBUTION,
} from "../app/js/core/exploration-generation.js";
import { playAreaCellSizeMeters } from "../app/js/core/play-area-grid-config.js";
import { dashboardHeatmap } from "../server/monitoring/dashboard-heatmap.js";
import { initializeExploration } from "../server/lobby/initialize-exploration.js";

function world({
  mode = "gps",
  span = 0.008,
  origin = 0,
  excludedPolygons = [],
} = {}) {
  const playArea = new PlayArea({
    id: "terrain",
    name: "Terrain",
    excludedPolygons,
    polygon: [
      { latitude: origin, longitude: origin },
      { latitude: origin, longitude: origin + span },
      { latitude: origin + span, longitude: origin + span },
      { latitude: origin + span, longitude: origin },
    ],
  });
  return {
    coordinateMode: mode,
    setup: { playArea, locationSetup: { rangePolicy: { mode: "fixed" } } },
    status: "started",
    locations: [],
    scenarioRuntime: { placements: {} },
    scenarioLocationBindings: [],
    explorationState: new ExplorationState(),
    now: () => 1000,
  };
}
const generate = (game, seed = "private-world-2026") =>
  generateExplorationState(game, { seed, generatedAt: 1000 });

test("la génération est reproductible et indépendante de l’ordre des lieux", () => {
  const game = world();
  game.locations = [
    {
      id: "b",
      type: "village",
      position: { latitude: 0.004, longitude: 0.004 },
      interactionRadius: 25,
    },
    {
      id: "a",
      type: "mine",
      position: { latitude: 0.004, longitude: 0.004 },
      interactionRadius: 25,
    },
  ];
  const before = structuredClone(game.locations);
  const first = generate(game).toJSON();
  game.locations.reverse();
  assert.deepEqual(generate(game).toJSON(), first);
  assert.notDeepEqual(
    generate(game, "another-private-seed").cells,
    first.cells,
  );
  assert.deepEqual(game.locations, before.reverse());
  assert.equal(game.explorationState.generation, null);
});

test("les tirages naturels et exceptionnels respectent les répartitions indépendantes", () => {
  const game = world({ span: 0.017 });
  const state = generate(game);
  assert.ok(state.cells.length > 10000);
  for (const [resource, expected] of Object.entries(
    NATURAL_RESOURCE_DISTRIBUTION,
  )) {
    const actual =
      (state.cells.filter((cell) => cell.resource === resource).length /
        state.cells.length) *
      100;
    assert.ok(Math.abs(actual - expected) < 2, `${resource}: ${actual}`);
  }
  for (const [type, expected] of Object.entries(
    EXCEPTIONAL_SITE_DISTRIBUTION,
  )) {
    const count =
      type === "none"
        ? state.cells.length - state.sites.length
        : state.sites.filter((site) => site.type === type).length;
    const actual = (count / state.cells.length) * 100;
    assert.ok(Math.abs(actual - expected) < 1, `${type}: ${actual}`);
  }
  assert.ok(
    state.sites.some(
      (site) =>
        state.cells.find((cell) => cell.id === site.cellId).resource === "none",
    ),
  );
  assert.ok(
    state.sites.some(
      (site) =>
        state.cells.find((cell) => cell.id === site.cellId).resource !== "none",
    ),
  );
  assert.ok(
    state.sites.every(
      (site) =>
        site.status === "active" &&
        [40, 70, 100].includes(site.requirements.expedition) &&
        site.rewards.itemCount === (site.type === "treasure" ? 2 : 1) &&
        site.hostLocationId === null,
    ),
  );
  assert.deepEqual(state.discoveries, []);
});

for (const mode of ["gps", "simulation"]) {
  test(`le terrain ${mode} utilise exactement les cellules de la heatmap et exclut les zones interdites`, () => {
    const span = mode === "gps" ? 0.006 : 1;
    const origin = mode === "gps" ? 48 : 22;
    const excludedPolygons = [
      [
        { latitude: origin + span * 0.2, longitude: origin + span * 0.2 },
        { latitude: origin + span * 0.4, longitude: origin + span * 0.2 },
        { latitude: origin + span * 0.4, longitude: origin + span * 0.4 },
        { latitude: origin + span * 0.2, longitude: origin + span * 0.4 },
      ],
    ];
    const game = world({ mode, span, origin, excludedPolygons });
    const state = generate(game);
    const grid = new PlayAreaGrid({
      playArea: game.setup.playArea,
      cellSizeMeters: playAreaCellSizeMeters(mode, game.setup.playArea),
    });
    const heatmap = dashboardHeatmap(
      { game, configuration: { positionMode: mode } },
      [],
    );
    assert.deepEqual(
      state.cells.map((cell) => cell.id),
      heatmap.map((cell) => cell.id),
    );
    assert.deepEqual(
      state.cells.map(({ id, row, column }) => ({ id, row, column })),
      grid.cells.map(({ id, row, column }) => ({ id, row, column })),
    );
    assert.ok(
      grid.cells.every((cell) =>
        game.setup.playArea.allowsPlacement(cell.center),
      ),
    );
    assert.ok(
      state.sites.every((site) =>
        game.setup.playArea.allowsPlacement(site.position),
      ),
    );
    const withoutExclusions = new PlayAreaGrid({
      playArea: { ...game.setup.playArea.toJSON(), excludedPolygons: [] },
      cellSizeMeters: grid.cellSizeMeters,
    });
    assert.ok(grid.cells.length < withoutExclusions.cells.length);
  });
}

test("les grandes aires restent sous la limite de grille et partagent la même taille adaptée", () => {
  for (const mode of ["gps", "simulation"]) {
    const game = world({ mode, span: mode === "gps" ? 0.1 : 30 });
    const state = generate(game);
    assert.ok(state.grid.cellSizeMeters > playAreaCellSizeMeters(mode));
    assert.ok(state.cells.length > 10000 && state.cells.length <= 20000);
    const heatmap = dashboardHeatmap(
      { game, configuration: { positionMode: mode } },
      [],
    );
    assert.deepEqual(
      state.cells.map((cell) => cell.id),
      heatmap.map((cell) => cell.id),
    );
  }
});

test("l’influence annule les ressources et exclut tous les sites exceptionnels", () => {
  const game = world();
  const position = { latitude: 0.004, longitude: 0.004 };
  game.setup.locationSetup.rangePolicy.maxInteractionMeters = 2000;
  game.locations = ["village-b", "village-a"].map((id) => ({
    id,
    type: "village",
    position,
    interactionRadius: 2000,
  }));
  const locationsBefore = structuredClone(game.locations);
  const original = generate({ ...game, locations: [] });
  const state = generate(game);
  assert.ok(original.sites.length > 0);
  assert.deepEqual(state.sites, []);
  assert.ok(
    state.cells.every(
      (cell) =>
        cell.resource === "none" && cell.suppressedByLocationIds.length === 2,
    ),
  );
  assert.deepEqual(game.locations, locationsBefore);
  assert.equal(game.explorationState.sites.length, 0);
});

test("une cellule touchée au bord du cercle est neutralisée même si son centre est à l’extérieur", () => {
  const game = world();
  const grid = new PlayAreaGrid({
    playArea: game.setup.playArea,
    cellSizeMeters: 15,
  });
  const target = grid.cells[0];
  const location = {
    id: "edge",
    type: "mine",
    interactionRadius: 10,
    position: {
      latitude: target.center.latitude,
      longitude: target.bounds[1].longitude + 8 / 111320,
    },
  };
  game.locations = [location];
  assert.ok(
    Math.abs(target.center.longitude - location.position.longitude) * 111320 >
      10,
  );
  const state = generate(game);
  const cell = state.cells.find((cell) => cell.id === target.id);
  assert.deepEqual(cell.suppressedByLocationIds, ["edge"]);
  assert.equal(cell.resource, "none");
});

test("les lieux différés, détruits, indices et positions interdites ne neutralisent aucune ressource", () => {
  const game = world();
  const position = { latitude: 0.004, longitude: 0.004 };
  game.locations = [
    { id: "deferred", type: "village", position },
    { id: "destroyed", type: "mine", state: "destroyed", position },
    { id: "clue", type: "camp", roles: ["clue"], position },
    { id: "outside", type: "fort", position: { latitude: 1, longitude: 1 } },
    { id: "event", type: "event_location", position },
  ];
  game.scenarioRuntime.placements.deferred = {
    locationId: "deferred",
    status: "walking",
  };
  const state = generate(game);
  assert.deepEqual(state.cells, generate({ ...game, locations: [] }).cells);
  assert.ok(state.sites.every((site) => site.hostLocationId === null));
});

test("l’initialisation est atomique et ne remplace jamais un état déjà présent", () => {
  const game = world();
  assert.equal(initializeExploration(game, { seed: "private" }), true);
  const state = game.explorationState.toJSON();
  assert.equal(
    initializeExploration(game, {
      now: () => {
        throw Error("Pas de nouveau tirage");
      },
    }),
    false,
  );
  assert.deepEqual(game.explorationState.toJSON(), state);
  game.explorationState.generation = null;
  assert.equal(initializeExploration(game), false);
  const invalid = world();
  assert.throws(() => initializeExploration(invalid, { seed: "" }));
  assert.equal(invalid.explorationState.grid, null);
});

test("les lieux ne déplacent pas les sites extérieurs et excluent les cellules de bord", () => {
  const game = world();
  const original = generate(game);
  game.locations = [
    {
      id: "village",
      type: "village",
      interactionRadius: 100,
      position: { latitude: 0.004, longitude: 0.004 },
    },
  ];
  const state = generate(game);
  const excluded = new Set(
    state.cells
      .filter((cell) => cell.suppressedByLocationIds.length)
      .map((cell) => cell.id),
  );
  assert.ok(excluded.size > 0);
  assert.deepEqual(
    state.sites.map((site) => site.id),
    original.sites
      .filter((site) => !excluded.has(site.cellId))
      .map((site) => site.id),
  );
  assert.ok(state.sites.every((site) => site.hostLocationId === null));
});

test("la migration clôture les anciens sites intérieurs et conserve les archives sans nouveau tirage", () => {
  const state = generate(world());
  const site = state.sites[0];
  site.hostLocationId = "village";
  state.clues.push(
    { siteId: site.id, status: "active" },
    { siteId: site.id, status: "sold" },
  );
  const exterior = state.sites[1];
  assert.equal(retireInteriorExceptionalSites(state), 1);
  assert.equal(site.status, "disappeared");
  assert.equal(site.resolution.reason, "interior-sites-removed");
  assert.equal(state.clues[0].status, "obsolete");
  assert.equal(state.clues[1].status, "sold");
  assert.equal(exterior.status, "active");
  assert.equal(retireInteriorExceptionalSites(state), 0);
  assert.equal(state.announcements.length, 0);
});
