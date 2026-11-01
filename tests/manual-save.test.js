import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";
import { LobbyService } from "../server/lobby/lobby-service.js";

test("une session terminée est reprise lorsque chaque téléphone réclame son héros", () => {
  let id = 0;
  let service = new LobbyService({
    idFactory: () => `id-${++id}`,
    randomBytesFn: (size) => Buffer.alloc(size, id++),
    now: () => 10_000 + id,
  });
  const hostAccount = service.createAccount({ name: "Jo" });
  const guestAccount = service.createAccount({ name: "Léa" });
  service.selectAccount({ accountId: hostAccount.id, connectionId: "host-1" });
  service.selectAccount({
    accountId: guestAccount.id,
    connectionId: "guest-1",
  });
  const host = service.createLobby({
    maxPlayers: 4,
    positionMode: "simulation",
    playerName: "Jo",
    accountId: hostAccount.id,
  });
  const guest = service.joinLobby({
    code: host.lobby.code,
    playerName: "Léa",
    accountId: guestAccount.id,
  });
  for (const session of [host.session, guest.session]) {
    service.selectHeroClass({
      token: session.token,
      heroClassId: "warrior",
      heroGender: "female",
    });
    service.setReady({ token: session.token, ready: true });
  }
  const started = service.startLobby({ token: host.session.token });
  const game = new Game({
    setup: createMultiplayerLaunch(started).setup,
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    locations: [],
  });
  game.chooseHero(host.session.playerId, {
    name: "Jo",
    classId: "warrior",
    gender: "female",
  });
  game.chooseHero(guest.session.playerId, {
    name: "Léa",
    classId: "warrior",
    gender: "female",
  });
  game.chooseHero("bandits", { name: "Rask", classId: "warrior" });
  game.start();
  service.bootstrapGame({ token: host.session.token, snapshot: game.toJSON() });
  const archived = service.saveAndEnd({
    token: host.session.token,
    name: "Soirée au camp",
  });
  assert.equal(archived.lobby.status, "ended");
  service.closeEndedLobby(archived.lobby.code);
  const persistedState = service.exportState();
  service = new LobbyService({
    idFactory: () => `id-${++id}`,
    randomBytesFn: (size) => Buffer.alloc(size, id++),
    now: () => 20_000 + id,
    initialState: persistedState,
  });

  service.selectAccount({ accountId: hostAccount.id, connectionId: "host-2" });
  const nextHost = service.createLobby({
    maxPlayers: 4,
    positionMode: "simulation",
    playerName: "Jo",
    accountId: hostAccount.id,
  });
  const saves = service.listManualSaves({ token: nextHost.session.token });
  assert.equal(saves[0].name, "Soirée au camp");
  const loaded = service.loadManualSave({
    token: nextHost.session.token,
    saveId: saves[0].id,
  });
  assert.equal(
    loaded.lobby.resume.slots.filter(({ claimed }) => claimed).length,
    1,
  );
  const nextGuest = service.joinLobby({
    code: loaded.lobby.code,
    playerName: "Nom ignoré",
    accountId: guestAccount.id,
  });
  assert.equal(nextGuest.session.playerId, guest.session.playerId);
  assert.equal(loaded.lobby.players[0].heroGender, "female");
  assert.equal(
    nextGuest.lobby.players.find((p) => p.id === guest.session.playerId)
      .heroGender,
    "female",
  );
  assert.throws(
    () =>
      service.selectHeroClass({
        token: loaded.session.token,
        heroClassId: "warrior",
        heroGender: "male",
      }),
    { code: "saved_hero_locked" },
  );
  service.setReady({ token: loaded.session.token, ready: true });
  service.setReady({ token: nextGuest.session.token, ready: true });
  const resumed = service.startLobby({ token: loaded.session.token });
  assert.equal(resumed.status, "started");
  assert.equal(service.gameSnapshot(resumed.code).state.heroes.length, 3);
  assert.equal(
    service
      .gameSnapshot(resumed.code)
      .state.heroes.find((h) => h.playerId === host.session.playerId).gender,
    "female",
  );
  const beforeDestruction = service.exportState().manualSaves;
  assert.throws(() => service.destroyGame({ token: nextGuest.session.token }), {
    code: "host_only",
  });
  const destroyed = service.destroyGame({ token: loaded.session.token });
  service.closeEndedLobby(destroyed.lobby.code);
  assert.deepEqual(service.exportState().manualSaves, beforeDestruction);
  assert.equal(service.exportState().lobbies.length, 0);
  assert.throws(() => service.resumeSession({ token: loaded.session.token }));
  assert.throws(() =>
    service.resumeSession({ token: nextGuest.session.token }),
  );
});
