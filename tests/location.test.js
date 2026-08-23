import assert from "node:assert/strict";
import test from "node:test";
import { ABANDONMENT_EXPIRY_CYCLES, Location } from "../app/js/core/location.js";

test("une location conserve son état persistant et sa garnison", () => {
  const location = new Location({
    id: "fort-1", name: "Fort du Nord", type: "fort", roles: ["military", "strategic"], source: "organizer",
    position: { latitude: 48.85, longitude: 2.35 }, ownerId: "player-1", controllerId: "player-1", populationCapacity: 40,
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
  assert.equal(data.populationCapacity, 40);
});

test("la détection d'un lieu couvre toujours son interaction", () => {
  assert.throws(() => new Location({ id: "bad", name: "Lieu", type: "ruin", source: "generated", position: { latitude: 48, longitude: 2 }, interactionRadius: 30, detectionRadius: 20 }));
});

test("le stockage dépend de la population et des infrastructures", () => {
  const camp = new Location({
    id: "camp-storage", name: "Camp", type: "camp", source: "generated", position: { latitude: 48, longitude: 2 },
    population: 8, resources: { infrastructureStorage: 20 }, qr: { enabled: false },
  });
  assert.equal(camp.recalculateStorageCapacity(), 24);
  assert.equal(camp.toJSON().resources.infrastructureStorage, 20);
});

test("une mine produit dans quatre slots spécialisés sans occuper les slots universels", () => {
  const mine = new Location({
    id: "mine-1", name: "Mine", type: "mine", source: "generated",
    position: { latitude: 48.85, longitude: 2.35 }, features: { resourceProduction: true },
    resources: { production: { gold: 250 }, stock: { gold: 92 }, storageCapacity: 100 }, qr: { enabled: false },
  });
  assert.deepEqual(mine.produceResources(1), { gold: 250 });
  assert.deepEqual(mine.produceResources(1), { gold: 150 });
  assert.deepEqual(mine.produceResources(1), {});
  assert.equal(mine.resources.productionStock.gold, 400);
  assert.equal(mine.resources.stock.gold, 92);
  assert.equal(mine.transferProductionResource("gold", 400, "universal"), 308);
  assert.equal(mine.resources.productionStock.gold, 92);
  assert.deepEqual(mine.produceResources(1), { gold: 250 });
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

test("la population fixe un vivier divisé indépendamment entre les types", () => {
  const village = new Location({
    id: "village-population", name: "Village", type: "village", source: "generated", population: 48,
    position: { latitude: 48, longitude: 2 }, features: { recruitment: true },
    recruitment: { availableUnitTypeIds: ["militia", "archer"], weights: { militia: 1, archer: 1 }, production: { militia: 10, archer: 10 }, stock: { militia: 20, archer: 20 }, capacity: 100 },
  });
  assert.equal(village.recruitment.capacity, 12);
  assert.deepEqual(village.recruitment.capacities, { militia: 6, archer: 6 });
  assert.deepEqual(village.recruitment.stock, { militia: 6, archer: 6 });
  village.recruitment.stock = { militia: 6, archer: 0 };
  assert.deepEqual(village.produceRecruits(1, () => 0.5), { archer: 6 });
  assert.deepEqual(village.toJSON().recruitment.weights, { militia: 1, archer: 1 });
});

test("les poids rendent les unités communes plus disponibles", () => {
  const village = new Location({
    id: "village-weights", name: "Village", type: "village", source: "generated", population: 48,
    position: { latitude: 48, longitude: 2 }, features: { recruitment: true },
    recruitment: { availableUnitTypeIds: ["militia", "archer"], weights: { militia: 3, archer: 1 }, production: {}, stock: {} },
  });
  assert.deepEqual(village.recruitment.capacities, { militia: 9, archer: 3 });
});

test("le contentement expert ralentit la production et le lieu conserve les dépôts", () => {
  const village = new Location({
    id: "village-content", name: "Village", type: "village", source: "scenario",
    position: { latitude: 48, longitude: 2 }, contentment: 0,
    features: { resourceProduction: true }, resources: { production: { gold: 8 }, stock: {}, storageCapacity: 20 },
  });
  assert.equal(village.getContentmentModifier(true), 0.25);
  assert.deepEqual(village.produceResources(1, village.getContentmentModifier(true)), { gold: 2 });
  assert.equal(village.depositResource("wood", 30), 30);
  village.depositItem({ id: "loot-1", itemId: "banner", quantity: 1, portable: true, valuePerUnit: 5 });
  assert.equal(village.adjustContentment(15), 15);
  assert.equal(village.toJSON().storedItems[0].itemId, "banner");
});

test("une localisation sans population suspend ses services puis disparaît", () => {
  const location = new Location({ id: "empty", name: "Lieu vide", type: "village", source: "test", position: { latitude: 0, longitude: 0 }, population: 1, state: "active", features: { resourceProduction: true, recruitment: true }, resources: { production: { wood: 5 } }, recruitment: { availableUnitTypeIds: ["militia"], production: { militia: 2 } } });
  location.removePopulation(1);
  assert.equal(location.state, "abandoned"); assert.deepEqual(location.produceResources(), {}); assert.deepEqual(location.produceRecruits(), {});
  location.advanceAbandonment(ABANDONMENT_EXPIRY_CYCLES - 1); assert.equal(location.state, "abandoned");
  location.advanceAbandonment(1); assert.equal(location.state, "destroyed");
  location.addPopulation(2); assert.equal(location.state, "destroyed");
});
