import test from "node:test";
import assert from "node:assert/strict";
import { createWorldSetupController } from "../app/js/controllers/world-setup-controller.js";
import { createGameToolsController } from "../app/js/controllers/game-tools-controller.js";
import { createGameStartController } from "../app/js/controllers/game-start-controller.js";

function setupContext() {
  return {
    mode: "simulation",
    game: {
      locations: [
        { id: "royal-capital", type: "capital" },
        { id: "fort", type: "fort" },
        { id: "test-camp", type: "camp", source: "simulation" },
      ],
      scenario: {
        locationSlots: [
          { id: "capital", type: "capital" },
          { id: "fort", type: "fort" },
        ],
      },
      scenarioLocationBindings: [
        { locationSlotId: "capital", locationId: "royal-capital" },
        { locationSlotId: "fort", locationId: "fort" },
      ],
    },
    setupView: {
      readWorldPreferences: () => ({ density: "low", placement: "auto" }),
    },
    manualSetupPlacements: new Map(),
    capitalPlaced: false,
    ui: { finishGpsSetup: {}, gpsAreaStatus: {} },
  };
}
test("simulation fixtures are excluded from generated placement counts", () => {
  const controller = createWorldSetupController(setupContext());
  const config = controller.automaticPlacementConfiguration();
  assert.deepEqual(config.locations, [
    { type: "fort", count: 1, placement: "auto" },
  ]);
  assert.equal(
    config.autonomous.every((group) => group.count === 0),
    true,
  );
});
test("manual high density preserves manual placement for groups and capital", () => {
  const context = setupContext();
  context.mode = "gps";
  context.setupView.readWorldPreferences = () => ({
    density: "high",
    placement: "manual",
  });
  const config =
    createWorldSetupController(context).automaticPlacementConfiguration();
  assert.equal(config.capitalMode, "manual");
  assert.equal(
    config.locations.every((location) => location.placement === "manual"),
    true,
  );
  assert.equal(
    config.autonomous.every(
      (group) => group.count === 2 && group.placement === "manual",
    ),
    true,
  );
});
test("setup requires the capital and every manual placement", () => {
  const context = setupContext();
  const controller = createWorldSetupController(context);
  controller.updateSetupCompletion();
  assert.equal(context.ui.finishGpsSetup.disabled, true);
  context.capitalPlaced = true;
  context.manualSetupPlacements.set("camp", {});
  controller.updateSetupCompletion();
  assert.equal(context.ui.finishGpsSetup.disabled, true);
  context.manualSetupPlacements.clear();
  controller.updateSetupCompletion();
  assert.equal(context.ui.finishGpsSetup.disabled, false);
});
test("world preparation stops before mutation if area has not been validated", () => {
  const context = setupContext();
  const before = structuredClone(context.game);
  createWorldSetupController(context).applyWorldSetup();
  assert.deepEqual(context.game, before);
  assert.match(context.ui.gpsAreaStatus.textContent, /zone de jeu/);
});
test("repositioning a setup group replaces its previous instance", () => {
  const context = setupContext();
  const groups = new Map();
  context.game = {
    getAutonomousGroup: (id) => groups.get(id),
    removeAutonomousGroup: (id) => groups.delete(id),
    addAutonomousGroup: (group) => groups.set(group.id, group),
  };
  const controller = createWorldSetupController(context);
  controller.addSetupAutonomousGroup("army", 0, { latitude: 48, longitude: 2 });
  controller.addSetupAutonomousGroup("army", 0, { latitude: 49, longitude: 3 });
  assert.equal(groups.size, 1);
  assert.equal(groups.get("setup-army-1").position.latitude, 49);
  assert.equal(groups.get("setup-army-1").factionId, "chaos");
});
test("cheat location rejects duplicate ids without changing the world", () => {
  const status = {};
  const context = {
    $: (selector) =>
      selector === "#cheat-status"
        ? status
        : { elements: { "location-id": { value: "existing" } } },
    game: { getLocation: () => ({ id: "existing" }) },
  };
  createGameToolsController(context).createCheatLocation();
  assert.match(status.textContent, /existe déjà/);
});
test("finishing setup waits for all manual placements", () => {
  const root = { querySelector: () => ({}), addEventListener: () => {} };
  const context = {
    $: () => root,
    capitalPlaced: true,
    manualSetupPlacements: new Map([["camp", {}]]),
  };
  createGameStartController(context).finishGameStart();
  assert.equal(context.manualSetupPlacements.size, 1);
});

test("closing the game menu remains callable outside tool initialization", () => {
  const removed = [];
  const attributes = [];
  const controller = createGameToolsController({
    $: (selector) =>
      selector === "#landscape-tools"
        ? { classList: { remove: (value) => removed.push(value) } }
        : { setAttribute: (...args) => attributes.push(args) },
  });
  controller.closeGameMenu();
  assert.deepEqual(removed, ["is-open"]);
  assert.deepEqual(attributes, [["aria-expanded", "false"]]);
});
