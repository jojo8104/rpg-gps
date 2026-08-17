import assert from "node:assert/strict";
import test from "node:test";
import { Location } from "../app/js/core/location.js";

test("une location conserve son état persistant et sa garnison", () => {
  const location = new Location({
    id: "fort-1", name: "Fort du Nord", type: "fort", roles: ["military", "strategic"], source: "organizer",
    position: { latitude: 48.85, longitude: 2.35 }, ownerId: "player-1", controllerId: "player-1",
    features: { capturable: true, garrison: true }, resources: { production: { stone: 2 }, stock: { stone: 8 }, storageCapacity: 100 },
    garrison: { units: [{ id: "guard-1", ownerPlayerId: "player-1", typeId: "guard", quantity: 8, rank: "corporal" }] }, qr: { enabled: true, required: true, id: "QR-001" },
  });
  assert.equal(location.garrison.getUnit("guard-1").quantity, 8);
  assert.equal(location.addHero("hero-1"), true);
  assert.equal(location.addHero("hero-1"), false);
  location.setController("player-2");
  assert.equal(location.controllerId, "player-2");
  const data = location.toJSON();
  data.resources.stock.stone = 0;
  assert.equal(location.resources.stock.stone, 8);
  assert.equal(location.detectionRadius, 75);
});

test("la détection d'un lieu couvre toujours son interaction", () => {
  assert.throws(() => new Location({ id: "bad", name: "Lieu", type: "ruin", source: "generated", position: { latitude: 48, longitude: 2 }, interactionRadius: 30, detectionRadius: 20 }));
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

test("un village produit un stock variable de recrues sans dépasser sa capacité", () => {
  const village = new Location({
    id: "village-recrues", name: "Village", type: "village", source: "generated",
    position: { latitude: 48, longitude: 2 }, features: { recruitment: true },
    recruitment: { availableUnitTypeIds: ["militia"], production: { militia: 4 }, stock: { militia: 7 }, capacity: 10, variance: 0.25 },
  });
  assert.deepEqual(village.produceRecruits(1, () => 1), { militia: 3 });
  assert.equal(village.recruitment.stock.militia, 10);
  assert.deepEqual(village.produceRecruits(1, () => 0), {});
  assert.equal(village.toJSON().recruitment.capacity, 10);
});
