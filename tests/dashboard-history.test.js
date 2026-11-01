import { Game } from "../app/js/core/game.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DashboardHistoryStore } from "../server/monitoring/dashboard-history-store.js";
import {
  captureWorldSample,
  unitPowerCoefficient,
} from "../server/monitoring/world-sample.js";
import { createRpgGpsServer } from "../server/server.js";
import { LobbyService } from "../server/lobby/lobby-service.js";

test("historique borné, incrémental, persistant et suppression isolée", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rpg-dashboard-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { directory, segmentSize: 2, limit: 4 };
  const store = new DashboardHistoryStore(options);
  for (let at = 1; at <= 11; at++) {
    assert.equal(store.append("ABCDE", { at }), true);
    await store.flush();
  }
  assert.deepEqual(
    (await store.read("ABCDE")).map((s) => s.at),
    [8, 9, 10, 11],
  );
  assert.deepEqual(
    (await store.read("ABCDE", 10)).map((s) => s.at),
    [11],
  );
  assert.deepEqual(await store.read("ABCDE", 11), []);
  assert.equal((await store.files("ABCDE")).length, 3);
  const restored = new DashboardHistoryStore(options);
  assert.deepEqual(await restored.read("ABCDE"), await store.read("ABCDE"));
  restored.append("ABCDE", { at: 12 });
  await restored.flush();
  assert.deepEqual(
    (await restored.read("ABCDE")).map((s) => s.at),
    [9, 10, 11, 12],
  );
  restored.append("FGHIJ", { at: 20 });
  await restored.flush();
  await restored.delete("ABCDE");
  assert.deepEqual(await restored.read("ABCDE"), []);
  assert.deepEqual(await restored.read("FGHIJ"), [{ at: 20 }]);
  assert.throws(() => store.append("../xx", {}), /invalide/);
});

test("score officiel du héros, mobilité et garnisons sans double comptage", () => {
  const definition = {
    stats: {
      attack: 2,
      defense: 3,
      healthPerSoldier: 10,
      range: 1,
      damageMin: 2,
      damageMax: 4,
      attackIntervalMs: 1000,
      speed: 2,
    },
    abilities: [],
  };
  assert.equal(unitPowerCoefficient(definition), 10);
  const hero = (id) => ({
    id,
    name: id,
    playerId: "p",
    classId: "class",
    level: 2,
    equipment: {},
    finalStats: { attack: 20, defense: 30 },
    health: 80,
    army: { units: [] },
    position: { latitude: 1, longitude: 2 },
  });
  const first = hero("a");
  first.army.units = [{ typeId: "unit", quantity: 10 }];
  const second = hero("b");
  const lobby = {
    gameRevision: 7,
    game: {
      heroes: [second, first],
      unitDefinitions: new Map([["unit", definition]]),
      heroClasses: new Map(),
      setup: { participants: [{ playerId: "p", teamId: "red" }] },
      locations: [
        {
          id: "v",
          name: "Village",
          population: 100,
          level: 2,
          garrison: {
            units: [{ typeId: "unit", quantity: 5, ownerPlayerId: "p" }],
          },
          resources: {
            production: { wood: 3 },
            productionStock: { wood: 12 },
            stock: { wood: 5, gold: 8 },
          },
        },
      ],
      battles: [
        {
          id: "battle",
          status: "finished",
          finishedAt: 9000,
          winnerTeamId: "winner",
          teams: [
            { id: "winner", heroes: [first] },
            { id: "loser", heroes: [second] },
          ],
        },
      ],
    },
  };
  const before = structuredClone(lobby);
  const sample = captureWorldSample(lobby, 10000, 6000);
  assert.deepEqual(sample.locations[0].stock, { wood: 17, gold: 8 });
  assert.equal(sample.heroes[0].heroPower, 130);
  assert.equal(sample.heroes[0].mobile.power, 110);
  assert.equal(sample.heroes[0].garrison.power, 50);
  assert.equal(sample.heroes[1].garrison.power, 0);
  assert.equal(sample.heroes[0].authority, 4);
  assert.deepEqual(sample.teams, [{ id: "red", power: 420 }]);
  assert.deepEqual(
    sample.battles.map((b) => b.result),
    ["win", "loss"],
  );
  assert.deepEqual(captureWorldSample(lobby, 14000, 10000).battles, []);
  sample.locations[0].production.wood = 99;
  assert.deepEqual(lobby, before);
});

test("API historique privée et relevés incrémentaux", async (t) => {
  const lobbies = new LobbyService();
  const created = lobbies.createLobby({
    maxPlayers: 4,
    positionMode: "simulation",
    playerName: "Test",
    connectionId: "test",
  });
  const server = createRpgGpsServer({
    lobbyService: lobbies,
    dashboardToken: "key",
    historyStore: { read: async () => [{ at: 4 }, { at: 8 }] },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api/dashboard/history`;
  assert.equal((await fetch(`${base}?code=${created.lobby.code}`)).status, 401);
  const headers = { Authorization: "Bearer key" };
  const result = await (
    await fetch(`${base}?code=${created.lobby.code}&since=4`, { headers })
  ).json();
  assert.deepEqual(result, {
    samples: [{ at: 8 }],
    intervalMs: 4000,
    limit: 2000,
  });
  assert.equal((await fetch(`${base}?code=XXXXX`, { headers })).status, 404);
});

test("cadence de quatre secondes, supervision maintenue même sans joueur", () => {
  let at = 1000;
  const samples = [];
  const lobbies = new LobbyService({
    now: () => at,
    onWorldSample: (code, sample) => samples.push(sample),
  });
  const started = lobbies.startSolo({
    playerName: "Suivi",
    connectionId: "monitor",
    heroClassId: "warrior",
    configuration: { positionMode: "simulation" },
  });
  const game = new Game({
    setup: createMultiplayerLaunch(started.lobby).setup,
    coordinateMode: "simulation",
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    locations: [],
    now: () => at,
  });
  game.chooseHero(started.session.playerId, {
    name: "Suivi",
    classId: "warrior",
  });
  game.chooseHero("bandits", { name: "Brigand", classId: "warrior" });
  game.start();
  lobbies.bootstrapGame({
    token: started.session.token,
    snapshot: game.toJSON(),
  });
  lobbies.advanceGames();
  assert.equal(samples.length, 1);
  at = 4999;
  lobbies.advanceGames();
  assert.equal(samples.length, 1);
  at = 5000;
  lobbies.advanceGames();
  assert.equal(samples.length, 2);
  const beforePause = lobbies.gameSnapshot(started.lobby.code);
  lobbies.disconnect({ token: started.session.token, connectionId: "monitor" });
  at = 9000;
  lobbies.advanceGames();
  assert.equal(samples.length, 3);
  assert.deepEqual(lobbies.gameSnapshot(started.lobby.code), beforePause);
  assert.equal(samples.at(-1).simulationPaused, true);
  assert.equal(samples.at(-1).heroes[0].connected, false);
  assert.deepEqual(
    samples.map((s) => s.at),
    [1000, 5000, 9000],
  );
});

test("la conservation complète traverse les segments et survit au redémarrage", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rpg-full-history-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const options = { directory, segmentSize: 2, limit: 4, retainAll: true };
  const store = new DashboardHistoryStore(options);
  for (let at = 1; at <= 12; at++) {
    store.append("ABCDE", {
      at,
      groups: [
        { id: "convoy", position: { latitude: 48, longitude: 2 + at / 1000 } },
      ],
    });
    await store.flush();
  }
  const restored = new DashboardHistoryStore(options);
  assert.equal((await restored.files("ABCDE")).length, 6);
  const full = await restored.read("ABCDE", 0, { all: true });
  assert.equal(full.length, 12);
  assert.equal(full[0].groups[0].id, "convoy");
  assert.deepEqual(
    (await restored.read("ABCDE", 10, { all: true })).map((s) => s.at),
    [11, 12],
  );
  assert.equal((await restored.read("ABCDE")).length, 4);
});
