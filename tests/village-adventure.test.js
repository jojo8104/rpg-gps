import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createVillageAdventure } from "../app/js/core/village-adventure.js";
import { Scenario } from "../app/js/core/scenario.js";
import { Location } from "../app/js/core/location.js";
const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url)));
test("le duel remplace la campagne par des missions valides de village", () => {
 const base = read("scenarios/chaos.json");
 const locations = read("locations.json");
 const before = JSON.stringify({base, locations});
 const bindings = base.locationSlots.map((slot) => ({locationSlotId: slot.id, locationId: slot.id === "village" ? "village-vert" : slot.id}));
 const result = createVillageAdventure(base, locations, bindings);
 const scenario = new Scenario(result.scenario);
 assert.equal(scenario.events.length, 0);
 assert.equal(scenario.trails.length, 0);
 assert.ok(scenario.phases.length > 1);
 assert.equal(scenario.getPhase("reach-royal-camp"), null);
 for (const location of result.locations.filter((entry) => entry.chief)) {
  assert.ok(scenario.getPhase(location.chief.secondaryQuestIds[0]));
  assert.doesNotThrow(() => new Location(location));
 }
 assert.equal(JSON.stringify({base, locations}), before);
});
