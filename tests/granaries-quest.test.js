import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Game } from "../app/js/core/game.js";
import { composeScenario } from "../app/js/core/scenario-composer.js";
import { Scenario } from "../app/js/core/scenario.js";

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const scenario = load("../data/scenarios/granaries-of-the-king.json");
const playArea = { id: "granaries-area", name: "Zone", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] };
const setup = { id: "granaries-setup", name: "Greniers", mode: "quick", scenarioId: "granaries_of_the_king", playerCount: 1, playArea, participants: [{ playerId: "local", name: "Autre joueur" }] };
const locations = [
  { id: "capital-real", name: "Capitale", type: "capital", source: "scenario", position: { latitude: .01, longitude: .01 }, visibility: "discovered" },
  { id: "supply-village-north", name: "Haut-Pré", type: "village", source: "scenario", position: { latitude: .02, longitude: .02 }, visibility: "discovered", state: "supplied", ownerId: "kingdom", population: 32, infrastructure: { field: 2 }, improvements: [{ id: "expanded-granary", type: "storage", storageCapacityBonus: 20, destroyed: false }], resources: { production: { food: 1 }, stock: { food: 5 }, storageCapacity: 60 }, features: { battle: true, resourceProduction: true }, garrison: { units: [] } },
  { id: "requisition-convoy", name: "Convoi", type: "event_location", source: "scenario", position: { latitude: .03, longitude: .03 }, visibility: "hidden" },
  { id: "counsellor-guard-depot", name: "Dépôt", type: "depot", source: "scenario", position: { latitude: .04, longitude: .04 }, visibility: "hidden", resources: { production: {}, stock: { food: 0 }, storageCapacity: 100 } }
];
const bindings = [
  { locationSlotId: "capital", locationId: "capital-real" },
  { locationSlotId: "supply-village-north", locationId: "supply-village-north" },
  { locationSlotId: "requisition-convoy", locationId: "requisition-convoy" },
  { locationSlotId: "counsellor-guard-depot", locationId: "counsellor-guard-depot" }
];
const createGame = () => new Game({ setup, scenario, locations, scenarioLocationBindings: bindings, coordinateMode: "gps" });
const winVillage = (game) => game.dispatchQuestEvent({ type: "BattleWon", locationId: "supply-village-north" });
const discoverConvoy = (game) => game.dispatchQuestEvent({ type: "LocationPlaced", locationSlotId: "requisition-convoy", locationId: "requisition-convoy" });

test("le module se compose sans dupliquer le village de Ravitaillement", () => {
  const base = load("../data/scenarios/chaos.json");
  const composed = composeScenario(base, scenario);
  assert.equal(composed.locationSlots.filter(({ id }) => id === "supply-village-north").length, 1);
  assert.equal(load("../data/granaries-locations.json").some(({ id }) => id === "supply-village-north"), false);
  assert.doesNotThrow(() => new Scenario(composed));
});

test("faire appliquer la réquisition saisit le stock restant sur la même instance", () => {
  const game = createGame(); const village = game.getLocation("supply-village-north"); const improvement = village.getImprovement("expanded-granary");
  game.selectQuestChoice("ENFORCE_REQUISITION"); winVillage(game);
  assert.strictEqual(game.getLocationForScenarioSlot("supply-village-north"), village);
  assert.strictEqual(village.getImprovement("expanded-granary"), improvement);
  assert.equal(village.resources.stock.food, 0); assert.equal(game.getLocation("counsellor-guard-depot").resources.stock.food, 5);
  assert.equal(game.worldState.get("granaries.reservesSeized"), 5); assert.equal(game.worldState.getNpc("haut_pre_village_chief").status, "captured");
});

test("défendre Haut-Pré préserve les réserves et fait du chef un allié", () => {
  const game = createGame(); game.selectQuestChoice("NEGOTIATE_WITH_CHIEF"); game.selectQuestChoice("DEFEND_GRANARY_VILLAGE"); winVillage(game);
  assert.equal(game.getLocation("supply-village-north").resources.stock.food, 5);
  assert.equal(game.worldState.getNpc("haut_pre_village_chief").status, "ally"); assert.equal(game.worldState.get("granaries.officerDefeated"), true);
  assert.equal(game.worldState.get("granaries.chiefRelation"), 2);
});

test("laisser faire conserve le chef comme fugitif et l'enquête reste facultative", () => {
  const game = createGame(); game.selectQuestChoice("NEGOTIATE_WITH_CHIEF"); game.selectQuestChoice("LET_GUARD_ACT"); game.selectQuestChoice("LEAVE_FALLEN_VILLAGE");
  assert.equal(game.worldState.getNpc("haut_pre_village_chief").status, "fugitive");
  game.dispatchQuestEvent({ type: "LocationEntered", locationId: "capital-real" });
  assert.equal(game.worldState.get("granaries.questCompleted"), true); assert.equal(game.worldState.get("granaries.convoyInvestigated"), false);
});

test("suivre le convoi révèle seulement l'anomalie du dépôt et persiste après recharge", () => {
  const game = createGame(); game.selectQuestChoice("ENFORCE_REQUISITION"); winVillage(game);
  assert.doesNotMatch(game.scenario.getPhase("granaries-return-journey").description, /convoi|chariot|réserves/i);
  assert.equal(game.getQuestChoices().some(({ id }) => id === "FOLLOW_REQUISITION_CONVOY"), false);
  discoverConvoy(game);
  assert.match(game.eventLog.at(-1).text, /chariots chargés à Haut-Pré/i);
  assert.equal(game.getQuestChoices().some(({ id }) => id === "FOLLOW_REQUISITION_CONVOY"), true);
  game.selectQuestChoice("FOLLOW_REQUISITION_CONVOY");
  game.dispatchQuestEvent({ type: "LocationEntered", locationId: "counsellor-guard-depot" });
  assert.equal(game.worldState.get("granaries.convoyInvestigated"), true); assert.equal(game.worldState.get("granaries.secretDepotDiscovered"), true);
  assert.equal(game.eventLog.some(({ text = "" }) => /coup d.?état/i.test(text)), false);
  const snapshot = game.toJSON();
  const restored = new Game({ setup: snapshot.setup, scenario: snapshot.scenario, locations: snapshot.locations, scenarioLocationBindings: snapshot.scenarioLocationBindings, coordinateMode: "gps", scenarioStateSnapshot: snapshot.scenarioState, worldStateSnapshot: snapshot.worldState, trailStateSnapshots: snapshot.trailStates, scenarioRuntimeSnapshot: snapshot.scenarioRuntime });
  assert.equal(restored.worldState.get("granaries.secretDepotDiscovered"), true); assert.equal(restored.worldState.get("granaries.reservesSeized"), 5);
  assert.equal(restored.getLocation("supply-village-north").resources.stock.food, 0);
});
