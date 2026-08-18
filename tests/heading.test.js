import test from "node:test";
import assert from "node:assert/strict";
import { headingFromOrientation, normalizeHeading, smoothHeading } from "../app/js/core/heading.js";

test("le cap de la boussole iPhone est prioritaire", () => {
  assert.equal(headingFromOrientation({ webkitCompassHeading: 275, alpha: 10, absolute: true }), 275);
});

test("une orientation absolue est convertie en cap nord", () => {
  assert.equal(headingFromOrientation({ alpha: 90, absolute: true }, 0), 270);
  assert.equal(normalizeHeading(-10), 350);
});

test("le lissage traverse correctement le nord", () => {
  assert.equal(smoothHeading(350, 10, .5), 0);
});
