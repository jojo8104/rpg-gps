import test from "node:test";
import assert from "node:assert/strict";
import { drawGeographyLines } from "../app/js/map/geography-lines.js";
test("tous les contours routiers sont dessinés avant les centres pour éviter les coupures", () => {
  const colors = [];
  const ctx = {
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      colors.push(this.strokeStyle);
    },
  };
  const features = [0, 1].map((i) => ({
    kind: "road",
    geometry: {
      coordinates: [
        [i, 0],
        [i + 1, 0],
      ],
    },
  }));
  drawGeographyLines(ctx, features, ([x, y]) => ({ x, y }), 1);
  assert.deepEqual(colors, ["#76684e", "#76684e", "#c5b285", "#c5b285"]);
});
