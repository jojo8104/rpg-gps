import assert from "node:assert/strict";
import test from "node:test";
import { createHeroAbilityController } from "../app/js/controllers/hero-ability-controller.js";
import { HeroConcealmentService } from "../app/js/core/hero-concealment-service.js";

function fixture() {
  const calls = [],
    timers = new Map();
  let timerId = 0,
    model,
    messages,
    count = 0,
    accepted = true;
  const targeting = { mode: null };
  const locations = [
    { id: "near", name: "Proche", position: { latitude: 10, longitude: 0 } },
    { id: "far", name: "Lointain", position: { latitude: 12, longitude: 0 } },
  ];
  let session = {
    mode: "simulation",
    localPlayerId: "local",
    battle: null,
    hero: {
      id: "hero",
      playerId: "local",
      classId: "mage",
      state: "active",
      army: { units: [] },
      skillIds: [],
      classFeatureState: {},
    },
    positioning: { position: [0, 0] },
    playAreaGrid: null,
    game: {
      locations,
      autonomousGroups: [],
      unitDefinitions: new Map(),
      setup: { rules: { engagementRadiusMeters: 30 } },
      getWatchBeaconsForPlayer: () => [],
      getPlayer: () => ({ knowsLocation: () => true }),
      inventoryService: {
        getHeroBagState: () => ({ usedSlots: 1, slotCapacity: 10 }),
      },
      placeScoutWatchBeacon: (input) => {
        calls.push(["beacon", input]);
        return { success: true, count: 1, maximum: 3 };
      },
      activateHeroDivination: ({ heroId, center }) => {
        calls.push(["divine", heroId, { center }]);
        return {
          success: true,
          durationMs: 1000,
          revealedLocationIds: ["near"],
          vision: { radius: 10 },
        };
      },
      activateHeroAstralTravel: (input) => {
        calls.push(["astral", input.heroId, input]);
        return { success: true };
      },
      heroClassFeatureService: {
        cooldownRemaining: () => 0,
        astralReachBonus: () => 5,
        watchBeaconRadius: () => 75,
        divine: (hero, input) => {
          calls.push(["divine", hero.id, input]);
          return {
            success: true,
            durationMs: 1000,
            revealedLocationIds: ["near"],
            vision: { radius: 10 },
          };
        },
        activateAstralTravel: (hero, input) => {
          calls.push(["astral", hero.id, input]);
          return { success: true };
        },
      },
    },
  };
  const concealment = new HeroConcealmentService();
  concealment.update({ position: { latitude: 0, longitude: 0 }, at: 0 });
  const controller = createHeroAbilityController({
    getSession: () => session,
    targeting,
    concealment,
    now: () => 30000,
    asGps: (position) =>
      Array.isArray(position)
        ? { latitude: position[0], longitude: position[1] }
        : position,
    distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
    worldDistance: (a, b) =>
      Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude),
    isLocationEnabled: () => true,
    positionFor: (id) => {
      const location = locations.find((location) => location.id === id);
      return [location.position.latitude, location.position.longitude];
    },
    baseRangesFor: () => ({ interactionRadius: 8 }),
    rebuildLocationEngine: () => calls.push(["rebuild"]),
    persistFieldState: () => calls.push(["persist"]),
    selectLocation: (id) => calls.push(["select", id]),
    switchView: (name) => calls.push(["view", name]),
    beginAutonomousBattle: (group, options) => {
      calls.push(["battle", group.id, options]);
      return true;
    },
    onChange: () => calls.push(["render"]),
    logTest: (text) => calls.push(["log", text]),
    deviceAlerts: { notify: (kind) => calls.push(["notify", kind]) },
    focusAlert: (position) => calls.push(["focus", position]),
    confirm: () => accepted,
    schedule: (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    cancel: (id) => timers.delete(id),
    views: {
      create: () => ({
        render: (value) => {
          model = value;
        },
        renderMessages: (value) => {
          count = value;
        },
      }),
      messages: (options) => {
        messages = options;
        return { close: () => calls.push(["close"]) };
      },
    },
  });
  return {
    controller,
    calls,
    timers,
    targeting,
    concealment,
    locations,
    get session() {
      return session;
    },
    replace: (value) => {
      session = value;
    },
    get model() {
      return model;
    },
    get messages() {
      return messages;
    },
    get count() {
      return count;
    },
    confirm: (value) => {
      accepted = value;
    },
  };
}

test("la divination alterne le ciblage et respecte la recharge", () => {
  const f = fixture();
  f.controller.useDivination();
  assert.equal(f.targeting.mode, "target-divination");
  f.controller.useDivination();
  assert.equal(f.targeting.mode, null);
  f.session.game.heroClassFeatureService.cooldownRemaining = () => 61000;
  f.controller.useDivination();
  assert.equal(f.targeting.mode, null);
  assert.match(
    f.calls.filter(([kind]) => kind === "log").at(-1)[1],
    /recharge 1:01/,
  );
});

test("la divination utilise la session courante, révèle les cellules et annule son délai au reset", async () => {
  const f = fixture();
  f.controller.useDivination();
  const visited = [],
    cells = [
      { center: { latitude: 2, longitude: 0 }, visits: 0 },
      { center: { latitude: 30, longitude: 0 }, visits: 0 },
    ];
  f.session.playAreaGrid = {
    cells,
    recordVisit: (center) => visited.push(center),
  };
  f.replace({ ...f.session, hero: { ...f.session.hero, id: "server-hero" } });
  await f.controller.activateDivinationAt({ latitude: 0, longitude: 0 });
  assert.equal(f.calls.find(([kind]) => kind === "divine")[1], "server-hero");
  assert.deepEqual(visited, [cells[0].center]);
  assert.equal(f.targeting.mode, null);
  const expiry = [...f.timers.values()][0];
  f.controller.reset();
  assert.equal(f.timers.size, 0);
  f.calls.length = 0;
  expiry();
  assert.deepEqual(f.calls, []);
});

test("le voyage astral s’active sans choisir de cible automatiquement", async () => {
  const f = fixture();
  await f.controller.useAstralTravel();
  assert.deepEqual(f.calls.find(([kind]) => kind === "astral")[2], {
    playerId: f.session.localPlayerId,
    heroId: f.session.hero.id,
  });
  assert.equal(f.calls.some(([kind]) => kind === "select"), false);
});

test("la divination n'affiche ni découverte ni succès avant confirmation du serveur", async () => {
  const f = fixture();
  const visits = [];
  f.session.playAreaGrid = {
    cells: [{ center: { latitude: 0, longitude: 0 }, visits: 0 }],
    recordVisit: (position) => visits.push(position),
  };
  let complete;
  f.session.game.activateHeroDivination = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  const pending = f.controller.activateDivinationAt({
    latitude: 0,
    longitude: 0,
  });
  assert.deepEqual(visits, []);
  assert.deepEqual(f.calls, []);
  complete({
    success: true,
    durationMs: 1000,
    revealedLocationIds: ["near"],
    vision: { radius: 10 },
  });
  await pending;
  assert.equal(visits.length, 1);
  assert.ok(f.calls.some(([kind]) => kind === "log"));
});

test("les pouvoirs sont inactifs pendant un combat ou pour un fantôme", () => {
  const f = fixture();
  f.session.battle = { status: "active" };
  f.controller.useDivination();
  f.controller.useAstralTravel();
  f.controller.launchPreparedAmbush();
  assert.deepEqual(f.calls, []);
  f.session.battle = null;
  f.session.hero.state = "ghost";
  f.controller.useDivination();
  assert.deepEqual(f.calls, []);
  assert.equal(f.controller.render().classPowerUnavailable, true);
});

test("l'embuscade vise depuis la position du héros puis ouvre le duel avec le résultat du moteur", () => {
  const f = fixture();
  f.session.hero.classId = "warrior";
  f.session.game.autonomousGroups = [
    {
      id: "own",
      owner: { id: "local" },
      status: "moving",
      position: { latitude: 1, longitude: 0 },
      cargo: [],
    },
    {
      id: "enemy",
      owner: { id: "bandits" },
      status: "moving",
      position: { latitude: 3, longitude: 0 },
      cargo: [],
    },
  ];
  f.controller.launchPreparedAmbush();
  f.controller.render();
  assert.equal(f.model.ambushTarget.group.id, "enemy");
  assert.equal(f.model.ambushTarget.distance, 3);
  assert.equal(f.session.hero.classFeatureState.gpsConcealmentMultiplier, 0.6);
  assert.equal(
    f.calls.some(([kind]) => kind === "battle"),
    false,
  );
  f.controller.launchPreparedAmbush();
  const battle = f.calls.find(([kind]) => kind === "battle");
  assert.equal(battle[1], "enemy");
  assert.ok(battle[2].ambushResult.level);
  f.controller.render();
  assert.equal(f.model.prepared, null);
});

test("la vigie déduplique les événements reçus et invalide le recentrage d'une ancienne fenêtre", () => {
  const f = fixture();
  const event = {
    ownerPlayerId: "local",
    at: 10,
    target: {
      key: "hero-a",
      kind: "hero",
      name: "Ada",
      position: { latitude: 1, longitude: 2 },
    },
  };
  f.controller.handleWatchBeaconEvents([
    event,
    event,
    { ...event, ownerPlayerId: "other" },
  ]);
  assert.equal(f.count, 1);
  f.controller.openWatchMessages();
  assert.equal(f.count, 0);
  assert.equal(f.messages.messages.length, 1);
  f.messages.onFocus(event.target.position);
  assert.deepEqual(
    f.calls.find(([kind]) => kind === "focus"),
    ["focus", event.target.position],
  );
  const focus = f.messages.onFocus;
  f.controller.reset();
  f.calls.length = 0;
  focus(event.target.position);
  assert.deepEqual(f.calls, []);
});

test("poser une balise conserve la confirmation et adapte le rayon de simulation", () => {
  const f = fixture();
  f.session.hero.classId = "ranger";
  f.confirm(false);
  f.controller.placeWatchBeacon();
  assert.equal(
    f.calls.some(([kind]) => kind === "beacon"),
    false,
  );
  f.confirm(true);
  f.controller.placeWatchBeacon();
  assert.equal(f.calls.find(([kind]) => kind === "beacon")[1].radius, 8);
  f.session.mode = "gps";
  f.session.positioning.position = { latitude: 48, longitude: 2 };
  f.controller.placeWatchBeacon();
  assert.equal(
    f.calls.filter(([kind]) => kind === "beacon").at(-1)[1].radius,
    75,
  );
});

test("la dissimulation repart de zéro après un changement de partie", () => {
  const f = fixture();
  f.controller.launchPreparedAmbush();
  assert.equal(f.concealment.concealed, true);
  f.controller.reset();
  assert.equal(f.concealment.concealed, false);
  assert.equal(f.concealment.lastPosition, null);
  assert.equal(f.concealment.canConceal(100000), false);
  assert.equal(f.model, null);
});
