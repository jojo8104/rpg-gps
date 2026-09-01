import assert from "node:assert/strict";
import test from "node:test";
import { Hero } from "../app/js/core/hero.js";
import { HeroClassFeatureService } from "../app/js/core/hero-class-feature-service.js";
import { Game } from "../app/js/core/game.js";

const classes = [
  {
    id: "ranger",
    features: {
      visionRadius: 75,
      detectionMultiplier: 1.5,
      concealmentMultiplier: 0.65,
      informationLevelBonus: 1,
      ignoresAmbushPenalty: true,
    },
  },
  {
    id: "mage",
    features: {
      visionRadius: 45,
      divinationDiameterByGrade: {
        captain: 45,
        banneret: 75,
        commander: 120,
        lord: 180,
        marshal: 270,
      },
      divinationCooldownMs: 300000,
      divinationDurationMs: 60000,
      astralReachBonusByGrade: {
        captain: 15,
        banneret: 25,
        commander: 40,
        lord: 60,
        marshal: 90,
      },
      astralCooldownMs: 600000,
      astralDurationMs: 300000,
      healingAuraRadiusByGrade: {
        captain: 15,
        banneret: 25,
        commander: 40,
        lord: 60,
        marshal: 90,
      },
      healingAuraPerCycle: 1,
    },
  },
];

test("l'éclaireur détecte plus loin, lit mieux et ignore le délai d'embuscade", () => {
  const service = new HeroClassFeatureService({ classDefinitions: classes });
  const hero = new Hero({
    id: "r",
    playerId: "p",
    name: "R",
    classId: "ranger",
  });
  assert.equal(service.detectionRadius(hero, 100), 150);
  assert.equal(service.visionRadius(hero), 75);
  assert.equal(service.detectionMultiplier(hero), 1.5);
  assert.equal(service.signatureMultiplier(hero), 0.65);
  assert.equal(service.informationLevel(hero, 2), 3);
  assert.equal(service.ambushRevealDelay(hero, 1500), 0);
  hero.classFeatureState.gpsConcealmentMultiplier = 0.6;
  assert.equal(service.signatureMultiplier(hero), 0.39);
});

test("le voyage astral est ciblé, temporaire et sérialisable", () => {
  let now = 1000;
  const service = new HeroClassFeatureService({
    classDefinitions: classes,
    now: () => now,
  });
  const hero = new Hero({ id: "m", playerId: "p", name: "M", classId: "mage" });
  assert.equal(
    service.activateAstralTravel(hero, {
      locationId: "site",
      distance: 60,
      baseRadius: 50,
    }).success,
    true,
  );
  assert.equal(service.interactionRadius(hero, 50, "site"), 65);
  assert.equal(service.interactionRadius(hero, 50, "other"), 50);
  const restored = new Hero(hero.toJSON());
  assert.deepEqual(restored.classFeatureState, hero.classFeatureState);
  now += 300000;
  assert.equal(service.interactionRadius(restored, 50, "site"), 50);
});

test("la divination révèle uniquement les lieux dans la zone", () => {
  const service = new HeroClassFeatureService({ classDefinitions: classes });
  const hero = new Hero({
    id: "m",
    playerId: "p",
    name: "M",
    classId: "mage",
    position: { latitude: 0, longitude: 0 },
  });
  const known = new Set();
  const player = {
    discoverLocation: (id) => {
      const fresh = !known.has(id);
      known.add(id);
      return fresh;
    },
  };
  const result = service.divine(hero, {
    player,
    locations: [
      { id: "near", position: { latitude: 2, longitude: 0 } },
      { id: "far", position: { latitude: 8, longitude: 0 } },
    ],
    distanceFn: (a, b) => Math.abs(a.latitude - b.latitude),
    radius: 5,
  });
  assert.deepEqual(result.revealedLocationIds, ["near"]);
});

test("la divination cible un point distinct du mage et expire", () => {
  let now = 1000;
  const service = new HeroClassFeatureService({
    classDefinitions: classes,
    now: () => now,
  });
  const hero = new Hero({
    id: "m",
    playerId: "p",
    name: "M",
    classId: "mage",
    position: { latitude: 0, longitude: 0 },
  });
  const known = new Set();
  const center = { latitude: 100, longitude: 0 };
  const result = service.divine(hero, {
    player: { discoverLocation: (id) => (known.add(id), true) },
    center,
    locations: [
      { id: "target", position: { latitude: 102, longitude: 0 } },
      { id: "mage", position: { latitude: 0, longitude: 0 } },
    ],
    distanceFn: (a, b) => Math.abs(a.latitude - b.latitude),
    radius: 5,
  });
  assert.deepEqual(result.revealedLocationIds, ["target"]);
  assert.deepEqual(service.activeDivination(hero), {
    center,
    radius: 5,
    activatedAt: 1000,
    expiresAt: 61000,
  });
  now = 61000;
  assert.equal(service.activeDivination(hero), null);
});

test("les spécialités innées du mage augmentent de portée à chaque grade", () => {
  const service = new HeroClassFeatureService({ classDefinitions: classes });
  const hero = new Hero({ id: "m", playerId: "p", name: "M", classId: "mage" });
  const expected = {
    captain: [22.5, 15, 15],
    banneret: [37.5, 25, 25],
    commander: [60, 40, 40],
    lord: [90, 60, 60],
    marshal: [135, 90, 90],
  };
  Object.entries(expected).forEach(([grade, values]) => {
    hero.commandRank = grade;
    assert.deepEqual(
      [
        service.divinationRadius(hero),
        service.astralReachBonus(hero),
        service.healingAura(hero).radius,
      ],
      values,
    );
  });
  assert.equal(service.healingAura(hero).healthPerCycle, 1);
});

test("les recharges du mage démarrent uniquement après une activation réussie et persistent", () => {
  let now = 1000;
  const service = new HeroClassFeatureService({
    classDefinitions: classes,
    now: () => now,
  });
  const hero = new Hero({
    id: "m",
    playerId: "p",
    name: "M",
    classId: "mage",
    position: { latitude: 0, longitude: 0 },
  });
  const player = { discoverLocation: () => true };
  assert.equal(
    service.activateAstralTravel(hero, {
      locationId: "far",
      distance: 100,
      baseRadius: 50,
    }).reason,
    "target_out_of_astral_reach",
  );
  assert.equal(service.cooldownRemaining(hero, "astralTravel"), 0);
  assert.equal(
    service.activateAstralTravel(hero, {
      locationId: "near",
      distance: 60,
      baseRadius: 50,
    }).success,
    true,
  );
  assert.equal(service.cooldownRemaining(hero, "astralTravel"), 600000);
  assert.equal(
    service.activateAstralTravel(hero, {
      locationId: "near",
      distance: 60,
      baseRadius: 50,
    }).reason,
    "ability_on_cooldown",
  );
  const divine = service.divine(hero, {
    player,
    locations: [],
    distanceFn: () => 0,
  });
  assert.equal(divine.success, true);
  assert.equal(service.cooldownRemaining(hero, "divination"), 300000);
  const restored = new Hero(hero.toJSON());
  assert.equal(service.cooldownRemaining(restored, "divination"), 300000);
  now += 300000;
  assert.equal(
    service.divine(restored, { player, locations: [], distanceFn: () => 0 })
      .success,
    true,
  );
  assert.equal(service.cooldownRemaining(restored, "astralTravel"), 300000);
});

test("l'éclaireur pose trois balises puis la quatrième remplace la plus ancienne", () => {
  const setup = {
    id: "watch",
    name: "Vigies",
    mode: "quick",
    scenarioId: "none",
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
      { playerId: "p1", name: "Éclaireur" },
      { playerId: "p2", name: "Intrus" },
    ],
  };
  let id = 0;
  let now = 100;
  const game = new Game({
    setup,
    heroClasses: [
      {
        id: "ranger",
        name: "Éclaireur",
        features: {
          canPlaceWatchBeacon: true,
          maximumWatchBeacons: 3,
          watchBeaconRadius: 10,
        },
      },
      { id: "warrior", name: "Guerrier" },
    ],
    coordinateMode: "simulation",
    now: () => now,
    idGenerator: (prefix) => `${prefix}-${++id}`,
  });
  const ranger = game.chooseHero("p1", { name: "R", classId: "ranger" });
  const intruder = game.chooseHero("p2", { name: "I", classId: "warrior" });
  game.start();
  ranger.updatePosition({ latitude: 0.1, longitude: 0.1 });
  intruder.updatePosition({ latitude: 0.1, longitude: 0.1 });
  const placed = Array.from({ length: 4 }, (_, index) => {
    now += 1;
    return game.placeScoutWatchBeacon({
      playerId: "p1",
      heroId: ranger.id,
      position: { latitude: index, longitude: 0 },
    });
  });
  assert.ok(placed.every((result) => result.success));
  assert.equal(game.watchBeacons.length, 3);
  assert.equal(placed[3].removedBeaconId, placed[0].beacon.id);
  assert.equal(game.toJSON().watchBeacons.length, 3);
  game.addAutonomousGroup({
    id: "ga",
    type: "army",
    owner: { kind: "faction", id: "chaos" },
    factionId: "chaos",
    position: { latitude: 0.2, longitude: 0.1 },
  });
  const events = game.scanWatchBeacons();
  assert.ok(
    events.some(
      (event) =>
        event.target.kind === "hero" && event.target.id === intruder.id,
    ),
  );
  assert.ok(
    events.some(
      (event) =>
        event.target.kind === "autonomous_group" && event.target.id === "ga",
    ),
  );
  assert.equal(game.scanWatchBeacons().length, 0);
});
