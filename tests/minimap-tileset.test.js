import test from "node:test";
import assert from "node:assert/strict";
import { biomeCoverage } from "../app/js/map/minimap-tileset.js";

test("le champ des raccords conserve les centres et partage exactement les bords", () => {
  const grid = [
    ["grass", "water"],
    ["forest", "rock"],
  ];
  assert.equal(biomeCoverage(grid, "water", 1, 0), 1);
  assert.equal(biomeCoverage(grid, "water", 0.5, 0), 0.5);
  assert.equal(biomeCoverage(grid, "water", 0.5, 0.5), 0.25);
  assert.equal(biomeCoverage(grid, "grass", -1, -1), 1);
  for (const [x, y] of [
    [0.2, 0.7],
    [0.5, 0.5],
    [1.1, -0.2],
  ]) {
    assert.ok(
      Math.abs(
        ["grass", "water", "forest", "rock"].reduce(
          (sum, biome) => sum + biomeCoverage(grid, biome, x, y),
          0,
        ) - 1,
      ) < 1e-12,
    );
  }
});
