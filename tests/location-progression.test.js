import assert from "node:assert/strict";
import test from "node:test";
import { Location } from "../app/js/core/location.js";
import { CAMP_LEVELS, LocationProgressionService } from "../app/js/core/location-progression-service.js";

const place = (overrides = {}) => new Location({ id: "place", name: "Lieu", type: "village", source: "scenario", position: { latitude: 0, longitude: 0 }, population: 100, resources: { stock: { materials: 20, gold: 10 }, storageCapacity: 100 }, ...overrides });

test("le mode expert fait perdre des niveaux avant de dégrader un lieu", () => {
  const service = new LocationProgressionService({ mode: "expert" });
  const location = place({ level: 2, infrastructure: { wall: 1 } });
  service.initialize(location);
  const firstMaximum = location.durability.maxHealth;
  const result = service.applyAttack(location, firstMaximum + 10);
  assert.equal(location.type, "village");
  assert.equal(location.level, 1);
  assert.equal(result.destroyed, false);
  assert.ok(location.durability.health > 0);
});

test("un village niveau 1 devient un camp niveau maximum au lieu de disparaître", () => {
  const service = new LocationProgressionService({ mode: "expert" });
  const location = place({ level: 1 });
  service.initialize(location);
  service.applyAttack(location, location.durability.maxHealth);
  assert.equal(location.type, "camp");
  assert.equal(location.level, 3);
  assert.equal(location.state, "active");
});

test("la reconstruction dépend des habitants et consomme matériaux et or", () => {
  const service = new LocationProgressionService({ mode: "expert" });
  const location = place(); service.initialize(location); location.durability.health -= 20;
  const result = service.reconstruct(location, 2);
  assert.ok(result.restored > 0);
  assert.equal(location.resources.stock.materials, 20 - result.restored / 5);
  assert.equal(location.resources.stock.gold, 10 - result.restored / 20);
});

test("en casual les lieux autres que les camps n'ont pas de points de vie", () => {
  const service = new LocationProgressionService({ mode: "casual" });
  assert.equal(service.applyAttack(place(), 100).applied, false);
  const camp = place({ type: "camp", level: 1 }); service.initialize(camp);
  assert.equal(service.applyAttack(camp, camp.durability.maxHealth).destroyed, true);
});

test("les trois niveaux du camp appliquent leur capacité et leurs slots", () => {
  const service = new LocationProgressionService({ mode: "expert" });
  const camp = place({ type: "camp", level: 1, population: 8, defenseSlots: 9 });
  service.initialize(camp);
  for (const level of [1, 2, 3]) {
    const profile = CAMP_LEVELS[level];
    assert.equal(camp.level, level);
    assert.equal(camp.populationCapacity, profile.populationCapacity);
    assert.equal(camp.defenseSlots, profile.defenseSlots);
    assert.equal(camp.resources.storageCapacity, Math.min(40, Math.max(4, Math.floor(camp.population / 2) + camp.resources.infrastructureStorage)));
    if (level < 3) {
      service.awardExperience(camp, service.getExperienceRequired(camp), "quest");
      assert.equal(service.levelUp(camp).success, true);
    }
  }
});

test("un camp niveau 3 attend une évolution explicite", () => {
  const service = new LocationProgressionService({ mode: "expert" });
  const camp = place({ type: "camp", level: 3 }); service.initialize(camp);
  service.awardExperience(camp, service.getExperienceRequired(camp), "quest");
  const experience = camp.progression.experience;
  assert.deepEqual(service.levelUp(camp), { success: false, reason: "maximum_level" });
  assert.equal(camp.type, "camp");
  assert.equal(camp.level, 3);
  assert.equal(camp.progression.experience, experience);
});
