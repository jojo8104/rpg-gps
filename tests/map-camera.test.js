import assert from "node:assert/strict";
import test from "node:test";
import { MapCamera } from "../app/js/map/MapCamera.js";

test("le suivi de dos conserve le cap et incline la carte", () => {
  const camera = Object.create(MapCamera.prototype);
  Object.assign(camera, {
    enabled: true,
    heading: 90,
    yaw: 0,
    pitch: 0,
    apply() {},
    set(values) {
      Object.assign(this, values);
    },
  });
  assert.equal(camera.setFollowHeading(true), true);
  assert.equal(camera.yaw, 90);
  assert.equal(camera.pitch, 35);
  camera.setHeading(230);
  assert.equal(camera.yaw, 230);
  camera.setFollowHeading(false);
  camera.setHeading(300);
  assert.equal(camera.yaw, 230);
});

test("un geste tactile annulé n'envoie aucune intention de déplacement du héros", () => {
  const camera = Object.create(MapCamera.prototype);
  let moves = 0;
  Object.assign(camera, {
    points: new Map([[1, { x: 12, y: 34 }]]),
    moved: true,
    dragHero: true,
    container: { hasPointerCapture: () => false },
    onHeroMove: () => moves++,
  });
  camera.pointerUp({ pointerId: 1, type: "pointercancel" });
  assert.equal(moves, 0);
  assert.equal(camera.points.size, 0);
});
