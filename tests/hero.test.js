import assert from "node:assert/strict";
import test from "node:test";

import { Hero } from "../app/js/core/hero.js";

test("un héros gère son armée, ses capacités et sa progression", () => {
  const hero = new Hero({ id: "hero-1", playerId: "player-1", name: "Ariane", abilityIds: ["charge"] });

  assert.equal(hero.addUnit({ id: "unit-1", ownerPlayerId: "player-1", typeId: "archer", quantity: 6 }), true);
  assert.equal(hero.addUnit({ id: "unit-1", ownerPlayerId: "player-1", typeId: "archer", quantity: 6 }), false);
  assert.equal(hero.addAbility("healing"), true);
  hero.addExperience(25);
  hero.setLevel(2);
  hero.equip("weapon", "iron-sword");

  assert.equal(hero.army.units.length, 1);
  assert.deepEqual(hero.abilityIds, ["charge", "healing"]);
  assert.equal(hero.experience, 25);
  assert.equal(hero.level, 2);
});

test("l'expérience seule ne change plus le grade de commandement du héros", () => {
  const hero = new Hero({ id: "commander", playerId: "player-1", name: "Ariane" });
  assert.equal(hero.commandRank, "captain"); assert.equal(hero.maxUnitStacks, 3);
  assert.equal(hero.addExperience(1_000), true); assert.equal(hero.commandRank, "captain");
  hero.setLevel(5); assert.equal(hero.commandRank, "banneret"); assert.equal(hero.maxUnitStacks, 4);
  hero.setLevel(20); assert.equal(hero.commandRank, "marshal"); assert.equal(hero.maxUnitStacks, 7);
});

test("un héros accepte une position GPS sérialisable", () => {
  const hero = new Hero({ id: "hero-1", playerId: "player-1", name: "Ariane" });
  hero.updatePosition({ latitude: 48.8566, longitude: 2.3522, accuracy: 8, updatedAt: "2026-08-12T10:30:00.000Z" });

  const data = hero.toJSON();
  data.position.latitude = 0;

  assert.equal(hero.position.latitude, 48.8566);
  assert.deepEqual(hero.position, { latitude: 48.8566, longitude: 2.3522, accuracy: 8, updatedAt: "2026-08-12T10:30:00.000Z" });
});

test("un héros détient ses ressources mais jamais de population", () => {
  const hero = new Hero({ id: "hero-resources", playerId: "player-1", name: "Ariane", resources: { gold: 20 } });
  hero.addResource("gold", 5); assert.equal(hero.spendResource("gold", 8), true); assert.equal(hero.getResourceAmount("gold"), 17);
  assert.throws(() => new Hero({ id: "invalid", playerId: "player-1", name: "Ariane", resources: { population: 2 } }), /population/);
});

test("les compétences sont passives et les pouvoirs sont séparés du commandement", () => {
  const hero = new Hero({ id: "tactician", playerId: "player-1", name: "Ariane", skillIds: ["inspiring"], specialPowerIds: ["rally"], maxCommandPoints: 4 });
  assert.deepEqual(hero.skillIds, ["inspiring"]);
  assert.deepEqual(hero.specialPowerIds, ["rally"]);
  assert.equal(hero.spendCommandPoints(3), true);
  assert.equal(hero.commandPoints, 1);
  assert.equal(hero.spendCommandPoints(2), false);
});
