import { retireInteriorExceptionalSites } from "../app/js/core/exploration-exterior-migration.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { ExplorationState } from "../app/js/core/exploration-state.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { ServerStateStore } from "../server/persistence/server-state-store.js";
import { explorationSnapshot } from "./fixtures/exploration-state.js";
import { launchScenarios } from "../server/lobby/scenario-catalog.js";

function startedLobby() {
  let id = 0;
  const options = {
    idFactory: () => `exploration-${++id}`,
    randomBytesFn: (size) => Buffer.alloc(size, ++id),
    now: () => 1000,
  };
  const service = new LobbyService(options);
  const account = service.createAccount({ name: "Alice" });
  const host = service.createLobby({
    playerName: "Alice",
    accountId: account.id,
    maxPlayers: 4,
    positionMode: "simulation",
  });
  service.selectHeroClass({
    token: host.session.token,
    heroClassId: "warrior",
  });
  service.setReady({ token: host.session.token, ready: true });
  const started = service.startLobby({ token: host.session.token });
  const game = new Game({
    setup: createMultiplayerLaunch(started).setup,
    coordinateMode: "simulation",
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
  });
  for (const player of game.players)
    game.chooseHero(player.id, { name: player.name, classId: "warrior" });
  game.start();
  return { service, options, host, game, account };
}

test("le navigateur ne peut injecter aucun état privé, même avec une version invalide", () => {
  for (const explorationState of [
    explorationSnapshot(),
    { version: 999, rewards: "forgées" },
  ]) {
    const { service, host, game } = startedLobby();
    service.bootstrapGame({
      token: host.session.token,
      snapshot: { ...game.toJSON(), explorationState },
    });
    const generated = service.gameSnapshot(host.lobby.code).state
      .explorationState;
    assert.ok(generated.generation && generated.cells.length > 0);
    assert.notEqual(
      generated.generation.seed,
      explorationState.generation?.seed,
    );
    assert.deepEqual(generated.discoveries, []);
    assert.ok(generated.clues.length > 0);
    assert.ok(generated.clues.every((clue) => clue.holder === null));
    assert.ok(
      generated.clues.every(
        (clue) =>
          !explorationState.clues?.some((injected) => injected.id === clue.id),
      ),
    );
    assert.deepEqual(generated.expeditions, []);
  }
});

test("un lancement serveur de scénario génère une fois le terrain et garde ses secrets privés", () => {
  const service = new LobbyService({ now: () => 1000 });
  const host = service.createLobby({
    playerName: "Alice",
    positionMode: "simulation",
  });
  const scenario = launchScenarios.find((entry) => entry.id !== "chaos");
  assert.ok(scenario);
  service.updateConfiguration({
    token: host.session.token,
    configuration: { scenarioId: scenario.id },
  });
  service.selectHeroClass({
    token: host.session.token,
    heroClassId: "warrior",
  });
  service.setReady({ token: host.session.token, ready: true });
  const started = service.startLobby({ token: host.session.token });
  const snapshot = service.gameSnapshot(started.code);
  assert.ok(snapshot.state.explorationState.generation);
  assert.ok(snapshot.state.explorationState.cells.length > 0);
  const before = snapshot.state.explorationState;
  const ignored = service.bootstrapGame({
    token: host.session.token,
    snapshot: { explorationState: { version: 999 } },
  });
  assert.deepEqual(ignored.state.explorationState, before);
  const packet = service.projectForPlayer(host.session.token, {
    game: snapshot,
  });
  assert.equal(Object.hasOwn(packet.game.state, "explorationState"), false);
  assert.equal(JSON.stringify(packet).includes(before.generation.seed), false);
});

test("un terrain généré survit à la reprise de Game sans changer son tirage", () => {
  const { service, host, game } = startedLobby();
  service.bootstrapGame({ token: host.session.token, snapshot: game.toJSON() });
  const before = service.gameSnapshot(host.lobby.code).state;
  const restored = Game.fromJSON(JSON.parse(JSON.stringify(before)), {
    now: () => 50000,
  });
  assert.deepEqual(restored.explorationState.toJSON(), before.explorationState);
  assert.deepEqual(
    restored.locations.map((location) => location.toJSON()),
    before.locations,
  );
  assert.deepEqual(restored.explorationState.discoveries, []);
});

test("un redémarrage depuis le disque conserve l’exploration officielle, sans gain ni nouveau tirage", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "rpg-exploration-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const { service, options, host, game } = startedLobby();
  service.bootstrapGame({ token: host.session.token, snapshot: game.toJSON() });
  // Une sauvegarde serveur officielle, distincte de l’initialisation navigateur.
  const saved = service.exportState();
  saved.lobbies[0].game.explorationState = new ExplorationState(
    explorationSnapshot(),
  ).toJSON();
  const store = new ServerStateStore({ directory });
  store.schedule(saved);
  await store.flush();
  const reloaded = new LobbyService({
    ...options,
    now: () => 900000,
    initialState: store.loadSync(),
  });
  const restored = reloaded.gameSnapshot(host.lobby.code).state;
  const expected = structuredClone(saved.lobbies[0].game.explorationState);
  assert.equal(retireInteriorExceptionalSites(expected), 1);
  assert.deepEqual(restored.explorationState, expected);
  assert.deepEqual(restored.heroes, saved.lobbies[0].game.heroes);
  assert.deepEqual(restored.eventLog, saved.lobbies[0].game.eventLog);
  const packet = reloaded.projectForPlayer(host.session.token, {
    game: { state: restored },
  });
  assert.equal(Object.hasOwn(packet.game.state, "explorationState"), false);
});

test("sauvegarder, quitter puis reprendre conserve l’exploration et les récompenses déjà traitées", () => {
  const { service, options, host, game, account } = startedLobby();
  service.bootstrapGame({ token: host.session.token, snapshot: game.toJSON() });
  const saved = service.exportState();
  const expected = new ExplorationState(explorationSnapshot()).toJSON();
  saved.lobbies[0].game.explorationState = structuredClone(expected);
  assert.equal(retireInteriorExceptionalSites(expected), 1);
  const official = new LobbyService({ ...options, initialState: saved });
  const archived = official.saveAndEnd({
    token: host.session.token,
    name: "Exploration suspendue",
  });
  assert.deepEqual(
    official.exportState().manualSaves[0].game.explorationState,
    expected,
  );
  official.closeEndedLobby(host.lobby.code);
  const restarted = new LobbyService({
    ...options,
    initialState: official.exportState(),
  });
  const next = restarted.createLobby({
    playerName: "Alice",
    accountId: account.id,
    maxPlayers: 4,
    positionMode: "simulation",
  });
  const loaded = restarted.loadManualSave({
    token: next.session.token,
    saveId: archived.save.id,
  });
  restarted.setReady({ token: loaded.session.token, ready: true });
  const resumed = restarted.startLobby({ token: loaded.session.token });
  const result = restarted.gameSnapshot(resumed.code).state;
  assert.deepEqual(result.explorationState, expected);
  assert.deepEqual(result.heroes, saved.lobbies[0].game.heroes);
});
