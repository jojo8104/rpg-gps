import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Game } from "../app/js/core/game.js";
import { composeScenario } from "../app/js/core/scenario-composer.js";
import { Scenario } from "../app/js/core/scenario.js";

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const moduleScenario = load("../data/scenarios/granaries-of-the-king.json");
const scenario = { ...moduleScenario, locationSlots: [...moduleScenario.locationSlots, { id: "capital-resource-gold-village", type: "village", defaultPlacement: { strategy: "fixed" } }] };
const playArea = { id: "granaries-area", name: "Zone", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] };
const setup = { id: "granaries-setup", name: "Greniers", mode: "quick", scenarioId: "granaries_of_the_king", playerCount: 1, playArea, participants: [{ playerId: "local", name: "Autre joueur" }] };
const locations = [
  { id: "capital-real", name: "Capitale", type: "capital", source: "scenario", position: { latitude: .01, longitude: .01 }, visibility: "discovered" },
  { id: "capital-resource-gold-village", name: "Aurive", type: "village", source: "scenario", position: { latitude: .02, longitude: .02 }, visibility: "discovered", state: "supplied", ownerId: "kingdom", population: 32, infrastructure: { field: 2 }, improvements: [{ id: "expanded-granary", type: "storage", storageCapacityBonus: 20, destroyed: false }], resources: { production: { food: 1 }, stock: { food: 5 }, storageCapacity: 60 }, features: { battle: true, resourceProduction: true }, garrison: { units: [] } },
  { id: "requisition-convoy", name: "Convoi", type: "event_location", source: "scenario", position: { latitude: .03, longitude: .03 }, visibility: "hidden" },
  { id: "counsellor-guard-depot", name: "Dépôt", type: "depot", source: "scenario", position: { latitude: .04, longitude: .04 }, visibility: "hidden", resources: { production: {}, stock: { food: 0 }, storageCapacity: 100 } }
];
const bindings = [
  { locationSlotId: "capital", locationId: "capital-real" },
  { locationSlotId: "capital-resource-gold-village", locationId: "capital-resource-gold-village" },
  { locationSlotId: "requisition-convoy", locationId: "requisition-convoy" },
  { locationSlotId: "counsellor-guard-depot", locationId: "counsellor-guard-depot" }
];
const createGame = () => new Game({ setup, scenario, locations, scenarioLocationBindings: bindings, coordinateMode: "gps" });
const reachVillage = (game) => game.dispatchQuestEvent({ type: "LocationEntered", locationId: "capital-resource-gold-village" });
const winVillage = (game) => game.dispatchQuestEvent({ type: "BattleWon", locationId: "capital-resource-gold-village" });
const discoverConvoy = (game) => game.dispatchQuestEvent({ type: "LocationPlaced", locationSlotId: "requisition-convoy", locationId: "requisition-convoy" });

test("le module se compose sans dupliquer le village de Ravitaillement", () => {
  const base = load("../data/scenarios/chaos.json");
  const composed = composeScenario(base, moduleScenario);
  assert.equal(composed.locationSlots.filter(({ id }) => id === "capital-resource-gold-village").length, 1);
  assert.equal(load("../data/granaries-locations.json").some(({ id }) => id === "capital-resource-gold-village"), false);
  assert.doesNotThrow(() => new Scenario(composed));
});

test("faire appliquer la réquisition saisit le stock restant sur la même instance", () => {
  const game = createGame(); const village = game.getLocation("capital-resource-gold-village"); const improvement = village.getImprovement("expanded-granary");
  reachVillage(game);
  game.selectQuestChoice("ENFORCE_REQUISITION"); winVillage(game);
  assert.strictEqual(game.getLocationForScenarioSlot("capital-resource-gold-village"), village);
  assert.strictEqual(village.getImprovement("expanded-granary"), improvement);
  assert.equal(village.resources.stock.food, 0); assert.equal(game.getLocation("counsellor-guard-depot").resources.stock.food, 5);
  assert.equal(game.worldState.get("granaries.reservesSeized"), 5); assert.equal(game.worldState.getNpc("haut_pre_village_chief").status, "captured");
});

test("défendre Aurive préserve les réserves et fait du chef un allié", () => {
  const game = createGame(); reachVillage(game); game.selectQuestChoice("NEGOTIATE_WITH_CHIEF"); game.selectQuestChoice("DEFEND_GRANARY_VILLAGE"); winVillage(game);
  assert.equal(game.getLocation("capital-resource-gold-village").resources.stock.food, 5);
  assert.equal(game.worldState.getNpc("haut_pre_village_chief").status, "ally"); assert.equal(game.worldState.get("granaries.officerDefeated"), true);
  assert.equal(game.worldState.get("granaries.chiefRelation"), 2);
});

test("laisser faire conserve le chef comme fugitif et l'enquête reste facultative", () => {
  const game = createGame(); reachVillage(game); game.selectQuestChoice("NEGOTIATE_WITH_CHIEF"); game.selectQuestChoice("LET_GUARD_ACT"); game.selectQuestChoice("LEAVE_FALLEN_VILLAGE");
  assert.equal(game.worldState.getNpc("haut_pre_village_chief").status, "fugitive");
  game.dispatchQuestEvent({ type: "LocationEntered", locationId: "capital-real" });
  assert.equal(game.worldState.get("granaries.questCompleted"), true); assert.equal(game.worldState.get("granaries.convoyInvestigated"), false);
});

test("suivre le convoi révèle seulement l'anomalie du dépôt et persiste après recharge", () => {
  const game = createGame(); reachVillage(game); game.selectQuestChoice("ENFORCE_REQUISITION"); winVillage(game);
  assert.doesNotMatch(game.scenario.getPhase("granaries-return-journey").description, /convoi|chariot|réserves/i);
  assert.equal(game.getQuestChoices().some(({ id }) => id === "FOLLOW_REQUISITION_CONVOY"), false);
  discoverConvoy(game);
  assert.match(game.eventLog.at(-1).text, /chariots chargés à Aurive/i);
  assert.equal(game.getQuestChoices().some(({ id }) => id === "FOLLOW_REQUISITION_CONVOY"), true);
  game.selectQuestChoice("FOLLOW_REQUISITION_CONVOY");
  game.dispatchQuestEvent({ type: "LocationEntered", locationId: "counsellor-guard-depot" });
  assert.equal(game.worldState.get("granaries.convoyInvestigated"), true); assert.equal(game.worldState.get("granaries.secretDepotDiscovered"), true);
  assert.equal(game.eventLog.some(({ text = "" }) => /coup d.?état/i.test(text)), false);
  const snapshot = game.toJSON();
  const restored = new Game({ setup: snapshot.setup, scenario: snapshot.scenario, locations: snapshot.locations, scenarioLocationBindings: snapshot.scenarioLocationBindings, coordinateMode: "gps", scenarioStateSnapshot: snapshot.scenarioState, worldStateSnapshot: snapshot.worldState, trailStateSnapshots: snapshot.trailStates, scenarioRuntimeSnapshot: snapshot.scenarioRuntime });
  assert.equal(restored.worldState.get("granaries.secretDepotDiscovered"), true); assert.equal(restored.worldState.get("granaries.reservesSeized"), 5);
  assert.equal(restored.getLocation("capital-resource-gold-village").resources.stock.food, 0);
});

test("les choix restent verrouillés jusqu'à l'arrivée et suivent la narration du blocus", () => {
  const game = createGame();
  assert.equal(game.scenarioState.currentPhaseId, "granaries-reach-village");
  assert.deepEqual(game.getQuestChoices(), []);

  const result = reachVillage(game);
  assert.equal(result.nextPhaseId, "granaries-arrival");
  const narration = result.appliedEvents[0].appliedEffects.find(({ type }) => type === "narration");
  assert.match(narration.text, /ordre de réquisition exceptionnelle/i);
  assert.match(narration.text, /prochaines semailles/i);
  assert.match(narration.text, /sous blocus/i);
  assert.deepEqual(game.getQuestChoices().map(({ id }) => id), ["ENFORCE_REQUISITION", "NEGOTIATE_WITH_CHIEF"]);
});
