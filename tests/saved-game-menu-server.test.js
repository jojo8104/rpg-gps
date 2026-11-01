import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { io } from "socket.io-client";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { Game } from "../app/js/core/game.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";
import { createRpgGpsServer } from "../server/server.js";

function fixture() {
  let changed;
  const service = new LobbyService({
    now: () => 1000,
    onStateChanged: (state) => {
      changed = structuredClone(state);
    },
  });
  const account = service.createAccount({ name: "Alice" });
  const solo = service.startSolo({
    accountId: account.id,
    playerName: "Alice",
    connectionId: "old",
    heroClassId: "warrior",
    configuration: { positionMode: "simulation" },
  });
  const game = new Game({
    setup: createMultiplayerLaunch(solo.lobby).setup,
    coordinateMode: "simulation",
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    locations: [],
  });
  game.chooseHero(solo.session.playerId, { name: "Alice", classId: "warrior" });
  game.chooseHero("bandits", { name: "Brigand", classId: "warrior" });
  game.start();
  service.bootstrapGame({ token: solo.session.token, snapshot: game.toJSON() });
  const { save } = service.saveAndEnd({
    token: solo.session.token,
    name: "Au camp",
  });
  service.closeEndedLobby(solo.lobby.code);
  service.disconnect("old");
  return {
    service,
    account,
    save,
    playerId: solo.session.playerId,
    state: () => changed,
  };
}

test("le menu consulte toutes les sauvegardes sans salon puis restaure le héros du compte organisateur", () => {
  const f = fixture();
  const before = f.service.exportState();
  const catalog = f.service.savedGameCatalog();
  assert.equal(catalog[0].ownerName, "Alice");
  assert.equal(
    catalog[0].sizeBytes,
    Buffer.byteLength(JSON.stringify(before.manualSaves[0]), "utf8"),
  );
  assert.equal(catalog[0].ownerAccountId, f.account.id);
  assert.equal(catalog[0].game, undefined);
  assert.equal(catalog[0].ownerIdentityHash, undefined);
  assert.deepEqual(
    f.service.exportState(),
    before,
    "consulter ne crée pas de salon",
  );
  assert.throws(
    () =>
      f.service.loadSavedGameFromMenu({
        saveId: f.save.id,
        accountId: "wrong",
        connectionId: "new",
      }),
    { code: "save_not_found" },
  );
  const loaded = f.service.loadSavedGameFromMenu({
    saveId: f.save.id,
    accountId: f.account.id,
    connectionId: "new",
  });
  assert.equal(loaded.session.playerId, f.playerId);
  assert.equal(loaded.lobby.resume.saveId, f.save.id);
  assert.equal(
    f.state().lobbies[0].resume.saveId,
    f.save.id,
    "la reprise est persistée",
  );
  assert.equal(
    f.service.savedGameCatalog().length,
    1,
    "charger conserve la sauvegarde source",
  );
  assert.equal(f.service.dashboardDeleteSavedGame(f.save.id), true);
  assert.equal(f.service.dashboardDeleteSavedGame(f.save.id), false);
  assert.equal(f.state().manualSaves.length, 0);
  f.service.setReady({ token: loaded.session.token, ready: true });
  const started = f.service.startLobby({ token: loaded.session.token });
  assert.equal(
    f.service.gameSnapshot(started.code).state.heroes[0].playerId,
    f.playerId,
    "la copie chargée reste jouable après suppression de la source",
  );
});

test("le catalogue et le chargement passent par le vrai transport ; le Dashboard exige clé et confirmation", async (t) => {
  const f = fixture();
  let flushes = 0;
  const server = createRpgGpsServer({
    lobbyService: f.service,
    dashboardToken: "test",
    stateStore: {
      flush: async () => {
        flushes++;
      },
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = io(base, { transports: ["websocket"] });
  t.after(async () => {
    client.close();
    await new Promise((resolve) => server.close(resolve));
  });
  await once(client, "connect");
  const command = (event, data = {}) => client.emitWithAck(event, data);
  assert.equal((await command("save:catalog")).saves.length, 1);
  assert.equal((await command("save:open", { saveId: f.save.id })).ok, false);
  assert.equal(
    (await command("account:select", { accountId: f.account.id })).ok,
    true,
  );
  const loaded = await command("save:open", { saveId: f.save.id });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.session.playerId, f.playerId);
  assert.equal((await fetch(base + "/api/dashboard/saves")).status, 401);
  const headers = { Authorization: "Bearer test" };
  const catalog = await (
    await fetch(base + "/api/dashboard/saves", { headers })
  ).json();
  assert.equal(catalog.saves[0].id, f.save.id);
  const url = base + "/api/dashboard/save?id=" + f.save.id;
  assert.equal((await fetch(url, { method: "DELETE", headers })).status, 400);
  assert.equal(
    (
      await fetch(url, {
        method: "DELETE",
        headers: { ...headers, "X-Dashboard-Confirm": f.save.id },
      })
    ).status,
    200,
  );
  assert.equal(flushes, 1);
  assert.equal(f.state().manualSaves.length, 0);
  assert.equal(f.service.dashboardList().length, 1);
  assert.equal((await command("save:catalog")).saves.length, 0);
  const restored = new LobbyService({ initialState: f.state() });
  assert.equal(restored.savedGameCatalog().length, 0);
});
