import test from "node:test";
import assert from "node:assert/strict";
import {
  autonomousGroupSpriteKind,
  autonomousGroupPoseStyle,
} from "../app/js/map/autonomous-group-sprite.js";

test("les sprites distinguent éclaireurs, bandits et déserteurs", () => {
  assert.equal(autonomousGroupSpriteKind({ type: "scout" }), "scout");
  assert.equal(autonomousGroupSpriteKind({ type: "convoy" }), "caravan");
  assert.equal(
    autonomousGroupSpriteKind({ type: "army", factionId: "bandits" }),
    "brigands",
  );
  assert.equal(
    autonomousGroupSpriteKind({ type: "rogue", owner: { id: "bandits" } }),
    "brigands",
  );
  assert.equal(
    autonomousGroupSpriteKind({ type: "rogue", factionId: "chaos" }),
    null,
  );
  assert.equal(autonomousGroupSpriteKind({ type: "messenger" }), null);
});

for (const kind of ["scout", "brigands"])
  test(`${kind} : huit orientations et trois poses avec pieds et axe fixes`, () => {
    for (let direction = 0; direction < 8; direction++)
      for (let step = 0; step < 3; step++) {
        const pose = autonomousGroupPoseStyle(kind, direction, step);
        assert.ok(
          Math.abs(
            parseFloat(pose.left) + parseFloat(pose.transformOrigin) - 40,
          ) < 1e-8,
        );
        assert.ok(
          Math.abs(parseFloat(pose.top) + parseFloat(pose.height) - 76) < 1e-8,
        );
        assert.ok(pose.backgroundImage.includes(`${kind}-jrpg-walk-v1.png`));
        if (direction > 4) {
          assert.equal(pose.transform, "scaleX(-1)");
          assert.equal(
            pose.backgroundPosition,
            autonomousGroupPoseStyle(kind, 8 - direction, step)
              .backgroundPosition,
          );
        }
      }
  });
