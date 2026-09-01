import test from "node:test";
import assert from "node:assert/strict";
import { HeroTraceService } from "../app/js/core/hero-trace-service.js";

function hero(classId = "warrior") {
  return { id: "h1", playerId: "local", classId, army: { units: [{ quantity: 12 }] } };
}

test("un héros laisse des traces espacées orientées et pondérées", () => {
  let id = 0;
  const service = new HeroTraceService({ idGenerator: () => `t${++id}`, spacingMeters: 10 });
  const value = hero();
  assert.deepEqual(service.recordMovement({ hero: value, position: { latitude: 0, longitude: 0 }, at: 0 }), []);
  const traces = service.recordMovement({ hero: value, position: { latitude: 0.0003, longitude: 0 }, at: 3000, occupiedCargoSlots: 2 });
  assert.equal(traces.length, 3);
  assert.ok(traces.every((trace) => trace.groupId === "hero:h1"));
  assert.ok(traces.every((trace) => trace.soldierCount === 12 && trace.occupiedCargoSlots === 2));
  assert.ok(traces.every((trace) => trace.weightBonus === 2));
  assert.ok(traces.every((trace) => trace.directionDegrees === 0));
});

test("la classe modifie la lisibilité initiale des pas", () => {
  const score = (classId) => {
    const service = new HeroTraceService({ spacingMeters: 1 });
    const value = hero(classId);
    service.recordMovement({ hero: value, position: { latitude: 0, longitude: 0 }, at: 0 });
    return service.recordMovement({ hero: value, position: { latitude: 0.00002, longitude: 0 }, at: 1000 })[0].initialDetectionScore;
  };
  assert.ok(score("warrior") > score("mage"));
  assert.ok(score("mage") > score("ranger"));
});
