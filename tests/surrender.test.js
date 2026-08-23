import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const setup = { id: "s", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 2, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "A" }, { playerId: "p2", name: "B" }] };
const unitDefinition = { id: "militia", name: "Milice", maxQuantity: 10, stats: { attack: 2, defense: 2, speed: 2, range: 1 } };
const heroClasses = [{ id: "fighter", name: "Combattant", abilityIds: [], startingUnits: [{ typeId: "militia", quantity: 5 }] }];

test("se rendre garde le héros vivant mais lui retire armée et bagages", () => {
  let id = 1;
  const game = new Game({ setup, heroClasses, unitDefinitions: [unitDefinition], idGenerator: (prefix) => `${prefix}-${id++}` });
  const winner = game.chooseHero("p1", { name: "A", classId: "fighter" }); const surrendered = game.chooseHero("p2", { name: "B", classId: "fighter" });
  surrendered.equip("mainHand", "iron_sword"); surrendered.addCarriedLoot([{ id: "parcel", itemId: "population", quantity: 3 }]); surrendered.resources.gold = 7; surrendered.resources.wood = 3;
  game.start();
  const battle = game.createBattle({ config: { countdownMs: 0 }, position: { latitude: 0, longitude: 0 }, teamParticipants: [{ id: "red", heroIds: [winner.id] }, { id: "blue", heroIds: [surrendered.id] }] });
  assert.equal(game.surrenderBattle({ battleId: battle.id, teamId: "blue" }).success, true);
  const result = game.resolveBattle(battle.id);
  assert.equal(surrendered.state, "active"); assert.ok(surrendered.health > 0);
  assert.equal(surrendered.army.units.length, 0); assert.equal(result.consequences.prisoners.length, 1);
  assert.equal(surrendered.carriedLoot.length, 0); assert.equal(surrendered.resources.gold, 0); assert.equal(surrendered.resources.wood, 0);
  assert.equal(surrendered.equipment.mainHand, undefined); assert.ok(result.lootSite.entries.some((entry) => entry.itemId === "iron_sword"));
});
