export const CAMP_DEVELOPMENT_SLOTS = Object.freeze({ 1: 2, 2: 3, 3: 4 });

export const CAMP_IMPROVEMENTS = Object.freeze({
  housing: improvement("Tentes d'habitation", "fundamental", "population", 1, [
    level(
      { wood: 5 },
      "Réduit le mécontentement lié à l'arrivée de population.",
    ),
    level({ wood: 10, stone: 5 }, "Améliore l'intégration de la population."),
  ]),
  barricades: improvement("Barricades", "fundamental", "defense", 1, [
    level({ wood: 8 }, "Renforce les points de vie du camp."),
    level(
      { wood: 15, stone: 5 },
      "Renforce davantage les points de vie du camp.",
    ),
    level({ wood: 20, stone: 10 }, "Prépare une évolution militaire."),
  ]),
  depot: improvement("Dépôt", "development", "logistics", 1, [
    level({ wood: 10 }, "Ajoute 4 slots universels.", {
      infrastructureStorage: 4,
    }),
    level({ wood: 15, stone: 5 }, "Ajoute 8 slots universels.", {
      infrastructureStorage: 8,
    }),
    level({ wood: 20, stone: 10, iron: 2 }, "Ajoute 14 slots universels.", {
      infrastructureStorage: 14,
    }),
  ]),
  trading_post: improvement(
    "Comptoir de commerce",
    "development",
    "economy",
    1,
    [
      level({ wood: 8, gold: 5 }, "Débloque le commerce du camp."),
      level({ wood: 12, gold: 10 }, "Améliore le commerce du camp."),
    ],
  ),
  workshop: improvement("Atelier de chantier", "development", "logistics", 1, [
    level({ wood: 10, iron: 2 }, "Prépare les travaux et le démantèlement."),
    level(
      { wood: 15, stone: 5, iron: 3 },
      "Améliore les travaux et la récupération.",
    ),
  ]),
  watch_post: improvement("Poste de guet", "development", "defense", 1, [
    level({ wood: 8 }, "Améliore la surveillance du camp."),
    level({ wood: 12, iron: 2 }, "Améliore encore la surveillance."),
  ]),
  healing_tent: improvement("Tente de soins", "development", "population", 2, [
    level({ wood: 10, gold: 5 }, "Débloque les soins des unités."),
    level({ wood: 15, gold: 10 }, "Prépare une infirmerie de campagne."),
  ]),
  hunting_lodge: improvement("Relais de chasse", "development", "economy", 2, [
    level({ wood: 10 }, "Produit de la nourriture et recrute des archers."),
    level({ wood: 15, iron: 2 }, "Augmente la production et le recrutement."),
  ]),
  prospecting_post: improvement(
    "Poste de prospection",
    "development",
    "information",
    3,
    [
      level(
        { wood: 15, gold: 10, iron: 2 },
        "Débloque les futures missions de prospection.",
      ),
    ],
  ),
  messenger_relay: improvement(
    "Relais de messagers",
    "development",
    "information",
    3,
    [level({ wood: 10, gold: 10 }, "Débloque les futurs messages physiques.")],
  ),
  tavern: improvement("Taverne", "development", "population", 2, [
    level({ wood: 12, gold: 5 }, "Favorise l'arrivée de nouveaux habitants.", { populationGrowthRate: 0.01 }),
    level({ wood: 18, stone: 5, gold: 10 }, "Renforce fortement l'attractivité du lieu.", { populationGrowthRate: 0.02 }),
  ]),
  forge: improvement("Forge", "development", "craft", 2, [
    level({ wood: 10, stone: 8, iron: 5 }, "Débloque le travail du métal."),
    level({ wood: 15, stone: 12, iron: 10 }, "Améliore la fabrication métallique."),
  ]),
  stable: improvement("Écurie", "development", "military", 2, [
    level({ wood: 15, gold: 5 }, "Permet d'accueillir et d'entraîner des montures."),
    level({ wood: 20, stone: 5, gold: 10 }, "Augmente les capacités équestres du lieu."),
  ]),
  barracks: improvement("Caserne", "development", "military", 2, [
    level({ wood: 15, stone: 10, iron: 3 }, "Débloque l'entraînement militaire."),
    level({ wood: 20, stone: 15, iron: 6 }, "Augmente la capacité de garnison."),
  ]),
  magic_academy: improvement("Académie de magie", "development", "knowledge", 3, [
    level({ wood: 20, stone: 20, gold: 25 }, "Débloque l'enseignement de la magie."),
    level({ stone: 30, iron: 5, gold: 40 }, "Développe la formation magique avancée."),
  ]),
  armorers: improvement("Armuriers", "development", "craft", 3, [
    level({ wood: 15, iron: 12, gold: 10 }, "Débloque la fabrication d'armures."),
    level({ stone: 15, iron: 20, gold: 15 }, "Améliore la qualité des armures."),
  ]),
  archery_range: improvement("Champ de tir", "development", "military", 2, [
    level({ wood: 15, iron: 2 }, "Débloque l'entraînement des archers."),
    level({ wood: 22, stone: 5, iron: 5 }, "Améliore l'entraînement à distance."),
  ]),
  palisades: improvement("Palissades", "fundamental", "defense", 1, [
    level({ wood: 15 }, "Renforce l'enceinte du lieu."),
    level({ wood: 25, iron: 3 }, "Épaissit l'enceinte en bois."),
  ]),
  walls: improvement("Murs", "fundamental", "defense", 2, [
    level({ stone: 20, wood: 10 }, "Établit une enceinte de pierre."),
    level({ stone: 35, iron: 5 }, "Renforce l'enceinte de pierre."),
  ]),
  ramparts: improvement("Murailles", "fundamental", "defense", 3, [
    level({ stone: 45, iron: 10, gold: 10 }, "Érige des fortifications monumentales."),
  ]),
  chapel: improvement("Chapelle", "development", "population", 2, [
    level({ wood: 12, stone: 10, gold: 5 }, "Soutient la cohésion et la croissance de la communauté.", { populationGrowthRate: 0.005 }),
    level({ stone: 20, gold: 12 }, "Accroît l'influence spirituelle du lieu.", { populationGrowthRate: 0.01 }),
  ]),
  habitation: improvement("Habitations", "fundamental", "population", 1, [
    level({ wood: 12 }, "Ajoute 4 places de population.", { populationCapacity: 4, populationGrowthRate: 0.005 }),
    level({ wood: 20, stone: 8 }, "Ajoute 8 places de population.", { populationCapacity: 8, populationGrowthRate: 0.01 }),
    level({ wood: 25, stone: 15, iron: 3 }, "Ajoute 14 places de population.", { populationCapacity: 14, populationGrowthRate: 0.015 }),
  ]),
  farm: improvement("Ferme", "development", "economy", 1, [
    level({ wood: 12 }, "Produit de la nourriture et favorise la croissance.", { foodProduction: 2, populationGrowthRate: 0.01 }),
    level({ wood: 18, stone: 5 }, "Augmente la production agricole.", { foodProduction: 4, populationGrowthRate: 0.02 }),
    level({ wood: 25, stone: 10, iron: 3 }, "Établit une exploitation agricole majeure.", { foodProduction: 7, populationGrowthRate: 0.03 }),
  ]),
  palace: improvement("Palais", "development", "government", 3, [
    level({ wood: 30, stone: 40, iron: 10, gold: 50 }, "Établit un centre de pouvoir et attire la population.", { populationCapacity: 10, populationGrowthRate: 0.02 }),
  ]),
  houses: improvement("Maisons", "fundamental", "population", 2, [
    level({ wood: 15, stone: 5 }, "Ajoute 6 places de population.", { populationCapacity: 6, populationGrowthRate: 0.005 }),
    level({ wood: 25, stone: 12 }, "Ajoute 12 places de population.", { populationCapacity: 12, populationGrowthRate: 0.01 }),
    level({ wood: 35, stone: 20, iron: 4 }, "Ajoute 20 places de population.", { populationCapacity: 20, populationGrowthRate: 0.015 }),
  ]),
  brewery: improvement("Brasserie", "development", "economy", 2, [
    level({ wood: 12, stone: 5, gold: 5 }, "Améliore l'attractivité économique du lieu.", { populationGrowthRate: 0.005 }),
    level({ wood: 18, stone: 10, gold: 10 }, "Développe l'activité de la brasserie.", { populationGrowthRate: 0.01 }),
  ]),
  military_school: improvement("École militaire", "development", "military", 3, [
    level({ wood: 20, stone: 20, iron: 10, gold: 15 }, "Débloque la formation militaire avancée."),
    level({ stone: 30, iron: 15, gold: 25 }, "Améliore la formation des officiers."),
  ]),
});

export const CAMP_LEVEL_REQUIREMENTS = Object.freeze({
  1: Object.freeze({
    population: 6,
    fundamentals: { housing: 1, barricades: 1 },
    developmentCategories: 1,
    costs: Object.freeze({ wood: 20, gold: 10 }),
  }),
  2: Object.freeze({
    population: 12,
    fundamentals: { housing: 2, barricades: 2 },
    developmentCategories: 2,
    costs: Object.freeze({ wood: 35, stone: 15, gold: 20 }),
  }),
});

export const CAMP_EVOLUTION_BRANCHES = Object.freeze({
  village: Object.freeze({
    name: "Fonder un village",
    targetType: "village",
    population: 20,
    fundamentals: Object.freeze({ housing: 2 }),
    improvements: Object.freeze({ trading_post: 1, healing_tent: 1 }),
    categories: Object.freeze(["economy", "population"]),
    costs: Object.freeze({ wood: 40, stone: 20, gold: 25 }),
  }),
  fort: Object.freeze({
    name: "Ériger un fort",
    targetType: "fort",
    population: 12,
    fundamentals: Object.freeze({ barricades: 3 }),
    improvements: Object.freeze({ watch_post: 2, workshop: 1 }),
    categories: Object.freeze(["defense", "logistics"]),
    costs: Object.freeze({ wood: 45, stone: 25, iron: 10, gold: 15 }),
  }),
});

export class CampImprovementService {
  constructor({ progressionService }) {
    this.progressionService = progressionService;
  }

  getState(location) {
    if (location.type !== "camp") return null;
    const improvements = Object.entries(CAMP_IMPROVEMENTS).map(
      ([id, definition]) => {
        const currentLevel = location.infrastructure[id] ?? 0;
        const nextLevel = currentLevel + 1;
        const next = definition.levels[nextLevel - 1] ?? null;
        return {
          id,
          name: definition.name,
          slotType: definition.slotType,
          category: definition.category,
          minimumCampLevel: definition.minimumCampLevel,
          level: currentLevel,
          maximumLevel: definition.levels.length,
          nextLevel,
          next,
          available:
            next !== null && location.level >= definition.minimumCampLevel,
        };
      },
    );
    const developmentUsed = improvements.filter(
      (entry) => entry.slotType === "development" && entry.level > 0,
    ).length;
    return {
      slots: {
        used: developmentUsed,
        maximum: CAMP_DEVELOPMENT_SLOTS[location.level],
      },
      improvements,
    };
  }

  build(location, improvementId) {
    if (location.type !== "camp")
      return { success: false, reason: "not_a_camp" };
    const definition = CAMP_IMPROVEMENTS[improvementId];
    if (!definition) return { success: false, reason: "unknown_improvement" };
    if (location.level < definition.minimumCampLevel)
      return { success: false, reason: "camp_level_too_low" };
    const currentLevel = location.infrastructure[improvementId] ?? 0;
    const next = definition.levels[currentLevel];
    if (!next) return { success: false, reason: "maximum_improvement_level" };
    const state = this.getState(location);
    if (
      definition.slotType === "development" &&
      currentLevel === 0 &&
      state.slots.used >= state.slots.maximum
    )
      return { success: false, reason: "no_development_slot" };
    if (!hasResources(location.resources.stock, next.costs))
      return {
        success: false,
        reason: "insufficient_resources",
        costs: { ...next.costs },
      };
    spendResources(location.resources.stock, next.costs);
    location.infrastructure[improvementId] = currentLevel + 1;
    this.applyEffects(location);
    const experienceGained =
      definition.slotType === "fundamental"
        ? 15 + currentLevel * 5
        : 20 + currentLevel * 10;
    this.progressionService.awardExperience(
      location,
      experienceGained,
      `improvement_${improvementId}_${currentLevel + 1}`,
    );
    return {
      success: true,
      improvementId,
      level: currentLevel + 1,
      costs: { ...next.costs },
      experienceGained,
    };
  }

  applyEffects(location) {
    if (location.type !== "camp") {
      if (location.type === "village") this.#unlockRecruitment(location, "militia");
      return null;
    }
    this.progressionService.initialize(location);
    const depotLevel = location.infrastructure.depot ?? 0;
    location.resources.infrastructureStorage =
      CAMP_IMPROVEMENTS.depot.levels[depotLevel - 1]?.effects
        .infrastructureStorage ?? 0;
    location.recalculateStorageCapacity();
    location.features.garrison = true;
    location.features.healing = (location.infrastructure.healing_tent ?? 0) > 0;
    location.features.trade = (location.infrastructure.trading_post ?? 0) > 0;
    location.features.watch = (location.infrastructure.watch_post ?? 0) > 0;
    location.features.prospecting =
      (location.infrastructure.prospecting_post ?? 0) > 0;
    location.features.messaging =
      (location.infrastructure.messenger_relay ?? 0) > 0;
    const huntingLevel = location.infrastructure.hunting_lodge ?? 0;
    const farmLevel = location.infrastructure.farm ?? 0;
    const farmFood = CAMP_IMPROVEMENTS.farm.levels[farmLevel - 1]?.effects.foodProduction ?? 0;
    location.features.resourceProduction = huntingLevel > 0 || farmLevel > 0;
    location.resources.production.food = huntingLevel + farmFood;
    location.features.recruitment = huntingLevel > 0;
    if (
      huntingLevel > 0 &&
      !location.recruitment.availableUnitTypeIds.includes("archer")
    )
      location.recruitment.availableUnitTypeIds.push("archer");
    if (huntingLevel > 0) {
      location.recruitment.production.archer = huntingLevel;
      location.recruitment.stock.archer ??= 0;
      location.recruitment.capacities.archer = Math.max(
        location.recruitment.capacities.archer ?? 0,
        Math.floor((location.population ?? 0) / 4),
      );
    }
    this.#applyMilitaryRecruitment(location);
    const capacityBonus = this.#sumCurrentEffects(location, "populationCapacity");
    location.populationCapacity += capacityBonus;
    location.features.forge = (location.infrastructure.forge ?? 0) > 0;
    location.features.stable = (location.infrastructure.stable ?? 0) > 0;
    location.features.militaryTraining = (location.infrastructure.barracks ?? 0) > 0 || (location.infrastructure.military_school ?? 0) > 0;
    location.features.magicTraining = (location.infrastructure.magic_academy ?? 0) > 0;
    location.features.armorer = (location.infrastructure.armorers ?? 0) > 0;
    return this.getState(location);
  }

  #applyMilitaryRecruitment(location) {
    const level = (id) => location.infrastructure[id] ?? 0;
    const has = (id) => level(id) > 0;
    if (has("hunting_lodge")) this.#unlockRecruitment(location, "archer");
    if (has("barracks") && has("forge")) {
      this.#unlockRecruitment(location, "swordsman");
      this.#unlockRecruitment(location, "spearman");
    }
    if (has("stable") && has("archery_range"))
      this.#unlockRecruitment(location, "mounted-archer");
    if (has("stable") && has("barracks") && has("forge"))
      this.#unlockRecruitment(location, "light-cavalry");
    if (has("stable") && has("barracks") && has("armorers"))
      this.#unlockRecruitment(location, "heavy-cavalry");
    if (has("barracks") && has("armorers"))
      this.#unlockRecruitment(location, "heavy-infantry");

    const base = Math.max(1, Math.floor((location.population ?? 0) / 4));
    const capacityMultipliers = {
      militia: 1 + level("barracks") * 0.5,
      archer: 1 + level("barracks") * 0.25 + level("archery_range") * 0.5,
      spearman: 1 + level("armorers") * 0.5,
      swordsman: 1 + level("armorers") * 0.5,
    };
    location.recruitment.availableUnitTypeIds.forEach((typeId) => {
      location.recruitment.capacities[typeId] = Math.max(
        location.recruitment.capacities[typeId] ?? 0,
        Math.floor(base * (capacityMultipliers[typeId] ?? 1)),
      );
    });
  }

  #unlockRecruitment(location, typeId) {
    location.features.recruitment = true;
    if (!location.recruitment.availableUnitTypeIds.includes(typeId))
      location.recruitment.availableUnitTypeIds.push(typeId);
    location.recruitment.production[typeId] ??= 1;
    location.recruitment.stock[typeId] ??= 0;
    location.recruitment.weights[typeId] ??= 1;
    location.recruitment.capacities[typeId] ??= Math.max(
      1,
      Math.floor((location.population ?? 0) / 4),
    );
  }

  advancePopulation(location, cycles = 1, modifier = 1) {
    if (!Number.isInteger(cycles) || cycles <= 0)
      throw new RangeError("Le nombre de cycles démographiques doit être un entier positif.");
    if (location.population === null || location.population <= 0 || location.populationCapacity === null || location.state === "abandoned" || location.state === "destroyed")
      return { gained: 0, population: location.population };
    const infrastructureRate = location.type === "camp"
      ? this.#sumCurrentEffects(location, "populationGrowthRate")
      : 0;
    const rate = Math.max(0, (0.02 + infrastructureRate) * modifier);
    const initial = location.population;
    let progress = location.statistics.populationGrowthProgress ?? 0;
    for (let cycle = 0; cycle < cycles && location.population < location.populationCapacity; cycle += 1) {
      progress += location.population * rate;
      const newcomers = Math.min(Math.floor(progress), location.populationCapacity - location.population);
      if (newcomers > 0) {
        location.addPopulation(newcomers);
        progress -= newcomers;
      }
    }
    location.statistics.populationGrowthProgress = location.population >= location.populationCapacity ? 0 : progress;
    return { gained: location.population - initial, population: location.population, capacity: location.populationCapacity, rate };
  }

  #sumCurrentEffects(location, effectId) {
    return Object.entries(CAMP_IMPROVEMENTS).reduce((total, [id, definition]) => {
      const currentLevel = location.infrastructure[id] ?? 0;
      return total + (definition.levels[currentLevel - 1]?.effects[effectId] ?? 0);
    }, 0);
  }

  getLevelUpStatus(location) {
    if (location.type !== "camp")
      return { eligible: false, reason: "not_a_camp" };
    const requirements = CAMP_LEVEL_REQUIREMENTS[location.level];
    if (!requirements)
      return { eligible: false, reason: "maximum_level", blockers: [] };
    const requiredExperience =
      this.progressionService.getExperienceRequired(location);
    const categories = new Set(
      this.getState(location)
        .improvements.filter(
          (entry) => entry.slotType === "development" && entry.level > 0,
        )
        .map((entry) => entry.category),
    );
    const blockers = [];
    if ((location.population ?? 0) < requirements.population)
      blockers.push(
        `Population ${location.population ?? 0}/${requirements.population}`,
      );
    if (location.progression.experience < requiredExperience)
      blockers.push(
        `XP ${location.progression.experience}/${requiredExperience}`,
      );
    Object.entries(requirements.fundamentals).forEach(([id, level]) => {
      if ((location.infrastructure[id] ?? 0) < level)
        blockers.push(
          `${CAMP_IMPROVEMENTS[id].name} ${location.infrastructure[id] ?? 0}/${level}`,
        );
    });
    if (categories.size < requirements.developmentCategories)
      blockers.push(
        `Catégories ${categories.size}/${requirements.developmentCategories}`,
      );
    if (!hasResources(location.resources.stock, requirements.costs))
      blockers.push(`Ressources : ${formatCosts(requirements.costs)}`);
    return {
      eligible: blockers.length === 0,
      blockers,
      costs: { ...requirements.costs },
      requiredExperience,
      requiredPopulation: requirements.population,
      requiredCategories: requirements.developmentCategories,
    };
  }

  getEvolutionState(location) {
    return Object.entries(CAMP_EVOLUTION_BRANCHES).map(([id, branch]) => ({
      id,
      ...branch,
      ...this.getEvolutionStatus(location, id),
    }));
  }

  getEvolutionStatus(location, branchId) {
    if (location.type !== "camp")
      return { eligible: false, reason: "not_a_camp", blockers: [] };
    const branch = CAMP_EVOLUTION_BRANCHES[branchId];
    if (!branch)
      return {
        eligible: false,
        reason: "unknown_evolution_branch",
        blockers: [],
      };
    const blockers = [];
    if (location.level < 3) blockers.push(`Camp ${location.level}/3`);
    if ((location.population ?? 0) < branch.population)
      blockers.push(
        `Population ${location.population ?? 0}/${branch.population}`,
      );
    Object.entries(branch.fundamentals).forEach(([id, level]) => {
      if ((location.infrastructure[id] ?? 0) < level)
        blockers.push(
          `${CAMP_IMPROVEMENTS[id].name} ${location.infrastructure[id] ?? 0}/${level}`,
        );
    });
    Object.entries(branch.improvements).forEach(([id, level]) => {
      if ((location.infrastructure[id] ?? 0) < level)
        blockers.push(
          `${CAMP_IMPROVEMENTS[id].name} ${location.infrastructure[id] ?? 0}/${level}`,
        );
    });
    const builtCategories = new Set(
      this.getState(location)
        .improvements.filter((entry) => entry.level > 0)
        .map((entry) => entry.category),
    );
    branch.categories.forEach((category) => {
      if (!builtCategories.has(category))
        blockers.push(`Orientation ${category}`);
    });
    const requiredExperience =
      this.progressionService.getExperienceRequired(location);
    if (location.progression.experience < requiredExperience)
      blockers.push(
        `XP ${location.progression.experience}/${requiredExperience}`,
      );
    if (!hasResources(location.resources.stock, branch.costs))
      blockers.push(`Ressources : ${formatCosts(branch.costs)}`);
    return {
      eligible: blockers.length === 0,
      blockers,
      requiredExperience,
      costs: { ...branch.costs },
    };
  }

  evolve(location, branchId) {
    const branch = CAMP_EVOLUTION_BRANCHES[branchId];
    const status = this.getEvolutionStatus(location, branchId);
    if (!status.eligible)
      return {
        success: false,
        reason: status.reason ?? "requirements_not_met",
        status,
      };
    spendResources(location.resources.stock, branch.costs);
    location.progression.experience -= status.requiredExperience;
    location.type = branch.targetType;
    location.level = 1;
    location.features.evolvesToVillage = false;
    if (branch.targetType === "village")
      location.populationCapacity = Math.max(
        location.populationCapacity ?? 0,
        40,
      );
    if (branch.targetType === "fort")
      location.defenseSlots = Math.max(location.defenseSlots, 3);
    if (branch.targetType === "village")
      this.#unlockRecruitment(location, "militia");
    const durability = this.progressionService.initialize(location);
    if (durability) durability.health = durability.maxHealth;
    return {
      success: true,
      branchId,
      evolvedTo: branch.targetType,
      level: location.level,
      costs: { ...branch.costs },
    };
  }

  levelUp(location) {
    const status = this.getLevelUpStatus(location);
    if (!status.eligible)
      return {
        success: false,
        reason: status.reason ?? "requirements_not_met",
        status,
      };
    spendResources(location.resources.stock, status.costs);
    const result = this.progressionService.levelUp(location);
    if (!result.success) return result;
    this.applyEffects(location);
    return { ...result, costs: status.costs, evolvedTo: null };
  }
}

function improvement(name, slotType, category, minimumCampLevel, levels) {
  return Object.freeze({
    name,
    slotType,
    category,
    minimumCampLevel,
    levels: Object.freeze(levels),
  });
}
function level(costs, description, effects = {}) {
  return Object.freeze({
    costs: Object.freeze(costs),
    description,
    effects: Object.freeze(effects),
  });
}
function hasResources(stock, costs) {
  return Object.entries(costs).every(
    ([id, amount]) => (stock[id] ?? 0) >= amount,
  );
}
function spendResources(stock, costs) {
  Object.entries(costs).forEach(([id, amount]) => {
    stock[id] = (stock[id] ?? 0) - amount;
  });
}
function formatCosts(costs) {
  return Object.entries(costs)
    .map(([id, amount]) => `${amount} ${id}`)
    .join(", ");
}
