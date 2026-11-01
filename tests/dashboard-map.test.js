import test from "node:test";
import assert from "node:assert/strict";
import {
  mapFramePoints,
  isOutsidePlayArea,
} from "../dashboard/map-geometry.js";

const polygon = [
  { latitude: 48, longitude: 2 },
  { latitude: 48, longitude: 2.01 },
  { latitude: 48.01, longitude: 2.01 },
  { latitude: 48.01, longitude: 2 },
];
const party = {
  configuration: { positionMode: "gps" },
  playArea: { polygon },
  locations: [{ position: { latitude: 49, longitude: 3 } }],
  players: [{ position: { latitude: 50, longitude: 4 } }],
};
test("le cadrage GPS reste sur la PlayArea malgré des villages et joueurs éloignés", () => {
  assert.deepEqual(
    mapFramePoints(party),
    polygon.map((p) => [p.latitude, p.longitude]),
  );
  assert.equal(isOutsidePlayArea(party, party.locations[0].position), true);
  assert.equal(
    isOutsidePlayArea(party, { latitude: 48.005, longitude: 2.005 }),
    false,
  );
  assert.equal(isOutsidePlayArea(party, polygon[0]), false);
  assert.equal(
    isOutsidePlayArea(party, { latitude: 48, longitude: 2.005 }),
    false,
  );
});
test("le cadrage fictif et le secours sans PlayArea englobent les entités", () => {
  const simulation = { ...party, coordinateMode: "simulation" };
  assert.deepEqual(mapFramePoints(simulation), [
    [49, 3],
    [50, 4],
  ]);
  assert.equal(
    isOutsidePlayArea(simulation, party.locations[0].position),
    false,
  );
  assert.deepEqual(mapFramePoints({ ...party, playArea: null }), [
    [49, 3],
    [50, 4],
  ]);
  assert.equal(
    isOutsidePlayArea(
      { ...party, playArea: null },
      party.locations[0].position,
    ),
    false,
  );
});
