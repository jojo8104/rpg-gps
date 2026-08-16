import assert from "node:assert/strict";
import test from "node:test";
import { Location } from "../app/js/core/location.js";

test("une location conserve son état persistant et sa garnison", () => {
  const location = new Location({
    id: "fort-1", name: "Fort du Nord", type: "fort", roles: ["military", "strategic"], source: "organizer",
    position: { latitude: 48.85, longitude: 2.35 }, ownerId: "player-1", controllerId: "player-1",
    features: { capturable: true, garrison: true }, resources: { production: { stone: 2 }, stock: { stone: 8 }, storageCapacity: 100 },
    garrison: { units: [{ id: "guard-1", ownerPlayerId: "player-1", typeId: "guard", quantity: 8, maxQuantity: 10 }] }, qr: { enabled: true, required: true, id: "QR-001" },
  });
  assert.equal(location.garrison.getUnit("guard-1").quantity, 8);
  assert.equal(location.addHero("hero-1"), true);
  assert.equal(location.addHero("hero-1"), false);
  location.setController("player-2");
  assert.equal(location.controllerId, "player-2");
  const data = location.toJSON();
  data.resources.stock.stone = 0;
  assert.equal(location.resources.stock.stone, 8);
});

test("une mine produit des ressources sans dépasser sa capacité", () => {
  const mine = new Location({
    id: "mine-1", name: "Mine", type: "mine", source: "generated",
    position: { latitude: 48.85, longitude: 2.35 }, features: { resourceProduction: true },
    resources: { production: { gold: 5 }, stock: { gold: 92 }, storageCapacity: 100 }, qr: { enabled: false },
  });
  assert.deepEqual(mine.produceResources(1), { gold: 5 });
  assert.deepEqual(mine.produceResources(1), { gold: 3 });
  assert.deepEqual(mine.produceResources(1), {});
  assert.equal(mine.resources.stock.gold, 100);
});
