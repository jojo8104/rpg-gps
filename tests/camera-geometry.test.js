import assert from "node:assert/strict";
import test from "node:test";
import {
  projectCameraPoint,
  unprojectCameraPoint,
  overviewZoom,
  navigationBounds,
} from "../app/js/map/camera-geometry.js";

test("les frontières peuvent atteindre le centre même sur une zone étroite inclinée", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 800, y: 0 },
    { x: 800, y: 10 },
    { x: 0, y: 10 },
  ];
  for (const size of [
    { x: 390, y: 700 },
    { x: 1200, y: 700 },
  ])
    for (const yaw of [0, 45, 90, 230])
      for (const pitch of [0, 35, 50]) {
        const frame = { size, yaw, pitch };
        const { zoom } = overviewZoom(points, frame);
        const [min, max] = navigationBounds(points, frame, zoom);
        for (const point of points) {
          assert.ok(point.x - size.x / 2 / 2 ** zoom > min.x);
          assert.ok(point.x + size.x / 2 / 2 ** zoom < max.x);
          assert.ok(point.y - size.y / 2 / 2 ** zoom > min.y);
          assert.ok(point.y + size.y / 2 / 2 ** zoom < max.y);
        }
      }
});

test("les interactions retrouvent les coordonnées sous rotation et perspective", () => {
  for (const size of [
    { x: 390, y: 700 },
    { x: 1200, y: 700 },
  ])
    for (const yaw of [0, 45, 90, 230, 359])
      for (const pitch of [0, 35, 50])
        for (const point of [
          { x: 0, y: 0 },
          { x: size.x, y: size.y },
          { x: 123, y: 234 },
        ]) {
          const frame = { size, yaw, pitch };
          const restored = unprojectCameraPoint(
            projectCameraPoint(point, frame),
            frame,
          );
          assert.ok(Math.abs(restored.x - point.x) < 1e-8);
          assert.ok(Math.abs(restored.y - point.y) < 1e-8);
        }
});

test("le zoom de vue d'ensemble garde toute la zone à l'écran sur mobile et PC", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 800, y: 0 },
    { x: 800, y: 300 },
    { x: 0, y: 300 },
  ];
  for (const size of [
    { x: 390, y: 700 },
    { x: 1200, y: 700 },
  ])
    for (const yaw of [0, 45, 90, 230])
      for (const pitch of [0, 35, 50]) {
        const frame = { size, yaw, pitch };
        const overview = overviewZoom(points, frame);
        for (const point of points) {
          const projected = projectCameraPoint(
            {
              x:
                size.x / 2 + (point.x - overview.center.x) * 2 ** overview.zoom,
              y:
                size.y / 2 + (point.y - overview.center.y) * 2 ** overview.zoom,
            },
            frame,
          );
          assert.ok(projected.x >= 24 && projected.x <= size.x - 24);
          assert.ok(projected.y >= 24 && projected.y <= size.y - 24);
        }
      }
});
