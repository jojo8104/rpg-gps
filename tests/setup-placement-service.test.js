import assert from "node:assert/strict";
import test from "node:test";
import { PlayArea } from "../app/js/core/play-area.js";
import { SetupPlacementService } from "../app/js/core/setup-placement-service.js";

const area = new PlayArea({ id: "setup-area", name: "Zone", polygon: [{ latitude: -89, longitude: -179 }, { latitude: -89, longitude: 179 }, { latitude: 89, longitude: 179 }, { latitude: 89, longitude: -179 }] });
const distance = (first, second) => Math.hypot(first.latitude - second.latitude, first.longitude - second.longitude);

test("le placement automatique reste dans la zone et espace les éléments", () => {
  const service = new SetupPlacementService({ distanceFn: distance });
  const positions = service.generate({ playArea: area, count: 6, minimumDistance: 24 });
  assert.equal(positions.every((position) => area.contains(position)), true);
  positions.forEach((position, index) => positions.slice(index + 1).forEach((other) => assert.ok(distance(position, other) >= 24)));
});

test("le placement automatique tient compte des positions déjà occupées", () => {
  const service = new SetupPlacementService({ distanceFn: distance });
  const occupied = [{ latitude: 16.666, longitude: 16.666 }];
  const [position] = service.generate({ playArea: area, count: 1, occupied, minimumDistance: 24 });
  assert.ok(distance(position, occupied[0]) >= 24);
});

test("un objectif proposé hors zone est ramené à l'intérieur de la PlayArea", () => {
  const service = new SetupPlacementService({ distanceFn: distance });
  const position = service.resolveInside({ playArea: area, preferred: { latitude: 89.5, longitude: 179.5 }, origin: { latitude: 0, longitude: 0 } });
  assert.equal(area.contains(position), true);
});

test("une quête choisit directement un candidat valide selon distance et direction", () => {
  const service = new SetupPlacementService({ distanceFn: distance }); const origin = { latitude: 0, longitude: 0 };
  const position = service.findPosition({ playArea: area, origin, preferredDistance: 80, preferredDirectionDegrees: 90 });
  assert.equal(area.contains(position), true);
  assert.ok(position.longitude > 0);
  assert.ok(Math.abs(distance(origin, position) - 80) < 35);
});

test("les zones interdites sont exclues avant le choix d'un objectif", () => {
  const service = new SetupPlacementService({ distanceFn: distance });
  const forbidden = new PlayArea({ id: "forbidden", name: "Bâtiment fermé", polygon: [{ latitude: -20, longitude: 40 }, { latitude: -20, longitude: 179 }, { latitude: 20, longitude: 179 }, { latitude: 20, longitude: 40 }] });
  const position = service.findPosition({ playArea: area, origin: { latitude: 0, longitude: 0 }, preferredDistance: 80, preferredDirectionDegrees: 90, excludedAreas: [forbidden] });
  assert.equal(area.contains(position), true);
  assert.equal(forbidden.contains(position), false);
});
