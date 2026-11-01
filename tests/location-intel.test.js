import test from "node:test";
import assert from "node:assert/strict";
import { Location } from "../app/js/core/location.js";
import { buildLocationIntel } from "../app/js/core/location-intel.js";

const location = new Location({ id: "fort", name: "Fort", type: "fort", source: "scenario", position: { latitude: 48, longitude: 2 }, interactionRadius: 20, detectionRadius: 80, level: 2, population: 30, populationCapacity: 40, defenseSlots: 2, ownerId: "p1", features: { garrison: true }, resources: { production: { gold: 2 }, stock: { gold: 9 }, storageCapacity: 20 }, infrastructure: { wall: 2 }, garrison: { units: [{ id: "guard", ownerPlayerId: "p1", typeId: "militia", quantity: 6, rank: "soldier" }] } });
const snapshot = { id: "fort", name: "Fort", distance: 42, nearby: false, interactionRadius: 20, actions: [] };

test("un lieu seulement repéré masque ses informations sensibles", () => {
  const intel = buildLocationIntel({ location, snapshot, knowledgeLevel: 1, owner: { id: "p1", name: "Ariane", color: "blue" } });
  assert.equal(intel.level, "?"); assert.equal(intel.owner.name, "inconnu"); assert.equal(intel.stock[0].amount, "?");
});

test("une visite révèle le stock et la garnison", () => {
  const defendedSnapshot = { ...snapshot, defense: { reinforcements: [{ id: "passing", name: "Archers", type: "archer", quantity: 4, ownerPlayerId: "p2", heroId: "enemy", heroName: "Rask", source: "hero" }] } };
  const intel = buildLocationIntel({ location, snapshot: defendedSnapshot, knowledgeLevel: 3, owner: { id: "p1", name: "Ariane", color: "blue" } });
  assert.equal(intel.population, 30); assert.equal(intel.populationCapacity, 40); assert.equal(intel.stock[0].amount, 9); assert.equal(intel.defense.units[0].quantity, 6);
  assert.equal(intel.defense.reinforcements[0].heroName, "Rask"); assert.equal(intel.defense.defenders.length, 2);
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


test("la production masque les ressources inactives sans amélioration productrice", () => {
  const site = new Location({ id: "production", name: "Production", type: "village", source: "scenario", interactionRadius: 20, detectionRadius: 80, position: { latitude: 48, longitude: 2 }, resources: { production: { gold: 2, wood: 0, food: 0, horse: 0 }, stock: { wood: 12 } }, infrastructure: { farm: 1 } });
  const intel = buildLocationIntel({ location: site, snapshot, knowledgeLevel: 3 });
  assert.deepEqual(intel.production.map((entry) => entry.id), ["gold", "food"]);
  assert.ok(intel.stock.some((entry) => entry.id === "wood"));
});

test("la fiche conserve les menus des fortifications et leurs emplacements", () => {
  const structures = [{ id: "walls", level: 2, canDismantle: true, upgradeActionId: "build-improvement:walls" }];
  const defense = { structures, improvementSlots: { free: 1 } };
  const intel = buildLocationIntel({ location, snapshot: { ...snapshot, defense }, knowledgeLevel: 3 });
  assert.deepEqual(intel.defense.structures, structures);
  assert.equal(intel.defense.improvementSlots.free, 1);
  const hidden = buildLocationIntel({ location, snapshot: { ...snapshot, defense }, knowledgeLevel: 1 });
  assert.deepEqual(hidden.defense.structures, []);
});

test("sans projection préalable, seuls les bâtiments défensifs sont dans la défense", () => {
  const site = new Location({ id: "defense", name: "Défense", type: "village", source: "scenario", interactionRadius: 20, detectionRadius: 80, position: { latitude: 48, longitude: 2 }, infrastructure: { wall: 2, farm: 1, depot: 1 } });
  const intel = buildLocationIntel({ location: site, snapshot, knowledgeLevel: 3 });
  assert.deepEqual(intel.defense.structures.map((entry) => entry.id), ["wall"]);
});
