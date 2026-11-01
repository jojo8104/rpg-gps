import test from "node:test";
import assert from "node:assert/strict";
import { Hero } from "../app/js/core/hero.js";
import { HeroTravelExperienceService } from "../app/js/core/hero-travel-experience-service.js";

const createHero = () => new Hero({ id: "walker", playerId: "local", name: "Marcheur" });

test("la distance parcourue est cumulée et convertie par tranches en XP", () => {
  const hero = createHero(); const service = new HeroTravelExperienceService({ distanceFn: (a, b) => b.longitude - a.longitude });
  assert.equal(service.record(hero, { latitude: 0, longitude: 0 }).initialized, true);
  assert.equal(service.record(hero, { latitude: 0, longitude: 60 }).experienceGained, 0);
  const result = service.record(hero, { latitude: 0, longitude: 125 });
  assert.equal(result.experienceGained, 0); assert.equal(result.totalDistanceMeters, 125); assert.equal(result.remainderMeters, 25);
});

test("un kilomètre rapporte 200 XP par deux paliers de 500 m", () => {
  const hero = createHero(); const service = new HeroTravelExperienceService({ maximumSegmentMeters: 300, distanceFn: (a, b) => (b.longitude - a.longitude) * 1_000 });
  service.record(hero, { latitude: 0, longitude: 0 });
  const gains = [.25, .5, .75, 1].map((longitude) => service.record(hero, { latitude: 0, longitude }).experienceGained);
  assert.equal(gains.reduce((total, amount) => total + amount, 0), 200);
});

test("la récompense reste fixe quel que soit le niveau", () => {
  const hero = createHero(); hero.setLevel(10);
  const service = new HeroTravelExperienceService({ distanceFn: (a, b) => (b.longitude - a.longitude) * 1000 });
  service.record(hero, { latitude: 0, longitude: 0 });
  const gains = [.1, .2, .3, .4, .5].map(longitude => service.record(hero, { latitude: 0, longitude }).experienceGained);
  assert.deepEqual(gains, [0, 0, 0, 0, 100]);
  assert.equal(service.record(hero, { latitude: 0, longitude: .5 }).experienceGained, 0);
});

test("un point imprécis et un saut GPS n'accordent aucune distance", () => {
  const hero = createHero(); const service = new HeroTravelExperienceService({ maximumAccuracyMeters: 30, maximumSegmentMeters: 20, distanceFn: (a, b) => b.longitude - a.longitude });
  service.record(hero, { latitude: 0, longitude: 0 });
  assert.equal(service.record(hero, { latitude: 0, longitude: 10 }, { accuracy: 40 }).reason, "insufficient_accuracy");
  assert.equal(service.record(hero, { latitude: 0, longitude: 30 }).reason, "gps_jump"); assert.equal(hero.travelProgress.totalDistanceMeters, 0);
});

test("la progression de marche est sérialisable", () => {
  const hero = createHero(); hero.travelProgress = { totalDistanceMeters: 150, remainderMeters: 50, lastPosition: { latitude: 48, longitude: 2 } };
  assert.deepEqual(new Hero(hero.toJSON()).travelProgress, hero.travelProgress);
});

test("une reprise conserve la distance et ne récompense pas de nouveau les anciens paliers", () => {
  const hero = createHero();
  hero.travelProgress = { totalDistanceMeters: 750, remainderMeters: 50, lastPosition: { latitude: 0, longitude: 0 } };
  const restored = new Hero(hero.toJSON());
  const service = new HeroTravelExperienceService({ distanceFn: (a, b) => (b.longitude - a.longitude) * 1000 });
  assert.equal(service.record(restored, { latitude: 0, longitude: 0 }).experienceGained, 0);
  assert.equal(service.record(restored, { latitude: 0, longitude: .2 }).experienceGained, 0);
  assert.equal(service.record(restored, { latitude: 0, longitude: .25 }).experienceGained, 100);
});
