import assert from "node:assert/strict";
import test from "node:test";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";

test("une partie accueille un joueur et transmet le rythme sportif", () => {
  const service = new LobbyService();
  const host = service.createLobby({
    maxPlayers: 4,
    positionMode: "simulation",
    playerName: "Solo",
    connectionId: "host",
    maxPlayers: 1,
  });
  const token = host.session.token;
  service.updateConfiguration({
    token,
    configuration: {
      maxPlayers: 1,
      travelPaceMode: "sport",
      scenarioId: "chaos",
    },
  });
  service.selectHeroClass({ token, heroClassId: "warrior" });
  service.setReady({ token, ready: true });
  const lobby = service.startLobby({ token });
  const launch = createMultiplayerLaunch(lobby);
  assert.equal(launch.heroChoices.length, 1);
  assert.equal(launch.setup.rules.travelPaceMode, "sport");
});

test("un duel exige encore deux joueurs", () => {
  const service = new LobbyService();
  const host = service.createLobby({
    maxPlayers: 4,
    positionMode: "simulation",
    playerName: "Solo",
    connectionId: "host",
  });
  service.updateConfiguration({
    token: host.session.token,
    configuration: { gameType: "duel" },
  });
  assert.throws(() => service.startLobby({ token: host.session.token }), {
    code: "not_enough_players",
  });
});

test("effacer un joueur persiste et protège les profils utilisés ailleurs", () => {
  const service = new LobbyService();
  const account = service.createAccount({ name: "Alice" });
  service.selectAccount({ accountId: account.id, connectionId: "owner" });
  assert.throws(
    () =>
      service.deleteAccount({ accountId: account.id, connectionId: "other" }),
    { code: "account_in_use" },
  );
  service.deleteAccount({ accountId: account.id, connectionId: "owner" });
  assert.deepEqual(
    new LobbyService({ initialState: service.exportState() }).listAccounts(),
    [],
  );
});

test("un profil dans une partie doit la quitter avant suppression", () => {
  const service = new LobbyService();
  const account = service.createAccount({ name: "Alice" });
  service.createLobby({
    maxPlayers: 4,
    positionMode: "simulation",
    accountId: account.id,
    connectionId: "owner",
  });
  assert.throws(
    () =>
      service.deleteAccount({ accountId: account.id, connectionId: "owner" }),
    { code: "account_in_lobby" },
  );
});

test("les anciens scénarios indépendants ne sont plus proposés", () => {
  const service = new LobbyService();
  const host = service.createLobby({
    maxPlayers: 4,
    positionMode: "simulation",
    playerName: "Alice",
    connectionId: "owner",
  });
  assert.throws(
    () =>
      service.updateConfiguration({
        token: host.session.token,
        configuration: { scenarioId: "repression" },
      }),
    { code: "invalid_scenario" },
  );
});
