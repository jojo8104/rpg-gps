import test from "node:test";
import assert from "node:assert/strict";
import { createWorldSetupController } from "../app/js/controllers/world-setup-controller.js";
import { createLocationFlowController } from "../app/js/controllers/location-flow-controller.js";
import { createPlayerInterfaceController } from "../app/js/controllers/player-interface-controller.js";

test("un déplacement refusé ne change ni la projection ni la carte", () => {
  const positions = new Map([["camp", [1, 2]]]);
  const messages = [];
  const controller = createWorldSetupController({
    game: {
      updateLocationPosition: () => ({ success: false, reason: "hors zone" }),
    },
    asGps: ([latitude, longitude]) => ({ latitude, longitude }),
    positioning: { locationPositions: positions },
    logTest: (message) => messages.push(message),
    render: () => assert.fail("aucun rendu après refus"),
  });
  assert.equal(controller.moveLocation("camp", [3, 4]), false);
  assert.deepEqual(positions.get("camp"), [1, 2]);
  assert.match(messages[0], /hors zone/);
});

test("un déplacement accepté utilise le moteur courant et copie la position", () => {
  const calls = [];
  const context = {
    game: { updateLocationPosition: () => assert.fail("ancien moteur") },
    asGps: (position) =>
      Array.isArray(position)
        ? { latitude: position[0], longitude: position[1] }
        : { ...position },
    positioning: { locationPositions: new Map() },
    enemyHero: {
      updatePosition: (position) => calls.push(["enemy", position]),
    },
    rebuildLocationEngine: () => calls.push(["rebuild"]),
    render: () => calls.push(["render"]),
    worldMap: {
      view: { focus: (position) => calls.push(["focus", position]) },
    },
  };
  const controller = createWorldSetupController(context);
  context.game = {
    updateLocationPosition: (input) => {
      calls.push(["command", input]);
      return { success: true };
    },
  };
  for (const position of [[3, 4], { latitude: 5, longitude: 6 }]) {
    assert.equal(controller.moveLocation("bandit-camp", position), true);
    assert.deepEqual(
      context.positioning.locationPositions.get("bandit-camp"),
      position,
    );
    assert.notEqual(
      context.positioning.locationPositions.get("bandit-camp"),
      position,
    );
  }
  assert.deepEqual(
    calls.slice(0, 4).map((call) => call[0]),
    ["command", "enemy", "rebuild", "render"],
  );
  context.enemyHero = null;
  assert.equal(controller.moveLocation("bandit-camp", [7, 8]), true);
});

test("la résolution attend la quête avant de reconstruire les lieux survivants", async () => {
  let complete;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  const session = {
    game: {
      locations: [
        { id: "destroyed", state: "destroyed" },
        { id: "alive", state: "active" },
      ],
    },
    currentEncounter: {},
  };
  const locations = { selectedId: "destroyed" };
  let rebuilt = 0;
  const controller = createLocationFlowController({
    session,
    locations,
    quests: { battleResolved: () => pending },
    rebuildLocationEngine: () => rebuilt++,
    resolveLocationEnemy: () => null,
  });
  const result = controller.handleBattleResolved({
    battle: {},
    result: { destroyedLocationId: "destroyed" },
  });
  assert.equal(rebuilt, 0);
  complete();
  await result;
  assert.equal(rebuilt, 1);
  assert.deepEqual([...session.interactionEngine.locations.keys()], ["alive"]);
  assert.equal(session.currentEncounter, null);
  assert.equal(locations.selectedId, null);
});

test("une capture termine la rencontre et conserve le lieu sélectionné", async () => {
  const session = { currentEncounter: {}, locationMessage: "" };
  const locations = { selectedId: "captured" };
  const controller = createLocationFlowController({
    session,
    locations,
    quests: { battleResolved: async () => {} },
  });
  await controller.handleBattleResolved({
    battle: {},
    result: { capturedLocationId: "captured" },
  });
  assert.equal(session.currentEncounter, null);
  assert.equal(locations.selectedId, "captured");
  assert.match(session.locationMessage, /capturé/);
});

test("les récompenses de marche affichent le palier et son alerte sans calculer d'XP", () => {
  const shown = [],
    alerts = [];
  const controller = createPlayerInterfaceController({
    elements: {},
    getSession: () => null,
    alerts: { reward: (reward) => alerts.push(reward) },
    views: { rewards: { show: (reward) => shown.push(reward) } },
  });
  controller.showTravelReward({
    completedKilometers: 0,
    completed500MeterSteps: 1,
    experienceGained: 100,
  });
  controller.showTravelReward({
    completedKilometers: 1,
    completed500MeterSteps: 2,
    experienceGained: 200,
  });
  assert.deepEqual(alerts, [{ kilometer: false }, { kilometer: true }]);
  assert.equal(shown[0].caption, "500 m");
  assert.equal(shown[0].title, "Distance parcourue");
  assert.equal(shown[1].caption, "1000 m");
  assert.equal(shown[1].title, "Distance parcourue");
  assert.equal(shown[1].className, "is-kilometer");
});
