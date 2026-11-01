import {
  terrainAllowsBranch,
  RESOURCE_CAMP_COST,
  RESOURCE_CAMP_PRODUCTION_RATE,
} from "./camp-terrain-rules.js";
import {
  planLocationPayment,
  spendLocationPayment,
} from "./location-payment.js";

export const CAMP_DEVELOPMENT_SLOTS = Object.freeze({ 1: 2, 2: 3, 3: 4 });
export const LOCATION_DEVELOPMENT_SLOTS = Object.freeze({
  village: 4,
  town: 6,
  capital: 17,
  fort: 5,
});
export const LOCATION_FORTIFICATION_SLOTS = Object.freeze({
  camp: 1,
  village: 1,
  town: 2,
  capital: 4,
  fort: 2,
});

// Temporary installations only; permanent buildings unlock after evolution.
export const CAMP_BUILDING_IDS = Object.freeze([
  "housing",
  "barricades",
  "depot",
  "trading_post",
  "watch_post",
  "healing_tent",
  "hunting_lodge",
  "prospecting_post",
  "messenger_relay",
]);

const SETTLEMENT_TYPES = new Set([
  "camp",
  "village",
  "town",
  "capital",
  "fort",
]);
const FORTIFICATION_TIERS = Object.freeze({
  barricades: 1,
  palisades: 2,
  walls: 3,
  ramparts: 4,
});
const MAX_FORTIFICATION_TIER = Object.freeze({
  camp: 2,
  village: 3,
  town: 4,
  capital: 4,
  fort: 4,
});
const CAMP_BASE_POPULATION_CAPACITY = Object.freeze({ 1: 8, 2: 15, 3: 25 });

export const CAMP_IMPROVEMENTS = Object.freeze({
  housing: improvement("Tentes d'habitation", "fundamental", "population", 1, [
    level({ wood: 5 }, "Ajoute 4 places de population.", {
      populationCapacity: 4,
    }),
    level({ wood: 10, stone: 5 }, "Porte le bonus à 8 places de population.", {
      populationCapacity: 8,
    }),
  ]),
  barricades: improvement("Barricades", "fundamental", "defense", 1, [
    level({ wood: 8 }, "Ajoute +1 défense aux défenseurs."),
    level({ wood: 15, stone: 5 }, "Porte le bonus de défense à +2."),
    level(
      { wood: 20, stone: 10 },
      "Porte le bonus de défense à +3 ; requis pour fonder un fort.",
    ),
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
      level(
        { wood: 8, gold: 5 },
        "Ouvre le commerce et les convois entre vos lieux.",
      ),
      level(
        { wood: 12, gold: 10 },
        "Importe des ressources non produites : prix doublé, stock limité renouvelé toutes les 10 min.",
      ),
    ],
  ),
  watch_post: improvement("Poste de guet", "development", "defense", 1, [
    level(
      { wood: 8 },
      "Surveille les environs à 250 m du lieu (35 en simulation).",
    ),
    level(
      { wood: 12, iron: 2 },
      "Ajoute un éclaireur en patrouille jusqu’à 450 m du lieu (60 en simulation).",
    ),
  ]),
  defense_tower: improvement("Tour de défense", "development", "defense", 2, [
    level(
      { wood: 15, stone: 15, iron: 3 },
      "Ajoute +2 attaque aux défenseurs, en plus de l’enceinte.",
    ),
    level(
      { stone: 25, iron: 8, gold: 8 },
      "Porte le bonus à +4 attaque, en plus de l’enceinte.",
    ),
  ]),
  healing_tent: improvement("Tente de soins", "development", "population", 2, [
    level(
      { wood: 10, gold: 5 },
      "Soigne le héros de 1 PV/cycle ; soins des soldats à 1 or par blessé.",
    ),
    level(
      { wood: 15, gold: 10 },
      "Soigne le héros de 2 PV/cycle ; +1 moral à son armée jusqu’à la prochaine bataille.",
    ),
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
        "Expédition : 5 vivres, 5 habitants, 1 spécialiste et 1 outil ; bière pour la portée, chevaux pour la vitesse.",
      ),
    ],
  ),
  messenger_relay: improvement(
    "Relais de messagers",
    "development",
    "information",
    3,
    [
      level(
        { wood: 10, gold: 10 },
        "Envoie des messagers : alertes d’attaque, détections du guet et messages entre joueurs.",
      ),
    ],
  ),
  tavern: improvement("Taverne", "development", "population", 2, [
    level(
      { wood: 12, gold: 5 },
      "Croissance +1 point/cycle ; PNJ, missions et +1 moral avant bataille.",
      { populationGrowthRate: 0.01 },
    ),
    level(
      { wood: 18, stone: 5, gold: 10 },
      "Croissance +2 points/cycle ; une place de PNJ supplémentaire et +2 moral avant bataille.",
      { populationGrowthRate: 0.02 },
    ),
  ]),
  forge: improvement("Forge", "development", "craft", 2, [
    level(
      { wood: 10, stone: 8, iron: 5 },
      "Vend des armes et outils ; trois fabrications d’équipement par forge.",
    ),
    level(
      { wood: 15, stone: 12, iron: 10 },
      "Autorise les recettes rares, dans la limite des trois fabrications.",
    ),
  ]),
  stable: improvement("Écurie", "development", "military", 2, [
    level(
      { wood: 15, gold: 5 },
      "Produit des chevaux et ouvre la branche de recrutement de cavalerie.",
      { horseProduction: 1 },
    ),
    level(
      { wood: 20, stone: 5, gold: 10 },
      "Double la production de chevaux et augmente les capacités équestres du lieu.",
      { horseProduction: 2 },
    ),
  ]),
  barracks: improvement("Caserne", "development", "military", 2, [
    level(
      { wood: 15, stone: 10, iron: 3 },
      "Donne au héros +1 attaque et défense une fois ; ajoute un emplacement de garnison.",
    ),
    level(
      { wood: 20, stone: 15, iron: 6 },
      "Augmente les réserves de recrues ; conserve le bonus de héros et la place de garnison.",
    ),
  ]),
  magic_academy: improvement(
    "Académie de magie",
    "development",
    "knowledge",
    3,
    [
      level(
        { wood: 20, stone: 20, gold: 25 },
        "Forme les mages ; propose une divination à toute classe pour 50 or.",
      ),
      level(
        { stone: 30, iron: 5, gold: 40 },
        "Ajoute une seconde formation de mage ; divination disponible pour 50 or.",
      ),
    ],
  ),
  armorers: improvement("Armuriers", "development", "craft", 3, [
    level(
      { wood: 15, iron: 12, gold: 10 },
      "Débloque la fabrication d'armures.",
    ),
    level(
      { stone: 15, iron: 20, gold: 15 },
      "Vend des équipements renforcés : +1 aux bonus d’attaque et de défense existants.",
    ),
  ]),
  archery_range: improvement("Champ de tir", "development", "military", 2, [
    level({ wood: 15, iron: 2 }, "Débloque l'entraînement des archers."),
    level(
      { wood: 22, stone: 5, iron: 5 },
      "Améliore l'entraînement à distance.",
    ),
  ]),
  palisades: improvement("Palissades", "fundamental", "defense", 1, [
    level({ wood: 15 }, "Accorde +4 défense aux défenseurs."),
    level({ wood: 25, iron: 3 }, "Porte le bonus de défense à +5."),
  ]),
  walls: improvement("Murs", "fundamental", "defense", 2, [
    level(
      { stone: 20, wood: 10 },
      "Accorde +5 défense et +1 attaque aux défenseurs.",
    ),
    level(
      { stone: 35, iron: 5 },
      "Accorde +6 défense et +2 attaque aux défenseurs.",
    ),
  ]),
  ramparts: improvement("Murailles", "fundamental", "defense", 3, [
    level(
      { stone: 45, iron: 10, gold: 10 },
      "Accorde +7 défense et +3 attaque ; cumulable avec la tour.",
    ),
  ]),
  chapel: improvement("Chapelle", "development", "population", 2, [
    level(
      { wood: 12, stone: 10, gold: 5 },
      "Soigne 1 PV par cycle, cumulable avec la tente ; résurrection à 50 % et croissance accrue.",
      { populationGrowthRate: 0.005 },
    ),
    level(
      { stone: 20, gold: 12 },
      "Soigne 2 PV par cycle, cumulables avec la tente ; résurrection à 75 % des PV.",
      { populationGrowthRate: 0.01 },
    ),
  ]),
  habitation: improvement("Habitations", "fundamental", "population", 1, [
    level({ wood: 12 }, "Ajoute 4 places de population.", {
      populationCapacity: 4,
      populationGrowthRate: 0.005,
    }),
    level({ wood: 20, stone: 8 }, "Ajoute 8 places de population.", {
      populationCapacity: 8,
      populationGrowthRate: 0.01,
    }),
    level({ wood: 25, stone: 15, iron: 3 }, "Ajoute 14 places de population.", {
      populationCapacity: 14,
      populationGrowthRate: 0.015,
    }),
  ]),
  farm: improvement("Ferme", "development", "economy", 1, [
    level({ wood: 12 }, "Produit de la nourriture et favorise la croissance.", {
      foodProduction: 2,
      populationGrowthRate: 0.01,
    }),
    level({ wood: 18, stone: 5 }, "Augmente la production agricole.", {
      foodProduction: 4,
      populationGrowthRate: 0.02,
    }),
    level(
      { wood: 25, stone: 10, iron: 3 },
      "Établit une exploitation agricole majeure.",
      { foodProduction: 7, populationGrowthRate: 0.03 },
    ),
  ]),
  palace: improvement("Palais", "development", "government", 3, [
    level(
      { wood: 30, stone: 40, iron: 10, gold: 50 },
      "Établit un centre de pouvoir et attire la population.",
      { populationCapacity: 10, populationGrowthRate: 0.02 },
    ),
  ]),
  houses: improvement("Maisons", "fundamental", "population", 2, [
    level({ wood: 15, stone: 5 }, "Ajoute 6 places de population.", {
      populationCapacity: 6,
      populationGrowthRate: 0.005,
    }),
    level({ wood: 25, stone: 12 }, "Ajoute 12 places de population.", {
      populationCapacity: 12,
      populationGrowthRate: 0.01,
    }),
    level({ wood: 35, stone: 20, iron: 4 }, "Ajoute 20 places de population.", {
      populationCapacity: 20,
      populationGrowthRate: 0.015,
    }),
  ]),
  brewery: improvement("Brasserie", "development", "economy", 2, [
    level(
      { wood: 12, stone: 5, gold: 5 },
      "Produit des tonneaux de bière et améliore l'attractivité.",
      { beerProduction: 1, populationGrowthRate: 0.005 },
    ),
    level(
      { wood: 18, stone: 10, gold: 10 },
      "Augmente la production de tonneaux de bière.",
      { beerProduction: 2, populationGrowthRate: 0.01 },
    ),
  ]),
  military_school: improvement(
    "École militaire",
    "development",
    "military",
    3,
    [
      level(
        { wood: 20, stone: 20, iron: 10, gold: 15 },
        "Débloque la formation militaire avancée.",
      ),
      level(
        { stone: 30, iron: 15, gold: 25 },
        "Ajoute une seconde formation : +1 attaque, +1 défense et une aptitude disponible.",
      ),
    ],
  ),
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
  "lumber-camp": Object.freeze({
    name: "Créer un camp de bûcheron",
    targetType: "lumber-camp",
    terrainResource: "wood",
    productionResource: "wood",
    population: 0,
    fundamentals: {},
    improvements: {},
    categories: [],
    costs: RESOURCE_CAMP_COST,
  }),
  quarry: Object.freeze({
    name: "Ouvrir une carrière",
    targetType: "quarry",
    terrainResource: "stone",
    productionResource: "stone",
    population: 0,
    fundamentals: {},
    improvements: {},
    categories: [],
    costs: RESOURCE_CAMP_COST,
  }),
  "iron-mine": Object.freeze({
    name: "Ouvrir une mine de fer",
    targetType: "mine",
    terrainResource: "iron",
    productionResource: "iron",
    population: 0,
    fundamentals: {},
    improvements: {},
    categories: [],
    costs: RESOURCE_CAMP_COST,
  }),
  "gold-mine": Object.freeze({
    name: "Ouvrir une mine d’or",
    targetType: "mine",
    terrainResource: "gold",
    productionResource: "gold",
    population: 0,
    fundamentals: {},
    improvements: {},
    categories: [],
    costs: RESOURCE_CAMP_COST,
  }),
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
    improvements: Object.freeze({ watch_post: 2 }),
    categories: Object.freeze(["defense"]),
    costs: Object.freeze({ wood: 45, stone: 25, iron: 10, gold: 15 }),
  }),
});

// Keep prerequisite buildings in dedicated slots, including after evolution.
const RESERVED_IMPROVEMENT_IDS = new Set(
  Object.values(CAMP_EVOLUTION_BRANCHES).flatMap((branch) =>
    Object.keys(branch.improvements),
  ),
);

export class CampImprovementService {
  constructor({ progressionService }) {
    this.progressionService = progressionService;
  }

  getState(location, hero = null) {
    if (!SETTLEMENT_TYPES.has(location.type)) return null;
    const improvements = Object.entries(CAMP_IMPROVEMENTS).map(
      ([id, definition]) => {
        const currentLevel = location.infrastructure[id] ?? 0;
        const nextLevel = currentLevel + 1;
        const next = definition.levels[nextLevel - 1] ?? null;
        return {
          id,
          name: definition.name,
          slotType: definition.slotType,
          reservedSlot: RESERVED_IMPROVEMENT_IDS.has(id),
          category: definition.category,
          minimumCampLevel: definition.minimumCampLevel,
          level: currentLevel,
          maximumLevel: definition.levels.length,
          nextLevel,
          next,
          payment: next
            ? planLocationPayment(location, next.costs, hero)
            : null,
          progressionRequirements: this.getImprovementProgression(location, id),
          available:
            next !== null &&
            this.#availabilityRank(location) >= definition.minimumCampLevel &&
            this.#isAllowedAtLocation(location, id),
        };
      },
    );
    const developmentUsed = improvements.filter(
      (entry) =>
        entry.slotType === "development" &&
        !entry.reservedSlot &&
        entry.level > 0,
    ).length;
    const maximumSlots =
      location.type === "camp"
        ? CAMP_DEVELOPMENT_SLOTS[location.level]
        : LOCATION_DEVELOPMENT_SLOTS[location.type];
    for (const entry of improvements) {
      entry.unavailableReason =
        entry.slotType === "development" &&
        !entry.reservedSlot &&
        entry.level === 0 &&
        developmentUsed >= maximumSlots
          ? "Aucun emplacement de développement libre. Démantelez un bâtiment pour construire."
          : null;
    }
    return {
      reservedSlots: {
        used: improvements.filter(
          (entry) => entry.reservedSlot && entry.level > 0,
        ).length,
        maximum: RESERVED_IMPROVEMENT_IDS.size,
      },
      slots: {
        used: developmentUsed,
        maximum:
          location.type === "camp"
            ? CAMP_DEVELOPMENT_SLOTS[location.level]
            : LOCATION_DEVELOPMENT_SLOTS[location.type],
      },
      fortificationSlots: this.getFortificationSlots(location),
      improvements,
    };
  }

  build(location, improvementId, hero = null) {
    if (!SETTLEMENT_TYPES.has(location.type))
      return { success: false, reason: "unsupported_location" };
    const definition = CAMP_IMPROVEMENTS[improvementId];
    if (!definition) return { success: false, reason: "unknown_improvement" };
    if (this.#availabilityRank(location) < definition.minimumCampLevel)
      return { success: false, reason: "camp_level_too_low" };
    if (!this.#isAllowedAtLocation(location, improvementId))
      return { success: false, reason: "improvement_not_available_here" };
    const currentLevel = location.infrastructure[improvementId] ?? 0;
    const next = definition.levels[currentLevel];
    if (!next) return { success: false, reason: "maximum_improvement_level" };
    const state = this.getState(location);
    if (
      definition.slotType === "development" &&
      !RESERVED_IMPROVEMENT_IDS.has(improvementId) &&
      currentLevel === 0 &&
      state.slots.used >= state.slots.maximum
    )
      return { success: false, reason: "no_development_slot" };
    if (!planLocationPayment(location, next.costs, hero).affordable)
      return {
        success: false,
        reason: "insufficient_resources",
        costs: { ...next.costs },
      };
    spendLocationPayment(location, next.costs, hero);
    this.#replaceBranchPredecessors(location, improvementId);
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
    delete location.infrastructure.workshop;
    if (location.type === "camp") this.progressionService.initialize(location);
    if (["village", "town", "capital"].includes(location.type))
      this.#unlockRecruitment(location, "militia");
    const depotLevel = location.infrastructure.depot ?? 0;
    location.resources.infrastructureStorage =
      CAMP_IMPROVEMENTS.depot.levels[depotLevel - 1]?.effects
        .infrastructureStorage ?? 0;
    location.recalculateStorageCapacity();
    const previousGarrisonBonus =
      location.statistics.infrastructureGarrisonBonus ?? 0;
    const garrisonBonus = (location.infrastructure.barracks ?? 0) > 0 ? 1 : 0;
    if (location.type === "camp") {
      location.defenseSlots += garrisonBonus;
    } else {
      location.defenseSlots = Math.max(
        0,
        location.defenseSlots - previousGarrisonBonus + garrisonBonus,
      );
    }
    location.statistics.infrastructureGarrisonBonus = garrisonBonus;
    location.features.garrison = true;
    location.features.healing =
      location.features.healing === true ||
      (location.infrastructure.healing_tent ?? 0) > 0 ||
      (location.infrastructure.chapel ?? 0) > 0;
    location.features.trade = (location.infrastructure.trading_post ?? 0) > 0;
    location.features.watch = (location.infrastructure.watch_post ?? 0) > 0;
    location.features.prospecting =
      (location.infrastructure.prospecting_post ?? 0) > 0;
    location.features.messaging =
      (location.infrastructure.messenger_relay ?? 0) > 0;
    const huntingLevel = location.infrastructure.hunting_lodge ?? 0;
    const farmLevel = location.infrastructure.farm ?? 0;
    const farmFood =
      CAMP_IMPROVEMENTS.farm.levels[farmLevel - 1]?.effects.foodProduction ?? 0;
    const breweryLevel = location.infrastructure.brewery ?? 0;
    const beerProduction =
      CAMP_IMPROVEMENTS.brewery.levels[breweryLevel - 1]?.effects
        .beerProduction ?? 0;
    const stableLevel = location.infrastructure.stable ?? 0;
    const horseProduction =
      CAMP_IMPROVEMENTS.stable.levels[stableLevel - 1]?.effects
        .horseProduction ?? 0;
    const previousFoodBonus =
      location.statistics.infrastructureFoodProductionBonus ?? 0;
    const foodBonus = huntingLevel + farmFood;
    location.resources.production.food = Math.max(
      0,
      (location.resources.production.food ?? 0) - previousFoodBonus + foodBonus,
    );
    location.statistics.infrastructureFoodProductionBonus = foodBonus;
    if (beerProduction > 0) {
      location.features.resourceProduction = true;
      location.resources.production.beer = beerProduction;
    }
    const previousHorseBonus =
      location.statistics.infrastructureHorseProductionBonus ?? 0;
    location.resources.production.horse = Math.max(
      0,
      (location.resources.production.horse ?? 0) -
        previousHorseBonus +
        horseProduction,
    );
    location.statistics.infrastructureHorseProductionBonus = horseProduction;
    location.features.resourceProduction = Object.values(
      location.resources.production,
    ).some((amount) => amount > 0);
    location.features.recruitment =
      location.features.recruitment === true ||
      huntingLevel > 0 ||
      location.recruitment.availableUnitTypeIds.length > 0;
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
    const previousCapacityBonus =
      location.statistics.infrastructurePopulationCapacityBonus ?? 0;
    if (location.type === "camp")
      location.statistics.infrastructureBasePopulationCapacity =
        CAMP_BASE_POPULATION_CAPACITY[location.level] ??
        location.populationCapacity ??
        0;
    else
      location.statistics.infrastructureBasePopulationCapacity ??= Math.max(
        0,
        (location.populationCapacity ?? 0) - previousCapacityBonus,
      );
    const capacityBonus = this.#sumCurrentEffects(
      location,
      "populationCapacity",
    );
    location.populationCapacity = Math.max(
      0,
      location.statistics.infrastructureBasePopulationCapacity + capacityBonus,
    );
    location.statistics.infrastructurePopulationCapacityBonus = capacityBonus;
    location.features.forge = (location.infrastructure.forge ?? 0) > 0;
    location.features.stable = (location.infrastructure.stable ?? 0) > 0;
    location.features.militaryTraining =
      (location.infrastructure.barracks ?? 0) > 0 ||
      (location.infrastructure.military_school ?? 0) > 0;
    location.features.magicTraining =
      (location.infrastructure.magic_academy ?? 0) > 0;
    location.features.armorer = (location.infrastructure.armorers ?? 0) > 0;
    location.features.trade =
      location.features.trade ||
      (location.infrastructure.forge ?? 0) > 0 ||
      (location.infrastructure.armorers ?? 0) > 0;
    location.features.sideQuests = (location.infrastructure.tavern ?? 0) > 0;
    location.features.chapelRevival = (location.infrastructure.chapel ?? 0) > 0;
    return this.getState(location);
  }

  getFortificationSlots(location) {
    const maximum = LOCATION_FORTIFICATION_SLOTS[location.type] ?? 0;
    const fortificationBuilt = Object.keys(FORTIFICATION_TIERS).some(
      (id) => (location.infrastructure[id] ?? 0) > 0,
    );
    const towerBuilt = (location.infrastructure.defense_tower ?? 0) > 0;
    const used = Number(fortificationBuilt) + Number(towerBuilt);
    return { used, maximum, free: Math.max(0, maximum - used) };
  }

  #availabilityRank(location) {
    return location.type === "camp"
      ? location.level
      : ({ village: 4, fort: 4, town: 5, capital: 6 }[location.type] ?? 0);
  }

  #isAllowedAtLocation(location, id) {
    if (location.type === "camp" && !CAMP_BUILDING_IDS.includes(id))
      return false;
    if (id === "housing") return location.type === "camp";
    if (id === "habitation")
      return (
        ["village", "town", "capital"].includes(location.type) ||
        (location.type === "camp" && location.level >= 3)
      );
    if (id === "houses") return ["town", "capital"].includes(location.type);
    const tier = FORTIFICATION_TIERS[id];
    if (tier) {
      if (tier > (MAX_FORTIFICATION_TIER[location.type] ?? 0)) return false;
      const currentTier = Math.max(
        0,
        ...Object.entries(FORTIFICATION_TIERS)
          .filter(
            ([candidate]) => (location.infrastructure[candidate] ?? 0) > 0,
          )
          .map(([, candidateTier]) => candidateTier),
      );
      if (currentTier > tier) return false;
      return (
        this.getFortificationSlots(location).free > 0 ||
        Object.keys(FORTIFICATION_TIERS).some(
          (candidate) => (location.infrastructure[candidate] ?? 0) > 0,
        )
      );
    }
    if (id === "defense_tower")
      return (
        location.type !== "camp" &&
        (this.getFortificationSlots(location).free > 0 ||
          (location.infrastructure.defense_tower ?? 0) > 0)
      );
    return true;
  }

  #replaceBranchPredecessors(location, id) {
    if (["housing", "habitation", "houses"].includes(id))
      ["housing", "habitation", "houses"]
        .filter((candidate) => candidate !== id)
        .forEach((candidate) => delete location.infrastructure[candidate]);
    if (Object.hasOwn(FORTIFICATION_TIERS, id))
      Object.keys(FORTIFICATION_TIERS)
        .filter((candidate) => candidate !== id)
        .forEach((candidate) => delete location.infrastructure[candidate]);
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
      throw new RangeError(
        "Le nombre de cycles démographiques doit être un entier positif.",
      );
    if (
      location.population === null ||
      location.population <= 0 ||
      location.populationCapacity === null ||
      location.state === "abandoned" ||
      location.state === "destroyed"
    )
      return { gained: 0, population: location.population };
    if ((location.statistics.prospectingPopulationAway ?? 0) > 0)
      return {
        gained: 0,
        population: location.population,
        reason: "expedition_active",
      };
    const infrastructureRate = this.#sumCurrentEffects(
      location,
      "populationGrowthRate",
    );
    const rate = Math.max(0, (0.02 + infrastructureRate) * modifier);
    const initial = location.population;
    let progress = location.statistics.populationGrowthProgress ?? 0;
    for (
      let cycle = 0;
      cycle < cycles && location.population < location.populationCapacity;
      cycle += 1
    ) {
      progress += location.population * rate;
      const newcomers = Math.min(
        Math.floor(progress),
        location.populationCapacity - location.population,
      );
      if (newcomers > 0) {
        location.addPopulation(newcomers);
        progress -= newcomers;
      }
    }
    location.statistics.populationGrowthProgress =
      location.population >= location.populationCapacity ? 0 : progress;
    return {
      gained: location.population - initial,
      population: location.population,
      capacity: location.populationCapacity,
      rate,
    };
  }

  #sumCurrentEffects(location, effectId) {
    return Object.entries(CAMP_IMPROVEMENTS).reduce(
      (total, [id, definition]) => {
        const currentLevel = location.infrastructure[id] ?? 0;
        return (
          total + (definition.levels[currentLevel - 1]?.effects[effectId] ?? 0)
        );
      },
      0,
    );
  }

  getLevelUpStatus(location, hero = null) {
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
    if (!planLocationPayment(location, requirements.costs, hero).affordable)
      blockers.push(`Ressources : ${formatCosts(requirements.costs)}`);
    return {
      eligible: blockers.length === 0,
      blockers,
      costs: { ...requirements.costs },
      payment: planLocationPayment(location, requirements.costs, hero),
      requiredExperience,
      requiredPopulation: requirements.population,
      requiredCategories: requirements.developmentCategories,
    };
  }

  getEvolutionState(location, hero = null) {
    return Object.entries(CAMP_EVOLUTION_BRANCHES)
      .filter(([, branch]) => terrainAllowsBranch(location, branch))
      .map(([id, branch]) => ({
        id,
        ...branch,
        ...this.getEvolutionStatus(location, id, hero),
      }));
  }

  getImprovementProgression(location, improvementId) {
    if (location.type !== "camp") return [];
    const definition = CAMP_IMPROVEMENTS[improvementId];
    if (!definition) return [];
    const next = CAMP_LEVEL_REQUIREMENTS[location.level];
    const targets = next
      ? [
          [
            `camp-${location.level + 1}`,
            { ...next, label: `Camp ${location.level + 1}` },
          ],
        ]
      : Object.entries(CAMP_EVOLUTION_BRANCHES).map(([id, branch]) => [
          id,
          { ...branch, label: id === "village" ? "Village" : "Fort" },
        ]);
    const builtDevelopmentCategories = new Set(
      Object.entries(location.infrastructure)
        .filter(
          ([id, level]) =>
            level > 0 && CAMP_IMPROVEMENTS[id]?.slotType === "development",
        )
        .map(([id]) => CAMP_IMPROVEMENTS[id].category),
    );
    return targets.flatMap(([targetId, requirements]) => {
      const requiredLevel = {
        ...requirements.fundamentals,
        ...requirements.improvements,
      }[improvementId];
      if (
        requiredLevel &&
        (location.infrastructure[improvementId] ?? 0) < requiredLevel
      )
        return [
          {
            targetId,
            label: requirements.label,
            kind: "required",
            level: requiredLevel,
          },
        ];
      if (
        requirements.developmentCategories > builtDevelopmentCategories.size &&
        definition.slotType === "development" &&
        !builtDevelopmentCategories.has(definition.category)
      )
        return [{ targetId, label: requirements.label, kind: "alternative" }];
      return [];
    });
  }

  getProgressionImprovementIds(location) {
    if (location.type !== "camp") return [];
    return this.getState(location)
      .improvements.filter(
        (entry) => entry.available && entry.progressionRequirements.length > 0,
      )
      .map((entry) => entry.id);
  }

  getEvolutionStatus(location, branchId, hero = null) {
    if (location.type !== "camp")
      return { eligible: false, reason: "not_a_camp", blockers: [] };
    const branch = CAMP_EVOLUTION_BRANCHES[branchId];
    if (!branch)
      return {
        eligible: false,
        reason: "unknown_evolution_branch",
        blockers: [],
      };
    if (!terrainAllowsBranch(location, branch))
      return {
        eligible: false,
        reason: "terrain_incompatible",
        blockers: ["Évolution incompatible avec le terrain."],
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
    if (!planLocationPayment(location, branch.costs, hero).affordable)
      blockers.push(`Ressources : ${formatCosts(branch.costs)}`);
    return {
      eligible: blockers.length === 0,
      blockers,
      requiredExperience,
      costs: { ...branch.costs },
      payment: planLocationPayment(location, branch.costs, hero),
    };
  }

  evolve(location, branchId, hero = null) {
    const branch = CAMP_EVOLUTION_BRANCHES[branchId];
    const status = this.getEvolutionStatus(location, branchId, hero);
    if (!status.eligible)
      return {
        success: false,
        reason: status.reason ?? "requirements_not_met",
        status,
      };
    spendLocationPayment(location, branch.costs, hero);
    location.progression.experience -= status.requiredExperience;
    location.type = branch.targetType;
    location.level = 1;
    location.features.evolvesToVillage = false;
    if (branch.productionResource) {
      location.resources.production[branch.productionResource] =
        RESOURCE_CAMP_PRODUCTION_RATE;
      location.features.resourceProduction = true;
    }
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

  levelUp(location, hero = null) {
    const status = this.getLevelUpStatus(location, hero);
    if (!status.eligible)
      return {
        success: false,
        reason: status.reason ?? "requirements_not_met",
        status,
      };
    spendLocationPayment(location, status.costs, hero);
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
function formatCosts(costs) {
  return Object.entries(costs)
    .map(([id, amount]) => `${amount} ${id}`)
    .join(", ");
}
