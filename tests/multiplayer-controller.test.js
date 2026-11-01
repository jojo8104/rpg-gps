import assert from "node:assert/strict";
import test from "node:test";
import { createMultiplayerController } from "../app/js/controllers/multiplayer-controller.js";
import { createQuickGameSetup } from "../app/js/ui/game-setup-view.js";

function fixture() {
  const calls = [],
    listeners = {},
    timers = [];
  let lobbyCallbacks;
  const client = {
    sendWorldState: async (snapshot) => calls.push(["publish", snapshot]),
    bootstrapGame: async (snapshot) => calls.push(["bootstrap", snapshot]),
    sendGameCommand: async (name, args) => {
      calls.push(["command", name, args]);
      return { result: { success: true } };
    },
    requestGameState: async () => calls.push(["resync"]),
    saveAndEnd: async (name) => calls.push(["save", name]),
  };
  for (const name of ["Positions", "WorldState", "GameState", "GameSaved"])
    client[`on${name}`] = (callback) => {
      listeners[name] = callback;
      return () => {
        delete listeners[name];
      };
    };
  let session = {
    ready: true,
    mode: "simulation",
    locationPositions: new Map(),
    game: {
      status: "started",
      value: 1,
      locations: [{ id: "camp", position: { latitude: 1, longitude: 2 } }],
      toJSON() {
        return { value: this.value };
      },
    },
  };
  const options = {
    getSession: () => session,
    createClient: () => client,
    createLobby: (root, client, callbacks) => {
      lobbyCallbacks = callbacks;
      return { initialize() {}, showChoice: () => calls.push(["choice"]) };
    },
    adoptGame: (game) => {
      session = { ...session, game };
    },
    rebuildWorld: () => {
      calls.push(["rebuild"]);
      return true;
    },
    onRender: (event) => calls.push(["render", event]),
    onPositions: () => calls.push(["positions"]),
    onResume: () => calls.push(["resume"]),
    onSolo: () => calls.push(["solo"]),
    onLaunch: (launch) => calls.push(["launch", launch]),
    onSaved: () => calls.push(["saved"]),
    onUnavailable: () => calls.push(["unavailable"]),
    onLog: (message) => calls.push(["log", message]),
    onError: () => calls.push(["error"]),
    restoreGame: (snapshot) => snapshot,
    applyWorldState: (game, snapshot) => snapshot.locations,
    createWorldState: (game) => ({
      value: game.value,
      locations: game.locations,
    }),
    fingerprint: (snapshot) => JSON.stringify(snapshot),
    schedule: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    cancel: (timer) => {
      if (timer) timer.cancelled = true;
    },
  };
  const controller = createMultiplayerController(options);
  controller.initialize();
  return {
    controller,
    client,
    calls,
    listeners,
    timers,
    options,
    get session() {
      return session;
    },
    replace(value) {
      session = value;
    },
    get lobby() {
      return lobbyCallbacks;
    },
  };
}

test("la connexion conserve les snapshots avant la création du monde et applique l'état officiel quand le jeu est prêt", () => {
  const f = fixture();
  f.replace({ ...f.session, ready: false });
  const game = f.session.game;
  f.listeners.GameState({ state: game });
  assert.equal(f.controller.pendingGame, game);
  assert.deepEqual(f.calls, []);
  f.controller.begin({ isHost: false, resumesSavedGame: true });
  f.replace({ ...f.session, ready: true });
  f.listeners.GameState({ state: game });
  assert.equal(f.controller.authoritative, true);
  assert.deepEqual(f.session.locationPositions.get("camp"), [1, 2]);
  assert.equal(f.calls.at(-1)[0], "resume");
});

test("la transition au solo et la fin sauvegardée nettoient la session réseau", () => {
  const f = fixture();
  f.controller.begin({ isHost: true });
  f.listeners.Positions({ positions: [{ playerId: "other" }] });
  f.listeners.GameSaved({ message: "saved" });
  assert.equal(f.controller.active, false);
  assert.deepEqual(f.controller.positions, []);
  assert.deepEqual(f.calls.slice(-2), [["saved"], ["choice"]]);
  f.controller.begin({ isHost: true });
  f.lobby.onSolo();
  assert.equal(f.controller.active, false);
  assert.deepEqual(f.calls.at(-1), ["solo"]);
});

test("les snapshots de lieux sont dédupliqués et ignorés après passage au moteur officiel", () => {
  const f = fixture();
  const snapshot = { locations: f.session.game.locations };
  assert.equal(f.controller.applyWorld(snapshot), true);
  assert.equal(f.controller.applyWorld(snapshot), false);
  f.controller.applyGame(f.session.game, { renderNow: false });
  assert.equal(f.controller.applyWorld({ locations: [] }), false);
});

test("les publications sont différées, relisent le jeu courant et s'arrêtent au changement de partie", () => {
  const f = fixture();
  f.controller.queuePublish();
  assert.equal(f.timers.length, 0, "pas de publication en solo");
  f.controller.begin({ isHost: true });
  f.controller.queuePublish();
  const first = f.timers.at(-1);
  f.replace({ ...f.session, game: { ...f.session.game, value: 2 } });
  first.callback();
  assert.equal(f.calls.at(-1)[1].value, 2);
  f.controller.queuePublish();
  assert.equal(f.timers.length, 1, "pas de publication identique");
  f.replace({ ...f.session, game: { ...f.session.game, value: 3 } });
  f.controller.queuePublish();
  const old = f.timers.at(-1);
  f.controller.begin(null);
  assert.equal(old.cancelled, true);
  const count = f.calls.length;
  old.callback();
  assert.equal(f.calls.length, count);
});

test("un échec de publication réessaie seulement dans la même partie", async () => {
  const f = fixture();
  let fail;
  f.client.sendWorldState = () =>
    new Promise((resolve, reject) => {
      fail = reject;
    });
  f.controller.begin({ isHost: true });
  f.controller.queuePublish();
  f.timers.at(-1).callback();
  f.controller.reset();
  const count = f.timers.length;
  fail(new Error("offline"));
  await Promise.resolve();
  assert.equal(f.timers.length, count);
});

test("seul l'hôte amorce le moteur serveur et une ancienne erreur ne change pas la nouvelle session", async () => {
  const f = fixture();
  f.controller.begin({ isHost: false });
  await f.controller.bootstrap();
  assert.deepEqual(f.calls, []);
  let fail;
  f.client.bootstrapGame = () =>
    new Promise((resolve, reject) => {
      fail = reject;
    });
  f.controller.begin({ isHost: true });
  const pending = f.controller.bootstrap();
  assert.equal(f.controller.bootstrapping, true);
  f.controller.begin({ isHost: true });
  fail(new Error("offline"));
  await pending;
  assert.equal(f.controller.bootstrapping, false);
  assert.deepEqual(f.calls, []);
});

test("le proxy attend le résultat serveur sans calcul local, puis invalide une ancienne partie", async () => {
  const f = fixture();
  f.controller.begin({ isHost: true });
  const game = {
    ...f.session.game,
    recruitUnit: () => {
      throw new Error("calcul local interdit");
    },
    query: () => "value",
  };
  f.controller.applyGame(game, { renderNow: false });
  assert.equal(f.session.game.query(), "value");
  assert.deepEqual(await f.session.game.recruitUnit({ id: "unit" }), {
    success: true,
  });
  assert.equal(f.calls.at(-1)[1], "recruitUnit");
  const old = f.session.game;
  f.controller.begin(null);
  assert.throws(() => old.recruitUnit({}), /plus active/);
});

test("une réponse de commande d'une partie précédente est ignorée", async () => {
  const f = fixture();
  f.controller.begin({ isHost: true });
  f.controller.applyGame(f.session.game, { renderNow: false });
  let complete;
  f.client.sendGameCommand = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  const pending = f.controller.execute("divineAtAcademy", {});
  f.controller.begin(null);
  f.calls.length = 0;
  complete({ result: { success: true }, game: { state: { invalid: true } } });
  assert.equal(await pending, null);
  assert.deepEqual(f.calls, []);
});

test("une commande attend l'état officiel et déduplique les clics en cours", async () => {
  const f = fixture();
  f.controller.begin({ isHost: true });
  const game = {
    ...f.session.game,
    recruitUnit() {
      this.value++;
    },
  };
  f.controller.applyGame(game, { renderNow: false });
  const proxy = f.session.game;
  let complete,
    requests = 0;
  f.client.sendGameCommand = () => {
    requests++;
    return new Promise((resolve) => {
      complete = resolve;
    });
  };
  const first = proxy.recruitUnit({ id: "unit" });
  const second = proxy.recruitUnit({ id: "unit" });
  assert.equal(first, second);
  assert.equal(requests, 1);
  assert.equal(proxy.value, 1);
  complete({
    result: { success: true, server: true },
    game: { state: { ...game, value: 7 } },
  });
  assert.deepEqual(await first, { success: true, server: true });
  assert.equal(
    proxy.value,
    7,
    "les anciennes références lisent le dernier état confirmé",
  );
});

test("une commande refusée ne modifie pas le jeu et demande une resynchronisation", async () => {
  const f = fixture();
  f.controller.begin({ isHost: true });
  const game = {
    ...f.session.game,
    recruitUnit() {
      this.value++;
    },
  };
  f.controller.applyGame(game, { renderNow: false });
  f.client.sendGameCommand = async () => {
    throw new Error("offline");
  };
  await assert.rejects(f.session.game.recruitUnit({ id: "unit" }), /offline/);
  assert.equal(f.session.game.value, 1);
  assert.ok(f.calls.some((call) => call[0] === "resync"));
});

test("le solo prépare une identité serveur sans lancer deux fois la partie", async () => {
  const f = fixture();
  const room = {
    code: "SOLO1",
    status: "started",
    hostPlayerId: "server-player",
    launch: {
      id: "solo-launch",
      seed: "solo-seed",
      configuration: {
        positionMode: "simulation",
        gameType: "cooperation",
        difficulty: "normal",
        scenarioId: "chaos",
        solo: true,
      },
      players: [{ id: "server-player", name: "Alice", heroClassId: "warrior" }],
    },
  };
  f.client.createSolo = async (input) => {
    assert.equal(input.heroClassId, "warrior");
    f.lobby.onStart({ lobby: room, playerId: "server-player" });
    return { lobby: room, session: { playerId: "server-player" } };
  };
  const launch = await f.controller.prepareSolo({
    setup: createQuickGameSetup(),
    heroChoice: { name: "Alice", classId: "warrior" },
    positionMode: "simulation",
  });
  assert.equal(launch.localPlayerId, "server-player");
  assert.equal(launch.solo, true);
  assert.equal(
    f.calls.some(([name]) => name === "launch"),
    false,
  );
});

test("un solo ne démarre pas quand le serveur refuse sa création", async () => {
  const f = fixture();
  f.client.createSolo = async () => {
    throw new Error("Serveur indisponible");
  };
  await assert.rejects(
    f.controller.prepareSolo({
      setup: createQuickGameSetup(),
      heroChoice: { name: "Alice", classId: "warrior" },
      positionMode: "simulation",
    }),
    /indisponible/,
  );
  assert.equal(f.controller.active, false);
});

test("l'indisponibilité du transport remonte au raccord d'interface", () => {
  let error;
  const controller = createMultiplayerController({
    createClient: () => {
      throw new Error("offline");
    },
    onUnavailable: (value) => {
      error = value;
    },
  });
  controller.initialize();
  assert.equal(error.message, "offline");
});

test("les fiches de classes sont transmises au lobby avant ou après son initialisation", () => {
  const { options } = fixture();
  const received = [];
  const controller = createMultiplayerController({
    ...options,
    createLobby: () => ({
      initialize() {},
      setHeroClasses: (classes) => received.push(classes),
    }),
  });
  const initial = [{ id: "warrior" }];
  controller.setHeroClasses(initial);
  controller.initialize();
  assert.deepEqual(received, [initial]);
  const updated = [{ id: "mage" }];
  controller.setHeroClasses(updated);
  assert.deepEqual(received, [initial, updated]);
});
