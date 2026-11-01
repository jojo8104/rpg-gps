import test from "node:test";
import assert from "node:assert/strict";
import { locationCameraLayout } from "../app/js/map/location-camera-layout.js";
test("l'image reste centrée et ne saute pas lorsque le sommet inférieur change", () => {
  for (const pitch of [0, 35, 50]) {
    let previous;
    for (let yaw = 0; yaw <= 360; yaw += 0.1) {
      const layout = locationCameraLayout(
        { x: 400, y: 300 },
        { size: { x: 800, y: 600 }, yaw, pitch },
        1,
      );
      assert.equal(layout.point.x, 400);
      if (previous) assert.ok(Math.abs(layout.point.y - previous.y) < 0.1);
      assert.ok(layout.labelY > 64);
      previous = layout.point;
    }
  }
});
