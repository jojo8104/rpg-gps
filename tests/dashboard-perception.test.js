import test from "node:test";
import assert from "node:assert/strict";
import {
  recordDashboardExploration,
  dashboardPerception,
} from "../server/monitoring/dashboard-perception.js";
const area = {
  id: "test",
  name: "Test",
  polygon: [
    { latitude: 48, longitude: 2 },
    { latitude: 48, longitude: 2.01 },
    { latitude: 48.01, longitude: 2.01 },
    { latitude: 48.01, longitude: 2 },
  ],
};
function fixture() {
  return {
    configuration: { positionMode: "gps" },
    players: new Map([
      ["alice", {}],
      ["bob", {}],
    ]),
    playArea: area,
    game: {
      coordinateMode: "gps",
      heroes: [
        { playerId: "alice", position: { latitude: 48.002, longitude: 2.002 } },
        { playerId: "bob", position: { latitude: 48.008, longitude: 2.008 } },
      ],
      heroClassFeatureService: {
        visionRadius: () => 40,
        activeDivination: () => null,
      },
      getLocationWatchZones: () => [],
    },
  };
}
test("l’exploration est isolée par joueur, datée et restaurable", () => {
  const lobby = fixture(),
    position = lobby.game.heroes[0].position;
  recordDashboardExploration(lobby, "alice", position, 1000);
  const first = dashboardPerception(lobby);
  assert.ok(Object.keys(first.players.alice.exploredCellTimes).length > 0);
  assert.equal(Object.keys(first.players.bob.exploredCellTimes).length, 0);
  recordDashboardExploration(lobby, "alice", position, 2000);
  assert.deepEqual(
    dashboardPerception(lobby).players.alice.exploredCellTimes,
    first.players.alice.exploredCellTimes,
  );
  const restored = fixture();
  restored.dashboardExploration = JSON.parse(
    JSON.stringify(lobby.dashboardExploration),
  );
  assert.deepEqual(dashboardPerception(restored), dashboardPerception(lobby));
  recordDashboardExploration(lobby, "bob", lobby.game.heroes[1].position, 3000);
  const result = dashboardPerception(lobby);
  const aliceIds = new Set(Object.keys(result.players.alice.exploredCellTimes));
  assert.ok(
    Object.keys(result.players.bob.exploredCellTimes).every(
      (id) => !aliceIds.has(id),
    ),
  );
});
test("la consultation ne modifie pas l’état et les anciennes cellules ne passent pas à un nouveau terrain", () => {
  const lobby = fixture();
  recordDashboardExploration(
    lobby,
    "alice",
    lobby.game.heroes[0].position,
    1000,
  );
  const before = structuredClone(lobby.dashboardExploration);
  const result = dashboardPerception(lobby);
  result.players.alice.exploredCellTimes.fake = 5000;
  assert.deepEqual(lobby.dashboardExploration, before);
  lobby.playArea = {
    ...area,
    polygon: area.polygon.map((p) => ({ ...p, longitude: p.longitude + 0.02 })),
  };
  assert.deepEqual(
    dashboardPerception(lobby).players.alice.exploredCellTimes,
    {},
  );
});
