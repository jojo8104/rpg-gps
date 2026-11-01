import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Location } from "../app/js/core/location.js";
import { LocationProgressionService } from "../app/js/core/location-progression-service.js";
import { CampImprovementService, CAMP_IMPROVEMENTS } from "../app/js/core/camp-improvement-service.js";

test("la capitale possède toutes les améliorations d'habitation et conserve leur état", () => {
  const locations = JSON.parse(readFileSync(new URL("../data/locations.json", import.meta.url), "utf8"));
  const capital = new Location(locations.find(({ type }) => type === "capital"));
  const service = new CampImprovementService({ progressionService: new LocationProgressionService({ mode: "expert" }) });
  const replaced = ["housing", "habitation", "barricades", "palisades", "walls"];
  for (const [id, definition] of Object.entries(CAMP_IMPROVEMENTS)) {
    assert.equal(capital.infrastructure[id], replaced.includes(id) ? undefined : definition.levels.length, id);
  }
  service.applyEffects(capital);
  const state = service.getState(capital);
  assert.equal(state.slots.used, state.slots.maximum);
  assert.equal(state.reservedSlots.used, state.reservedSlots.maximum);
  for (const feature of ["trade", "healing", "watch", "prospecting", "messaging"])
    assert.equal(capital.features[feature], true, feature);
  assert.equal(capital.defenseBonus, 7);
  assert.equal(capital.locationAttackBonus, 7);
  assert.ok(capital.resources.production.food >= 7);
  assert.ok(capital.recruitment.availableUnitTypeIds.includes("swordsman"));
  const restored = new Location(capital.toJSON());
  service.applyEffects(restored);
  assert.deepEqual(restored.toJSON(), capital.toJSON());
  delete restored.infrastructure.forge;
  service.applyEffects(restored);
  assert.equal(restored.infrastructure.forge, undefined);
  assert.equal(service.getState(restored).slots.used, state.slots.used - 1);
});
