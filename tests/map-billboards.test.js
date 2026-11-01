import assert from "node:assert/strict";
import test from "node:test";
import { markerZoomScale, heroViewFrame } from "../app/js/map/MapBillboards.js";

test("les illustrations diminuent au dézoom en GPS et en simulation", () => {
  assert.ok(markerZoomScale(14) < markerZoomScale(16));
  assert.ok(markerZoomScale(16) < markerZoomScale(18));
  assert.ok(markerZoomScale(-1, true) < markerZoomScale(0, true));
  assert.ok(markerZoomScale(0, true) < markerZoomScale(1.5, true));
  assert.equal(markerZoomScale(18), 1);
});
test("les huit vues du héros sont relatives à la caméra, avec le dos en suivi", () => {
  for (let index = 0; index < 8; index++)
    assert.equal(heroViewFrame(index * 45, 0), index);
  for (const heading of [-450, -90, 0, 90, 360, 720])
    assert.equal(heroViewFrame(heading, heading), 0);
  assert.equal(heroViewFrame(0, 90), 6);
  assert.equal(heroViewFrame(180, 90), 2);
});
