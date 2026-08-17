import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const setup = { id: "s", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 2, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "A" }, { playerId: "p2", name: "B" }], rules: { engagementRadiusMeters: 100, fleeConfirmations: 1, pursuitCooldownMinutes: 5 } };
const heroClasses = [{ id: "fighter", name: "Combattant", abilityIds: [], startingUnits: [{ typeId: "runner", quantity: 6 }] }];
const definition = { id: "runner", maxQuantity: 10, stats: { attack: 1, defense: 1, range: 1, speed: 1 } };

test("la fuite du héros laisse ses unités engagées sur le terrain", () => {
  let id = 1;
  const game = new Game({ setup, heroClasses, unitDefinitions: [definition], idGenerator: (prefix) => `${prefix}-${id++}` });
  const first = game.chooseHero("p1", { name: "A", classId: "fighter" });
  const second = game.chooseHero("p2", { name: "B", classId: "fighter" });
  first.updatePosition({ latitude: 48.8566, longitude: 2.35 }); second.updatePosition({ latitude: 48.8566, longitude: 2.3502 });
  game.start();
  const battle = game.engageHeroes({ initiatorHeroId: first.id, targetHeroId: second.id, battleConfig: { pursuitLossRate: 0.5 }, teams: [{ id: "red", heroIds: [first.id] }, { id: "blue", heroIds: [second.id] }] });
  const fleeingUnit = battle.teams[1].units[0];
  game.updateBattleHeroPosition({ battleId: battle.id, heroId: second.id, position: { latitude: 48.86, longitude: 2.35 } });
  assert.equal(fleeingUnit.quantity, 6);
  assert.equal(fleeingUnit.commandDisabled, true);
  assert.equal(fleeingUnit.currentOrder.type, "hold");
  assert.equal(battle.eventLog.some((event) => event.type === "pursuit_losses"), false);
});
