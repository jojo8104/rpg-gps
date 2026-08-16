import assert from "node:assert/strict";
import test from "node:test";

import { Hero } from "../app/js/core/hero.js";

test("un héros gère son armée, ses capacités et sa progression", () => {
  const hero = new Hero({ id: "hero-1", playerId: "player-1", name: "Ariane", abilityIds: ["charge"] });

  assert.equal(hero.addUnit({ id: "unit-1", ownerPlayerId: "player-1", typeId: "archer", quantity: 8, maxQuantity: 10 }), true);
  assert.equal(hero.addUnit({ id: "unit-1", ownerPlayerId: "player-1", typeId: "archer", quantity: 8, maxQuantity: 10 }), false);
  assert.equal(hero.addAbility("healing"), true);
  hero.addExperience(25);
  hero.setLevel(2);
  hero.equip("weapon", "iron-sword");

  assert.equal(hero.army.units.length, 1);
  assert.deepEqual(hero.abilityIds, ["charge", "healing"]);
  assert.equal(hero.experience, 25);
  assert.equal(hero.level, 2);
});

test("un héros accepte une position GPS sérialisable", () => {
  const hero = new Hero({ id: "hero-1", playerId: "player-1", name: "Ariane" });
  hero.updatePosition({ latitude: 48.8566, longitude: 2.3522, accuracy: 8, updatedAt: "2026-08-12T10:30:00.000Z" });

  const data = hero.toJSON();
  data.position.latitude = 0;

  assert.equal(hero.position.latitude, 48.8566);
  assert.deepEqual(hero.position, { latitude: 48.8566, longitude: 2.3522, accuracy: 8, updatedAt: "2026-08-12T10:30:00.000Z" });
});
