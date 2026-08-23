import assert from "node:assert/strict";
import test from "node:test";
import { armySpeed, pursuitRounds } from "../app/js/core/army-pursuit.js";

test("la vitesse d'armée est pondérée par le nombre de soldats vivants", () => {
  const speed = armySpeed([{ speed: 2, quantity: 8, state: "active" }, { speed: 6, quantity: 2, state: "active" }]);
  assert.equal(speed, 2.8);
});

test("le nombre de rounds de poursuite suit exactement les seuils validés", () => {
  assert.equal(pursuitRounds(2, 3), 0);
  assert.equal(pursuitRounds(3, 3), 0);
  assert.equal(pursuitRounds(4, 3), 1);
  assert.equal(pursuitRounds(5, 3), 1);
  assert.equal(pursuitRounds(5.01, 3), 2);
});
