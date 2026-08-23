import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const setup = { id: "s", name: "Test", mode: "quick", scenarioId: "scenario", playerCount: 1, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "Joueur" }], rules: { maxUnitsPerHero: 3, enableContentment: true } };
const scenario = { id: "scenario", name: "Test", intro: "Contexte de test.", initialPhaseId: "phase", playerStart: { resources: { wood: 30 }, unitStacks: [] }, phases: [{ id: "phase", title: "Phase", description: "Phase de test.", objectives: [], eventIds: [], transitions: [] }] };
const heroClasses = [{ id: "warrior", name: "Guerrier", abilityIds: [], startingResources: {}, startingUnits: [] }];

function gameWithCamp(ownerId = "p1") {
  const game = new Game({ setup, scenario, heroClasses, unitDefinitions: [], locations: [{ id: "camp", name: "Camp", type: "camp", source: "test", position: { latitude: 0, longitude: 0 }, ownerId, population: 8, contentment: 50, resources: { stock: { wood: 20 }, storageCapacity: 100 }, features: {} }] });
  const hero = game.chooseHero("p1", { name: "Héros", classId: "warrior" }); game.start(); game.getLocation("camp").addHero(hero.id); return { game, hero, camp: game.getLocation("camp") };
}

test("un transfert gratuit déplace les ressources et fait varier le contentement", () => {
  const { game, hero, camp } = gameWithCamp();
  const deposit = game.transferLocationResource({ playerId: "p1", heroId: hero.id, locationId: camp.id, resourceName: "wood", amount: 12, direction: "to_location" });
  assert.equal(deposit.success, true); assert.equal(deposit.contentmentDelta, 2); assert.equal(camp.contentment, 52); assert.equal(hero.resources.wood, 18); assert.equal(camp.resources.stock.wood, 32);
  const withdraw = game.transferLocationResource({ playerId: "p1", heroId: hero.id, locationId: camp.id, resourceName: "wood", amount: 25, direction: "to_hero" });
  assert.equal(withdraw.contentmentDelta, -3); assert.equal(camp.contentment, 49); assert.equal(hero.resources.wood, 43); assert.equal(camp.resources.stock.wood, 7);
});

test("le héros ne gère pas gratuitement les réserves d'un autre propriétaire", () => {
  const { game, hero, camp } = gameWithCamp("enemy");
  assert.equal(game.transferLocationResource({ playerId: "p1", heroId: hero.id, locationId: camp.id, resourceName: "wood", amount: 1, direction: "to_hero" }).reason, "location_not_owned");
});

test("la production peut aller vers le héros ou l'universel mais jamais recevoir un dépôt", () => {
  const { game, hero, camp } = gameWithCamp(); camp.resources.production.wood = 5; camp.resources.productionStock.wood = 25;
  const heroTransfer = game.transferLocationProduction({ playerId: "p1", heroId: hero.id, locationId: camp.id, resourceName: "wood", amount: 20, destination: "hero" });
  assert.equal(heroTransfer.success, true); assert.equal(hero.getResourceAmount("wood"), 50); assert.equal(camp.resources.productionStock.wood, 5);
  const universalTransfer = game.transferLocationProduction({ playerId: "p1", heroId: hero.id, locationId: camp.id, resourceName: "wood", amount: 5, destination: "universal" });
  assert.equal(universalTransfer.success, true); assert.equal(camp.resources.stock.wood, 25); assert.equal(camp.resources.productionStock.wood, 0);
  assert.equal(game.transferLocationProduction({ playerId: "p1", heroId: hero.id, locationId: camp.id, resourceName: "wood", amount: 1, destination: "production" }).reason, "invalid_destination");
});

test("le bouton population crée au plus cinq habitants dans la réserve universelle", () => {
  const { game, hero, camp } = gameWithCamp();
  const first = game.preparePopulationPackages({ playerId: "p1", heroId: hero.id, locationId: camp.id, people: 5 });
  assert.equal(first.success, true); assert.equal(camp.population, 3); assert.equal(camp.resources.stock.population, 5); assert.equal(hero.carriedLoot.length, 0);
  const last = game.preparePopulationPackages({ playerId: "p1", heroId: hero.id, locationId: camp.id, people: 5 });
  assert.equal(last.people, 3); assert.equal(camp.population, 0); assert.equal(camp.resources.stock.population, 8); assert.equal(camp.state, "abandoned");
  const take = game.takeLocationPopulationPackage({ playerId: "p1", heroId: hero.id, locationId: camp.id });
  assert.equal(take.people, 5); assert.equal(camp.resources.stock.population, 3); assert.equal(hero.carriedLoot[0].quantity, 5);
});
