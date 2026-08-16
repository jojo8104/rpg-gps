import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const setup = { id: "s", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 2, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "A" }, { playerId: "p2", name: "B" }], rules: { engagementRadiusMeters: 100, fleeConfirmations: 2 } };
const heroClasses = [{ id: "fighter", name: "Combattant", abilityIds: [] }];

test("la fuite nécessite plusieurs positions GPS consécutives hors zone", () => {
  let id = 1;
  const game = new Game({ setup, heroClasses, idGenerator: (prefix) => `${prefix}-${id++}` });
  const first = game.chooseHero("p1", { name: "A", classId: "fighter" });
  const second = game.chooseHero("p2", { name: "B", classId: "fighter" });
  first.updatePosition({ latitude: 48.8566, longitude: 2.35 });
  second.updatePosition({ latitude: 48.8566, longitude: 2.3502 });
  game.start();
  const battle = game.engageHeroes({ initiatorHeroId: first.id, targetHeroId: second.id, teams: [{ id: "red", heroIds: [first.id] }, { id: "blue", heroIds: [second.id] }] });
  assert.equal(game.updateBattleHeroPosition({ battleId: battle.id, heroId: second.id, position: { latitude: 48.86, longitude: 2.35 } }).state, "potential_flee");
  assert.equal(game.updateBattleHeroPosition({ battleId: battle.id, heroId: second.id, position: { latitude: 48.8566, longitude: 2.3502 } }).state, "inside");
  assert.equal(game.updateBattleHeroPosition({ battleId: battle.id, heroId: second.id, position: { latitude: 48.86, longitude: 2.35 } }).state, "potential_flee");
  assert.equal(game.updateBattleHeroPosition({ battleId: battle.id, heroId: second.id, position: { latitude: 48.86, longitude: 2.35 } }).state, "fled");
  assert.equal(battle.status, "finished");
  assert.equal(battle.winnerTeamId, "red");
  assert.ok(second.pursuitCooldownUntil > 0);
  assert.equal(game.canEngageHeroes(first.id, second.id), false);
});
