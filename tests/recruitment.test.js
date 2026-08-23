import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const unitDefinitions = [{
  id: "archer", name: "Archer", faction: "kingdom", maxQuantity: 10,
  stats: { attack: 4, defense: 2, speed: 3, range: 3, morale: 5 },
  abilities: ["ranged_attack"], costs: { gold: 30, wood: 10, iron: 5 }, tags: ["ranged"],
}];
const setup = {
  id: "setup-1", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 1,
  playArea: { id: "area-1", name: "Parc", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] },
  participants: [{ playerId: "player-1", name: "Ariane" }], rules: { maxUnitsPerHero: 3 },
};
const scenario = {
  id: "chaos", name: "Chaos", intro: "Fuyez.", initialPhaseId: "escape",
  playerStart: { resources: { gold: 50, wood: 20, iron: 10 }, unitStacks: [] },
  phases: [{ id: "escape", title: "Fuite", description: "Fuir.", objectives: [], eventIds: [], transitions: [] }],
};
const heroClasses = [{ id: "warrior", name: "Guerrier", abilityIds: [], startingResources: { gold: 10 }, startingUnits: [] }];
const locations = [{ id: "fort-1", name: "Fort", type: "fort", source: "scenario", position: { latitude: 0, longitude: 0 }, defenseSlots: 2, features: { recruitment: true, healing: true, garrison: true }, recruitment: { availableUnitTypeIds: ["archer"], stock: { archer: 20 }, production: { archer: 2 }, capacity: 30, variance: 0.25 } }];

test("le début attribue les ressources de classe et scénario, puis recrute au fort", () => {
  let id = 1;
  const game = new Game({ setup, scenario, heroClasses, unitDefinitions, locations, idGenerator: (prefix) => `${prefix}-${id++}` });
  const hero = game.chooseHero("player-1", { name: "Aldric", classId: "warrior" });
  game.start();
  const player = game.getPlayer("player-1");
  assert.equal(hero.getResourceAmount("gold"), 60);
  assert.equal(game.recruitUnit({ playerId: player.id, heroId: hero.id, locationId: "fort-1", unitTypeId: "archer" }).reason, "hero_not_at_location");
  game.getLocation("fort-1").addHero(hero.id);
  const result = game.recruitUnit({ playerId: player.id, heroId: hero.id, locationId: "fort-1", unitTypeId: "archer" });
  assert.equal(result.success, true);
  assert.equal(result.unit.ownerPlayerId, player.id);
  assert.equal(hero.getResourceAmount("gold"), 30);
  assert.equal(game.getLocation("fort-1").recruitment.stock.archer, 14);
  assert.equal(hero.army.getUnit(result.unit.id).quantity, 6);
  assert.equal(hero.army.getUnit(result.unit.id).rank, "soldier");
  assert.equal(result.unit.name, "1re Archer");
  assert.equal(result.unit.number, 1);
  const secondResult = game.recruitUnit({ playerId: player.id, heroId: hero.id, locationId: "fort-1", unitTypeId: "archer" });
  assert.equal(secondResult.unit.name, "2e Archer");
  assert.equal(secondResult.unit.number, 2);
});

test("une unité appartient toujours à son joueur après un dépôt et un retrait de garnison", () => {
  const game = new Game({ setup, scenario, heroClasses, unitDefinitions, locations, idGenerator: () => "unit-1" });
  const hero = game.chooseHero("player-1", { name: "Aldric", classId: "warrior" });
  game.start();
  const fort = game.getLocation("fort-1");
  fort.addHero(hero.id);
  const result = game.recruitUnit({ playerId: "player-1", heroId: hero.id, locationId: fort.id, unitTypeId: "archer" });
  assert.equal(game.garrisonUnit({ playerId: "player-1", heroId: hero.id, locationId: fort.id, unitId: result.unit.id }), true);
  assert.equal(fort.garrison.getUnit(result.unit.id).ownerPlayerId, "player-1");
  assert.equal(game.withdrawGarrisonUnit({ playerId: "player-1", heroId: hero.id, locationId: fort.id, unitId: result.unit.id }), true);
  assert.equal(hero.army.getUnit(result.unit.id).ownerPlayerId, "player-1");
});

test("un héros peut dissoudre définitivement une unité hors combat", () => {
  let id = 1;
  const game = new Game({ setup, scenario, heroClasses, unitDefinitions, locations, idGenerator: (prefix) => `${prefix}-${id++}` });
  const hero = game.chooseHero("player-1", { name: "Aldric", classId: "warrior" }); game.start();
  const fort = game.getLocation("fort-1"); fort.addHero(hero.id);
  const unit = game.recruitUnit({ playerId: "player-1", heroId: hero.id, locationId: fort.id, unitTypeId: "archer" }).unit;
  const result = game.disbandUnit({ playerId: "player-1", heroId: hero.id, unitId: unit.id });
  assert.equal(result.success, true);
  assert.equal(result.unit.name, "1re Archer");
  assert.equal(hero.army.getUnit(unit.id), null);
  assert.ok(game.eventLog.some((event) => event.type === "unit_disbanded" && event.unitId === unit.id));
  assert.deepEqual(game.disbandUnit({ playerId: "player-1", heroId: hero.id, unitId: unit.id }), { success: false, reason: "invalid_unit" });
});

test("un lieu complète les unités avec son stock de recrues compatibles", () => {
  const game = new Game({ setup, scenario, heroClasses, unitDefinitions, locations, idGenerator: () => "unit-complete" });
  const hero = game.chooseHero("player-1", { name: "Aldric", classId: "warrior" }); game.start();
  const fort = game.getLocation("fort-1"); fort.addHero(hero.id);
  const unit = game.recruitUnit({ playerId: "player-1", heroId: hero.id, locationId: fort.id, unitTypeId: "archer" }).unit;
  unit.lose(2); const stockBefore = fort.recruitment.stock.archer;
  const result = game.completeHeroUnits({ playerId: "player-1", heroId: hero.id, locationId: fort.id });
  assert.equal(result.success, true); assert.equal(unit.quantity, unit.maxQuantity); assert.equal(fort.recruitment.stock.archer, stockBefore - 2);
});

test("chaque soldat survivant récupère un PV par unité de temps dans un lieu de soin", () => {
  const game = new Game({ setup, scenario, heroClasses, unitDefinitions, locations, idGenerator: () => "unit-heal" });
  const hero = game.chooseHero("player-1", { name: "Aldric", classId: "warrior" }); game.start();
  const fort = game.getLocation("fort-1"); fort.addHero(hero.id);
  const unit = game.recruitUnit({ playerId: "player-1", heroId: hero.id, locationId: fort.id, unitTypeId: "archer" }).unit;
  unit.soldierHealth = unit.soldierHealth.map((health) => health - 2);
  const result = game.healHeroUnits({ playerId: "player-1", heroId: hero.id, locationId: fort.id, timeUnits: 1 });
  assert.equal(result.restoredHealth, unit.quantity); assert.ok(unit.soldierHealth.every((health) => health === unit.healthPerSoldier - 1));
});

test("les unités récupèrent passivement à chaque cycle hors des localisations", () => {
  const game = new Game({ setup, scenario, heroClasses, unitDefinitions, locations, idGenerator: () => "unit-cycle-heal" });
  const hero = game.chooseHero("player-1", { name: "Aldric", classId: "warrior" }); game.start();
  const fort = game.getLocation("fort-1"); fort.addHero(hero.id);
  const unit = game.recruitUnit({ playerId: "player-1", heroId: hero.id, locationId: fort.id, unitTypeId: "archer" }).unit;
  fort.removeHero(hero.id); hero.updatePosition({ latitude: 5, longitude: 5 });
  unit.soldierHealth = unit.soldierHealth.map((health) => health - 2);
  const cycle = game.advanceCycle(1, () => 0.5);
  assert.equal(cycle.recoveredUnits[0].unitId, unit.id);
  assert.equal(cycle.recoveredUnits[0].restoredHealth, unit.quantity);
  assert.ok(unit.soldierHealth.every((health) => health === unit.healthPerSoldier - 1));
});
