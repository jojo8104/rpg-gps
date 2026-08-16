import assert from "node:assert/strict";
import test from "node:test";
import { TerrainZone } from "../app/js/core/terrain-zone.js";

test("TerrainZone reste un modèle de données indépendant, sans couplage à Battle", () => {
  const zone = new TerrainZone({ id: "forest", type: "FOREST", certainty: "CONFIRMED", cells: [{ x: 0, y: 0 }], modifiers: { defense: 1.2 } });
  assert.equal(zone.contains({ x: 0, y: 0 }), true); assert.equal(zone.modifiers.defense, 1.2);
});
