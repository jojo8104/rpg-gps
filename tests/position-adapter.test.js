import test from "node:test";
import assert from "node:assert/strict";
import { normalizePosition } from "../app/js/position-adapter.js";

test("le mode maison convertit une position Leaflet en coordonnées de simulation", () => {
  assert.deepEqual(normalizePosition({ latitude: 42, longitude: 70 }, "simulation"), [42, 70]);
});

test("le mode GPS conserve un objet géographique", () => {
  assert.deepEqual(normalizePosition([48.8, 2.3], "gps"), { latitude: 48.8, longitude: 2.3 });
});

test("une position incomplète est refusée avant le calcul de distance", () => {
  assert.throws(() => normalizePosition({ latitude: 42 }, "simulation"), /coordonnées valides/);
});
