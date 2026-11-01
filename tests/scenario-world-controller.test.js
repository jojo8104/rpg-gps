import assert from "node:assert/strict";
import test from "node:test";
import { createScenarioWorldController } from "../app/js/controllers/scenario-world-controller.js";

function fixture() {
  const calls = [],
    known = new Set();
  const locations = [
    "evacuation-camp",
    "prospector-battlefield",
    "gold-mine",
    "attacked-convoy",
  ].map((id) => ({
    id,
    name: id,
    source: "scenario",
    state: "active",
    visibility: "discovered",
    position: { latitude: 20, longitude: 0 },
  }));
  let session = {
    mode: "simulation",
    localPlayerId: "local",
    hero: { id: "hero" },
    positioning: { position: [0, 0], locationPositions: new Map() },
    enabledGpsLocationIds: new Set(),
    validatedPlayArea: { contains: () => true, allowsPlacement: () => true },
    playAreaGrid: null,
    field: { canPlaceQuestLocation: () => true, questDistanceMeters: 300 },
    game: {
      locations,
      setup: { rules: { travelPaceMode: "calm" }, playArea: null },
      scenarioState: { currentPhaseId: "follow-first-trace" },
      scenarioRuntime: { placements: {} },
      scenarioLocationBindings: [],
      autonomousGroupTraces: [],
      evacuationStates: { "royal-camp-evacuation": {} },
      getLocation: (id) =>
        locations.find((location) => location.id === id) ?? null,
      getPlayer: () => ({
        knowsLocation: (id) => known.has(id),
        discoverLocation: (id) => known.add(id),
      }),
      discoverLocation: (input) => {
        known.add(input.locationId);
        calls.push(["discover", input]);
      },
      placeScenarioLocation: (input) => {
        calls.push(["place", input]);
        return {
          success: true,
          locationId: "gold-mine",
          position: { latitude: 1, longitude: 2 },
        };
      },
      dispatchQuestEvent: (event) => {
        calls.push(["event", event]);
        return { phaseId: "inspect" };
      },
      updateLocationPosition: (input) => calls.push(["update", input]),
    },
  };
  const asGps = (position) =>
    Array.isArray(position)
      ? { latitude: position[0], longitude: position[1] }
      : position;
  const controller = createScenarioWorldController({
    getSession: () => session,
    asGps,
    distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
    positionFor: (id) => session.positioning.locationPositions.get(id),
    moveLocation: (id, position) => {
      calls.push(["move", id, position]);
      session.positioning.locationPositions.set(id, position);
      session.game.getLocation(id).position = asGps(position);
    },
    setupPlacementService: {
      findPosition: (input) => {
        calls.push(["find", input]);
        return {
          latitude:
            input.origin.latitude +
            input.preferredDistance / (session.mode === "gps" ? 111320 : 1),
          longitude: input.origin.longitude,
        };
      },
    },
    rebuildLocationEngine: () => calls.push(["rebuild"]),
    persistFieldState: () => calls.push(["persist"]),
    resetInteractions: () => calls.push(["resetInteractions"]),
    showSearchHeatmap: () => calls.push(["heatmap"]),
    onProgress: (progress) => calls.push(["progress", progress]),
    onPlaced: () => calls.push(["placed"]),
    onChange: () => calls.push(["render"]),
    onMessage: (text) => calls.push(["message", text]),
    selectLocation: (id) => calls.push(["select", id]),
    logTest: (text) => calls.push(["log", text]),
    deviceAlerts: { notify: (kind) => calls.push(["notify", kind]) },
    now: () => 1000,
  });
  return {
    controller,
    calls,
    known,
    get session() {
      return session;
    },
    replace: (value) => {
      session = value;
    },
  };
}

test("les traces suivent les phases, se conservent et changent de visibilité", async () => {
  const f = fixture();
  await f.controller.syncQuestTrace();
  await f.controller.syncQuestTrace();
  assert.equal(f.session.game.autonomousGroupTraces.length, 1);
  assert.deepEqual(await f.controller.visibleQuestTraces(), [
    { id: "prospectors-trace-1", position: [9, 0] },
  ]);
  f.session.game.scenarioState.currentPhaseId = "follow-second-trace";
  assert.deepEqual(await f.controller.visibleQuestTraces(), [
    { id: "prospectors-trace-2", position: [10, 0] },
  ]);
  assert.equal(f.session.game.autonomousGroupTraces.length, 2);
  f.session.game.scenarioState.currentPhaseId = "return-to-capital";
  assert.deepEqual(await f.controller.visibleQuestTraces(), []);
});

test("les traces GPS utilisent la distance du rythme choisi et des coordonnées GPS", async () => {
  const f = fixture();
  f.session.mode = "gps";
  f.session.positioning.position = { latitude: 48, longitude: 2 };
  f.session.game.setup.rules.travelPaceMode = "sport";
  const traces = await f.controller.visibleQuestTraces();
  assert.equal(
    f.calls.find(([kind]) => kind === "find")[1].preferredDistance,
    120,
  );
  assert.equal(traces[0].position.latitude, 48 + 120 / 111320);
  assert.equal(Array.isArray(traces[0].position), false);
});

test("le champ de bataille est révélé et placé une seule fois à la phase attendue", async () => {
  const f = fixture();
  await f.controller.syncQuestBattlefield();
  assert.equal(f.calls.length, 0);
  f.session.game.scenarioState.currentPhaseId = "prospectors-battlefield";
  await f.controller.syncQuestBattlefield();
  await f.controller.syncQuestBattlefield();
  assert.equal(f.known.has("prospector-battlefield"), true);
  assert.equal(
    f.session.enabledGpsLocationIds.has("prospector-battlefield"),
    true,
  );
  assert.equal(f.calls.filter(([kind]) => kind === "move").length, 1);
});

test("la recherche du camp pose un signal puis le retire au contact de sa cellule", async () => {
  const f = fixture();
  let currentId = "away";
  f.session.game.scenarioState.currentPhaseId = "reach-evacuation-camp";
  f.session.playAreaGrid = {
    setQuestSignal: () => ({ targetCellId: "target" }),
    getCellAt: () => ({ id: currentId }),
    clearQuestSignal: () => f.calls.push(["clearSignal"]),
  };
  assert.equal(await f.controller.syncEvacuationCampSearch(), false);
  assert.equal(
    f.calls.some(([kind]) => kind === "heatmap"),
    true,
  );
  currentId = "target";
  assert.equal(await f.controller.syncEvacuationCampSearch(), true);
  assert.equal(f.known.has("evacuation-camp"), true);
  assert.equal(
    f.session.game.evacuationStates["royal-camp-evacuation"].campDiscoveredAt,
    1000,
  );
  assert.equal(
    f.calls.some(([kind]) => kind === "clearSignal"),
    true,
  );
});

test("examiner une trace exige la proximité et transmet l'événement au moteur", async () => {
  const f = fixture();
  await f.controller.syncQuestTrace();
  f.session.positioning.position = [-20, 0];
  await f.controller.inspectQuestTrace("prospectors-trace-1");
  assert.equal(
    f.calls.some(([kind]) => kind === "event"),
    false,
  );
  assert.match(f.calls.find(([kind]) => kind === "message")[1], /Approchez/);
  f.session.positioning.position = [9, 0];
  await f.controller.inspectQuestTrace("prospectors-trace-1");
  assert.deepEqual(f.calls.find(([kind]) => kind === "event")[1], {
    type: "TraceInspected",
    traceId: "prospectors-trace-1",
  });
  assert.equal(
    f.calls.some(([kind]) => kind === "progress"),
    true,
  );
});

test("le placement hors zone est refusé et un placement valide raccorde carte et moteur", async () => {
  const f = fixture();
  f.session.validatedPlayArea.allowsPlacement = () => false;
  await f.controller.confirmScenarioPlacement("mine");
  assert.equal(
    f.calls.some(([kind]) => kind === "place"),
    false,
  );
  assert.match(
    f.calls.find(([kind]) => kind === "message")[1],
    /hors de la zone/,
  );
  f.session.validatedPlayArea.allowsPlacement = () => true;
  await f.controller.confirmScenarioPlacement("mine");
  assert.deepEqual(
    f.session.positioning.locationPositions.get("gold-mine"),
    [1, 2],
  );
  assert.equal(f.known.has("gold-mine"), true);
  assert.equal(
    f.calls.some(([kind]) => kind === "placed"),
    true,
  );
  assert.deepEqual(
    f.calls.find(([kind]) => kind === "select"),
    ["select", "gold-mine"],
  );
});

test("les lieux existants sont visibles sans quête ni activation locale", async () => {
  const f = fixture();
  const camp = f.session.game.getLocation("evacuation-camp");
  f.session.enabledGpsLocationIds = new Set();
  assert.equal(await f.controller.isLocationEnabled(camp), true);
  f.known.add(camp.id);
  assert.equal(await f.controller.isLocationEnabled(camp), true);
  f.session.game.scenarioLocationBindings = [
    { locationId: camp.id, locationSlotId: "camp" },
  ];
  f.session.game.scenarioRuntime.placements.camp = { status: "walking" };
  assert.equal(await f.controller.isLocationEnabled(camp), false);
  f.session.game.scenarioRuntime.placements.camp.status = "placed";
  camp.state = "destroyed";
  assert.equal(await f.controller.isLocationEnabled(camp), false);
});

test("les lieux d'équipe nouveaux rejoignent les interactions sans reconstruction répétée", async () => {
  const f = fixture();
  const location = {
    id: "team-fort",
    source: "team-quest:fort",
    position: { latitude: 3, longitude: 4 },
  };
  f.session.game.locations.push(location);
  assert.equal(await f.controller.syncTeamLocations(), true);
  assert.deepEqual(
    f.session.positioning.locationPositions.get("team-fort"),
    [3, 4],
  );
  assert.equal(f.session.enabledGpsLocationIds.has("team-fort"), true);
  assert.equal(await f.controller.syncTeamLocations(), false);
  assert.equal(
    f.calls.filter(([kind]) => kind === "resetInteractions").length,
    1,
  );
});

test("la balise de test conserve sa validation et ne se duplique pas", async () => {
  const f = fixture();
  f.session.field.canPlaceQuestLocation = () => false;
  await f.controller.placeQuestLocation();
  assert.equal(f.session.game.getLocation("quest-beacon-300m"), null);
  f.session.field.canPlaceQuestLocation = () => true;
  await f.controller.placeQuestLocation();
  await f.controller.placeQuestLocation();
  assert.equal(
    f.session.game.locations.filter(
      (location) => location.id === "quest-beacon-300m",
    ).length,
    1,
  );
  assert.deepEqual(
    f.session.positioning.locationPositions.get("quest-beacon-300m"),
    [0, 0],
  );
});
