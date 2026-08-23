import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const playArea = { id: "area", name: "Zone", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] };
const setup = {
  id: "setup", name: "Test", mode: "quick", scenarioId: "test-quest", playerCount: 1, playArea,
  participants: [{ playerId: "local", name: "Joueur" }],
  locationSetup: { placements: { camp: { strategy: "distance", minimumDistanceMeters: 100, confirmations: 2 } } },
};
const scenario = {
  id: "test-quest", name: "Test", intro: "Rejoignez le camp.", initialPhaseId: "reach",
  locationSlots: [{ id: "camp", type: "camp", defaultPlacement: { strategy: "distance", minimumDistanceMeters: 300 } }],
  phases: [
    { id: "reach", title: "Rejoindre", description: "Marchez.", objectives: [{ id: "reach-camp", text: "Rejoindre le camp", trigger: { type: "locationPlaced", locationSlotId: "camp" }, eventId: "reached" }], eventIds: ["reached"], transitions: [{ nextPhase: "talk" }] },
    { id: "talk", title: "Parler", description: "Interrogez le chef.", objectives: [{ id: "talk-chief", text: "Parler au chef", trigger: { type: "interactionCompleted", interactionId: "talk-chief", locationSlotId: "camp" } }], eventIds: [], transitions: [] },
  ],
  events: [{ id: "reached", effects: [{ type: "showNarration", text: "Le camp est atteint." }] }],
};
const locations = [{ id: "camp-real", name: "Camp", type: "camp", source: "scenario", position: { latitude: 0, longitude: 0 }, population: 4 }];

function createGame() {
  return new Game({ setup, scenario, locations, scenarioLocationBindings: [{ locationSlotId: "camp", locationId: "camp-real" }] });
}

test("le setup remplace la distance par défaut et exige les confirmations", () => {
  const game = createGame();
  game.startScenarioRuntime({ latitude: 0, longitude: 0 });
  const target = { latitude: 0, longitude: 0.001 };
  assert.equal(game.updateScenarioPosition({ position: target, accuracy: 10 })[0].status, "walking");
  assert.equal(game.updateScenarioPosition({ position: target, accuracy: 10 })[0].status, "ready");
  assert.equal(game.scenarioRuntime.placements.camp.minimumDistanceMeters, 100);
});

test("placer le camp accomplit l'objectif et enchaîne la phase suivante", () => {
  const game = createGame();
  const target = { latitude: 0, longitude: 0.001 };
  game.startScenarioRuntime({ latitude: 0, longitude: 0 });
  game.updateScenarioPosition({ position: target, accuracy: 10 });
  game.updateScenarioPosition({ position: target, accuracy: 10 });
  const result = game.placeScenarioLocation({ locationSlotId: "camp", position: target });
  assert.equal(result.success, true);
  assert.equal(game.scenarioState.currentPhaseId, "talk");
  assert.equal(game.eventLog.some((entry) => entry.type === "narration" && entry.text === "Le camp est atteint."), true);
  assert.deepEqual(game.getLocation("camp-real").position, target);
});

test("l'interaction locale termine l'objectif actif une seule fois", () => {
  const game = createGame();
  const target = { latitude: 0, longitude: 0.001 };
  game.startScenarioRuntime({ latitude: 0, longitude: 0 });
  game.updateScenarioPosition({ position: target, accuracy: 10 });
  game.updateScenarioPosition({ position: target, accuracy: 10 });
  game.placeScenarioLocation({ locationSlotId: "camp", position: target });
  assert.equal(game.getQuestInteractionsForLocation("camp-real")[0].interactionId, "talk-chief");
  assert.equal(game.dispatchQuestEvent({ type: "InteractionCompleted", interactionId: "talk-chief", locationId: "camp-real" }).completedObjectiveIds[0], "talk-chief");
  assert.equal(game.dispatchQuestEvent({ type: "InteractionCompleted", interactionId: "talk-chief", locationId: "camp-real" }), null);
});

test("un setup fixe utilise directement ses coordonnées", () => {
  const fixedPosition = { latitude: 0.2, longitude: 0.3 };
  const game = new Game({
    setup: { ...setup, locationSetup: { placements: { camp: { strategy: "fixed", position: fixedPosition } } } },
    scenario, locations, scenarioLocationBindings: [{ locationSlotId: "camp", locationId: "camp-real" }],
  });
  assert.equal(game.scenarioRuntime.placements.camp.status, "placed");
  assert.deepEqual(game.getLocation("camp-real").position, fixedPosition);
});

test("les déclencheurs de trace et de victoire restent indépendants de l'interface", () => {
  const traceScenario = {
    id: "test-quest", name: "Piste", intro: "Suivez.", initialPhaseId: "trace",
    locationSlots: [{ id: "camp", type: "camp" }],
    phases: [
      { id: "trace", title: "Piste", description: "Examinez.", objectives: [{ id: "trace", text: "Trace", trigger: { type: "traceInspected", traceId: "trace-royale" } }], eventIds: [], transitions: [{ nextPhase: "battle" }] },
      { id: "battle", title: "Combat", description: "Gagnez.", objectives: [{ id: "victory", text: "Victoire", trigger: { type: "battleWon", locationSlotId: "camp" } }], eventIds: [], transitions: [] },
    ], events: [],
  };
  const game = new Game({ setup, scenario: traceScenario, locations, scenarioLocationBindings: [{ locationSlotId: "camp", locationId: "camp-real" }] });
  assert.equal(game.dispatchQuestEvent({ type: "TraceInspected", traceId: "une-autre-trace" }), null);
  assert.equal(game.dispatchQuestEvent({ type: "TraceInspected", traceId: "trace-royale" }).nextPhaseId, "battle");
  assert.equal(game.dispatchQuestEvent({ type: "BattleWon", locationId: "camp-real" }).completedObjectiveIds[0], "victory");
});
