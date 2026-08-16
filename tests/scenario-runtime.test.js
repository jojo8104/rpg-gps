import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const setup = {
  id: "setup-1", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 1,
  playArea: { id: "area-1", name: "Parc", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] },
  participants: [{ playerId: "player-1", name: "Ariane" }],
};
const scenario = {
  id: "chaos", name: "Chaos", intro: "Fuyez.", initialPhaseId: "escape",
  locationSlots: [{ id: "refuge", type: "fort" }],
  phases: [{ id: "escape", title: "Fuite", description: "Atteignez le fort.", objectives: [], eventIds: ["refuge-reached"], transitions: [] }],
  events: [{ id: "refuge-reached", effects: [{ type: "showNarration", text: "Le refuge est atteint." }, { type: "revealLocation", locationSlotId: "refuge" }, { type: "setLocationState", locationSlotId: "refuge", state: "secured" }] }],
};
const locations = [{ id: "fort-1", name: "Fort", type: "fort", source: "scenario", position: { latitude: 0, longitude: 0 }, visibility: "hidden" }];

test("un événement de scénario agit sur le lieu réellement associé", () => {
  const game = new Game({ setup, scenario, locations, scenarioLocationBindings: [{ locationSlotId: "refuge", locationId: "fort-1" }] });
  const result = game.triggerScenarioEvent("refuge-reached");
  assert.equal(result.appliedEffects.length, 3);
  assert.equal(game.getLocation("fort-1").visibility, "discovered");
  assert.equal(game.getLocation("fort-1").state, "secured");
  assert.deepEqual(game.eventLog[0], { type: "narration", text: "Le refuge est atteint.", eventId: "refuge-reached" });
});
