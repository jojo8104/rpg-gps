import test from "node:test";
import assert from "node:assert/strict";
import {
  caravanHeading,
  caravanPoseStyle,
} from "../app/js/map/caravan-sprite.js";

test("la caravane a huit vues dont les trois vues miroir, avec un ancrage fixe", () => {
  for (let direction = 0; direction < 8; direction++)
    for (let step = 0; step < 3; step++) {
      const pose = caravanPoseStyle(direction, step);
      assert.ok(
        Math.abs(
          parseFloat(pose.left) + parseFloat(pose.transformOrigin) - 40,
        ) < 1e-8,
      );
      assert.ok(
        Math.abs(parseFloat(pose.top) + parseFloat(pose.height) - 76) < 1e-8,
      );
      if (direction > 4) {
        assert.equal(pose.transform, "scaleX(-1)");
        assert.equal(
          pose.backgroundPosition,
          caravanPoseStyle(8 - direction, step).backgroundPosition,
        );
      }
    }
});
test("le cap visuel suit la destination officielle sans modifier le groupe", () => {
  const group = {
    position: [0, 0],
    movement: { destination: { latitude: 1, longitude: 0 } },
  };
  const before = JSON.stringify(group);
  assert.equal(caravanHeading(group), 0);
  assert.equal(JSON.stringify(group), before);
  assert.equal(caravanHeading({ position: [0, 0] }), 180);
});
