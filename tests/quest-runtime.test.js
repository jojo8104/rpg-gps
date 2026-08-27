import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { Scenario, ScenarioState } from "../app/js/core/scenario.js";

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

test("une quête différée reste absente jusqu'à la réception de son ordre", () => {
  const game = new Game({ setup, scenario, locations, scenarioLocationBindings: [{ locationSlotId: "camp", locationId: "camp-real" }], scenarioStartsActive: false });
  assert.equal(game.getActiveQuest(), null);
  assert.equal(game.scenarioState.getCurrentPhaseState().status, "locked");
  assert.equal(game.scenarioRuntime.placements.camp.status, "waiting");

  game.startScenarioRuntime({ latitude: 0, longitude: 0 });

  assert.equal(game.getActiveQuest().id, "reach");
  assert.equal(game.scenarioState.getCurrentPhaseState().status, "active");
  assert.equal(game.scenarioRuntime.placements.camp.status, "walking");
  assert.equal(game.eventLog.some((entry) => entry.type === "scenario_started"), true);
});

test("le setup remplace la distance par défaut et exige les confirmations", () => {
  const game = createGame();
  game.startScenarioRuntime({ latitude: 0, longitude: 0 });
  const target = { latitude: 0, longitude: 0.001 };
  assert.equal(game.updateScenarioPosition({ position: target, accuracy: 10 })[0].status, "walking");
  assert.equal(game.updateScenarioPosition({ position: target, accuracy: 10 })[0].status, "ready");
  assert.equal(game.scenarioRuntime.placements.camp.minimumDistanceMeters, 100);
});

test("un placement de quête adapte sa distance au rythme du setup", () => {
  const calmGame = new Game({ setup: { ...setup, rules: { travelPaceMode: "calm" } }, scenario: { ...scenario, locationSlots: [{ ...scenario.locationSlots[0], defaultPlacement: { strategy: "distance", minimumDistanceMetersByPace: { calm: 150, sport: 300 } } }] }, locations, scenarioLocationBindings: [{ locationSlotId: "camp", locationId: "camp-real" }] });
  const sportGame = new Game({ setup: { ...setup, rules: { travelPaceMode: "sport" } }, scenario: { ...scenario, locationSlots: [{ ...scenario.locationSlots[0], defaultPlacement: { strategy: "distance", minimumDistanceMetersByPace: { calm: 150, sport: 300 } } }] }, locations, scenarioLocationBindings: [{ locationSlotId: "camp", locationId: "camp-real" }] });
  assert.equal(calmGame.scenarioRuntime.placements.camp.minimumDistanceMeters, 150);
  assert.equal(sportGame.scenarioRuntime.placements.camp.minimumDistanceMeters, 300);
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

test("un lieu de quête ne peut jamais être placé hors de la zone de jeu", () => {
  const game = createGame();
  const outside = { latitude: 2, longitude: 2 };
  game.startScenarioRuntime({ latitude: 0, longitude: 0 });
  game.updateScenarioPosition({ position: outside, accuracy: 10 });
  game.updateScenarioPosition({ position: outside, accuracy: 10 });
  const result = game.placeScenarioLocation({ locationSlotId: "camp", position: outside });
  assert.deepEqual(result, { success: false, reason: "outside_play_area" });
  assert.deepEqual(game.getLocation("camp-real").position, { latitude: 0, longitude: 0 });
});

test("le déplacement générique d'un lieu refuse aussi de sortir de la PlayArea", () => {
  const game = createGame();
  const result = game.updateLocationPosition({ locationId: "camp-real", position: { latitude: 2, longitude: 2 } });
  assert.deepEqual(result, { success: false, reason: "outside_play_area" });
  assert.deepEqual(game.getLocation("camp-real").position, { latitude: 0, longitude: 0 });
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

test("un placement fixe hors PlayArea est rejeté dès la construction", () => {
  assert.throws(() => new Game({
    setup: { ...setup, locationSetup: { placements: { camp: { strategy: "fixed", position: { latitude: 2, longitude: 2 } } } } },
    scenario, locations, scenarioLocationBindings: [{ locationSlotId: "camp", locationId: "camp-real" }],
  }), /placement fixe.*PlayArea/i);
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

test("une quête abandonnée peut échouer puis suivre un embranchement déclaré", () => {
  const definition = new Scenario({ id: "failure", name: "Échec", intro: "Test", initialPhaseId: "mission", phases: [{ id: "mission", title: "Mission", description: "Agir", objectives: [{ id: "act", text: "Agir" }], transitions: [], failure: { policy: "branch", nextPhase: "aftermath" } }, { id: "aftermath", title: "Conséquences", description: "Sans récompense", objectives: [], transitions: [] }] });
  const state = new ScenarioState(definition); assert.equal(state.failCurrentPhase(definition, { reason: "abandoned", nextPhaseId: "aftermath", at: 10 }), true);
  assert.equal(state.phaseStates.mission.status, "failed"); assert.equal(state.phaseStates.mission.objectives[0].state, "failed"); assert.equal(state.currentPhaseId, "aftermath");
});

test("les quêtes s'enchaînent avec accord sans revenir à la première", () => {
  const cyclicScenario = {
    id: "test-quest", name: "Cycle", intro: "Alternez.", initialPhaseId: "quest-one",
    phases: [
      { id: "quest-one", title: "Quête 1", description: "Première", objectives: [{ id: "finish-one", text: "Finir la première", trigger: { type: "interactionCompleted", interactionId: "finish-one" } }], transitions: [] },
      { id: "quest-two", title: "Quête 2", description: "Deuxième", objectives: [{ id: "finish-two", text: "Finir la deuxième", trigger: { type: "interactionCompleted", interactionId: "finish-two" } }], transitions: [], failure: { policy: "branch", nextPhase: "quest-two-failed" } },
      { id: "quest-two-failed", title: "Échec 2", description: "Échec", objectives: [], transitions: [] },
      { id: "quest-three", title: "Quête 3", description: "Troisième", objectives: [{ id: "finish-three", text: "Finir la troisième", trigger: { type: "interactionCompleted", interactionId: "finish-three" } }], transitions: [] },
    ], events: [],
  };
  const game = new Game({ setup, scenario: cyclicScenario, locations });
  game.configureQuestSequence([
    { id: "one", startPhaseId: "quest-one", phaseIds: ["quest-one"] },
    { id: "two", startPhaseId: "quest-two", phaseIds: ["quest-two", "quest-two-failed"] },
    { id: "three", startPhaseId: "quest-three", phaseIds: ["quest-three"] },
  ]);

  const success = game.dispatchQuestEvent({ type: "InteractionCompleted", interactionId: "finish-one" });
  assert.equal(success.nextPhaseId, null); assert.equal(success.nextQuestId, "two");
  assert.equal(game.getActiveQuest(), null); assert.equal(game.getLastQuestResult().outcome, "completed");
  assert.equal(game.acceptAvailableQuest("two").success, true);
  assert.equal(game.scenarioState.currentPhaseId, "quest-two");

  const failure = game.failCurrentQuest({ reason: "battle_lost" });
  assert.equal(failure.nextQuestId, "three"); assert.equal(game.getActiveQuest(), null);
  assert.equal(game.acceptAvailableQuest("three").success, true);
  assert.equal(game.scenarioState.currentPhaseId, "quest-three");

  const abandoned = game.abandonCurrentQuest();
  assert.equal(abandoned.nextQuestId, null); assert.equal(game.getLastQuestResult().outcome, "abandoned");
  assert.equal(game.getAvailableQuests().length, 0);
  assert.equal(game.scenarioState.phaseStates["quest-one"].status, "completed");
});
