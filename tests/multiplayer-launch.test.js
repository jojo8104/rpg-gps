import assert from "node:assert/strict";
import test from "node:test";
import {
  createMultiplayerLaunch,
  createSeededIdGenerator,
} from "../app/js/core/multiplayer-launch.js";

function startedLobby(overrides = {}) {
  return {
    code: "ABCDE",
    status: "started",
    launch: {
      id: "multiplayer-ABCDE-1000",
      seed: "ABCDE-1000",
      configuration: {
        positionMode: "gps",
        scenarioId: "repression",
        difficulty: "hard",
      },
      playArea: {
        id: "lobby-area-ABCDE",
        name: "Zone GPS multijoueur",
        polygon: [
          { latitude: 48.85, longitude: 2.34 },
          { latitude: 48.85, longitude: 2.35 },
          { latitude: 48.86, longitude: 2.35 },
        ],
        excludedPolygons: [],
      },
      players: [
        { id: "p1", name: "Jo", heroClassId: "warrior" },
        { id: "p2", name: "Léa", heroClassId: "mage" },
      ],
      ...overrides,
    },
  };
}

test("un lobby démarré devient une configuration Game commune", () => {
  const launch = createMultiplayerLaunch(startedLobby());
  assert.equal(launch.setup.id, "multiplayer-ABCDE-1000");
  assert.equal(launch.setup.playerCount, 3);
  assert.deepEqual(
    launch.setup.participants.map((participant) => participant.playerId),
    ["p1", "p2", "bandits"],
  );
  assert.equal(launch.positionMode, "gps");
  assert.equal(launch.adventureId, "repression");
  assert.equal(launch.setup.rules.enableContentment, true);
  assert.equal(launch.setup.rules.travelPaceMode, "sport");
  assert.equal(launch.setup.playArea.polygon.length, 3);
  assert.deepEqual(launch.heroChoices[1], {
    playerId: "p2",
    choice: {
      name: "Léa",
      classId: "mage",
      appearanceId: "mage",
      firstAptitudeId: "offensive_magic",
    },
  });
});

test("la graine produit les mêmes identifiants sur tous les téléphones", () => {
  const first = createSeededIdGenerator("ABCDE-1000");
  const second = createSeededIdGenerator("ABCDE-1000");
  assert.deepEqual(
    [first("hero"), first("unit"), first("hero")],
    [second("hero"), second("unit"), second("hero")],
  );
});

test("un lobby non démarré est refusé", () => {
  const lobby = startedLobby();
  lobby.status = "waiting";
  assert.throws(() => createMultiplayerLaunch(lobby), /pas prête/i);
});
