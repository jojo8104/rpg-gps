import test from "node:test";
import assert from "node:assert/strict";
import { Location } from "../app/js/core/location.js";
import { buildLocationIntel } from "../app/js/core/location-intel.js";

const location = new Location({ id: "fort", name: "Fort", type: "fort", source: "scenario", position: { latitude: 48, longitude: 2 }, interactionRadius: 20, detectionRadius: 80, level: 2, population: 30, defenseSlots: 2, ownerId: "p1", features: { garrison: true }, resources: { production: { gold: 2 }, stock: { gold: 9 }, storageCapacity: 20 }, infrastructure: { wall: 2 }, garrison: { units: [{ id: "guard", ownerPlayerId: "p1", typeId: "militia", quantity: 6, rank: "soldier" }] } });
const snapshot = { id: "fort", name: "Fort", distance: 42, nearby: false, interactionRadius: 20, actions: [] };

test("un lieu seulement repéré masque ses informations sensibles", () => {
  const intel = buildLocationIntel({ location, snapshot, knowledgeLevel: 1, owner: { id: "p1", name: "Ariane", color: "blue" } });
  assert.equal(intel.level, "?"); assert.equal(intel.owner.name, "inconnu"); assert.equal(intel.stock[0].amount, "?");
});

test("une visite révèle le stock et la garnison", () => {
  const intel = buildLocationIntel({ location, snapshot, knowledgeLevel: 3, owner: { id: "p1", name: "Ariane", color: "blue" } });
  assert.equal(intel.population, 30); assert.equal(intel.stock[0].amount, 9); assert.equal(intel.defense.units[0].quantity, 6);
});

test("l'identité et les statistiques d'un héros se révèlent progressivement", () => {
  const heroes = [{ id: "enemy", name: "Rask", classId: "warrior", className: "Guerrier", level: 3 }];
  const detected = buildLocationIntel({ location, snapshot, knowledgeLevel: 1, heroes });
  const identifiedType = buildLocationIntel({ location, snapshot, knowledgeLevel: 2, heroes });
  const identifiedHero = buildLocationIntel({ location, snapshot, knowledgeLevel: 3, heroes });
  assert.equal(detected.presences[0].label, "?");
  assert.equal(identifiedType.presences[0].label, "Héros Guerrier présent");
  assert.equal(identifiedType.presences[0].stats[0].value, null);
  assert.equal(identifiedHero.presences[0].label, "Rask");
  assert.equal(identifiedHero.presences[0].stats[0].value, 16);
});
