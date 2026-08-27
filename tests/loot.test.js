import assert from "node:assert/strict";
import test from "node:test";
import { BattleEngine } from "../app/js/core/battle-engine.js";
import { BattleLoot } from "../app/js/core/battle-loot.js";
import { Game } from "../app/js/core/game.js";
import { LootDistributionService } from "../app/js/core/loot-distribution-service.js";

const hero = (id, playerId) => ({ id, sourceId: id, playerId, attack: 10, defense: 2, speed: 2 });
function finishedBattle({ loot, winners = [hero("h1", "p1")], losers = [hero("h2", "p2")] }) {
  const battle = new BattleEngine({ id: "battle", loot, teams: [{ id: "w", heroes: winners, units: [] }, { id: "l", heroes: losers, units: [] }] });
  losers.forEach((entry) => { battle.getEntity(entry.id).state = "ghost"; }); battle.start(); battle.tick(1); return battle;
}

test("le butin est partagé par contribution entre les héros victorieux survivants", () => {
  const battle = finishedBattle({ loot: [{ id: "gold", itemId: "gold", quantity: 10, portable: true }], winners: [hero("h1", "p1"), hero("h2", "p2")], losers: [hero("h3", "p3")] });
  battle.state.contributions.p1.total = 75; battle.state.contributions.p2.total = 25;
  const reward = new LootDistributionService().createReward({ id: "loot", battle });
  assert.deepEqual(reward.shares.map((share) => share.ratio), [.75, .25]); assert.deepEqual(reward.entries[0].allocations, { p1: 8, p2: 2 });
});

test("un héros victorieux éliminé est exclu du partage", () => {
  const battle = finishedBattle({ loot: [{ id: "gold", itemId: "gold", quantity: 4 }], winners: [hero("h1", "p1"), hero("h2", "p2")], losers: [hero("h3", "p3")] });
  battle.getEntity("h2").state = "ghost";
  const reward = new LootDistributionService().createReward({ id: "loot", battle });
  assert.deepEqual(reward.shares.map((share) => share.playerId), ["p1"]); assert.equal(reward.entries[0].allocations.p1, 4);
});

test("le butin du résultat se collecte sans position GPS", () => {
  const battle = finishedBattle({ loot: [{ id: "gold", itemId: "gold", quantity: 100, portable: true }, { id: "cart", itemId: "war-cart", quantity: 1, portable: false }] });
  const reward = new LootDistributionService().createReward({ id: "loot", battle });
  const result = reward.collect({ playerId: "p1", bag: { freeSlots: 1 }, selection: { gold: 100 } });
  assert.equal(result.success, true); assert.equal(result.remainingSlots, 0); assert.equal(reward.entries.find((entry) => entry.id === "cart").quantity, 1);
});

test("le butin de combat n'expire pas et exclut les barricades", () => {
  const battle = finishedBattle({ loot: [{ id: "gold", itemId: "gold", quantity: 1 }, { id: "wall", itemId: "barricade", quantity: 1, portable: false }] });
  const reward = new LootDistributionService().createReward({ id: "loot", battle });
  assert.deepEqual(reward.entries.map((entry) => entry.itemId), ["gold"]); assert.equal("position" in reward, false); assert.equal("expiresAt" in reward, false);
});

test("une sélection trop grande ne retire aucun butin", () => {
  const reward = new BattleLoot({ id: "limited", battleId: "battle", entries: [{ id: "stone", itemId: "stone", quantity: 20, portable: true, allocations: { p1: 20 } }], shares: [{ playerId: "p1", heroId: "h1", contribution: 1, ratio: 1 }] });
  const result = reward.collect({ playerId: "p1", bag: { freeSlots: 1 }, selection: { stone: 20 } });
  assert.equal(result.success, false); assert.equal(result.reason, "insufficient_slots"); assert.equal(reward.entries[0].quantity, 20);
});

test("les ressources du résultat rejoignent les groupes slotables du héros", () => {
  let id = 1; const setup = { id: "s", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 1, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "A" }] };
  const game = new Game({ setup, heroClasses: [{ id: "fighter", name: "Combattant", abilityIds: [], startingUnits: [] }], idGenerator: (prefix) => `${prefix}-${id++}` });
  const winner = game.chooseHero("p1", { name: "A", classId: "fighter" }); game.start();
  game.battleLoot.push(new BattleLoot({ id: "loot", battleId: "battle", entries: [{ id: "gold", itemId: "gold", quantity: 120, portable: true, valuePerUnit: 1, allocations: { p1: 120 } }], shares: [{ playerId: "p1", heroId: winner.id, contribution: 1, ratio: 1 }] }));
  const result = game.collectBattleLoot({ battleId: "battle", playerId: "p1", heroId: winner.id, selection: { gold: 120 } });
  assert.equal(result.success, true); assert.equal(winner.resources.gold, 120); assert.equal(game.inventoryService.getUsedHeroBagSlots(winner), 2);
});
