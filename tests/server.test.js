import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readServerConfig } from "../server/config.js";
import { createRpgGpsServer } from "../server/server.js";
import { Game } from "../app/js/core/game.js";
import { BattleEngine } from "../app/js/core/battle-engine.js";
import { LobbyService } from "../server/lobby/lobby-service.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function persistedGame() {
  const game = new Game({
    setup: {
      id: "saved",
      name: "Sauvegarde",
      mode: "quick",
      scenarioId: "chaos",
      playerCount: 2,
      playArea: {
        id: "area",
        name: "Zone",
        polygon: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 1 },
          { latitude: 1, longitude: 0 },
        ],
      },
      participants: [
        { playerId: "p1", name: "A" },
        { playerId: "p2", name: "B" },
      ],
    },
    heroClasses: [{ id: "fighter", name: "F", abilityIds: [] }],
    locations: [
      {
        id: "camp",
        name: "Camp",
        type: "camp",
        source: "scenario",
        position: { latitude: 0, longitude: 0 },
      },
    ],
    now: () => 1000,
  });
  const first = game.chooseHero("p1", { name: "A", classId: "fighter" });
  const second = game.chooseHero("p2", { name: "B", classId: "fighter" });
  game.start();
  game.createBattle({
    teamParticipants: [
      { id: "red", heroIds: [first.id] },
      { id: "blue", heroIds: [second.id] },
    ],
    position: { latitude: 0, longitude: 0 },
  });
  return game.toJSON();
}

test("un combat incompatible ne bloque pas la restauration du serveur", async (context) => {
  const snapshot = persistedGame();
  delete snapshot.battles[0].duel;
  snapshot.battles[0].status = "active";
  const original = structuredClone(snapshot);
  const restored = Game.fromJSON(snapshot, { now: () => 2000 });
  assert.equal(restored.battles.length, 0);
  assert.equal(restored.battleSites.length, 0);
  assert.deepEqual(
    restored.heroes.map((hero) => hero.toJSON()),
    snapshot.heroes,
  );
  assert.deepEqual(
    restored.locations.map((location) => location.toJSON()),
    snapshot.locations,
  );
  assert.equal(restored.battleReports.length, snapshot.battleReports.length);
  assert.equal(restored.eventLog.at(-1).type, "incompatible_battles_discarded");
  assert.deepEqual(snapshot, original);

  const service = new LobbyService();
  service.createLobby({ maxPlayers: 4, positionMode: "simulation", playerName: "Jo", connectionId: "test" });
  const state = service.exportState();
  state.lobbies[0].game = snapshot;
  const lobbyService = new LobbyService({ initialState: state });
  const server = createRpgGpsServer({ projectRoot, lobbyService });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/health`,
  );
  assert.equal(response.status, 200);
});

test("la restauration conserve les duels courants et écarte les autres formats", () => {
  const snapshot = persistedGame();
  const current = structuredClone(snapshot.battles[0]);
  snapshot.battles.push({
    ...structuredClone(current),
    id: "other-format",
    duel: { mode: "DUEL", version: 4 },
  });
  const restored = Game.fromJSON(snapshot);
  assert.deepEqual(
    restored.battles.map((battle) => battle.toJSON()),
    [current],
  );
  assert.equal(restored.battleSites.length, snapshot.battleSites.length);
  assert.deepEqual(restored.eventLog.at(-1).battleIds, ["other-format"]);
  assert.throws(() => new BattleEngine(snapshot.battles[1]), /incompatible/);
});

test("la configuration du serveur possède des valeurs sûres", () => {
  assert.deepEqual(readServerConfig({}), {
    host: "127.0.0.1",
    port: 3000,
    dataDirectory: "/var/lib/rpg-gps",
  });
  assert.deepEqual(
    readServerConfig({
      RPG_GPS_HOST: "0.0.0.0",
      RPG_GPS_PORT: "8080",
      RPG_GPS_DATA_DIR: "/tmp/rpg-test",
    }),
    {
      host: "0.0.0.0",
      port: 8080,
      dataDirectory: "/tmp/rpg-test",
    },
  );
  assert.throws(
    () => readServerConfig({ RPG_GPS_PORT: "70000" }),
    /port valide/,
  );
});

test("le serveur expose sa santé et les fichiers du jeu", async (context) => {
  const server = createRpgGpsServer({ projectRoot, now: () => 5_000 });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok", uptimeSeconds: 0 });
  assert.equal(health.headers.get("cache-control"), "no-store");

  const home = await fetch(`${origin}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /^text\/html/);
  assert.match(await home.text(), /RPG GPS/);

  const script = await fetch(`${origin}/app/js/main.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /^text\/javascript/);
  assert.equal(script.headers.get("cache-control"), "no-cache");

  const worker = await fetch(`${origin}/service-worker.js`);
  assert.equal(worker.headers.get("cache-control"), "no-cache");

  const socketClient = await fetch(`${origin}/socket.io/socket.io.js`);
  assert.equal(socketClient.status, 200);
  assert.match(
    socketClient.headers.get("content-type"),
    /^application\/javascript/,
  );
});

test("le serveur refuse les méthodes d’écriture et les fichiers absents", async (context) => {
  const server = createRpgGpsServer({ projectRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const write = await fetch(`http://127.0.0.1:${port}/`, { method: "POST" });
  assert.equal(write.status, 405);
  const missing = await fetch(`http://127.0.0.1:${port}/absent.txt`);
  assert.equal(missing.status, 404);
});
