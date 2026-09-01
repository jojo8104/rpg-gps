import assert from "node:assert/strict";
import test from "node:test";
import { PlayArea } from "../app/js/core/play-area.js";

test("une aire de jeu détermine si un point est dans son polygone", () => {
  const area = new PlayArea({
    id: "area-1",
    name: "Parc",
    polygon: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 10 },
      { latitude: 10, longitude: 10 },
      { latitude: 10, longitude: 0 },
    ],
  });
  assert.equal(area.contains({ latitude: 5, longitude: 5 }), true);
  assert.equal(area.contains({ latitude: 15, longitude: 5 }), false);
  assert.ok(area.getAreaSquareMeters() > 10_000_000_000);
  assert.ok(area.getAreaSquareKilometers() > 10_000);
});

test("une exclusion interdit les placements sans faire sortir le joueur", () => {
  const area = new PlayArea({
    id: "with-exclusion",
    name: "Parc",
    polygon: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
      { latitude: 1, longitude: 1 },
      { latitude: 1, longitude: 0 },
    ],
    excludedPolygons: [
      [
        { latitude: 0.4, longitude: 0.4 },
        { latitude: 0.4, longitude: 0.6 },
        { latitude: 0.6, longitude: 0.6 },
        { latitude: 0.6, longitude: 0.4 },
      ],
    ],
  });
  assert.equal(area.contains({ latitude: 0.5, longitude: 0.5 }), true);
  assert.equal(area.allowsPlacement({ latitude: 0.5, longitude: 0.5 }), false);
  assert.equal(area.allowsPlacement({ latitude: 0.2, longitude: 0.2 }), true);
  assert.equal(area.toJSON().excludedPolygons.length, 1);
});
