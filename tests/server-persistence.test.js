import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { ServerStateStore } from "../server/persistence/server-state-store.js";

async function temporaryDirectory(context) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rpg-gps-state-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("une partie et ses sessions survivent à un redémarrage", async (context) => {
  const directory = await temporaryDirectory(context);
  const store = new ServerStateStore({ directory, debounceMs: 1 });
  let identifier = 0;
  const lobbies = new LobbyService({
    idFactory: () => `player-${++identifier}`,
    randomBytesFn: (size) => Buffer.alloc(size, identifier++),
    now: () => 1_000,
    onStateChanged: (state) => store.schedule(state),
  });
  const host = lobbies.createLobby({ playerName: "Jo", connectionId: "host" });
  const guest = lobbies.joinLobby({
    code: host.lobby.code,
    playerName: "Léa",
    connectionId: "guest",
  });
  for (const session of [host.session, guest.session]) {
    lobbies.selectHeroClass({ token: session.token, heroClassId: "warrior" });
    lobbies.setReady({ token: session.token, ready: true });
  }
  const started = lobbies.startLobby({ token: host.session.token });
  const game = new Game({
    setup: createMultiplayerLaunch(started).setup,
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    locations: [],
  });
  game.chooseHero(host.session.playerId, { name: "Jo", classId: "warrior" });
  game.chooseHero(guest.session.playerId, { name: "Léa", classId: "warrior" });
  game.chooseHero("bandits", { name: "Rask", classId: "warrior" });
  game.start();
  lobbies.bootstrapGame({ token: host.session.token, snapshot: game.toJSON() });
  await store.flush();

  const restoredStore = new ServerStateStore({ directory });
  const restored = new LobbyService({
    now: () => 5_000,
    initialState: restoredStore.loadSync(),
  });
  const resumed = restored.resumeSession({
    token: guest.session.token,
    connectionId: "new-socket",
  });
  assert.equal(resumed.lobby.status, "started");
  assert.equal(resumed.lobby.players.find(({ id }) => id === guest.session.playerId).connected, true);
  assert.equal(resumed.lobby.players.find(({ id }) => id === host.session.playerId).connected, false);
  assert.equal(restored.gameSnapshot(started.code).state.status, "started");
  assert.equal(restored.gameSnapshot(started.code).state.heroes.length, 3);
});

test("la dernière modification est écrite atomiquement", async (context) => {
  const directory = await temporaryDirectory(context);
  const store = new ServerStateStore({ directory, debounceMs: 10_000 });
  store.schedule({ lobbies: [], sessions: [], marker: "ancienne" });
  store.schedule({ lobbies: [], sessions: [], marker: "récente" });
  await store.flush();
  store.schedule({ lobbies: [], sessions: [], marker: "finale" });
  await store.flush();
  const saved = JSON.parse(await readFile(path.join(directory, "server-state.json"), "utf8"));
  assert.equal(saved.marker, "finale");
  assert.deepEqual((await readdir(directory)).filter((name) => name.endsWith(".tmp")), []);
});

test("une sauvegarde corrompue est isolée sans bloquer le serveur", async (context) => {
  const directory = await temporaryDirectory(context);
  const filePath = path.join(directory, "server-state.json");
  await writeFile(filePath, "{invalide", "utf8");
  const store = new ServerStateStore({ directory });
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(store.loadSync(), null);
  } finally {
    console.error = originalError;
  }
  assert.equal((await readdir(directory)).some((name) => name.includes(".corrupt-")), true);
});
