import assert from "node:assert/strict";
import test from "node:test";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { Game } from "../app/js/core/game.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";

function service() {
  let id = 0;
  let random = 0;
  return new LobbyService({
    idFactory: () => `player-${++id}`,
    randomBytesFn: (size) => Buffer.alloc(size, random++),
    now: () => 1_000,
  });
}

test("un organisateur crée un lobby avec un code et un jeton privé", () => {
  const lobbies = service();
  const result = lobbies.createLobby({
    playerName: "Jo",
    connectionId: "socket-1",
  });
  assert.match(result.lobby.code, /^[A-Z2-9]{5}$/);
  assert.equal(result.lobby.players[0].isHost, true);
  assert.equal(result.lobby.players[0].connected, true);
  assert.ok(result.session.token.length >= 40);
  assert.equal(
    JSON.stringify(result.lobby).includes(result.session.token),
    false,
  );
});

test("un second joueur rejoint, se prépare et l’organisateur démarre", () => {
  const lobbies = service();
  const host = lobbies.createLobby({ playerName: "Jo", connectionId: "one" });
  const guest = lobbies.joinLobby({
    code: host.lobby.code.toLowerCase(),
    playerName: "Léa",
    connectionId: "two",
  });
  lobbies.selectHeroClass({
    token: host.session.token,
    heroClassId: "warrior",
  });
  lobbies.selectHeroClass({
    token: guest.session.token,
    heroClassId: "mage",
  });
  lobbies.setReady({ token: host.session.token, ready: true });
  const ready = lobbies.setReady({ token: guest.session.token, ready: true });
  assert.equal(ready.players.length, 2);
  assert.equal(
    ready.players.every((player) => player.ready),
    true,
  );
  const started = lobbies.startLobby({ token: host.session.token });
  assert.equal(started.status, "started");
  assert.equal(started.launch.id, `multiplayer-${started.code}-1000`);
  assert.equal(started.launch.configuration.difficulty, "normal");
  assert.deepEqual(
    started.players.map((player) => player.heroClassId),
    ["warrior", "mage"],
  );
});

test("le serveur conserve Game, autorise le héros du joueur et continue sans l’organisateur", () => {
  let currentTime = 1_000;
  let id = 0;
  let random = 0;
  const lobbies = new LobbyService({
    idFactory: () => `player-${++id}`,
    randomBytesFn: (size) => Buffer.alloc(size, random++),
    now: () => currentTime,
  });
  const host = lobbies.createLobby({ playerName: "Jo", connectionId: "host" });
  const guest = lobbies.joinLobby({
    code: host.lobby.code,
    playerName: "Léa",
    connectionId: "guest",
  });
  lobbies.selectHeroClass({ token: host.session.token, heroClassId: "warrior" });
  lobbies.selectHeroClass({ token: guest.session.token, heroClassId: "warrior" });
  lobbies.setReady({ token: host.session.token, ready: true });
  lobbies.setReady({ token: guest.session.token, ready: true });
  const lobby = lobbies.startLobby({ token: host.session.token });
  const launch = createMultiplayerLaunch(lobby);
  const game = new Game({
    setup: launch.setup,
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    locations: [],
    now: () => currentTime,
    idGenerator: (prefix) => `${prefix}-${++id}`,
  });
  const hostHero = game.chooseHero(host.session.playerId, {
    name: "Jo",
    classId: "warrior",
  });
  const guestHero = game.chooseHero(guest.session.playerId, {
    name: "Léa",
    classId: "warrior",
  });
  const enemyHero = game.chooseHero("bandits", {
    name: "Rask",
    classId: "warrior",
  });
  game.start();
  const battle = game.createBattle({
    teamParticipants: [
      { id: "heroes", heroIds: [hostHero.id, guestHero.id] },
      { id: "bandits", heroIds: [enemyHero.id] },
    ],
  });
  battle.start();
  const bootstrapped = lobbies.bootstrapGame({
    token: host.session.token,
    snapshot: game.toJSON(),
  });
  assert.equal(bootstrapped.state.status, "started");
  assert.throws(
    () =>
      lobbies.updateHeroState({
        token: guest.session.token,
        heroState: {},
      }),
    (error) => error.code === "server_authoritative",
  );
  assert.throws(
    () =>
      lobbies.updateWorldState({
        token: guest.session.token,
        baseRevision: 0,
        worldState: { locations: [] },
      }),
    (error) => error.code === "server_authoritative",
  );
  lobbies.updatePlayerPosition({
    token: guest.session.token,
    position: { latitude: 48.85, longitude: 2.35, accuracy: 5 },
  });
  const moved = { game: lobbies.gameSnapshot(lobby.code) };
  assert.equal(moved.game.state.heroes.find((entry) => entry.id === guestHero.id).position.latitude, 48.85);
  const ownCommand = lobbies.executeGameCommand({
    token: guest.session.token,
    command: "levelUpHero",
    args: [{ heroId: guestHero.id }],
  });
  assert.equal(ownCommand.result.success, false);
  assert.throws(
    () =>
      lobbies.executeGameCommand({
        token: guest.session.token,
        command: "levelUpHero",
        args: [{ heroId: hostHero.id }],
      }),
    (error) => error.code === "command_forbidden",
  );
  lobbies.disconnect({ token: host.session.token, connectionId: "host" });
  currentTime = 12_000;
  const updates = lobbies.advanceGames();
  assert.equal(updates.length, 1);
  assert.equal(updates[0].state.status, "started");
});

test("seul l’organisateur configure la partie", () => {
  const lobbies = service();
  const host = lobbies.createLobby({ playerName: "Jo" });
  const guest = lobbies.joinLobby({ code: host.lobby.code, playerName: "Léa" });

  const configured = lobbies.updateConfiguration({
    token: host.session.token,
    configuration: {
      positionMode: "gps",
      maxPlayers: 3,
      scenarioId: "repression",
      difficulty: "hard",
    },
  });
  assert.deepEqual(configured.configuration, {
    positionMode: "gps",
    scenarioId: "repression",
    difficulty: "hard",
  });
  assert.equal(configured.maxPlayers, 3);
  assert.throws(
    () =>
      lobbies.updateConfiguration({
        token: guest.session.token,
        configuration: { difficulty: "easy" },
      }),
    (error) => error.code === "host_only",
  );
});

test("chaque joueur choisit sa classe avant de pouvoir être prêt", () => {
  const lobbies = service();
  const host = lobbies.createLobby({ playerName: "Jo" });
  assert.throws(
    () => lobbies.setReady({ token: host.session.token, ready: true }),
    (error) => error.code === "hero_class_required",
  );
  const selected = lobbies.selectHeroClass({
    token: host.session.token,
    heroClassId: "ranger",
  });
  assert.equal(selected.players[0].heroClassId, "ranger");
  assert.equal(selected.players[0].ready, false);
  assert.equal(
    lobbies.setReady({ token: host.session.token, ready: true }).players[0]
      .ready,
    true,
  );
});

test("le mode GPS exige une zone définie par l’organisateur", () => {
  const lobbies = service();
  const host = lobbies.createLobby({ playerName: "Jo" });
  const guest = lobbies.joinLobby({ code: host.lobby.code, playerName: "Léa" });
  lobbies.updateConfiguration({
    token: host.session.token,
    configuration: { positionMode: "gps" },
  });
  lobbies.selectHeroClass({
    token: host.session.token,
    heroClassId: "warrior",
  });
  lobbies.selectHeroClass({
    token: guest.session.token,
    heroClassId: "ranger",
  });
  assert.throws(
    () => lobbies.setReady({ token: host.session.token, ready: true }),
    (error) => error.code === "play_area_required",
  );
  const playArea = {
    polygon: [
      { latitude: 48.85, longitude: 2.34 },
      { latitude: 48.85, longitude: 2.35 },
      { latitude: 48.86, longitude: 2.35 },
    ],
  };
  assert.throws(
    () => lobbies.setPlayArea({ token: guest.session.token, playArea }),
    (error) => error.code === "host_only",
  );
  const withArea = lobbies.setPlayArea({
    token: host.session.token,
    playArea,
  });
  assert.equal(withArea.playArea.polygon.length, 3);
  lobbies.setReady({ token: host.session.token, ready: true });
  lobbies.setReady({ token: guest.session.token, ready: true });
  assert.equal(
    lobbies.startLobby({ token: host.session.token }).launch.playArea.polygon
      .length,
    3,
  );
});

test("une position est attribuée au joueur authentifié et validée", () => {
  let now = 1_000;
  let random = 3;
  const lobbies = new LobbyService({
    idFactory: (() => {
      let id = 0;
      return () => `player-${++id}`;
    })(),
    randomBytesFn: (size) => Buffer.alloc(size, random++),
    now: () => now,
  });
  const host = lobbies.createLobby({ playerName: "Jo" });
  const guest = lobbies.joinLobby({ code: host.lobby.code, playerName: "Léa" });
  lobbies.selectHeroClass({ token: host.session.token, heroClassId: "warrior" });
  lobbies.selectHeroClass({ token: guest.session.token, heroClassId: "ranger" });
  lobbies.setReady({ token: host.session.token, ready: true });
  lobbies.setReady({ token: guest.session.token, ready: true });
  lobbies.startLobby({ token: host.session.token });
  now = 2_000;
  const snapshot = lobbies.updatePlayerPosition({
    token: guest.session.token,
    position: { latitude: 48.85, longitude: 2.35, accuracy: 8, heading: 90 },
  });
  const positioned = snapshot.positions.find(
    (entry) => entry.playerId === guest.session.playerId,
  );
  assert.equal(positioned.name, "Léa");
  assert.deepEqual(positioned.position, {
    latitude: 48.85,
    longitude: 2.35,
    accuracy: 8,
    heading: 90,
    updatedAt: 2_000,
  });
  assert.throws(
    () =>
      lobbies.updatePlayerPosition({
        token: host.session.token,
        position: { latitude: 120, longitude: 2.35 },
      }),
    (error) => error.code === "invalid_position",
  );
});

test("une session reprend sa place et suit réellement les connexions", () => {
  const lobbies = service();
  const created = lobbies.createLobby({
    playerName: "Jo",
    connectionId: "old",
  });
  const offline = lobbies.disconnect({
    token: created.session.token,
    connectionId: "old",
  });
  assert.equal(offline.players[0].connected, false);
  const resumed = lobbies.resumeSession({
    token: created.session.token,
    connectionId: "new",
  });
  assert.equal(resumed.session.playerId, created.session.playerId);
  assert.equal(resumed.lobby.players[0].connected, true);
});

test("un invité ne peut pas démarrer et un code inconnu est refusé", () => {
  const lobbies = service();
  const host = lobbies.createLobby({ playerName: "Jo" });
  const guest = lobbies.joinLobby({ code: host.lobby.code, playerName: "Léa" });
  assert.throws(
    () => lobbies.startLobby({ token: guest.session.token }),
    (error) => error.code === "host_only",
  );
  assert.throws(
    () => lobbies.joinLobby({ code: "ZZZZZ", playerName: "Léa" }),
    (error) => error.code === "lobby_not_found",
  );
});
