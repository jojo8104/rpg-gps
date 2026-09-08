import assert from "node:assert/strict";
import test from "node:test";
import { io as createClient } from "socket.io-client";
import { createRpgGpsServer } from "../server/server.js";
import { Game } from "../app/js/core/game.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";

test("un compte sélectionné devient indisponible pour les autres téléphones", async (context) => {
  const server = createRpgGpsServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const address = `http://127.0.0.1:${port}`;
  const first = createClient(address, { transports: ["websocket"] });
  const second = createClient(address, { transports: ["websocket"] });
  context.after(async () => {
    first.close();
    second.close();
    await new Promise((resolve) => server.close(resolve));
  });
  await Promise.all([connected(first), connected(second)]);
  const created = await request(first, "account:create", { name: "Léa" });
  await request(first, "account:select", { accountId: created.account.id });
  const listed = await request(second, "account:list", {});
  assert.equal(listed.accounts.find(({ id }) => id === created.account.id).available, false);
  const refused = await request(second, "account:select", {
    accountId: created.account.id,
  });
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, "account_in_use");
});

test("deux clients reçoivent le même état de lobby en temps réel", async (context) => {
  const server = createRpgGpsServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const address = `http://127.0.0.1:${port}`;
  const host = createClient(address, { transports: ["websocket"] });
  const guest = createClient(address, { transports: ["websocket"] });
  context.after(async () => {
    host.close();
    guest.close();
    await new Promise((resolve) => server.close(resolve));
  });
  await Promise.all([connected(host), connected(guest)]);

  const created = await request(host, "lobby:create", { playerName: "Jo" });
  assert.equal(created.ok, true);
  const update = eventOnce(
    host,
    "lobby:state",
    (lobby) => lobby.players.length === 2,
  );
  const joined = await request(guest, "lobby:join", {
    code: created.lobby.code,
    playerName: "Léa",
  });
  assert.equal(joined.ok, true);
  const lobby = await update;
  assert.deepEqual(
    lobby.players.map((player) => player.name),
    ["Jo", "Léa"],
  );

  const configuredUpdate = eventOnce(
    guest,
    "lobby:state",
    (state) => state.configuration?.positionMode === "gps",
  );
  const configured = await request(host, "lobby:configure", {
    positionMode: "gps",
    maxPlayers: 3,
    scenarioId: "repression",
    difficulty: "hard",
  });
  assert.equal(configured.ok, true);
  assert.equal((await configuredUpdate).configuration.difficulty, "hard");

  const selectedUpdate = eventOnce(
    host,
    "lobby:state",
    (state) => state.players[1]?.heroClassId === "mage",
  );
  const selected = await request(guest, "lobby:hero-class", {
    heroClassId: "mage",
  });
  assert.equal(selected.ok, true);
  assert.equal((await selectedUpdate).players[1].heroClassId, "mage");

  const areaUpdate = eventOnce(
    guest,
    "lobby:state",
    (state) => state.playArea?.polygon?.length === 3,
  );
  await request(host, "lobby:configure", { positionMode: "gps" });
  const area = await request(host, "lobby:play-area", {
    polygon: [
      { latitude: 48.85, longitude: 2.34 },
      { latitude: 48.85, longitude: 2.35 },
      { latitude: 48.86, longitude: 2.35 },
    ],
  });
  assert.equal(area.ok, true);
  assert.equal((await areaUpdate).playArea.polygon.length, 3);
});

test("la position d’un héros est diffusée aux autres joueurs", async (context) => {
  const server = createRpgGpsServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const address = `http://127.0.0.1:${port}`;
  const host = createClient(address, { transports: ["websocket"] });
  const guest = createClient(address, { transports: ["websocket"] });
  context.after(async () => {
    host.close();
    guest.close();
    await new Promise((resolve) => server.close(resolve));
  });
  await Promise.all([connected(host), connected(guest)]);
  const created = await request(host, "lobby:create", { playerName: "Jo" });
  const joined = await request(guest, "lobby:join", {
    code: created.lobby.code,
    playerName: "Léa",
  });
  await request(host, "lobby:hero-class", { heroClassId: "warrior" });
  await request(guest, "lobby:hero-class", { heroClassId: "mage" });
  await request(host, "lobby:ready", { ready: true });
  await request(guest, "lobby:ready", { ready: true });
  await request(host, "lobby:start", {});

  const received = eventOnce(
    host,
    "game:positions",
    (snapshot) =>
      snapshot.positions.find(
        (entry) => entry.playerId === joined.session.playerId,
      )?.position?.latitude === 48.85,
  );
  const response = await request(guest, "game:position", {
    playerId: created.session.playerId,
    latitude: 48.85,
    longitude: 2.35,
    accuracy: 7,
    heading: 180,
  });
  assert.equal(response.ok, true);
  const position = (await received).positions.find(
    (entry) => entry.position?.latitude === 48.85,
  );
  assert.equal(position.playerId, joined.session.playerId);
  assert.equal(position.heroClassId, "mage");
});

test("l’état d’un héros authentifié est diffusé sans pouvoir usurper un allié", async (context) => {
  const server = createRpgGpsServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const address = `http://127.0.0.1:${port}`;
  const host = createClient(address, { transports: ["websocket"] });
  const guest = createClient(address, { transports: ["websocket"] });
  context.after(async () => {
    host.close();
    guest.close();
    await new Promise((resolve) => server.close(resolve));
  });
  await Promise.all([connected(host), connected(guest)]);
  const created = await request(host, "lobby:create", { playerName: "Jo" });
  const joined = await request(guest, "lobby:join", {
    code: created.lobby.code,
    playerName: "Léa",
  });
  await request(host, "lobby:hero-class", { heroClassId: "warrior" });
  await request(guest, "lobby:hero-class", { heroClassId: "mage" });
  await request(host, "lobby:ready", { ready: true });
  await request(guest, "lobby:ready", { ready: true });
  await request(host, "lobby:start", {});

  const received = eventOnce(
    host,
    "game:positions",
    (snapshot) =>
      snapshot.positions.find(
        (entry) => entry.playerId === joined.session.playerId,
      )?.heroState?.health === 17,
  );
  const response = await request(guest, "game:hero-state", {
    playerId: created.session.playerId,
    health: 17,
    maxHealth: 25,
    level: 3,
    state: "active",
    commandPoints: 2,
    maxCommandPoints: 4,
    units: [
      { id: "unit-1", typeId: "archer", quantity: 6, combatantCount: 5 },
    ],
  });
  assert.equal(response.ok, true);
  const state = (await received).positions.find(
    (entry) => entry.playerId === joined.session.playerId,
  );
  assert.equal(state.playerId, joined.session.playerId);
  assert.equal(state.heroState.level, 3);
  assert.equal(state.heroState.units[0].combatantCount, 5);
});

test("les lieux communs sont versionnés et un état périmé est refusé", async (context) => {
  const server = createRpgGpsServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const address = `http://127.0.0.1:${port}`;
  const host = createClient(address, { transports: ["websocket"] });
  const guest = createClient(address, { transports: ["websocket"] });
  context.after(async () => {
    host.close();
    guest.close();
    await new Promise((resolve) => server.close(resolve));
  });
  await Promise.all([connected(host), connected(guest)]);
  const created = await request(host, "lobby:create", { playerName: "Jo" });
  await request(guest, "lobby:join", {
    code: created.lobby.code,
    playerName: "Léa",
  });
  await request(host, "lobby:hero-class", { heroClassId: "warrior" });
  await request(guest, "lobby:hero-class", { heroClassId: "mage" });
  await request(host, "lobby:ready", { ready: true });
  await request(guest, "lobby:ready", { ready: true });
  await request(host, "lobby:start", {});

  const shared = eventOnce(
    guest,
    "game:world-state",
    (snapshot) => snapshot.revision === 1,
  );
  const accepted = await request(host, "game:world-state", {
    baseRevision: 0,
    state: {
      locations: [{
        id: "shared-camp",
        name: "Camp commun",
        type: "camp",
        source: "test",
        position: { latitude: 48.85, longitude: 2.35 },
        resources: { stock: { wood: 8 } },
        garrison: { units: [] },
      }],
    },
  });
  assert.equal(accepted.ok, true);
  assert.equal((await shared).state.locations[0].resources.stock.wood, 8);

  const stale = await request(guest, "game:world-state", {
    baseRevision: 0,
    state: accepted.world.state,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, "world_revision_conflict");
});

test("le moteur serveur poursuit un combat après la déconnexion de l’organisateur", async (context) => {
  const server = createRpgGpsServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  const host = createClient(address, { transports: ["websocket"] });
  const guest = createClient(address, { transports: ["websocket"] });
  context.after(async () => {
    host.close();
    guest.close();
    await new Promise((resolve) => server.close(resolve));
  });
  await Promise.all([connected(host), connected(guest)]);
  const created = await request(host, "lobby:create", { playerName: "Jo" });
  const joined = await request(guest, "lobby:join", {
    code: created.lobby.code,
    playerName: "Léa",
  });
  await request(host, "lobby:hero-class", { heroClassId: "warrior" });
  await request(guest, "lobby:hero-class", { heroClassId: "warrior" });
  await request(host, "lobby:ready", { ready: true });
  await request(guest, "lobby:ready", { ready: true });
  const started = await request(host, "lobby:start", {});
  const launch = createMultiplayerLaunch(started.lobby);
  let id = 0;
  const game = new Game({
    setup: launch.setup,
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    locations: [],
    idGenerator: (prefix) => `${prefix}-${++id}`,
  });
  const hostHero = game.chooseHero(created.session.playerId, {
    name: "Jo",
    classId: "warrior",
  });
  const guestHero = game.chooseHero(joined.session.playerId, {
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
    config: { countdownMs: 0 },
  });
  battle.start();
  const initial = eventOnce(
    guest,
    "game:state",
    (snapshot) => snapshot.revision === 1,
  );
  const bootstrap = await request(host, "game:bootstrap", {
    state: game.toJSON(),
  });
  assert.equal(bootstrap.ok, true);
  await initial;
  const advanced = eventOnce(
    guest,
    "game:state",
    (snapshot) => snapshot.revision > 1 && snapshot.state.battles[0].elapsedMs > 0,
  );
  host.close();
  const official = await advanced;
  assert.equal(official.state.battles[0].status, "active");
  const forbidden = await request(guest, "game:command", {
    command: "levelUpHero",
    args: [{ heroId: hostHero.id }],
  });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.error.code, "command_forbidden");
});

function connected(socket) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });
}

function request(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function eventOnce(socket, event, predicate) {
  return new Promise((resolve) => {
    const listener = (value) => {
      if (!predicate(value)) return;
      socket.off(event, listener);
      resolve(value);
    };
    socket.on(event, listener);
  });
}
