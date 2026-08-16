import assert from "node:assert/strict";
import test from "node:test";
import { BattleEngine } from "../app/js/core/battle-engine.js";
import { LootDistributionService } from "../app/js/core/loot-distribution-service.js";

const position = { latitude: 48.8566, longitude: 2.3522 };
const hero = (id, playerId) => ({ id, sourceId: id, playerId, attack: 10, defense: 2, speed: 2 });

test("le butin est partagé par contribution entre les héros victorieux survivants", () => {
  const battle = new BattleEngine({ id: "battle", loot: [{ id: "gold", itemId: "gold", quantity: 10, portable: true, weightPerUnit: 1, valuePerUnit: 1 }], teams: [
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
    { id: "gold", itemId: "gold", quantity: 5, portable: true, weightPerUnit: 1 },
    { id: "cart", itemId: "war-cart", quantity: 1, portable: false, weightPerUnit: 100 },
  ], teams: [{ id: "w", heroes: [hero("h1", "p1")], units: [] }, { id: "l", heroes: [hero("h2", "p2")], units: [] }] });
  battle.getEntity("h2").state = "ghost"; battle.start(); battle.tick(1);
  const site = new LootDistributionService().createSite({ id: "loot", battle, position });
  site.discover("p1");
  assert.equal(site.collect({ playerId: "p1", position: { latitude: 49, longitude: 2 }, capacity: 10 }).reason, "outside_loot_site");
  const result = site.collect({ playerId: "p1", position, capacity: 3 });
  assert.equal(result.success, true); assert.equal(result.collected[0].quantity, 3);
  assert.equal(site.entries.find((entry) => entry.itemId === "war-cart").quantity, 1);
});

test("un LootSite reste invisible jusqu'à l'action de recherche", () => {
  const battle = new BattleEngine({ id: "battle", loot: [{ id: "gold", itemId: "gold", quantity: 1 }], teams: [{ id: "w", heroes: [hero("h1", "p1")], units: [] }, { id: "l", heroes: [hero("h2", "p2")], units: [] }] });
  battle.getEntity("h2").state = "ghost"; battle.start(); battle.tick(1);
  const site = new LootDistributionService().createSite({ id: "loot", battle, position });
  assert.equal(site.isKnownBy("p1"), false); assert.equal(site.collect({ playerId: "p1", position, capacity: 10 }).reason, "loot_not_discovered");
  assert.equal(site.discover("p1"), true); assert.equal(site.isKnownBy("p1"), true);
});
