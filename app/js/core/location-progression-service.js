export const LOCATION_EVOLUTION = Object.freeze({
  camp: {
    previousType: null,
    nextType: null,
    maxLevel: 3,
    baseHealth: 80,
    healthPerLevel: 20,
    xpBase: 100,
  },
  village: {
    previousType: "camp",
    nextType: "town",
    maxLevel: 5,
    baseHealth: 180,
    healthPerLevel: 35,
    xpBase: 220,
  },
  town: {
    previousType: "village",
    nextType: "capital",
    maxLevel: 5,
    baseHealth: 400,
    healthPerLevel: 60,
    xpBase: 500,
  },
  capital: {
    previousType: "town",
    nextType: null,
    maxLevel: 10,
    baseHealth: 850,
    healthPerLevel: 90,
    xpBase: 1_000,
  },
  fort: {
    previousType: null,
    nextType: null,
    maxLevel: 5,
    baseHealth: 300,
    healthPerLevel: 65,
    xpBase: 400,
  },
  mine: {
    previousType: null,
    nextType: null,
    maxLevel: 5,
    baseHealth: 140,
    healthPerLevel: 30,
    xpBase: 250,
  },
});

export const CAMP_LEVELS = Object.freeze({
  1: Object.freeze({ populationCapacity: 8, defenseSlots: 1 }),
  2: Object.freeze({ populationCapacity: 15, defenseSlots: 1 }),
  3: Object.freeze({ populationCapacity: 25, defenseSlots: 2 }),
});

const MATERIAL_IDS = ["materials", "material", "stone", "wood"];

/** Règles de progression, siège et reconstruction, sans dépendance au DOM. */
export class LocationProgressionService {
  constructor({ mode = "casual" } = {}) {
    if (!["casual", "expert"].includes(mode))
      throw new RangeError("Le mode des lieux doit être casual ou expert.");
    this.mode = mode;
  }

  initialize(location) {
    const definition = LOCATION_EVOLUTION[location.type];
    this.#applyLevelProfile(location);
    if (!definition || (this.mode === "casual" && location.type !== "camp"))
      return null;
    const maxHealth = this.getMaxHealth(location);
    location.durability ??= {
      health: maxHealth,
      maxHealth,
      lastRegenerationAt: null,
    };
    location.durability.maxHealth = maxHealth;
    location.durability.health = Math.min(
      maxHealth,
      location.durability.health,
    );
    return location.durability;
  }

  getMaxHealth(location) {
    const definition = LOCATION_EVOLUTION[location.type];
    if (!definition) return 0;
    const improvements = Object.values(location.infrastructure ?? {}).reduce(
      (sum, level) => sum + level,
      0,
    );
    return (
      definition.baseHealth +
      definition.healthPerLevel * location.level +
      improvements * 25
    );
  }

  getExperienceRequired(location) {
    const definition = LOCATION_EVOLUTION[location.type];
    return definition
      ? Math.round(definition.xpBase * location.level ** 1.35)
      : null;
  }

  awardExperience(location, amount, source = "activity") {
    if (!Number.isFinite(amount) || amount <= 0)
      throw new RangeError("L'expérience gagnée doit être positive.");
    location.progression.experience += amount;
    location.statistics[`xp_${source}`] =
      (location.statistics[`xp_${source}`] ?? 0) + amount;
    return {
      experience: location.progression.experience,
      required: this.getExperienceRequired(location),
    };
  }

  levelUp(location) {
    const definition = LOCATION_EVOLUTION[location.type];
    const required = this.getExperienceRequired(location);
    if (!definition || location.progression.experience < required)
      return { success: false, reason: "insufficient_experience" };
    if (location.level >= definition.maxLevel && !definition.nextType)
      return { success: false, reason: "maximum_level" };
    location.progression.experience -= required;
    if (location.level < definition.maxLevel) location.level += 1;
    else if (definition.nextType) {
      location.type = definition.nextType;
      location.level = 1;
    } else return { success: false, reason: "maximum_level" };
    this.#applyLevelProfile(location);
    const durability = this.initialize(location);
    if (durability) durability.health = durability.maxHealth;
    return {
      success: true,
      type: location.type,
      level: location.level,
      durability,
    };
  }

  applyAttack(location, attackPoints) {
    if (!Number.isFinite(attackPoints) || attackPoints <= 0)
      throw new RangeError("Les dégâts d'attaque doivent être positifs.");
    const durability = this.initialize(location);
    if (!durability)
      return { applied: false, reason: "indestructible_in_this_mode" };
    let remainingDamage = attackPoints;
    const lostLevels = [];
    while (
      remainingDamage >= durability.health &&
      location.state !== "destroyed"
    ) {
      remainingDamage -= durability.health;
      const transition = this.#loseLevel(location);
      lostLevels.push(transition);
      if (location.state === "destroyed") break;
      durability.maxHealth = this.getMaxHealth(location);
      durability.health = durability.maxHealth;
    }
    if (location.state !== "destroyed") durability.health -= remainingDamage;
    return {
      applied: true,
      damage: attackPoints,
      lostLevels,
      destroyed: location.state === "destroyed",
      health: durability.health,
      maxHealth: durability.maxHealth,
    };
  }

  reconstruct(location, hours = 1) {
    if (!Number.isFinite(hours) || hours <= 0)
      throw new RangeError("La durée de reconstruction doit être positive.");
    const durability = this.initialize(location);
    if (
      !durability ||
      location.state === "destroyed" ||
      durability.health >= durability.maxHealth
    )
      return { restored: 0, spent: {} };
    const population = location.population ?? 0;
    const potential = Math.floor(hours * (1 + Math.sqrt(population) / 4));
    const stock = location.resources.stock;
    const materialId = MATERIAL_IDS.find((id) => (stock[id] ?? 0) > 0);
    if (!materialId || (stock.gold ?? 0) <= 0)
      return { restored: 0, spent: {} };
    const affordable = Math.floor(
      Math.min((stock[materialId] ?? 0) * 5, stock.gold * 20),
    );
    const restored = Math.min(
      potential,
      affordable,
      durability.maxHealth - durability.health,
    );
    if (restored <= 0) return { restored: 0, spent: {} };
    const materials = restored / 5;
    const gold = restored / 20;
    stock[materialId] -= materials;
    stock.gold -= gold;
    durability.health += restored;
    return { restored, spent: { [materialId]: materials, gold } };
  }

  #loseLevel(location) {
    const from = { type: location.type, level: location.level };
    const definition = LOCATION_EVOLUTION[location.type];
    if (location.level > 1) location.level -= 1;
    else if (definition.previousType) {
      location.type = definition.previousType;
      location.level = LOCATION_EVOLUTION[location.type].maxLevel;
    } else {
      location.level = 0;
      location.state = "destroyed";
      location.features.battle = false;
      location.heroIds = [];
    }
    this.#applyLevelProfile(location);
    return {
      from,
      to: { type: location.type, level: location.level },
      destroyed: location.state === "destroyed",
    };
  }

  #applyLevelProfile(location) {
    if (location.type !== "camp" || location.level === 0) return null;
    const profile = CAMP_LEVELS[location.level];
    if (!profile)
      throw new RangeError(
        `Le niveau ${location.level} du camp n'est pas configuré.`,
      );
    location.populationCapacity = profile.populationCapacity;
    location.defenseSlots = profile.defenseSlots;
    location.recalculateStorageCapacity();
    return profile;
  }
}
