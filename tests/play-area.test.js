import assert from "node:assert/strict";
import test from "node:test";
import { PlayArea } from "../app/js/core/play-area.js";

test("une aire de jeu détermine si un point est dans son polygone", () => {
  const area = new PlayArea({ id: "area-1", name: "Parc", polygon: [
    { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 10 }, { latitude: 10, longitude: 10 }, { latitude: 10, longitude: 0 },
  ] });
  assert.equal(area.contains({ latitude: 5, longitude: 5 }), true);
  assert.equal(area.contains({ latitude: 15, longitude: 5 }), false);
  assert.ok(area.getAreaSquareMeters() > 10_000_000_000);
  assert.ok(area.getAreaSquareKilometers() > 10_000);
});
