import assert from "node:assert/strict";
import test from "node:test";
import { HeroConcealmentService } from "../app/js/core/hero-concealment-service.js";

test("la dissimulation exige une immobilité puis réduit la signature", () => {
  const service = new HeroConcealmentService({ stationaryDurationMs: 20_000, distanceFn: (a, b) => Math.abs(a.latitude - b.latitude) });
  service.update({ position: { latitude: 0, longitude: 0 }, accuracy: 2, at: 0 });
  service.update({ position: { latitude: 3, longitude: 0 }, accuracy: 3, at: 20_000 });
  assert.equal(service.canConceal(20_000), true);
  assert.equal(service.confirm(20_000), true);
  assert.equal(service.signatureMultiplier, .6);
});

test("un déplacement confirmé annule immédiatement la dissimulation", () => {
  const service = new HeroConcealmentService({ stationaryDurationMs: 0, movementThresholdMeters: 5, distanceFn: (a, b) => Math.abs(a.latitude - b.latitude) });
  service.update({ position: { latitude: 0, longitude: 0 }, accuracy: 1, at: 0 }); service.confirm(0);
  const result = service.update({ position: { latitude: 8, longitude: 0 }, accuracy: 1, at: 1_000 });
  assert.equal(result.concealmentCancelled, true); assert.equal(service.signatureMultiplier, 1);
});
