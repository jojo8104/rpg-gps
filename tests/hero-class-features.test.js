import assert from "node:assert/strict";
import test from "node:test";
import { Hero } from "../app/js/core/hero.js";
import { HeroClassFeatureService } from "../app/js/core/hero-class-feature-service.js";
import { Game } from "../app/js/core/game.js";

const classes = [
  { id: "ranger", features: { detectionMultiplier: 1.5, concealmentMultiplier: .65, informationLevelBonus: 1, ignoresAmbushPenalty: true } },
  { id: "mage", features: { divinationRadius: 500, astralReachBonus: 100, astralDurationMs: 300000, healingAuraRadius: 100, healingAuraPerCycle: 1 } },
];

test("l'éclaireur détecte plus loin, lit mieux et ignore le délai d'embuscade", () => {
  const service = new HeroClassFeatureService({ classDefinitions: classes }); const hero = new Hero({ id: "r", playerId: "p", name: "R", classId: "ranger" });
  assert.equal(service.detectionRadius(hero, 100), 150); assert.equal(service.detectionMultiplier(hero), 1.5); assert.equal(service.signatureMultiplier(hero), .65); assert.equal(service.informationLevel(hero, 2), 3); assert.equal(service.ambushRevealDelay(hero, 1500), 0);
  hero.classFeatureState.gpsConcealmentMultiplier = .6; assert.equal(service.signatureMultiplier(hero), .39);
});

test("le voyage astral est ciblé, temporaire et sérialisable", () => {
  let now = 1000; const service = new HeroClassFeatureService({ classDefinitions: classes, now: () => now }); const hero = new Hero({ id: "m", playerId: "p", name: "M", classId: "mage" });
  assert.equal(service.activateAstralTravel(hero, { locationId: "site", distance: 140, baseRadius: 50 }).success, true);
  assert.equal(service.interactionRadius(hero, 50, "site"), 150); assert.equal(service.interactionRadius(hero, 50, "other"), 50);
  const restored = new Hero(hero.toJSON()); assert.deepEqual(restored.classFeatureState, hero.classFeatureState);
  now += 300000; assert.equal(service.interactionRadius(restored, 50, "site"), 50);
});

test("la divination révèle uniquement les lieux dans la zone", () => {
  const service = new HeroClassFeatureService({ classDefinitions: classes }); const hero = new Hero({ id: "m", playerId: "p", name: "M", classId: "mage", position: { latitude: 0, longitude: 0 } }); const known = new Set();
  const player = { discoverLocation: (id) => { const fresh = !known.has(id); known.add(id); return fresh; } };
  const result = service.divine(hero, { player, locations: [{ id: "near", position: { latitude: 2, longitude: 0 } }, { id: "far", position: { latitude: 8, longitude: 0 } }], distanceFn: (a, b) => Math.abs(a.latitude - b.latitude), radius: 5 });
  assert.deepEqual(result.revealedLocationIds, ["near"]);
});

test("l'éclaireur peut détacher une unité dans une embuscade persistante", () => {
  const setup = { id: "ambush", name: "Embuscade", mode: "quick", scenarioId: "none", playerCount: 1, playArea: { id: "area", name: "Zone", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p", name: "P" }] };
  const unitDefinitions = [{ id: "scouts", maxQuantity: 10, stats: { attack: 2, defense: 2, speed: 4, range: 1, morale: 4, healthPerSoldier: 10, combatHealthThreshold: 4 }, costs: {} }];
  let id = 0; const game = new Game({ setup, classDefinitions: classes, heroClasses: [{ id: "ranger", name: "Éclaireur", features: { canPrepareAmbush: true }, startingUnits: [{ typeId: "scouts", quantity: 3 }] }], unitDefinitions, idGenerator: (prefix) => `${prefix}-${++id}` });
  const ranger = game.chooseHero("p", { name: "R", classId: "ranger" }); game.start(); ranger.updatePosition({ latitude: 0.1, longitude: 0.1 }); const unit = ranger.army.units[0];
  const result = game.prepareHeroAmbush({ playerId: "p", heroId: ranger.id, unitId: unit.id });
  assert.equal(result.success, true); assert.equal(ranger.army.units.length, 0); assert.equal(game.getAutonomousGroup(result.groupId).status, "ambushing"); assert.equal(game.getAutonomousGroup(result.groupId).army.units[0].id, unit.id);
});
