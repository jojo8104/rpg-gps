import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScenarioBundles,
  launchScenarios,
} from "../server/lobby/scenario-catalog.js";
import { createEditorGame } from "../server/lobby/editor-game.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { branchExample } from "../editor/js/branch-example.js";

test("un scénario éditeur garde son nom, ses lieux et uniquement ses quêtes", () => {
  const project = branchExample();
  project.campaign = {
    id: "scenario-test",
    name: "Mon aventure",
    intro: "Introduction",
    quests: [project.quest],
    initialQuestIds: [project.quest.id],
  };
  const bundle = buildScenarioBundles([project]).get("scenario-test");
  assert.equal(bundle.catalog.name, "Mon aventure");
  assert.deepEqual(bundle.questIds, [project.quest.id]);
  assert.ok(
    bundle.data.scenario.locationSlots.some((slot) => slot.id === "fort"),
  );
  assert.ok(
    bundle.catalog.locations.some((location) => location.id === "fort"),
  );
  assert.equal(bundle.data.scenario.mapDefinition, null);
  assert.deepEqual(
    bundle.data.scenario.locationSlots.map((slot) => slot.id).sort(),
    ["camp", "capital", "fort"],
  );
  assert.deepEqual(
    bundle.catalog.locations.map((location) => location.id).sort(),
    ["camp", "capital", "fort"],
  );
  assert.deepEqual(
    bundle.data.locations.map((location) => location.id).sort(),
    ["camp", "capital", "fort"],
  );
  const lobby = {
    status: "started",
    code: "TEST",
    configuration: { scenarioId: "scenario-test", positionMode: "simulation" },
    launch: {
      id: "launch",
      seed: "test",
      configuration: {
        scenarioId: "scenario-test",
        positionMode: "simulation",
        difficulty: "normal",
      },
      players: [{ id: "player", name: "Test", heroClassId: "warrior" }],
    },
  };
  assert.equal(
    createMultiplayerLaunch(lobby).setup.scenarioId,
    "scenario-test",
  );
  const game = createEditorGame(
    lobby,
    { now: () => 1000, questSystemEnabled: false },
    bundle,
  );
  assert.equal(game.scenario.id, "scenario-test");
  assert.equal(game.status, "started");
  assert.ok(game.getLocationForScenarioSlot("fort"));
  assert.equal(game.getLocation("supply-fort"), null);
  assert.equal(game.getLocation("prospector-battlefield"), null);
});
test("le lobby annonce les scénarios disponibles et refuse un identifiant inconnu", () => {
  const service = new LobbyService();
  const host = service.createLobby({
    playerName: "Test",
    positionMode: "simulation",
  });
  assert.deepEqual(host.lobby.scenarios, launchScenarios);
  assert.throws(
    () =>
      service.updateConfiguration({
        token: host.session.token,
        configuration: { scenarioId: "inconnu" },
      }),
    (error) => error.code === "invalid_scenario",
  );
});

test("deux scénarios installés ne partagent pas leurs lieux et ne modifient pas le monde d’origine", () => {
  const first = branchExample(),
    second = branchExample();
  first.campaign = { id: "premier", name: "Premier", quests: [first.quest] };
  second.campaign = { id: "second", name: "Second", quests: [second.quest] };
  second.quest.id = "deuxieme-quete";
  second.world.locationSlots = [
    {
      id: "foret-seconde",
      type: "lumber-camp",
      defaultPlacement: { strategy: "random" },
    },
  ];
  second.world.locations = [
    {
      id: "foret-seconde",
      name: "Forêt du second scénario",
      type: "lumber-camp",
    },
  ];
  const bundles = buildScenarioBundles([first, second]);
  assert.deepEqual(
    bundles
      .get("premier")
      .catalog.locations.map((location) => location.id)
      .sort(),
    ["camp", "capital", "fort"],
  );
  assert.deepEqual(
    bundles.get("second").catalog.locations.map((location) => location.id),
    ["foret-seconde"],
  );
  assert.ok(
    !bundles
      .get("chaos")
      .catalog.locations.some((location) =>
        ["foret-seconde", "fort", "camp"].includes(location.id),
      ),
  );
  assert.ok(!bundles.get("chaos").questIds.includes("deuxieme-quete"));
  assert.equal(first.world.locationSlots.length, 3);
});
