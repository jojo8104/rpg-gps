import assert from "node:assert/strict";
import test from "node:test";
import {
  HERO_ATLAS,
  HERO_PIXEL_SCALE,
  HERO_FEET_LINE,
  heroPoseStyle,
} from "../app/js/map/hero-sprite-atlas.js";

test("les 24 poses partagent le même axe vertical et la même ligne de pieds", () => {
  assert.equal(HERO_ATLAS.length, 8);
  for (let direction = 0; direction < 8; direction++) {
    assert.equal(HERO_ATLAS[direction].length, 3);
    for (let step = 0; step < 3; step++) {
      const row = direction > 4 ? 8 - direction : direction;
      const pose = HERO_ATLAS[row][step];
      const style = heroPoseStyle(direction, step);
      const headAxis =
        parseFloat(style.left) + (pose.axis - pose.x) * HERO_PIXEL_SCALE;
      const feet = parseFloat(style.top) + parseFloat(style.height);
      assert.equal(headAxis, 40);
      assert.equal(feet, HERO_FEET_LINE);
      assert.ok(pose.x >= 0 && pose.x + pose.width <= 768);
      assert.ok(pose.y >= 0 && pose.y + pose.height <= 2046);
    }
  }
});

test("les trois directions ouest sont les miroirs des vues est correspondantes", () => {
  for (const classId of ["warrior", "mage", "ranger"]) {
    for (const direction of [5, 6, 7]) {
      for (let step = 0; step < 3; step++) {
        const west = heroPoseStyle(direction, step, classId);
        const east = heroPoseStyle(8 - direction, step, classId);
        assert.equal(west.backgroundPosition, east.backgroundPosition);
        assert.equal(west.left, east.left);
        assert.equal(west.top, east.top);
        assert.equal(west.transform, "scaleX(-1)");
        assert.equal(east.transform, "none");
        const axis = parseFloat(west.left) + parseFloat(west.transformOrigin);
        assert.ok(Math.abs(axis - 40) < 1e-8);
        assert.equal(
          parseFloat(west.top) + parseFloat(west.height),
          HERO_FEET_LINE,
        );
      }
    }
    const sources = Array.from(
      { length: 5 },
      (_, direction) => heroPoseStyle(direction, 0, classId).backgroundPosition,
    );
    assert.equal(new Set(sources).size, 5);
  }
  assert.match(heroPoseStyle(0, 0, "mage").backgroundImage, /mage-jrpg/);
  assert.match(heroPoseStyle(0, 0, "ranger").backgroundImage, /ranger-jrpg/);
  assert.match(heroPoseStyle(0, 0, "unknown").backgroundImage, /hero-jrpg/);
});
