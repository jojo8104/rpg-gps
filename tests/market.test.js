import assert from "node:assert/strict";
import test from "node:test";
import { MarketService } from "../app/js/core/market-service.js";
import { Hero } from "../app/js/core/hero.js";
import { Location } from "../app/js/core/location.js";
import { Game } from "../app/js/core/game.js";
import { EquipmentService } from "../app/js/core/equipment-service.js";
import { tradeMessage } from "../app/js/ui/market-view.js";

function fixture() {
  const hero = new Hero({ id: "h", playerId: "p", name: "H", classId: "warrior", resources: { gold: 20 } });
  const location = new Location({ id: "market", name: "Marché", type: "village", source: "test", position: { latitude: 0, longitude: 0 }, population: 20, features: { trade: true }, resources: { stock: { gold: 30, wood: 20 } } });
  return { hero, location, itemId: "wood", direction: "buy" };
}
const service = new MarketService();
test("achat et revente transfèrent les ressources sans créer d'or", () => {
  const input = fixture();
  assert.equal(service.execute(input).success, true);
  assert.equal(input.hero.resources.gold, 18);
  assert.equal(input.hero.resources.wood, 5);
  assert.equal(input.location.resources.stock.gold, 32);
  assert.equal(input.location.resources.stock.wood, 15);
  assert.equal(service.execute({ ...input, direction: "sell" }).success, true);
  assert.equal(input.hero.resources.gold, 19);
  assert.equal(input.location.resources.stock.wood, 20);
});
test("les refus et la prévisualisation ne modifient aucun stock", () => {
  for (const alter of [
    (i) => { i.lots = -1; },
    (i) => { i.lots = 1.5; },
    (i) => { i.lots = Infinity; },
    (i) => { i.itemId = "population"; },
    (i) => { i.hero.resources.gold = 0; },
    (i) => { i.location.resources.stock.wood = 0; },
    (i) => { i.hero.resources.horse = (i.hero.bagSlotCount - 1) * 5; },
    (i) => { i.location.population = 0; i.location.resources.stock = { wood: 20, stone: 10, iron: 10, food: 10 }; },
    (i) => { i.location.features.trade = false; },
  ]) {
    const input = fixture(); alter(input);
    const before = JSON.stringify(input);
    assert.equal(service.execute(input).success, false);
    assert.equal(JSON.stringify(input), before);
  }
  const input = fixture(); const before = JSON.stringify(input);
  assert.equal(service.execute({ ...input, preview: true }).success, true);
  assert.equal(JSON.stringify(input), before);
});
test("un échange peut utiliser la place libérée par son paiement", () => {
  const input = fixture(); input.hero.resources.gold = 2; input.hero.resources.horse = (input.hero.bagSlotCount - 1) * 5;
  assert.equal(service.execute(input).success, true);
});
test("Game vérifie propriétaire, présence et droit commercial et journalise", () => {
  const input = fixture(); let allowed = true;
  const game = { getHero: () => input.hero, getLocation: () => input.location,
    locationAccessPolicy: { can: () => allowed }, marketService: service, eventLog: [], now: () => 123 };
  const command = { playerId: "p", heroId: "h", locationId: "market", itemId: "wood", direction: "buy" };
  const trade = (args = command) => Game.prototype.tradeAtLocation.call(game, args);
  assert.equal(trade().success, false);
  input.location.heroIds.push("h");
  assert.equal(trade({ ...command, playerId: "enemy" }).success, false);
  allowed = false; assert.equal(trade().success, false);
  allowed = true; assert.equal(trade({ ...command, preview: true }).success, true);
  assert.equal(input.hero.resources.gold, 18);
  assert.equal(game.eventLog[0].type, "market_trade");
  const restored = new Location(input.location.toJSON());
  assert.deepEqual(restored.resources.stock, input.location.resources.stock);
});

test("les prix suivent le stock local et favorisent les lieux producteurs", () => {
  const { location } = fixture();
  const quote = () => service.getOffers(location).find((offer) => offer.itemId === "iron");
  location.resources.stock.iron = 0;
  const scarce = quote();
  location.resources.stock.iron = 40;
  const abundant = quote();
  assert.ok(scarce.buy > abundant.buy);
  assert.ok(scarce.sell > abundant.sell);
  location.resources.stock.iron = 20;
  const imported = quote();
  location.resources.production.iron = 2;
  assert.ok(quote().buy < imported.buy);
  for (const offer of service.getOffers(location)) assert.ok(offer.sell < offer.buy);
});

test("le tarif affiché est facturé et évolue après les échanges sans mutation en aperçu", () => {
  const input = fixture();
  input.location.resources.stock.wood = 10;
  const before = JSON.stringify(input);
  const offer = service.getOffers(input.location).find((entry) => entry.itemId === "wood");
  const preview = service.execute({ ...input, preview: true });
  assert.equal(preview.gold, offer.buy);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(service.execute(input), preview);
  assert.ok(service.getOffers(input.location).find((entry) => entry.itemId === "wood").buy >= offer.buy);
});


test("le catalogue visible ne propose que les ressources du lieu ou des bagages", () => {
  const { location, hero } = fixture();
  hero.resources.iron = 5;
  hero.resources.food = 0;
  location.resources.production.stone = 3;
  location.resources.productionStock.stone = 15;
  assert.deepEqual(service.getAvailableOffers(location, hero).map((offer) => offer.itemId), ["wood", "iron"]);
  assert.equal(service.execute({ location, hero, itemId: "iron", direction: "buy", preview: true }).success, false);
  assert.equal(service.execute({ location, hero, itemId: "iron", direction: "sell", preview: true }).success, true);
  hero.resources.iron = 0;
  location.resources.stock.wood = 0;
  assert.deepEqual(service.getAvailableOffers(location, hero), []);
});

test("le commerce inclut les ressources supplémentaires, objets et paquets des bagages", () => {
  const { location, hero } = fixture();
  location.resources.stock.exploration_tools = 1;
  location.storedItems.push({ id: "shield", itemId: "round_shield", quantity: 1, valuePerUnit: 5 });
  hero.resources.specialist_farmer = 1;
  hero.addCarriedLoot([
    { id: "sword", itemId: "iron_sword", quantity: 1 },
    { id: "report", itemId: "custom_report", quantity: 1 },
  ]);
  const ids = service.getAvailableOffers(location, hero).map((entry) => entry.itemId);
  for (const id of ["wood", "exploration_tools", "round_shield", "iron_sword", "custom_report"]) assert.ok(ids.includes(id));
  assert.ok(!ids.includes("gold"));
  assert.equal(service.execute({ hero, location, itemId: "exploration_tools", direction: "buy" }).success, true);
  assert.equal(hero.resources.exploration_tools, 1);
  assert.equal(service.execute({ hero, location, itemId: "specialist_farmer", direction: "sell" }).success, false);
  const result = service.execute({ hero, location, itemId: "custom_report", direction: "sell" });
  assert.equal(result.success, true);
  assert.match(tradeMessage(result), /custom_report/);
  assert.equal(location.storedItems.find((entry) => entry.itemId === "custom_report").quantity, 1);
});

test("un équipement peut être vendu, racheté, sauvegardé puis équipé", () => {
  const { hero, location } = fixture();
  location.resources.stock.gold = 200;
  hero.resources.gold = 200;
  hero.addCarriedLoot([{ id: "sword", itemId: "iron_sword", quantity: 1 }]);
  const input = { hero, location, itemId: "iron_sword", direction: "sell" };
  const before = JSON.stringify(input);
  const preview = service.execute({ ...input, preview: true });
  assert.equal(preview.success, true);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(service.execute(input), preview);
  assert.equal(hero.carriedLoot.length, 0);
  assert.equal(location.storedItems[0].itemId, "iron_sword");
  const restoredLocation = new Location(location.toJSON());
  assert.equal(service.execute({ ...input, location: restoredLocation, direction: "buy" }).success, true);
  assert.equal(restoredLocation.storedItems.length, 0);
  const restoredHero = new Hero(hero.toJSON());
  assert.equal(new EquipmentService().equip(restoredHero, restoredHero.carriedLoot[0].id).success, true);
  assert.equal(restoredHero.equipment.mainHand, "iron_sword");
  assert.equal(service.execute({ ...input, hero: restoredHero }).success, false);
});

test("les reliquats sont échangés au prix et à la quantité affichés", () => {
  const { hero, location } = fixture();
  location.resources.stock.wood = 2;
  hero.resources.iron = 1;
  for (const [itemId, direction] of [["wood", "buy"], ["iron", "sell"]]) {
    const offer = service.getAvailableOffers(location, hero).find((entry) => entry.itemId === itemId);
    const result = service.execute({ hero, location, itemId, direction });
    assert.equal(result.success, true);
    assert.equal(result.quantity, offer[`${direction}Quantity`]);
    assert.equal(result.gold, offer[direction]);
  }
  assert.equal(location.resources.stock.wood, 0);
  assert.equal(hero.resources.iron, 0);
});

test("la vente utilise ensemble les ressources libres et les paquets sans perdre le reste", () => {
  const { hero, location } = fixture();
  hero.resources.wood = 2;
  hero.addCarriedLoot([{ id: "wood-package", itemId: "wood", quantity: 8, metadata: { source: "quest" } }]);
  const result = service.execute({ hero, location, itemId: "wood", direction: "sell" });
  assert.equal(result.success, true);
  assert.equal(result.quantity, 5);
  assert.equal(hero.resources.wood, 0);
  assert.equal(hero.carriedLoot[0].quantity, 5);
  assert.deepEqual(hero.carriedLoot[0].metadata, { source: "quest" });
  assert.equal(location.resources.stock.wood, 22);
  assert.equal(location.storedItems[0].quantity, 3);
});

test("les refus de vente d'objet restent atomiques et comptent le stockage des objets", () => {
  for (const reason of ["location_stock_insufficient", "location_storage_full"]) {
    const { hero, location } = fixture();
    hero.addCarriedLoot([{ id: "report", itemId: "abandoned_mine_report", quantity: 1 }]);
    if (reason === "location_stock_insufficient") location.resources.stock.gold = 0;
    else location.storedItems = Array.from({ length: location.storageSlotCapacity - 2 }, (_, i) => ({ id: `item-${i}`, itemId: "iron_sword", quantity: 1, valuePerUnit: 1 }));
    const input = { hero, location, itemId: "abandoned_mine_report", direction: "sell" };
    const before = JSON.stringify(input);
    assert.equal(service.execute(input).reason, reason);
    assert.equal(JSON.stringify(input), before);
  }
});

test("vendre le dernier objet libère une case pour l'or et acheter respecte les bagages pleins", () => {
  const { hero, location } = fixture();
  hero.resources.gold = 0;
  hero.resources.horse = (hero.bagSlotCount - 1) * 5;
  hero.addCarriedLoot([{ id: "report", itemId: "abandoned_mine_report", quantity: 1 }]);
  const input = { hero, location, itemId: "abandoned_mine_report", direction: "sell" };
  assert.equal(service.execute(input).success, true);
  hero.resources.gold = 20;
  const before = JSON.stringify(input);
  assert.equal(service.execute({ ...input, direction: "buy" }).reason, "hero_bag_full");
  assert.equal(JSON.stringify(input), before);
});


test("les PNJ et populations sont exclus du marché et les commandes directes restent sans effet", () => {
  for (const itemId of ["specialist_geologist", "specialist_cartographer", "specialist_adventurer", "specialist_miner", "specialist_lumberjack", "specialist_farmer", "officer_drill", "officer_veteran", "royal_geologist", "population"]) {
    for (const packaged of [false, true]) {
      const { hero, location } = fixture();
      if (packaged) {
        hero.carriedLoot.push({ id: "npc", itemId, quantity: 1 });
        location.storedItems.push({ id: "stored-npc", itemId, quantity: 1 });
      } else {
        hero.resources[itemId] = 1;
        location.resources.stock[itemId] = 1;
      }
      const before = JSON.stringify({ hero, location });
      assert.ok(!service.getOffers(location, hero).some((offer) => offer.itemId === itemId));
      assert.ok(!service.getAvailableOffers(location, hero).some((offer) => offer.itemId === itemId));
      for (const direction of ["buy", "sell"]) {
        for (const preview of [false, true]) {
          assert.deepEqual(service.execute({ hero, location, itemId, direction, preview }), { success: false, reason: "invalid_trade" });
          assert.equal(JSON.stringify({ hero, location }), before);
        }
      }
    }
  }
});
