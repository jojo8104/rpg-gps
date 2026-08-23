import assert from "node:assert/strict";
import test from "node:test";
import { ChiefTradeService } from "../app/js/core/chief-trade-service.js";
import { Hero } from "../app/js/core/hero.js";
import { Location } from "../app/js/core/location.js";
import { MarketService } from "../app/js/core/market-service.js";

function tradingLocation() {
  return new Location({ id: "village", name: "Village", type: "village", source: "test", position: { latitude: 0, longitude: 0 }, population: 10, interactionIds: ["local-chief-trade"], resources: { stock: { food: 2 } }, chief: { trade: true, tradeLimitPerCycle: 2, tradeOffers: [{ id: "wood-food", give: { resource: "wood", amount: 5 }, receive: { resource: "food", amount: 1 } }] } });
}

test("le troc du chef applique le taux configuré et déplace les stocks", () => {
  const location = tradingLocation();
  const hero = new Hero({ id: "h", playerId: "p", name: "Héros", classId: "warrior", resources: { wood: 10 } });
  const result = new ChiefTradeService().execute({ hero, location, offerId: "wood-food" });
  assert.equal(result.success, true);
  assert.equal(hero.resources.wood, 5); assert.equal(hero.resources.food, 1);
  assert.equal(location.resources.stock.wood, 5); assert.equal(location.resources.stock.food, 1);
  assert.equal(location.statistics.chiefTradeRemaining, 1);
});

test("le chef refuse un troc sans ressource, sans stock ou sans quota", () => {
  const service = new ChiefTradeService(); const location = tradingLocation();
  const hero = new Hero({ id: "h", playerId: "p", name: "Héros", classId: "warrior", resources: {} });
  assert.equal(service.execute({ hero, location, offerId: "wood-food" }).reason, "insufficient_resources");
  hero.addResource("wood", 5); location.resources.stock.food = 0;
  assert.equal(service.execute({ hero, location, offerId: "wood-food" }).reason, "location_stock_insufficient");
  location.resources.stock.food = 1; location.statistics.chiefTradeRemaining = 0;
  assert.equal(service.execute({ hero, location, offerId: "wood-food" }).reason, "chief_trade_quota_exhausted");
  assert.equal(service.refresh(location), 2);
});

test("un marché transforme par lots de cinq la production bloquée en or", () => {
  const location = new Location({ id: "wood", name: "Bois", type: "lumber-camp", source: "test", position: { latitude: 0, longitude: 0 }, population: 8, features: { trade: true, resourceProduction: true }, resources: { production: { wood: 3 }, productionStock: { wood: 80 }, stock: {} } });
  const service = new MarketService();
  assert.deepEqual(service.sellBlockedProduction(location), { surplus: 0, gold: 0 });
  assert.deepEqual(service.sellBlockedProduction(location), { surplus: 5, gold: 1 });
  assert.equal(location.resources.stock.gold, 1); assert.equal(location.statistics.marketSurplusUnits, 1);
});
