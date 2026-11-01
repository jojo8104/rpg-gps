import assert from "node:assert/strict";
import test from "node:test";
import { createPositionController } from "../app/js/controllers/position-controller.js";

const asGps = (position) =>
  Array.isArray(position)
    ? { latitude: position[0], longitude: position[1] }
    : position;

test("le GPS affiche immédiatement la mesure sans changer le héros ni reculer au retour serveur", async () => {
  const displays = [];
  const f = fixture({ onDisplayPosition: (...args) => displays.push(args) });
  f.session.mode = "gps";
  f.session.authoritative = true;
  f.session.hero.position = { latitude: 48, longitude: 2 };
  let acknowledge;
  f.session.client = {
    sendPosition: () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
  };
  f.controller.rebuild();
  const measured = { latitude: 48.001, longitude: 2.002, accuracy: 5 };
  const pending = f.controller.apply(measured);
  assert.deepEqual(displays[0][0], { latitude: 48.001, longitude: 2.002 });
  assert.deepEqual(f.session.hero.position, { latitude: 48, longitude: 2 });
  assert.equal(
    f.calls.some(([name]) => name === "location"),
    false,
  );
  f.session.hero.position = {
    latitude: 48.0005,
    longitude: 2.001,
    accuracy: 9,
  };
  f.controller.syncOfficialPosition();
  assert.deepEqual(f.controller.displayPosition, {
    latitude: 48.001,
    longitude: 2.002,
  });
  assert.equal(f.controller.accuracy, 5);
  acknowledge(null);
  await pending;
  assert.deepEqual(f.controller.position, {
    latitude: 48.0005,
    longitude: 2.001,
  });
  assert.equal(
    f.calls.some(([name]) => name === "scenario" || name === "location"),
    false,
  );
  f.controller.reset();
  assert.equal(f.controller.displayPosition, null);
});

test("un refus réseau conserve le pion mesuré sans déclencher une interaction", async () => {
  const f = fixture();
  f.session.mode = "gps";
  f.session.authoritative = true;
  f.session.hero.position = { latitude: 48, longitude: 2 };
  f.session.client = {
    sendPosition: async () => {
      throw new Error("Hors connexion");
    },
  };
  await f.controller.apply({ latitude: 49, longitude: 3, accuracy: 6 });
  assert.deepEqual(f.controller.displayPosition, {
    latitude: 49,
    longitude: 3,
  });
  assert.deepEqual(f.controller.position, { latitude: 48, longitude: 2 });
  assert.equal(
    f.calls.some(([name]) => name === "location" || name === "scenario"),
    false,
  );
});

test("la carte affiche la position officielle avant la fin des commandes de quête", async () => {
  const f = fixture();
  f.session.authoritative = true;
  f.session.client = {
    sendPosition: async () => ({
      positions: {
        positions: [
          { playerId: "player", position: { latitude: 3, longitude: 4 } },
        ],
      },
    }),
  };
  f.session.hero.updatePosition = () => {
    throw new Error("Mutation locale du héros officiel");
  };
  let release;
  f.session.game.updateScenarioPosition = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  f.controller.rebuild();
  const pending = f.controller.apply([1, 2]);
  while (!release) await Promise.resolve();
  assert.deepEqual(f.controller.position, [3, 4]);
  assert.ok(f.calls.some(([name]) => name === "render"));
  assert.deepEqual(
    f.calls.find(([name]) => name === "follow"),
    ["follow", [3, 4]],
  );
  release(null);
  await pending;
});

test("les déplacements continuent sans envoyer de commande de quête désactivée", async () => {
  const f = fixture();
  f.session.game.questSystemEnabled = false;
  f.session.game.updateScenarioPosition = () => {
    throw new Error("Commande de quête interdite");
  };
  await f.controller.rebuild();
  await f.controller.apply([1, 2]);
  assert.deepEqual(f.controller.position, [1, 2]);
  assert.equal(
    f.calls.some(([name]) => name === "location"),
    true,
  );
  assert.deepEqual(f.calls.at(-1), ["render", { background: true }]);
});
function fixture(overrides = {}) {
  const calls = [];
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args]);
  const hero = {
    id: "hero",
    classFeatureState: {},
    updatePosition: record("hero"),
  };
  let session = {
    hero,
    playerId: "player",
    mode: "simulation",
    setupActive: false,
    authoritative: false,
    field: { updatePosition: () => null },
    playAreaPresence: { update: () => null },
    game: {
      status: "started",
      locations: [{ id: "camp" }],
      inventoryService: { getHeroBagState: () => ({ usedSlots: 0 }) },
      autonomousGroupTraces: [],
      scanWatchBeacons: () => [],
      updateScenarioPosition: () => [],
      getPlayer: () => ({}),
      heroClassFeatureService: {
        signatureMultiplier: () => 1,
        visionRadius: () => 150,
      },
    },
  };
  const controller = createPositionController({
    getSession: () => session,
    now: () => 1000,
    heroTraceService: { recordMovement: () => [] },
    heroConcealmentService: { update: () => ({}), signatureMultiplier: 1 },
    mappedLocations: () => [],
    isLocationEnabled: () => true,
    positionFor: () => [0, 0],
    radiusFor: () => 8,
    distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
    asGps,
    onTravelReward: record("travel"),
    onWatchEvents: record("watch"),
    onAmbushCancelled: record("ambush"),
    onFollow: record("follow"),
    onChange: record("render"),
    onAreaEvent: record("area"),
    onFieldQuest: record("field"),
    onScenarioPlacements: record("scenario"),
    onPersist: record("persist"),
    onQuestSearch: record("search"),
    onLocationEvent: record("location"),
    onMessage: record("message"),
    onLog: record("log"),
    ...overrides,
  });
  return {
    controller,
    session,
    calls,
    replace(value) {
      session = value;
    },
  };
}

test("le pion suit les nouveaux états officiels même sans callback GPS local", () => {
  const f = fixture();
  f.session.mode = "gps";
  f.session.authoritative = true;
  f.session.hero.position = { latitude: 48, longitude: 2, accuracy: 6 };
  assert.equal(f.controller.syncOfficialPosition(), true);
  assert.deepEqual(f.controller.position, { latitude: 48, longitude: 2 });
  assert.equal(f.controller.accuracy, 6);
  f.session.hero = {
    ...f.session.hero,
    position: { latitude: 48.001, longitude: 2.002, accuracy: 8 },
  };
  f.controller.syncOfficialPosition();
  assert.deepEqual(f.controller.position, {
    latitude: 48.001,
    longitude: 2.002,
  });
  assert.equal(f.controller.accuracy, 8);
  assert.deepEqual(f.calls.at(-1), ["follow", f.controller.position]);
});

test("les états officiels ne déplacent pas le pion pendant le placement GPS", () => {
  const f = fixture();
  f.session.setupActive = true;
  f.session.hero.position = { latitude: 48, longitude: 2 };
  f.controller.position = [1, 2];
  assert.equal(f.controller.syncOfficialPosition(), false);
  assert.deepEqual(f.controller.position, [1, 2]);
});

test("les déplacements normalisent les positions et remontent les événements de proximité", async () => {
  const f = fixture();
  await f.controller.rebuild();
  await f.controller.apply({ latitude: 1, longitude: 2 });
  assert.deepEqual(f.controller.position, [1, 2]);
  assert.equal(f.controller.accuracy, null);
  assert.equal(
    f.calls.find(([name]) => name === "location")[1].type,
    "LocationEntered",
  );
  assert.deepEqual(f.calls.at(-1), ["render", { background: true }]);
});

test("les états serveur conservent la présence sans rouvrir la fiche du lieu", async () => {
  const f = fixture();
  f.controller.rebuild();
  await f.controller.apply([1, 2]);
  f.session.game.locations = [{ id: "camp" }];
  f.controller.rebuild();
  await f.controller.apply([1, 2]);
  await f.controller.apply([20, 20]);
  assert.deepEqual(
    f.calls
      .filter(([name]) => name === "location")
      .map(([, event]) => event.type),
    ["LocationEntered", "LocationExited"],
  );
});

test("une position dépassée attendue du serveur ne produit pas de fiche tardive", async () => {
  const acknowledgements = [];
  const f = fixture();
  f.session.authoritative = true;
  f.session.client = {
    sendPosition: () =>
      new Promise((resolve) => acknowledgements.push(resolve)),
  };
  f.controller.rebuild();
  const first = f.controller.apply([0, 0]);
  const latest = f.controller.apply([20, 20]);
  assert.equal(
    f.calls.some(([name]) => name === "location"),
    false,
  );
  acknowledgements[1]();
  await latest;
  acknowledgements[0]();
  await first;
  assert.equal(
    f.calls.some(([name]) => name === "location"),
    false,
  );
  assert.deepEqual(f.controller.position, [20, 20]);
});

test("une entrée retardée devient obsolète après la sortie du lieu", async () => {
  let release, entryContext;
  const f = fixture({
    onLocationEvent: (event, context) => {
      if (event.type === "LocationEntered") {
        entryContext = context;
        return new Promise((resolve) => {
          release = resolve;
        });
      }
    },
  });
  f.controller.rebuild();
  const entry = f.controller.apply([0, 0]);
  while (!release) await Promise.resolve();
  assert.equal(entryContext.isCurrent(), true);
  await f.controller.apply([20, 20]);
  assert.equal(entryContext.isCurrent(), false);
  release();
  await entry;
  assert.equal(f.calls.filter(([name]) => name === "render").length, 1);
});

test("une position filtrée par la limite réseau ne déclenche pas une interaction non confirmée", async () => {
  const f = fixture();
  f.session.authoritative = true;
  f.session.client = { sendPosition: async () => null };
  f.controller.rebuild();
  await f.controller.apply([0, 0]);
  assert.equal(
    f.calls.some(([name]) => name === "location" || name === "scenario"),
    false,
  );
});

test("la préparation actualise le pion sans progression de quête ni découverte", async () => {
  const f = fixture();
  f.session.setupActive = true;
  await f.controller.apply([1, 2]);
  assert.equal(
    f.calls.some(([name]) => name === "scenario"),
    false,
  );
  assert.equal(
    f.calls.some(([name]) => name === "location"),
    false,
  );
  assert.deepEqual(f.calls.at(-1), ["render"]);
});

test("la marche GPS transmet la précision au serveur sans recalculer la récompense localement", async () => {
  const f = fixture();
  let travel, network;
  f.replace({
    ...f.session,
    mode: "gps",
    authoritative: true,
    heading: 40,
    hero: { ...f.session.hero, id: "new-hero" },
    client: {
      sendPosition: (input) => {
        network = input;
        return Promise.resolve();
      },
    },
    game: {
      ...f.session.game,
      recordHeroTravel: (input) => {
        travel = input;
        return { experienceGained: 1, totalDistanceMeters: 30 };
      },
    },
  });
  await f.controller.rebuild();
  await f.controller.apply({ latitude: 48, longitude: 2, accuracy: 7 });
  assert.equal(travel, undefined);
  assert.equal(network.accuracy, 7);
  assert.equal(network.heading, 40);
  assert.equal(
    f.calls.some(([name]) => name === "watch"),
    false,
  );
  assert.equal(f.controller.accuracy, 7);
});

test("les passages dans une même cellule sont comptés une seule fois jusqu'à réinitialisation", async () => {
  const f = fixture();
  let visits = 0;
  f.session.grid = {
    revealWithinRadius: () => [],
    getCellAt: () => ({ id: "cell" }),
    recordVisit: () => ({ visits: ++visits }),
  };
  await f.controller.rebuild();
  await f.controller.apply([1, 2]);
  await f.controller.apply([1, 2]);
  assert.equal(visits, 1);
  await f.controller.resetVisited();
  await f.controller.apply([1, 2]);
  assert.equal(visits, 2);
});
