import assert from "node:assert/strict";
import test from "node:test";
import { Location } from "../app/js/core/location.js";
import { readFileSync } from "node:fs";
import { Scenario } from "../app/js/core/scenario.js";
import { composeScenario } from "../app/js/core/scenario-composer.js";

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

test("La Répression se compose dans Chaos et expose une quête lançable par le sélecteur dev", () => {
  const definition = composeScenario(load("../data/scenarios/chaos.json"), load("../data/scenarios/repression.json"));
  const scenario = new Scenario(definition);
  assert.equal(scenario.id, "chaos"); assert.ok(scenario.getPhase("locate-village")); assert.ok(scenario.getPhase("village-arrival")); assert.ok(scenario.getPhase("arrival")); assert.ok(scenario.getPhase("treasure-choice"));
  assert.equal(scenario.getPhase("locate-village").objectives[0].trigger.type, "locationPlaced");
  assert.equal(scenario.getPhase("village-arrival").objectives[0].trigger.type, "enterLocation");
  assert.ok(scenario.trails.some(({ id }) => id === "convoy-raiders-trail"));
  for (const slotId of ["seditious-village", "attacked-convoy", "brigand-camp-convoy"]) assert.ok(scenario.locationSlots.some(({ id }) => id === slotId));
  const locations = load("../data/repression-locations.json"); assert.deepEqual(locations.map(({ id }) => id), ["seditious-village", "attacked-convoy", "brigand-camp-convoy"]);
});

test("les garnisons de La Répression respectent la capacité de leur grade", () => {
  const locations = load("../data/repression-locations.json");
  assert.doesNotThrow(() => locations.map((definition) => new Location(definition)));
});
