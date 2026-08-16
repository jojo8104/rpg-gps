import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const definition = { id: "militia", maxQuantity: 10, stats: { attack: 1, defense: 1, ranged: 0, mobility: 1 } };
const setup = { id: "s", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 2, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "A" }, { playerId: "p2", name: "B" }] };
const classes = [{ id: "fighter", name: "F", abilityIds: [], startingUnits: [{ typeId: "militia", quantity: 5 }] }];

test("la résolution conserve les survivants et transforme les déserteurs en RogueArmy", () => {
  let id = 1;
  const game = new Game({ setup, heroClasses: classes, unitDefinitions: [definition], idGenerator: (prefix) => `${prefix}-${id++}` });
  const first = game.chooseHero("p1", { name: "A", classId: "fighter" });
  const second = game.chooseHero("p2", { name: "B", classId: "fighter" });
  game.start();
  const battle = game.createBattle({ teamParticipants: [{ id: "red", heroIds: [first.id], positions: { [first.id]: { x: 0, y: 0 } } }, { id: "blue", heroIds: [second.id], positions: { [second.id]: { x: 5, y: 0 } } }] });
  const blueUnit = battle.teams[1].units[0];
  battle.markUnitDeserted(blueUnit.id);
  battle.teams[1].heroes[0].state = "ghost";
  battle.status = "finished";
  battle.winnerTeamId = "red";
  const result = game.resolveBattle(battle.id);
  assert.equal(result.consequences.deserters.length, 1);
  assert.equal(game.rogueArmies.length, 1);
  assert.equal(second.army.units.length, 0);
  assert.equal(first.army.units[0].quantity, 5);
});
