import assert from "node:assert/strict";
import test from "node:test";
import { BattleEngine } from "../app/js/core/battle-engine.js";
import { Game } from "../app/js/core/game.js";
import { LootDistributionService } from "../app/js/core/loot-distribution-service.js";
import { LootSite } from "../app/js/core/loot-site.js";

const position = { latitude: 48.8566, longitude: 2.3522 };
const hero = (id, playerId) => ({ id, sourceId: id, playerId, attack: 10, defense: 2, speed: 2 });

test("le butin est partagé par contribution entre les héros victorieux survivants", () => {
  const battle = new BattleEngine({ id: "battle", loot: [{ id: "gold", itemId: "gold", quantity: 10, portable: true, valuePerUnit: 1 }], teams: [
    { id: "winners", heroes: [hero("h1", "p1"), hero("h2", "p2")], units: [] },
    { id: "losers", heroes: [hero("h3", "p3")], units: [] },
  ] });
  battle.state.contributions.p1.total = 75; battle.state.contributions.p2.total = 25;
  battle.getEntity("h3").state = "ghost"; battle.start(); battle.tick(1);
  const site = new LootDistributionService().createSite({ id: "loot", battle, position });
  assert.deepEqual(site.shares.map((share) => share.ratio), [.75, .25]);
  assert.deepEqual(site.entries[0].allocations, { p1: 8, p2: 2 });
});

test("un héros victorieux éliminé est exclu du partage", () => {
  const battle = new BattleEngine({ id: "battle", loot: [{ id: "gold", itemId: "gold", quantity: 4 }], teams: [
    { id: "winners", heroes: [hero("h1", "p1"), hero("h2", "p2")], units: [] }, { id: "losers", heroes: [hero("h3", "p3")], units: [] },
  ] });
  battle.getEntity("h2").state = "ghost"; battle.getEntity("h3").state = "ghost"; battle.start(); battle.tick(1);
  const site = new LootDistributionService().createSite({ id: "loot", battle, position });
  assert.deepEqual(site.shares.map((share) => share.playerId), ["p1"]); assert.equal(site.entries[0].allocations.p1, 4);
});

test("la collecte exige la présence GPS et laisse le non-transportable sur place", () => {
  const battle = new BattleEngine({ id: "battle", loot: [
    { id: "gold", itemId: "gold", quantity: 105, portable: true },
    { id: "cart", itemId: "war-cart", quantity: 1, portable: false },
  ], teams: [{ id: "w", heroes: [hero("h1", "p1")], units: [] }, { id: "l", heroes: [hero("h2", "p2")], units: [] }] });
  battle.getEntity("h2").state = "ghost"; battle.start(); battle.tick(1);
  const site = new LootDistributionService().createSite({ id: "loot", battle, position });
  site.discover("p1");
  assert.equal(site.collect({ playerId: "p1", position: { latitude: 49, longitude: 2 }, bag: { freeSlots: 1 }, selection: { gold: 100 } }).reason, "outside_loot_site");
  const result = site.collect({ playerId: "p1", position, bag: { freeSlots: 1 }, selection: { gold: 100 } });
  assert.equal(result.success, true); assert.equal(result.collected[0].quantity, 100); assert.equal(result.remainingSlots, 0);
  assert.equal(site.entries.find((entry) => entry.itemId === "war-cart").quantity, 1);
});

test("un LootSite reste invisible jusqu'à l'action de recherche", () => {
  const battle = new BattleEngine({ id: "battle", loot: [{ id: "gold", itemId: "gold", quantity: 1 }], teams: [{ id: "w", heroes: [hero("h1", "p1")], units: [] }, { id: "l", heroes: [hero("h2", "p2")], units: [] }] });
  battle.getEntity("h2").state = "ghost"; battle.start(); battle.tick(1);
  const site = new LootDistributionService().createSite({ id: "loot", battle, position });
  assert.equal(site.isKnownBy("p1"), false); assert.equal(site.collect({ playerId: "p1", position, bag: { freeSlots: 1 }, selection: { gold: 1 } }).reason, "loot_not_discovered");
  assert.equal(site.discover("p1"), true); assert.equal(site.isKnownBy("p1"), true);
});

test("un butin disparaît après cinq minutes et exclut les barricades", () => {
  let now = 1_000; const battle = new BattleEngine({ id: "temporary-loot", loot: [{ id: "gold", itemId: "gold", quantity: 1 }, { id: "wall", itemId: "barricade", quantity: 1, portable: false }], teams: [{ id: "w", heroes: [hero("h1", "p1")], units: [] }, { id: "l", heroes: [hero("h2", "p2")], units: [] }] });
  battle.getEntity("h2").state = "ghost"; battle.start(); battle.tick(1);
  const site = new LootDistributionService().createSite({ id: "temporary", battle, position, now: () => now });
  assert.deepEqual(site.entries.map((entry) => entry.itemId), ["gold"]); assert.equal(site.expiresAt, 301_000); now = 301_000; assert.equal(site.isExpired(), true);
});

test("un site de butin devient épuisé après la récupération complète", () => {
  const battle = new BattleEngine({ id: "depleted-battle", loot: [{ id: "gold", itemId: "gold", quantity: 2, portable: true }], teams: [{ id: "w", heroes: [hero("h1", "p1")], units: [] }, { id: "l", heroes: [hero("h2", "p2")], units: [] }] });
  battle.getEntity("h2").state = "ghost"; battle.start(); battle.tick(1); const site = new LootDistributionService().createSite({ id: "depleted", battle, position }); site.discover("p1");
  assert.equal(site.collect({ playerId: "p1", position, bag: { freeSlots: 0, quantitiesByItem: { gold: 98 }, slotsByItem: { gold: 1 } }, selection: { gold: 2 } }).success, true); assert.equal(site.status, "DEPLETED");
});

test("une sélection trop grande ne retire aucun butin", () => {
  const site = new LootSite({ id: "limited", battleId: "battle", position, entries: [{ id: "stone", itemId: "stone", quantity: 20, portable: true, allocations: { p1: 20 } }], shares: [{ playerId: "p1", heroId: "h1", contribution: 1, ratio: 1 }] });
  site.discover("p1");
  const result = site.collect({ playerId: "p1", position, bag: { freeSlots: 1 }, selection: { stone: 20 } });
  assert.equal(result.success, false); assert.equal(result.reason, "insufficient_slots"); assert.equal(site.entries[0].quantity, 20); assert.equal(site.entries[0].allocations.p1, 20);
});

test("les ressources de butin rejoignent les groupes slotables du héros", () => {
  let id = 1;
  const setup = { id: "s", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 1, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "A" }] };
  const game = new Game({ setup, heroClasses: [{ id: "fighter", name: "Combattant", abilityIds: [], startingUnits: [] }], idGenerator: (prefix) => `${prefix}-${id++}` });
  const winner = game.chooseHero("p1", { name: "A", classId: "fighter" }); game.start();
  const site = new LootSite({ id: "loot", battleId: "battle", position, entries: [{ id: "gold", itemId: "gold", quantity: 120, portable: true, valuePerUnit: 1, allocations: { p1: 120 } }], shares: [{ playerId: "p1", heroId: winner.id, contribution: 1, ratio: 1 }] });
  site.discover("p1"); game.lootSites.push(site);
  const result = game.collectLoot({ lootSiteId: site.id, playerId: "p1", heroId: winner.id, position, selection: { gold: 120 } });
  assert.equal(result.success, true); assert.equal(winner.resources.gold, 120); assert.equal(winner.carriedLoot.length, 0); assert.equal(game.inventoryService.getUsedHeroBagSlots(winner), 2);
});
