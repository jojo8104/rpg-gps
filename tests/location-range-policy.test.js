import test from "node:test";
import assert from "node:assert/strict";
import { LocationRangePolicy } from "../app/js/core/location-range-policy.js";

const location = { type: "village", interactionRadius: 20, detectionRadius: 100 };

test("une petite aire réduit automatiquement les portées", () => {
  const policy = new LocationRangePolicy();
  const ranges = policy.resolve(location, { getAreaSquareKilometers: () => .2 });
  assert.equal(ranges.interactionRadius, 13);
  assert.equal(ranges.detectionRadius, 65);
});

test("le mode fixe ignore la superficie et accepte une exception par type", () => {
  const policy = new LocationRangePolicy({ mode: "fixed", typeOverrides: { village: { interactionRadius: 14, detectionRadius: 80 } } });
  assert.deepEqual(policy.resolve(location, { getAreaSquareKilometers: () => .2 }), { interactionRadius: 14, detectionRadius: 80 });
});
