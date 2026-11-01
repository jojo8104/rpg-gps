import test from "node:test";
import assert from "node:assert/strict";
import { Hero } from "../app/js/core/hero.js";
import { Location } from "../app/js/core/location.js";
import { MarketService } from "../app/js/core/market-service.js";
import { bindStockSlots } from "../app/js/ui/stock-slots-view.js";

function fixture({ heroWood = 3, heroOther = {}, stockOther = {} } = {}) {
  const hero = new Hero({
    id: "h",
    playerId: "p",
    name: "H",
    classId: "warrior",
    resources: { wood: heroWood, ...heroOther },
  });
  const location = new Location({
    id: "camp",
    name: "Camp",
    type: "camp",
    source: "test",
    ownerId: "p",
    population: 8,
    position: { latitude: 0, longitude: 0 },
    resources: {
      stock: { wood: 18, ...stockOther },
      production: { wood: 1 },
      productionStock: { wood: 12 },
    },
  });
  location.addHero(hero.id);
  return { hero, location };
}

test("les transferts attendent le serveur sans projection et empêchent les doubles clics", async () => {
  const actions = [
    {
      id: "reserve-balance:wood",
      details: { heroAmount: 3, locationAmount: 18 },
    },
  ];
  const listeners = {};
  const button = {
    dataset: { inventoryAction: "reserve-balance:wood:8" },
    addEventListener: (name, callback) => {
      listeners[name] = callback;
    },
  };
  const attributes = {};
  const manager = {
    dataset: { stockActions: encodeURIComponent(JSON.stringify(actions)) },
    matches: () => true,
    querySelectorAll: (selector) =>
      selector === "[data-inventory-action]" ? [button] : [],
    toggleAttribute: (name, value) => {
      attributes[name] = value;
    },
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
    isConnected: false,
  };
  let finish;
  let calls = 0;
  bindStockSlots(manager, async (intent) => {
    calls++;
    assert.equal(intent, button.dataset.inventoryAction);
    await new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = listeners.click();
  assert.deepEqual(
    JSON.parse(decodeURIComponent(manager.dataset.stockActions)),
    actions,
  );
  assert.equal(attributes["aria-busy"], "true");
  assert.equal(button.disabled, true);
  assert.equal(button.draggable, false);
  await listeners.click();
  assert.equal(calls, 1);
  finish();
  await pending;
});
