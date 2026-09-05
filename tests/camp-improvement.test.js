import assert from "node:assert/strict";
import test from "node:test";
import { CampImprovementService } from "../app/js/core/camp-improvement-service.js";
import { Location } from "../app/js/core/location.js";
import { LocationProgressionService } from "../app/js/core/location-progression-service.js";

const create = ({ level = 1, population = 8 } = {}) => {
  const progression = new LocationProgressionService({ mode: "expert" });
  const service = new CampImprovementService({ progressionService: progression });
  const location = new Location({ id: "camp", name: "Camp", type: "camp", source: "generated", position: { latitude: 0, longitude: 0 }, ownerId: "p1", level, population, resources: { stock: { wood: 200, stone: 100, iron: 50, gold: 100 }, storageCapacity: 500 }, qr: { enabled: false } });
  progression.initialize(location); service.applyEffects(location);
  return { location, progression, service };
};

test("les fondations ne consomment pas les emplacements de développement", () => {
  const { location, service } = create();
  assert.equal(service.build(location, "housing").success, true);
  assert.equal(service.build(location, "barricades").success, true);
  assert.deepEqual(service.getState(location).slots, { used: 0, maximum: 2 });
  assert.equal(service.build(location, "depot").success, true);
  assert.equal(service.build(location, "trading_post").success, true);
  assert.equal(service.build(location, "watch_post").reason, "no_development_slot");
});

test("le dépôt et les améliorations fonctionnelles appliquent leurs effets", () => {
  const { location, service } = create({ level: 2, population: 12 });
  service.build(location, "depot");
  assert.equal(location.resources.infrastructureStorage, 4);
  assert.equal(location.resources.storageCapacity, 10);
  service.build(location, "healing_tent");
  service.build(location, "hunting_lodge");
  assert.equal(location.features.healing, true);
  assert.equal(location.features.recruitment, true);
  assert.equal(location.resources.production.food, 1);
  assert.ok(location.recruitment.availableUnitTypeIds.includes("archer"));
});

test("construire consomme le stock et attribue les XP du lieu", () => {
  const { location, service } = create();
  const wood = location.resources.stock.wood;
  const result = service.build(location, "depot");
  assert.equal(result.experienceGained, 20);
  assert.equal(location.progression.experience, 20);
  assert.equal(location.resources.stock.wood, wood - 10);
});

test("le passage au camp 2 exige population, fondations, diversité, ressources et XP", () => {
  const { location, progression, service } = create({ population: 6 });
  service.build(location, "housing"); service.build(location, "barricades"); service.build(location, "depot");
  progression.awardExperience(location, 50, "quest");
  const status = service.getLevelUpStatus(location);
  assert.equal(status.eligible, true);
  assert.equal(service.levelUp(location).success, true);
  assert.equal(location.level, 2);
  assert.equal(location.populationCapacity, 15);
});

test("le Camp 3 débloque prospection et messagers sans lancer leurs missions", () => {
  const { location, service } = create({ level: 3, population: 20 });
  assert.equal(service.build(location, "prospecting_post").success, true);
  assert.equal(service.build(location, "messenger_relay").success, true);
  assert.equal(location.features.prospecting, true);
  assert.equal(location.features.messaging, true);
});

test("le Camp 3 reste un camp jusqu'au choix explicite d'une branche", () => {
  const { location, progression, service } = create({ level: 2, population: 20 });
  service.build(location, "housing"); service.build(location, "housing");
  service.build(location, "barricades"); service.build(location, "barricades");
  service.build(location, "depot"); service.build(location, "trading_post");
  progression.awardExperience(location, progression.getExperienceRequired(location), "quest");
  assert.equal(service.levelUp(location).success, true);
  assert.equal(location.type, "camp");
  assert.equal(location.level, 3);
});

test("un Camp 3 civil peut devenir volontairement un village", () => {
  const { location, progression, service } = create({ level: 3, population: 20 });
  service.build(location, "housing"); service.build(location, "housing");
  service.build(location, "trading_post"); service.build(location, "healing_tent");
  progression.awardExperience(location, progression.getExperienceRequired(location), "quest");
  const result = service.evolve(location, "village");
  assert.equal(result.success, true);
  assert.equal(location.type, "village");
  assert.equal(location.level, 1);
  assert.equal(location.populationCapacity, 40);
});

test("un Camp 3 militaire peut devenir volontairement un fort", () => {
  const { location, progression, service } = create({ level: 3, population: 12 });
  service.build(location, "barricades"); service.build(location, "barricades"); service.build(location, "barricades");
  service.build(location, "watch_post"); service.build(location, "watch_post"); service.build(location, "workshop");
  progression.awardExperience(location, progression.getExperienceRequired(location), "quest");
  const result = service.evolve(location, "fort");
  assert.equal(result.success, true);
  assert.equal(location.type, "fort");
  assert.equal(location.level, 1);
  assert.equal(location.defenseSlots, 3);
});

test("les nouveaux bâtiments sont présents avec leurs niveaux et prérequis", () => {
  const { location, service } = create({ level: 3, population: 20 });
  const state = service.getState(location);
  for (const id of ["tavern", "forge", "stable", "barracks", "magic_academy", "armorers", "archery_range", "palisades", "walls", "ramparts", "chapel", "habitation", "farm", "palace", "houses", "brewery", "military_school"])
    assert.ok(state.improvements.some((entry) => entry.id === id), id);
});

test("les habitations augmentent la capacité et la ferme produit de la nourriture", () => {
  const { location, service } = create({ level: 3, population: 8 });
  service.build(location, "habitation");
  service.build(location, "farm");
  assert.equal(location.populationCapacity, 29);
  assert.equal(location.resources.production.food, 2);
});

test("la population croît par cycle selon les habitants et les infrastructures sans dépasser la capacité", () => {
  const { location, service } = create({ level: 3, population: 20 });
  service.build(location, "habitation");
  service.build(location, "farm");
  const first = service.advancePopulation(location, 2);
  assert.equal(first.gained, 1);
  const final = service.advancePopulation(location, 100);
  assert.equal(final.population, location.populationCapacity);
});

test("les combinaisons militaires débloquent les unités et augmentent leurs capacités", () => {
  const { location, service } = create({ level: 3, population: 20 });
  location.infrastructure = {
    hunting_lodge: 1, barracks: 2, forge: 1, archery_range: 2,
    stable: 1, armorers: 1,
  };
  service.applyEffects(location);
  assert.deepEqual(new Set(location.recruitment.availableUnitTypeIds), new Set([
    "archer", "swordsman", "spearman", "mounted-archer",
    "light-cavalry", "heavy-cavalry", "heavy-infantry",
  ]));
  assert.equal(location.recruitment.capacities.archer, 12);
  assert.equal(location.recruitment.capacities.spearman, 7);
  assert.equal(location.recruitment.capacities.swordsman, 7);
});

test("un village débloque les miliciens", () => {
  const { location, progression, service } = create({ level: 3, population: 20 });
  location.infrastructure = { housing: 2, trading_post: 1, healing_tent: 1 };
  progression.awardExperience(location, progression.getExperienceRequired(location), "quest");
  assert.equal(service.evolve(location, "village").success, true);
  assert.ok(location.recruitment.availableUnitTypeIds.includes("militia"));
});
