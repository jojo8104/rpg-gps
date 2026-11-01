import assert from "node:assert/strict";
import test from "node:test";
import { Location } from "../app/js/core/location.js";
import { createLocationMapModel } from "../app/js/controllers/location-map-model.js";
import { createMapLayerModel } from "../app/js/controllers/map-layer-model.js";

test("le modèle affiche les lieux placés sans découverte et calcule la proximité sans navigateur", () => {
  const location = new Location({
    id: "camp",
    name: "Camp",
    type: "camp",
    source: "simulation",
    position: { latitude: 0, longitude: 0 },
  });
  let known = false;
  const session = {
    position: [3, 4],
    playerId: "player",
    data: { heroClasses: [] },
    hero: { id: "hero", state: "active", army: { units: [] }, carriedLoot: [] },
    game: {
      locations: [location],
      getPlayer: () => ({ id: "player", knowsLocation: () => known }),
      getLocationRelation: () => "neutral",
      canPerformLocationAction: () => false,
      getQuestInteractionsForLocation: () => [],
      getLocationChiefConversation: () => null,
      getCampDevelopment: () => null,
    },
  };
  const model = createLocationMapModel({
    getSession: () => session,
    descriptions: {},
    isLocationEnabled: () => true,
    positionFor: () => [0, 0],
    distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
    rangesFor: () => ({ interactionRadius: 8, detectionRadius: 16 }),
    baseRangesFor: () => ({ interactionRadius: 8 }),
  });
  assert.equal(model.locations()[0].id, "camp");
  const projected = model.locations({ knownOnly: false })[0];
  assert.equal(projected.distance, 5);
  assert.equal(projected.nearby, true);
  assert.deepEqual(projected.actions, []);
  known = true;
  session.position = [30, 40];
  assert.equal(model.locations()[0].nearby, false);
  assert.equal(location.heroIds.length, 0);
});

test("les couches de carte préservent la position du héros et désactivent le brouillard pendant la préparation", () => {
  let visibility;
  const session = {
    mode: "simulation",
    playerId: "player",
    position: [1, 2],
    hero: { id: "hero", playerId: "player" },
    traceVisibility: new Set(),
    game: {
      autonomousGroups: [],
      autonomousGroupTraces: [],
      heroes: [],
      heroClassFeatureService: {
        activeDivination: () => null,
        activeAstralTravel: () => null,
        detectionMultiplier: () => 1,
        visionRadius: () => 150,
      },
      getLocationWatchZones: () => [],
      getWatchBeaconsForPlayer: () => [],
      getVisibleDynamicSites: () => [],
    },
  };
  const layers = createMapLayerModel({
    getSession: () => session,
    autonomousGroupDetectionService: { detect: () => [] },
    asGps: (value) => ({ latitude: value[0], longitude: value[1] }),
    mappedLocations: (options) => {
      visibility = options;
      return [];
    },
    visibleQuestTraces: () => [],
  });
  const inputs = {
    heading: 30,
    accuracy: 5,
    setupActive: true,
    fogEnabled: true,
    field: {
      playAreaPoints: [],
      excludedPolygons: [],
      exclusionDraftPoints: [],
    },
    grid: null,
    heatmapVisible: true,
  };
  const frame = layers.frame(inputs);
  assert.deepEqual(frame.heroPosition, [1, 2]);
  assert.equal(frame.heroHeading, 30);
  assert.equal(frame.fogEnabled, false);
  assert.equal(visibility.knownOnly, false);
  assert.equal(visibility.includeHiddenLocations, true);
  assert.equal(
    layers.frame({ ...inputs, setupActive: false }).fogEnabled,
    true,
  );
  assert.equal(visibility.knownOnly, false);
});
