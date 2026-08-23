import assert from "node:assert/strict";
import test from "node:test";
import { AutonomousGroupTrace } from "../app/js/core/autonomous-group-trace.js";

const trace = () => new AutonomousGroupTrace({ id: "t", groupId: "g", groupType: "army", owner: { kind: "faction", id: "chaos" }, position: { latitude: 0, longitude: 0 }, soldierCount: 50, occupiedCargoSlots: 2, directionDegrees: 90, createdAt: 0, decayPerMinute: 1 });

test("le score initial dépend uniquement des soldats et des slots puis décroît constamment", () => {
  const value = trace(); assert.equal(value.initialDetectionScore, 8); assert.equal(value.getScore(3 * 60_000), 5); assert.equal(value.getScore(8 * 60_000), 0);
});

test("un éclaireur détecte une trace faible et en extrait davantage d'informations", () => {
  const value = trace(); const at = 5 * 60_000;
  assert.equal(value.read({ at, minimumScore: 5 }), null);
  const reading = value.read({ at, minimumScore: 1, analysisBonus: 8 });
  assert.equal(reading.level, 4); assert.equal(reading.soldierCount, 50); assert.equal(reading.directionDegrees, 90);
});

test("une trace sort de la perception avec la distance sans être supprimée du moteur", () => {
  const value = trace(); const at = value.createdAt;
  assert.equal(value.isDetectable({ at, minimumScore: 1, distance: 100, distancePerPoint: 50 }), true);
  assert.equal(value.isDetectable({ at, minimumScore: 1, distance: 400, distancePerPoint: 50 }), false);
  assert.ok(value.getScore(at) > 0);
  assert.equal(value.isDetectable({ at, minimumScore: 1, distance: 400, distancePerPoint: 50, detectionBonus: 6 }), true);
});
