import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const setup = {
  id: "s",
  name: "Partie",
  mode: "quick",
  scenarioId: "chaos",
  playerCount: 2,
  playArea: {
    id: "a",
    name: "A",
    polygon: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
      { latitude: 1, longitude: 0 },
    ],
  },
  participants: [
    { playerId: "p1", name: "A" },
    { playerId: "p2", name: "B" },
  ],
  rules: { engagementRadiusMeters: 100, fleeConfirmations: 2 },
};
const heroClasses = [{ id: "fighter", name: "Combattant", abilityIds: [] }];

function duel() {
  let id = 1;
  const game = new Game({
    setup,
    heroClasses,
    idGenerator: (prefix) => `${prefix}-${id++}`,
  });
  const first = game.chooseHero("p1", { name: "A", classId: "fighter" });
  const second = game.chooseHero("p2", { name: "B", classId: "fighter" });
  first.updatePosition({ latitude: 48.8566, longitude: 2.35 });
  second.updatePosition({ latitude: 48.8566, longitude: 2.3502 });
  game.start();
  const battle = game.engageHeroes({
    initiatorHeroId: first.id,
    targetHeroId: second.id,
    teams: [
      { id: "red", heroIds: [first.id] },
      { id: "blue", heroIds: [second.id] },
    ],
  });
  return { game, first, second, battle };
}

test("le GPS suit le héros pendant le duel", () => {
  const { game, second, battle } = duel();
  second.equip("weapon", "training-sword");
  second.addCarriedLoot([{ itemId: "gold", quantity: 3 }]);
  for (let attempt = 0; attempt < 3; attempt++)
    assert.equal(
      game.updateBattleHeroPosition({
        battleId: battle.id,
        heroId: second.id,
        position: { latitude: 48.86, longitude: 2.35 },
      }).state,
      "inside",
    );
  assert.equal(battle.status, "active");
  assert.equal(battle.duel.phase, "CHOICE");
  assert.equal(second.equipment.weapon, "training-sword");
  assert.equal(second.carriedLoot[0].quantity, 3);
});

test("la fuite du duel termine la bataille et produit son rapport RPG", () => {
  const { game, battle } = duel();
  battle.submitDuelChoice("red", { flee: true });
  battle.lockDuelChoice("red");
  battle.submitDuelChoice("blue", { cards: [] });
  battle.lockDuelChoice("blue");
  assert.equal(battle.status, "finished");
  assert.equal(battle.winnerTeamId, "blue");
  const report = game.resolveBattle(battle.id);
  assert.equal(report.battleId, battle.id);
});
