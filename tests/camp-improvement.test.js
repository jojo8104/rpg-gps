import assert from "node:assert/strict";
import test from "node:test";
import { CampImprovementService } from "../app/js/core/camp-improvement-service.js";
import { Location } from "../app/js/core/location.js";
import { LocationProgressionService } from "../app/js/core/location-progression-service.js";

const create = ({ level = 1, population = 8, type = "camp" } = {}) => {
  const progression = new LocationProgressionService({ mode: "expert" });
  const service = new CampImprovementService({
    progressionService: progression,
  });
  const location = new Location({
    id: "camp",
    name: "Camp",
    type,
    populationCapacity: type === "camp" ? null : 40,
    source: "generated",
    position: { latitude: 0, longitude: 0 },
    ownerId: "p1",
    level,
    population,
    resources: {
      stock: { wood: 200, stone: 100, iron: 50, gold: 100 },
      storageCapacity: 500,
    },
    qr: { enabled: false },
  });
  progression.initialize(location);
  service.applyEffects(location);
  return { location, progression, service };
};

test("les fondations ne consomment pas les emplacements de développement", () => {
  const { location, service } = create();
  assert.equal(service.build(location, "housing").success, true);
  assert.equal(service.build(location, "barricades").success, true);
  assert.deepEqual(service.getState(location).slots, { used: 0, maximum: 2 });
  assert.equal(service.build(location, "depot").success, true);
  assert.equal(service.build(location, "trading_post").success, true);
  assert.equal(service.build(location, "watch_post").success, true);
  assert.deepEqual(service.getState(location).slots, { used: 1, maximum: 2 });
  assert.deepEqual(service.getState(location).reservedSlots, { used: 2, maximum: 3 });
});

for (const branch of ["village", "fort"]) {
  test(`les slots libres pleins ne bloquent pas les prérequis du ${branch}`, () => {
    const { location, service, progression } = create({ level: 3, population: 20 });
    location.infrastructure = {
      housing: 2, barricades: 3, depot: 1, hunting_lodge: 1,
      prospecting_post: 1, messenger_relay: 1,
    };
    for (const id of ["trading_post", "healing_tent", "watch_post", "watch_post"]) {
      assert.equal(service.getState(location).improvements.find((entry) => entry.id === id).unavailableReason, null);
      assert.equal(service.build(location, id).success, true);
    }
    assert.deepEqual(service.getState(location).slots, { used: 4, maximum: 4 });
    assert.deepEqual(service.getState(location).reservedSlots, { used: 3, maximum: 3 });
    const before = { ...location.infrastructure };
    progression.awardExperience(location, 1000, "test");
    assert.equal(service.evolve(location, branch).success, true);
    assert.deepEqual(location.infrastructure, before);
    const restored = new Location(JSON.parse(JSON.stringify(location)));
    service.applyEffects(restored);
    assert.deepEqual(service.getState(restored).slots, { used: 4, maximum: branch === "fort" ? 5 : 4 });
    assert.deepEqual(service.getState(restored).reservedSlots, { used: 3, maximum: 3 });
  });
}

test("les tentes augmentent la capacité sans cumuler les bonus lors des recalculs et rechargements", () => {
  const { location, progression, service } = create();
  assert.equal(location.populationCapacity, 8);
  assert.equal(service.build(location, "housing").success, true);
  assert.equal(location.populationCapacity, 12);
  assert.equal(service.build(location, "housing").success, true);
  assert.equal(location.populationCapacity, 16);
  assert.equal(location.population, 8);
  service.applyEffects(location);
  assert.equal(location.populationCapacity, 16);
  const restored = new Location(JSON.parse(JSON.stringify(location)));
  progression.initialize(restored);
  service.applyEffects(restored);
  assert.equal(restored.populationCapacity, 16);
  assert.equal(
    service.build(restored, "housing").reason,
    "maximum_improvement_level",
  );
  assert.equal(restored.populationCapacity, 16);
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
  service.build(location, "housing");
  service.build(location, "barricades");
  service.build(location, "depot");
  progression.awardExperience(location, 50, "quest");
  const status = service.getLevelUpStatus(location);
  assert.equal(status.eligible, true);
  assert.equal(service.levelUp(location).success, true);
  assert.equal(location.level, 2);
  assert.equal(location.populationCapacity, 19);
});

test("le Camp 3 débloque prospection et messagers sans lancer leurs missions", () => {
  const { location, service } = create({ level: 3, population: 20 });
  assert.equal(service.build(location, "prospecting_post").success, true);
  assert.equal(service.build(location, "messenger_relay").success, true);
  assert.equal(location.features.prospecting, true);
  assert.equal(location.features.messaging, true);
});

test("le Camp 3 reste un camp jusqu'au choix explicite d'une branche", () => {
  const { location, progression, service } = create({
    level: 2,
    population: 20,
  });
  service.build(location, "housing");
  service.build(location, "housing");
  service.build(location, "barricades");
  service.build(location, "barricades");
  service.build(location, "depot");
  service.build(location, "trading_post");
  progression.awardExperience(
    location,
    progression.getExperienceRequired(location),
    "quest",
  );
  assert.equal(service.levelUp(location).success, true);
  assert.equal(location.type, "camp");
  assert.equal(location.level, 3);
});

test("un Camp 3 civil peut devenir volontairement un village", () => {
  const { location, progression, service } = create({
    level: 3,
    population: 20,
  });
  service.build(location, "housing");
  service.build(location, "housing");
  service.build(location, "trading_post");
  service.build(location, "healing_tent");
  progression.awardExperience(
    location,
    progression.getExperienceRequired(location),
    "quest",
  );
  const result = service.evolve(location, "village");
  assert.equal(result.success, true);
  assert.equal(location.type, "village");
  assert.equal(location.level, 1);
  assert.equal(location.populationCapacity, 40);
});

test("un Camp 3 militaire peut devenir volontairement un fort", () => {
  const { location, progression, service } = create({
    level: 3,
    population: 12,
  });
  service.build(location, "barricades");
  service.build(location, "barricades");
  service.build(location, "barricades");
  service.build(location, "watch_post");
  service.build(location, "watch_post");
  service.build(location, "workshop");
  progression.awardExperience(
    location,
    progression.getExperienceRequired(location),
    "quest",
  );
  const result = service.evolve(location, "fort");
  assert.equal(result.success, true);
  assert.equal(location.type, "fort");
  assert.equal(location.level, 1);
  assert.equal(location.defenseSlots, 3);
});

test("les nouveaux bâtiments sont présents avec leurs niveaux et prérequis", () => {
  const { location, service } = create({ level: 3, population: 20 });
  const state = service.getState(location);
  for (const id of [
    "tavern",
    "forge",
    "stable",
    "barracks",
    "magic_academy",
    "armorers",
    "archery_range",
    "palisades",
    "walls",
    "ramparts",
    "chapel",
    "habitation",
    "farm",
    "palace",
    "houses",
    "brewery",
    "military_school",
  ])
    assert.ok(
      state.improvements.some((entry) => entry.id === id),
      id,
    );
});

test("les habitations augmentent la capacité et la ferme produit de la nourriture", () => {
  const { location, service } = create({ type: "village", population: 8 });
  service.build(location, "habitation");
  service.build(location, "farm");
  assert.equal(location.populationCapacity, 44);
  assert.equal(location.resources.production.food, 2);
});

test("la population croît par cycle selon les habitants et les infrastructures sans dépasser la capacité", () => {
  const { location, service } = create({ type: "village", population: 20 });
  service.build(location, "habitation");
  service.build(location, "farm");
  const first = service.advancePopulation(location, 3);
  assert.equal(first.gained, 2);
  const final = service.advancePopulation(location, 100);
  assert.equal(final.population, location.populationCapacity);
});

test("les combinaisons militaires débloquent les unités et augmentent leurs capacités", () => {
  const { location, service } = create({ level: 3, population: 20 });
  location.infrastructure = {
    hunting_lodge: 1,
    barracks: 2,
    forge: 1,
    archery_range: 2,
    stable: 1,
    armorers: 1,
  };
  service.applyEffects(location);
  assert.deepEqual(
    new Set(location.recruitment.availableUnitTypeIds),
    new Set([
      "archer",
      "swordsman",
      "spearman",
      "mounted-archer",
      "light-cavalry",
      "heavy-cavalry",
      "heavy-infantry",
    ]),
  );
  assert.equal(location.recruitment.capacities.archer, 12);
  assert.equal(location.recruitment.capacities.spearman, 7);
  assert.equal(location.recruitment.capacities.swordsman, 7);
});

test("un village débloque les miliciens", () => {
  const { location, progression, service } = create({
    level: 3,
    population: 20,
  });
  location.infrastructure = { housing: 2, trading_post: 1, healing_tent: 1 };
  progression.awardExperience(
    location,
    progression.getExperienceRequired(location),
    "quest",
  );
  assert.equal(service.evolve(location, "village").success, true);
  assert.ok(location.recruitment.availableUnitTypeIds.includes("militia"));
});

test("les enceintes évoluent dans un seul slot et respectent le rang du lieu", () => {
  const { location, service } = create({ level: 3, population: 20 });
  assert.equal(
    service.build(location, "walls").reason,
    "improvement_not_available_here",
  );
  assert.equal(
    service.build(location, "palisades").reason,
    "improvement_not_available_here",
  );
  location.type = "village";
  assert.equal(service.build(location, "palisades").success, true);
  assert.deepEqual(service.getFortificationSlots(location), {
    used: 1,
    maximum: 1,
    free: 0,
  });
  assert.equal(service.build(location, "walls").success, true);
  assert.equal(location.infrastructure.palisades, undefined);
  assert.equal(location.infrastructure.walls, 1);
  assert.equal(
    service.build(location, "palisades").reason,
    "improvement_not_available_here",
  );
});

test("la brasserie produit des tonneaux de bière", () => {
  const { location, service } = create({ type: "village", population: 20 });
  assert.equal(service.build(location, "brewery").success, true);
  assert.equal(location.resources.production.beer, 1);
});

test("l'écurie produit des chevaux", () => {
  const { location, service } = create({ type: "village", population: 20 });
  assert.equal(service.build(location, "stable").success, true);
  assert.equal(location.resources.production.horse, 1);
  assert.equal(service.build(location, "stable").success, true);
  assert.equal(location.resources.production.horse, 2);
});

test("le menu de progression ne retient que les constructions utiles au prochain niveau", () => {
  const { location, service } = create({ level: 1, population: 8 });
  let ids = service.getProgressionImprovementIds(location);
  assert.ok(ids.includes("housing"));
  assert.ok(ids.includes("barricades"));
  assert.ok(ids.includes("depot"));
  service.build(location, "housing");
  service.build(location, "barricades");
  service.build(location, "depot");
  ids = service.getProgressionImprovementIds(location);
  assert.equal(ids.includes("housing"), false);
  assert.equal(ids.includes("barricades"), false);
  assert.equal(ids.includes("trading_post"), false);
});

test("au camp maximal le menu réunit uniquement les besoins des évolutions", () => {
  const { location, service } = create({ level: 3, population: 20 });
  const ids = service.getProgressionImprovementIds(location);
  assert.ok(ids.includes("housing"));
  assert.ok(ids.includes("barricades"));
  assert.ok(ids.includes("trading_post"));
  assert.ok(ids.includes("watch_post"));
  assert.equal(ids.includes("magic_academy"), false);
});

test("un camp refuse les bâtiments permanents dans le catalogue et dans le moteur", () => {
  for (const level of [1, 2, 3]) {
    const { location, service } = create({ level });
    for (const id of [
      "tavern",
      "stable",
      "forge",
      "farm",
      "brewery",
      "habitation",
      "barracks",
      "magic_academy",
      "palace",
      "chapel",
    ]) {
      assert.equal(
        service.getState(location).improvements.find((entry) => entry.id === id)
          .available,
        false,
        id,
      );
      const before = JSON.stringify(location);
      assert.equal(service.build(location, id).success, false, id);
      assert.equal(JSON.stringify(location), before);
    }
  }
});

test("les prérequis de village et de fort sont distincts des choix facultatifs", () => {
  const { location, service } = create({ level: 3, population: 20 });
  const entry = (id) =>
    service.getState(location).improvements.find((item) => item.id === id);
  assert.deepEqual(entry("trading_post").progressionRequirements, [
    { targetId: "village", label: "Village", kind: "required", level: 1 },
  ]);
  assert.equal(entry("watch_post").progressionRequirements[0].targetId, "fort");
  assert.deepEqual(entry("hunting_lodge").progressionRequirements, []);
  assert.equal(entry("hunting_lodge").available, true);
  service.build(location, "trading_post");
  assert.deepEqual(entry("trading_post").progressionRequirements, []);
  assert.equal(entry("trading_post").available, true);
});

test("les fondations ne satisfont pas le choix de catégories de développement", () => {
  const { location, service } = create({ level: 2 });
  location.infrastructure = { housing: 2, barricades: 2, depot: 1 };
  const choices = service.getProgressionImprovementIds(location);
  assert.ok(choices.includes("trading_post"));
  assert.ok(choices.includes("healing_tent"));
  assert.ok(!choices.includes("workshop"));
  const entry = service
    .getState(location)
    .improvements.find((item) => item.id === "trading_post");
  assert.equal(entry.progressionRequirements[0].kind, "alternative");
});

test("un emplacement plein bloque les nouvelles constructions mais pas les upgrades", () => {
  const { location, service } = create({ type: "village" });
  location.infrastructure = { depot: 1, tavern: 1, forge: 1, stable: 1 };
  const state = service.getState(location);
  assert.ok(
    state.improvements.find((entry) => entry.id === "barracks")
      .unavailableReason,
  );
  assert.equal(
    state.improvements.find((entry) => entry.id === "depot").unavailableReason,
    null,
  );
  assert.equal(
    service.build(location, "barracks").reason,
    "no_development_slot",
  );
  assert.equal(service.build(location, "depot").success, true);
});

test("l'évolution débloque les bâtiments permanents du village", () => {
  const { location, progression, service } = create({
    level: 3,
    population: 20,
  });
  location.infrastructure = { housing: 2, trading_post: 1, healing_tent: 1 };
  progression.awardExperience(
    location,
    progression.getExperienceRequired(location),
    "test",
  );
  assert.equal(service.evolve(location, "village").success, true);
  const state = service.getState(location);
  for (const id of ["tavern", "stable", "habitation", "farm"])
    assert.equal(
      state.improvements.find((entry) => entry.id === id).available,
      true,
    );
});
