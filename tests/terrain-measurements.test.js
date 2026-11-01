import assert from "node:assert/strict";
import test from "node:test";
import {
  measureTerrainOutline,
  formatTerrainOutline,
} from "../app/js/ui/terrain-measurements.js";

test("le statut attend une zone fermée et mesure les quatre côtés du contour", () => {
  assert.equal(measureTerrainOutline([]), null);
  assert.equal(formatTerrainOutline([{ latitude: 0, longitude: 0 }]), "");
  const points = [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 0.001 },
    { latitude: 0.001, longitude: 0.001 },
    { latitude: 0.001, longitude: 0 },
  ];
  const value = measureTerrainOutline(points);
  assert.ok(Math.abs(value.width - 111.195) < 0.01);
  assert.ok(Math.abs(value.height - 111.195) < 0.01);
  assert.ok(Math.abs(value.perimeter - 444.78) < 0.02);
  assert.match(formatTerrainOutline(points), /111 × 111 m/);
});

test("les dimensions englobantes ne sont pas les côtés du polygone", () => {
  const value = measureTerrainOutline([
    { latitude: 45, longitude: 2 },
    { latitude: 45, longitude: 2.002 },
    { latitude: 45.001, longitude: 2.001 },
  ]);
  assert.ok(value.width > 157 && value.width < 158);
  assert.ok(value.height > 111 && value.height < 112);
  assert.ok(value.perimeter > 420 && value.perimeter < 431);
});
