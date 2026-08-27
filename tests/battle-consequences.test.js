import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const definition = { id: "militia", maxQuantity: 10, stats: { attack: 1, defense: 1, range: 1, speed: 1 } };
const setup = { id: "s", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 2, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "A" }, { playerId: "p2", name: "B" }] };
const classes = [{ id: "fighter", name: "F", abilityIds: [], startingUnits: [{ typeId: "militia", quantity: 5 }] }];

test("la résolution conserve les survivants et transforme les déserteurs en groupe autonome rogue", () => {
  let id = 1;
  const game = new Game({ setup, heroClasses: classes, unitDefinitions: [definition], locations: [{ id: "enemy-camp", name: "Camp", type: "camp", source: "scenario", position: { latitude: 0, longitude: 0 }, features: { battle: true } }], idGenerator: (prefix) => `${prefix}-${id++}` });
  const first = game.chooseHero("p1", { name: "A", classId: "fighter" });
  const second = game.chooseHero("p2", { name: "B", classId: "fighter" });
  game.start();
  const battle = game.createBattle({ teamParticipants: [{ id: "red", heroIds: [first.id], positions: { [first.id]: { x: 0, y: 0 } } }, { id: "blue", heroIds: [second.id], positions: { [second.id]: { x: 5, y: 0 } } }], position: { latitude: 0, longitude: 0 }, sourceLocationId: "enemy-camp", sourceEnemyTeamId: "blue" });
  const blueUnit = battle.teams[1].units[0];
  battle.markUnitDeserted(blueUnit.id);
  battle.teams[1].heroes[0].state = "ghost";
  battle.status = "finished";
  battle.winnerTeamId = "red";
  const result = game.resolveBattle(battle.id);
  assert.equal(result.consequences.deserters.length, 1);
  assert.equal(game.rogueArmies.length, 1);
  assert.equal(game.autonomousGroups.length, 1);
  assert.equal(game.autonomousGroups[0].type, "rogue");
  assert.deepEqual(game.autonomousGroups[0].owner, { kind: "independent", id: game.autonomousGroups[0].id });
  assert.equal(result.consequences.autonomousGroupIds[0], game.autonomousGroups[0].id);
  assert.equal(second.army.units.length, 0);
  assert.equal(first.army.units[0].quantity, 5);
  assert.ok(first.army.units[0].experience > 0);
  assert.equal(first.experience, 50);
  assert.equal(second.experience, 20);
  assert.equal(result.heroProgression.find((entry) => entry.heroId === first.id).experienceGained, 50);
  assert.equal(result.heroProgression.find((entry) => entry.heroId === second.id).experienceGained, 20);
  assert.equal(result.consequences.survivors[0].name, "1re Militia");
  assert.equal(result.destroyedLocationId, "enemy-camp");
  assert.equal(game.getLocation("enemy-camp").state, "destroyed");
  assert.equal(game.getLocation("enemy-camp").features.battle, false);
  assert.equal(game.battleSites[0].status, "FINISHED");
});

test("une victoire ennemie équipe le héros, convertit le reste en XP et ne laisse aucun site", () => {
  let id = 1; const game = new Game({ setup, heroClasses: classes, unitDefinitions: [definition], locations: [{ id: "enemy-camp", name: "Camp", type: "camp", source: "scenario", position: { latitude: 0, longitude: 0 }, ownerId: "p2", features: { battle: true } }], idGenerator: (prefix) => `${prefix}-${id++}` });
  const playerHero = game.chooseHero("p1", { name: "Joueur", classId: "fighter" }); const enemyHero = game.chooseHero("p2", { name: "Ennemi", classId: "fighter" }); playerHero.equip("mainHand", "iron_sword"); playerHero.resources.gold = 4; game.start();
  const battle = game.createBattle({ teamParticipants: [{ id: "heroes", heroIds: [playerHero.id] }, { id: "bandits", heroIds: [enemyHero.id] }], loot: [{ id: "battle-gold", itemId: "gold", quantity: 5, portable: true }], position: { latitude: 0, longitude: 0 }, sourceLocationId: "enemy-camp", sourceEnemyTeamId: "bandits" });
  battle.teams[0].heroes[0].state = "ghost"; battle.teams[0].heroes[0].health = 0; battle.status = "finished"; battle.winnerTeamId = "bandits";
  const result = game.resolveBattle(battle.id);
  assert.equal(enemyHero.equipment.mainHand, "iron_sword"); assert.equal(result.enemySalvage.convertedExperience, 9); assert.equal(result.battleLoot, null); assert.equal(game.battleLoot.length, 0); assert.equal(game.battleSites.length, 0);
  assert.equal(result.enemySalvage.experience.reduce((sum, entry) => sum + entry.amount, 0), 9);
});
