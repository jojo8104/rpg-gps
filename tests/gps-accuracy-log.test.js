import test from "node:test";
import assert from "node:assert/strict";
import { GpsAccuracyLog } from "../app/js/core/gps-accuracy-log.js";

test("le journal GPS calcule un résumé et borne son historique", () => {
  const log = new GpsAccuracyLog({ maximumSamples: 2 });
  log.record({ accuracy: 12, updatedAt: "2026-08-17T10:00:00Z" });
  log.record({ accuracy: 8, updatedAt: "2026-08-17T10:00:01Z" });
  log.record({ accuracy: 10, updatedAt: "2026-08-17T10:00:02Z" });
  assert.deepEqual(log.getSummary(), { count: 2, latest: 10, average: 9, minimum: 8, maximum: 10 });
});
