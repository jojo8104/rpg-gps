import test from "node:test";
import assert from "node:assert/strict";
import { CheatService } from "../app/js/core/cheat-service.js";
import { Hero } from "../app/js/core/hero.js";

test("le cheat applique niveau, ressources et modificateurs sans dépendre du DOM", () => {
  const hero = new Hero({ id: "hero", playerId: "local", name: "Test", baseStats: { attack: 2, defense: 2, morale: 2, mobility: 2, command: 3, health: 30 } });
  new CheatService().applyHeroChanges(hero, { level: 5, health: 40, stats: { attack: 8, defense: 0, morale: 0, mobility: 0, command: 0, health: 20 }, resources: { gold: 99 } });
  assert.equal(hero.level, 5); assert.equal(hero.finalStats.attack, 10); assert.equal(hero.maxHealth, 50); assert.equal(hero.health, 40); assert.equal(hero.resources.gold, 99);
});

test("le créateur produit une localisation sérialisable et productrice", () => {
  const location = new CheatService().createLocation({ id: "wood", name: "Bûcherons", type: "lumber-camp", ownerId: "local", level: 2, population: 12, defenseSlots: 2, productionResource: "wood", productionAmount: 5 }, { latitude: 48, longitude: 2 });
  assert.equal(location.resources.production.wood, 5); assert.equal(location.features.resourceProduction, true); assert.equal(location.garrison.units.length, 0); assert.doesNotThrow(() => JSON.stringify(location));
});
