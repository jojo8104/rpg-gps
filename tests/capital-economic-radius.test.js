import test from "node:test";
import assert from "node:assert/strict";
import { CapitalAiService } from "../app/js/core/capital-ai-service.js";

const service = new CapitalAiService();
const gps = (surface, flags = {}) => ({
  coordinateMode: "gps",
  setup: { playArea: { getAreaSquareMeters: () => surface } },
  worldState: { get: (key, fallback) => flags[key] ?? fallback },
});

test("le rayon suit la surface sans minimum artificiel et reste plafonné", () => {
  const small = service.economicRadius(gps(10000));
  assert.ok(Math.abs(small - 28.2095) < 0.001);
  assert.ok(Math.abs(service.economicRadius(gps(40000)) - small * 2) < 0.001);
  assert.equal(service.economicRadius(gps(100000000)), 600);
  assert.equal(service.economicRadius(gps(0)), 0);
});

test("le scénario peut ajuster la proportion et le plafond", () => {
  assert.equal(
    service.economicRadius(
      gps(100000000, {
        "capitalAi.resourceRadiusRatio": 0.3,
        "capitalAi.resourceRadiusMaximumMeters": 400,
      }),
    ),
    400,
  );
  assert.throws(
    () =>
      service.economicRadius(
        gps(10000, {
          "capitalAi.resourceRadiusRatio": 2,
        }),
      ),
    /ratio/,
  );
});

test("la simulation utilise sa surface plane et soustrait les zones exclues", () => {
  const polygon = (size) => [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: size },
    { latitude: size, longitude: size },
    { latitude: size, longitude: 0 },
  ];
  const game = {
    ...gps(0),
    coordinateMode: "simulation",
    setup: {
      playArea: { polygon: polygon(100), excludedPolygons: [polygon(20)] },
    },
  };
  assert.equal(service.economicRadius(game), Math.sqrt(9600 / Math.PI) * 0.5);
  game.setup.playArea.polygon = polygon(20);
  assert.equal(service.economicRadius(game), 0);
});
