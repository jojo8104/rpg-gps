import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { projectPlayerPayload } from "../server/realtime/player-projection.js";
import { socialGame } from "./fixtures/player-social-game.js";
import { ExplorationState } from "../app/js/core/exploration-state.js";
import { explorationSnapshot } from "./fixtures/exploration-state.js";

test("l’état privé d’exploration n’est transmis ni au joueur ni à l’organisateur", () => {
  const { game, positions } = fixture(0.001);
  game.explorationState = new ExplorationState(explorationSnapshot());
  const state = game.toJSON();
  for (const playerId of ["a", "b"]) {
    const packet = projectPlayerPayload(
      {
        game: { state },
        world: {
          state: {
            locations: state.locations,
            explorationState: state.explorationState,
          },
        },
        acknowledgement: {
          result: { explorationState: state.explorationState },
        },
      },
      {
        playerId,
        lobby: {
          hostPlayerId: "a",
          configuration: { gameType: "duel" },
          players: game.players,
        },
        gameSnapshot: { state },
        positions,
      },
    );
    const encoded = JSON.stringify(packet);
    for (const secret of [
      "explorationState",
      "private-seed-8d3",
      "hidden-treasure",
      "secret-relic",
      "treasure-series",
    ])
      assert.equal(encoded.includes(secret), false, `${playerId}: ${secret}`);
    assert.doesNotThrow(() => Game.fromJSON(packet.game.state));
  }
  assert.deepEqual(game.explorationState.toJSON(), state.explorationState);
});

function fixture(latitude) {
  const {
    game,
    heroes: [a, b],
  } = socialGame({ enemy: true, allowPvP: true });
  b.updatePosition({ latitude, longitude: 0 });
  b.resources.gold = 999;
  const positions = {
    positions: game.heroes.map((h) => ({
      playerId: h.playerId,
      name: h.name,
      heroClassId: h.classId,
      heroGender: h.gender,
      connected: true,
      position: h.position,
      heroState: {
        level: h.level,
        health: h.health,
        maxHealth: h.maxHealth,
        units: [],
      },
    })),
  };
  const lobby = {
    configuration: { gameType: "duel" },
    players: [{ id: "a" }, { id: "b" }],
  };
  const project = (payload) =>
    projectPlayerPayload(payload, {
      playerId: "a",
      lobby,
      gameSnapshot: { state: game.toJSON() },
      positions,
    });
  return { game, a, b, positions, project };
}

test("les frontières publiques ne dévoilent ni mesures ni progression territoriale adverse", () => {
  const { game, project } = fixture(0.01);
  game.territoryState = {
    signature: "private",
    presence: { b: { cellId: "secret" } },
    captures: { secret: { teamId: "red" } },
    grid: { cells: [] },
    view: {
      edges: [],
      occupation: { red: 0.2 },
      progress: { a: { seconds: 10 }, b: { seconds: 50 } },
    },
  };
  const territory = project({ state: game.toJSON() }).state.territoryState;
  assert.deepEqual(Object.keys(territory), ["view"]);
  assert.deepEqual(territory.view.progress, { a: { seconds: 10 } });
  assert.equal(JSON.stringify(territory).includes("secret"), false);
});

test("les récompenses et fragments d’équipement de l’adversaire restent privés", () => {
  const { game, a, b, project } = fixture(0.001);
  game.itemAcquisitionService.unlock({
    source: "mainQuest",
    key: "mine",
    heroId: a.id,
    itemId: "iron_sword",
  });
  game.itemAcquisitionService.unlock({
    source: "mainQuest",
    key: "secret",
    heroId: b.id,
    itemId: "archmage_staff",
  });
  game.itemAcquisitionService.recordVisit(b, { id: "secret-place" });
  const result = project({ state: game.toJSON() }).state.itemAcquisitionState;
  assert.equal(result.rewards.length, 1);
  assert.equal(result.rewards[0].heroId, a.id);
  assert.equal(result.visits[b.id], undefined);
});

test("ennemi hors vision absent des positions, de la partie et des réponses imbriquées", () => {
  const { game, b, positions, project } = fixture(0.001);
  game.watchBeacons = [
    {
      toJSON: () => ({
        id: "secret-beacon",
        ownerPlayerId: "b",
        position: b.position,
      }),
    },
  ];
  const packet = project({ positions, game: { state: game.toJSON() } });
  assert.deepEqual(
    packet.positions.positions.map((p) => p.playerId),
    ["a"],
  );
  assert.equal(
    packet.game.state.heroes.some((h) => h.playerId === "b"),
    false,
  );
  assert.equal(packet.game.state.watchBeacons.length, 0);
  // Un horodatage ou un identifiant opaque peut légitimement contenir 999.
  assert.equal(JSON.stringify(packet).includes('"gold":999'), false);
  assert.equal(Game.fromJSON(packet.game.state).getPlayer("a").id, "a");
});

test("ennemi visible : silhouette puis classe et niveau puis état de combat", () => {
  for (const [latitude, expected] of [
    [0.00025, 1],
    [0.0001, 2],
    [0.00001, 3],
  ]) {
    const { game, positions, project } = fixture(latitude);
    const target = project(positions).positions.find((p) => p.playerId === "b");
    assert.ok(target);
    if (expected === 1) {
      assert.equal(target.heroState, null);
      assert.equal(target.heroClassId, null);
      assert.equal(target.heroGender, null);
    }
    if (expected >= 2)
      assert.equal(
        target.heroGender,
        game.heroes.find((h) => h.playerId === "b").gender,
      );
    if (expected === 2)
      assert.deepEqual(Object.keys(target.heroState), ["level"]);
    if (expected === 3) assert.ok(target.heroState.health);
    const state = project({ state: game.toJSON() }).state;
    assert.equal(
      state.heroes.find((h) => h.playerId === "b").resources,
      undefined,
    );
    assert.doesNotThrow(() => Game.fromJSON(state));
  }
});

test("sessions privées et renseignements réservés au destinataire", () => {
  const { game, positions } = fixture(0.00001);
  game.playerSessions = [
    { id: "private", playerIds: ["b", "c"], inventoryFingerprint: "secret" },
    { id: "mine", playerIds: ["a", "b"], inventoryFingerprint: "secret" },
  ];
  game.getPlayer("b").discoverLocation("secret-location", 3);
  const packet = projectPlayerPayload(
    { state: game.toJSON() },
    {
      playerId: "a",
      lobby: {
        configuration: { gameType: "duel" },
        players: [{ id: "a" }, { id: "b" }],
      },
      gameSnapshot: { state: game.toJSON() },
      positions,
    },
  );
  assert.deepEqual(packet.state.playerSessions, [
    { id: "mine", playerIds: ["a", "b"] },
  ]);
  assert.equal(JSON.stringify(packet).includes("secret"), false);
});
