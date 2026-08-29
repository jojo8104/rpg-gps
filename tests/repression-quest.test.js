import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Game } from "../app/js/core/game.js";

const scenario = JSON.parse(readFileSync(new URL("../data/scenarios/repression.json", import.meta.url), "utf8"));
const playArea = { id: "repression-area", name: "Zone", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] };
const setup = { id: "repression-setup", name: "Répression", mode: "quick", scenarioId: "repression", playerCount: 1, playArea, participants: [{ playerId: "local", name: "Joueur" }] };
const locations = [
  { id: "capital-real", name: "Capitale", type: "capital", source: "scenario", position: { latitude: .01, longitude: .01 }, visibility: "discovered" },
  { id: "village-real", name: "Village séditieux", type: "village", source: "scenario", position: { latitude: .02, longitude: .02 }, state: "besieged", ownerId: "ruined_knight", population: null, features: { battle: true, recruitment: true }, recruitment: { availableUnitTypeIds: ["militia"], capacity: 8, stock: { militia: 8 } }, improvements: [{ id: "manor", type: "defensive", defenseBonus: 2, militiaCapacityBonus: 4, destroyed: false }], garrison: { units: [] } },
  { id: "convoy-real", name: "Vestiges du convoi", type: "event_location", source: "scenario", position: { latitude: .03, longitude: .03 }, visibility: "hidden" },
  { id: "brigands-real", name: "Camp des brigands", type: "brigand_camp", source: "scenario", position: { latitude: .04, longitude: .04 }, visibility: "hidden" }
];
const bindings = [
  { locationSlotId: "capital", locationId: "capital-real" }, { locationSlotId: "seditious-village", locationId: "village-real" },
  { locationSlotId: "attacked-convoy", locationId: "convoy-real" }, { locationSlotId: "brigand-camp-convoy", locationId: "brigands-real" }
];

function createRawGame() { return new Game({ setup, scenario, locations, scenarioLocationBindings: bindings, coordinateMode: "gps" }); }
function createGame() {
  const game = createRawGame();
  game.dispatchQuestEvent({ type: "LocationPlaced", locationSlotId: "seditious-village", locationId: "village-real" });
  game.dispatchQuestEvent({ type: "LocationEntered", locationId: "village-real" });
  return game;
}
function win(game, locationId = "village-real") { return game.dispatchQuestEvent({ type: "BattleWon", locationId }); }
function discoverConvoy(game) { game.dispatchQuestEvent({ type: "LocationPlaced", locationSlotId: "attacked-convoy", locationId: "convoy-real" }); }

test("le village est généré puis son entrée présente la situation avant les choix", () => {
  const game = createRawGame();
  assert.equal(game.scenarioState.currentPhaseId, "locate-village"); assert.deepEqual(game.getQuestChoices(), []);
  const located = game.dispatchQuestEvent({ type: "LocationPlaced", locationSlotId: "seditious-village", locationId: "village-real" });
  assert.equal(located.nextPhaseId, "village-arrival"); assert.match(located.appliedEvents[0].appliedEffects.find(({ type }) => type === "narration").text, /palissades de Montfaucon/i);
  assert.deepEqual(game.getQuestChoices(), []);
  const entered = game.dispatchQuestEvent({ type: "LocationEntered", locationId: "village-real" });
  assert.equal(entered.nextPhaseId, "arrival"); assert.match(entered.appliedEvents[0].appliedEffects.find(({ type }) => type === "narration").text, /agir au nom de la Couronne/i);
  assert.deepEqual(game.getQuestChoices().map(({ id }) => id), ["ASSAULT_VILLAGE", "NEGOTIATE"]);
});

test("l'assaut immédiat détruit réellement le Manoir et permet un retour direct", () => {
  const game = createGame(); const village = game.getLocation("village-real");
  assert.equal(village.defenseBonus, 2); assert.equal(village.militiaCapacity, 12);
  const defendedBattle = game.battleService.createBattle({ id: "manor-before", game, teamParticipants: [{ id: "attackers", locationId: "capital-real" }, { id: "defenders", locationId: "village-real" }], now: 0 });
  assert.equal(defendedBattle.teams.find(({ id }) => id === "defenders").heroes[0].defense, 8);
  const assault = game.selectQuestChoice("ASSAULT_VILLAGE"); assert.equal(assault.nextPhaseId, "royal-assault"); assert.match(assault.appliedEvent.appliedEffects.find(({ type }) => type === "narration").text, /trompes royales/i);
  const victory = win(game); assert.match(victory.appliedEvents[0].appliedEffects.find(({ type }) => type === "narration").text, /goût de cendre/i);
  assert.equal(game.worldState.getNpc("ruined_knight").status, "dead"); assert.equal(village.state, "royal_control");
  assert.equal(village.getImprovement("manor").destroyed, true); assert.equal(village.defenseBonus, 0); assert.equal(village.militiaCapacity, 8);
  const ruinedBattle = game.battleService.createBattle({ id: "manor-after", game, teamParticipants: [{ id: "attackers", locationId: "capital-real" }, { id: "defenders", locationId: "village-real" }], now: 0 });
  assert.equal(ruinedBattle.teams.find(({ id }) => id === "defenders").heroes[0].defense, 6);
  const result = game.dispatchQuestEvent({ type: "LocationEntered", locationId: "capital-real" });
  assert.equal(result.completedObjectiveIds[0], "return-capital"); assert.equal(game.worldState.get("repression.questCompleted"), true);
  const report = game.eventLog.find((entry) => entry.type === "scenario_report"); assert.match(report.text, /chevalier est mort/i); assert.doesNotMatch(report.text, /inconnu/i);
  assert.equal(game.worldState.get("repression.knightStatus"), "dead"); assert.equal(game.worldState.get("repression.knightGrade"), 1);
});

test("la défense conserve le Manoir et donner le trésor augmente le grade du chevalier", () => {
  const game = createGame(); game.selectQuestChoice("NEGOTIATE"); game.selectQuestChoice("DEFEND_VILLAGE"); win(game);
  assert.equal(game.worldState.getNpc("ruined_knight").status, "ally"); assert.equal(game.getLocation("village-real").getImprovement("manor").destroyed, false);
  discoverConvoy(game); game.selectQuestChoice("INSPECT_CONVOY");
  game.dispatchQuestEvent({ type: "TraceInspected", traceId: "convoy-trace-1" }); game.dispatchQuestEvent({ type: "TraceInspected", traceId: "convoy-trace-2" });
  game.selectQuestChoice("ATTACK_CAMP"); win(game, "brigands-real");
  assert.equal(game.getQuestChoices().some(({ id }) => id === "GIVE_TREASURE_TO_KNIGHT"), true);
  game.selectQuestChoice("GIVE_TREASURE_TO_KNIGHT");
  assert.equal(game.worldState.getNpc("ruined_knight").grade, 2); assert.equal(game.worldState.get("repression.treasureChoice"), "knight");
  assert.equal(game.toJSON().worldState.npcs.find(({ id }) => id === "ruined_knight").grade, 2);
});

test("laisser faire rend le chevalier fugitif et l'enquête reste facultative", () => {
  const game = createGame(); game.selectQuestChoice("NEGOTIATE"); game.selectQuestChoice("STAND_ASIDE"); game.selectQuestChoice("CONTINUE");
  assert.equal(game.worldState.getNpc("ruined_knight").status, "fugitive");
  game.dispatchQuestEvent({ type: "LocationEntered", locationId: "capital-real" });
  assert.equal(game.worldState.get("repression.questCompleted"), true); assert.equal(game.getTrailState("convoy-raiders-trail").status, "not_started");
});

test("la piste impose l'ordre de ses points et révèle le camp à son terme", () => {
  const game = createGame(); game.selectQuestChoice("ASSAULT_VILLAGE"); win(game); assert.equal(game.getQuestChoices().length, 0); discoverConvoy(game); const inspection = game.selectQuestChoice("INSPECT_CONVOY");
  assert.match(inspection.appliedEvent.appliedEffects.find(({ type }) => type === "narration").text, /piste fraîche/i);
  assert.equal(game.dispatchQuestEvent({ type: "TraceInspected", traceId: "convoy-trace-2" }), null);
  const firstTrace = game.dispatchQuestEvent({ type: "TraceInspected", traceId: "convoy-trace-1" }); assert.match(firstTrace.appliedEvents[0].appliedEffects.find(({ type }) => type === "narration").text, /fibres de toile royale/i);
  const secondTrace = game.dispatchQuestEvent({ type: "TraceInspected", traceId: "convoy-trace-2" }); assert.match(secondTrace.appliedEvents[0].appliedEffects.find(({ type }) => type === "narration").text, /fumée basse/i);
  assert.equal(game.getTrailState("convoy-raiders-trail").status, "completed"); assert.equal(game.getLocation("brigands-real").visibility, "discovered");
});

test("une défaite au camp ne bloque pas le retour à la capitale", () => {
  const game = createGame(); game.selectQuestChoice("ASSAULT_VILLAGE"); win(game); discoverConvoy(game); game.selectQuestChoice("INSPECT_CONVOY");
  game.dispatchQuestEvent({ type: "TraceInspected", traceId: "convoy-trace-1" }); game.dispatchQuestEvent({ type: "TraceInspected", traceId: "convoy-trace-2" }); game.selectQuestChoice("ATTACK_CAMP");
  const result = game.dispatchQuestEvent({ type: "BattleLost", locationId: "brigands-real" });
  assert.equal(result.nextPhaseId, "return-after-investigation"); assert.equal(game.worldState.get("repression.brigandTruthKnown"), false);
  assert.match(result.appliedEvent.appliedEffects.find(({ type }) => type === "narration").text, /repoussent hors du vallon/i);
});

test("l'état critique de la quête, des PNJ, du Manoir et de la piste se recharge", () => {
  const game = createGame(); game.selectQuestChoice("NEGOTIATE"); game.selectQuestChoice("DEFEND_VILLAGE"); win(game); discoverConvoy(game); game.selectQuestChoice("INSPECT_CONVOY"); game.dispatchQuestEvent({ type: "TraceInspected", traceId: "convoy-trace-1" });
  const snapshot = game.toJSON();
  const restored = new Game({ setup: snapshot.setup, scenario: snapshot.scenario, locations: snapshot.locations, scenarioLocationBindings: snapshot.scenarioLocationBindings, coordinateMode: "gps", scenarioStateSnapshot: snapshot.scenarioState, worldStateSnapshot: snapshot.worldState, trailStateSnapshots: snapshot.trailStates, scenarioRuntimeSnapshot: snapshot.scenarioRuntime });
  assert.equal(restored.scenarioState.currentPhaseId, "convoy-trace-two"); assert.equal(restored.worldState.getNpc("ruined_knight").status, "ally");
  assert.deepEqual(restored.getTrailState("convoy-raiders-trail").inspectedTraceIds, ["convoy-trace-1"]); assert.equal(restored.getLocation("village-real").getImprovement("manor").destroyed, false);
  restored.dispatchQuestEvent({ type: "TraceInspected", traceId: "convoy-trace-2" }); assert.equal(restored.getTrailState("convoy-raiders-trail").status, "completed");
});
