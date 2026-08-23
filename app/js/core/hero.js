import { Army } from "./army.js";
import { HERO_GRADES, HERO_MAX_LEVEL, gradeForLevel, levelForExperience, totalXpForLevel } from "./hero-progression-config.js";

/** Représente un personnage contrôlé sur la carte. */
export class Hero {
  constructor({
    id,
    playerId,
    name,
    classId = null,
    maxHealth = null,
    health = null,
    state = "active",
    pursuitCooldownUntil = null,
    army = {},
    position = null,
    experience = 0,
    level = 1,
    equipment = {},
    carriedLoot = [],
    abilityIds = [],
    skillIds = abilityIds,
    specialPowerIds = [],
    maxCommandPoints = 3,
    commandPoints = maxCommandPoints,
    resources = {},
    commandRank = "captain",
    commandStats = {},
    moraleHistory = [],
    baseStats = null,
    statGrowth = {},
    equipmentModifiers = {},
    temporaryModifiers = {},
    growthPlan = [],
    aptitudeRanks = {},
    pendingLevelUps = [],
    progressionHistory = [],
    xpHistory = [],
    appearanceId = null,
    classFeatureState = {},
  }) {
    this.id = Hero.#requireText(id, "L'identifiant du héros");
    this.playerId = Hero.#requireText(playerId, "L'identifiant du joueur");
    this.name = Hero.#requireText(name, "Le nom du héros");
    this.classId = classId === null ? null : Hero.#requireText(classId, "L'identifiant de classe");
    this.baseStats = Hero.#createStats(baseStats ?? { attack: commandStats.attackBonus ?? 0, defense: commandStats.defenseBonus ?? 0, morale: commandStats.moraleBonus ?? 0, mobility: 1, command: maxCommandPoints, health: maxHealth ?? 30 }, "Les statistiques initiales");
    this.statGrowth = Hero.#createStats(statGrowth, "La progression des statistiques", true);
    this.equipmentModifiers = Hero.#createStats(equipmentModifiers, "Les bonus d'équipement", true);
    this.temporaryModifiers = Hero.#createStats(temporaryModifiers, "Les bonus temporaires", true);
    this.maxHealth = Hero.#requirePositiveNumber(maxHealth ?? this.finalStats.health, "Les PV maximum");
    this.health = Hero.#requireHealth(health ?? this.maxHealth, this.maxHealth);
    this.state = Hero.#requireText(state, "L'état du héros");
    this.pursuitCooldownUntil = pursuitCooldownUntil === null ? null : Hero.#requireNonNegativeNumber(pursuitCooldownUntil, "La fin du cooldown");
    this.army = army instanceof Army ? army : new Army(army);
    this.position = Hero.#createPosition(position);
    this.resources = Hero.#createResources(resources);
    this.commandRank = HERO_GRADES.some((grade) => grade.id === commandRank) ? commandRank : gradeForLevel(level).id;
    this.commandStats = Hero.#createCommandStats(commandStats);
    this.moraleHistory = Hero.#createMoraleHistory(moraleHistory);
    this.experience = Hero.#requireNonNegativeNumber(experience, "L'expérience");
    this.level = Hero.#requirePositiveInteger(level, "Le niveau");
    this.equipment = Hero.#createEquipment(equipment);
    this.carriedLoot = Hero.#createCarriedLoot(carriedLoot);
    this.skillIds = Hero.#createUniqueIds(skillIds, "Les compétences du héros");
    this.abilityIds = this.skillIds;
    this.specialPowerIds = Hero.#createUniqueIds(specialPowerIds, "Les pouvoirs du héros");
    this.maxCommandPoints = Hero.#requirePositiveInteger(maxCommandPoints, "Les points de commandement maximum");
    this.commandPoints = Hero.#requireCommandPoints(commandPoints, this.maxCommandPoints);
    this.growthPlan = Hero.#createTextList(growthPlan, "Le sac de progression");
    this.aptitudeRanks = Hero.#createAptitudeRanks(aptitudeRanks);
    this.pendingLevelUps = structuredClone(Hero.#requireList(pendingLevelUps, "Les level-ups en attente"));
    this.progressionHistory = structuredClone(Hero.#requireList(progressionHistory, "L'historique de progression"));
    this.xpHistory = structuredClone(Hero.#requireList(xpHistory, "L'historique d'expérience"));
    this.appearanceId = appearanceId === null ? null : Hero.#requireText(appearanceId, "L'apparence du héros");
    if (classFeatureState === null || Array.isArray(classFeatureState) || typeof classFeatureState !== "object") throw new TypeError("L'état des avantages de classe doit être un objet.");
    this.classFeatureState = structuredClone(classFeatureState);
  }

  addUnit(unit) {
    if (this.army.units.length >= this.maxUnitStacks) return false;
    return this.army.addUnit(unit);
  }

  get maxUnitStacks() { return HERO_GRADES.find((grade) => grade.id === this.commandRank)?.capacity ?? HERO_GRADES[0].capacity; }
  get bagSlotCount() { const index = Math.max(0, HERO_GRADES.findIndex((grade) => grade.id === this.commandRank)); return [8, 10, 12, 14, 16][index] ?? 8; }
  get finalStats() { return Object.fromEntries(["attack", "defense", "morale", "mobility", "command", "health"].map((stat) => [stat, this.baseStats[stat] + this.statGrowth[stat] + this.equipmentModifiers[stat] + this.temporaryModifiers[stat]])); }

  removeUnit(unitId) {
    return this.army.removeUnit(unitId);
  }

  updatePosition(position) {
    this.position = Hero.#createPosition(position, false);
  }

  addExperience(amount, source = "legacy") { this.experience = Math.min(totalXpForLevel(HERO_MAX_LEVEL), this.experience + Hero.#requirePositiveNumber(amount, "Le gain d'expérience")); this.xpHistory.push({ type: "xp_gain", amount, source, timestamp: Date.now() }); return levelForExperience(this.experience) > this.level; }

  getResourceAmount(resourceName) { return this.resources[Hero.#requireText(resourceName, "Le nom de la ressource")] ?? 0; }
  addResource(resourceName, amount) { const name = Hero.#requireText(resourceName, "Le nom de la ressource"); this.resources[name] = this.getResourceAmount(name) + Hero.#requirePositiveNumber(amount, "Le montant"); }
  spendResource(resourceName, amount) { const name = Hero.#requireText(resourceName, "Le nom de la ressource"); const value = Hero.#requirePositiveNumber(amount, "Le montant"); if (this.getResourceAmount(name) < value) return false; this.resources[name] -= value; return true; }

  refreshCommandRank() { this.commandRank = gradeForLevel(this.level).id; return this.commandRank; }

  setBattleState({ health, state }) {
    this.health = Hero.#requireHealth(health, this.maxHealth, true);
    this.state = Hero.#requireText(state, "L'état du héros");
  }

  recoverHealth(amount) {
    const value = Hero.#requirePositiveNumber(amount, "Le soin du héros");
    if (this.health === 0 || this.state === "ghost") return 0;
    const previous = this.health; this.health = Math.min(this.maxHealth, this.health + value); return this.health - previous;
  }

  revive(healthRatio = 0.5) {
    if (this.state !== "ghost" || this.health !== 0) return 0;
    if (!Number.isFinite(healthRatio) || healthRatio <= 0 || healthRatio > 1) throw new RangeError("Le ratio de résurrection doit être compris entre zéro et un.");
    this.health = Math.ceil(this.maxHealth * healthRatio); this.state = "active"; return this.health;
  }

  setLevel(level) {
    const value = Hero.#requirePositiveInteger(level, "Le niveau"); if (value > HERO_MAX_LEVEL) throw new RangeError("Le niveau maximal du héros est 20."); this.level = value; this.refreshCommandRank();
  }

  equip(slot, itemId) {
    const validSlot = Hero.#requireText(slot, "L'emplacement d'équipement");
    this.equipment[validSlot] = Hero.#requireText(itemId, "L'identifiant de l'équipement");
  }

  unequip(slot) {
    const validSlot = Hero.#requireText(slot, "L'emplacement d'équipement");

    if (!(validSlot in this.equipment)) {
      return false;
    }

    delete this.equipment[validSlot];
    return true;
  }

  addCarriedLoot(entries) { this.carriedLoot.push(...Hero.#createCarriedLoot(entries)); }

  addAbility(abilityId) {
    return this.addSkill(abilityId);
  }

  addSkill(skillId) { return Hero.#addUniqueId(this.skillIds, skillId, "L'identifiant de la compétence"); }
  addSpecialPower(powerId) { return Hero.#addUniqueId(this.specialPowerIds, powerId, "L'identifiant du pouvoir"); }
  spendCommandPoints(cost) { const value = Hero.#requirePositiveInteger(cost, "Le coût de commandement"); if (this.commandPoints < value) return false; this.commandPoints -= value; return true; }
  restoreCommandPoints(amount = this.maxCommandPoints) { const value = Hero.#requirePositiveInteger(amount, "La récupération de commandement"); this.commandPoints = Math.min(this.maxCommandPoints, this.commandPoints + value); return this.commandPoints; }

  recordMoraleFactor(source, value, reason = null) {
    const factor = Hero.#createMoraleHistory([{ source, value, reason }])[0];
    this.moraleHistory.push(factor);
    return factor;
  }

  toJSON() {
    return {
      id: this.id,
      playerId: this.playerId,
      name: this.name,
      classId: this.classId,
      maxHealth: this.maxHealth,
      health: this.health,
      state: this.state,
      pursuitCooldownUntil: this.pursuitCooldownUntil,
      army: this.army.toJSON(),
      position: this.position === null ? null : { ...this.position },
      experience: this.experience,
      level: this.level,
      equipment: { ...this.equipment },
      resources: { ...this.resources },
      commandRank: this.commandRank,
      commandStats: { ...this.commandStats },
      moraleHistory: this.moraleHistory.map((entry) => ({ ...entry })),
      maxUnitStacks: this.maxUnitStacks,
      bagSlotCount: this.bagSlotCount,
      carriedLoot: this.carriedLoot.map((entry) => ({ ...entry })),
      abilityIds: [...this.abilityIds],
      skillIds: [...this.skillIds],
      specialPowerIds: [...this.specialPowerIds],
      maxCommandPoints: this.maxCommandPoints,
      commandPoints: this.commandPoints,
      baseStats: { ...this.baseStats },
      statGrowth: { ...this.statGrowth },
      equipmentModifiers: { ...this.equipmentModifiers },
      temporaryModifiers: { ...this.temporaryModifiers },
      finalStats: { ...this.finalStats },
      growthPlan: [...this.growthPlan],
      aptitudeRanks: { ...this.aptitudeRanks },
      pendingLevelUps: structuredClone(this.pendingLevelUps),
      progressionHistory: structuredClone(this.progressionHistory),
      xpHistory: structuredClone(this.xpHistory),
      appearanceId: this.appearanceId,
      classFeatureState: structuredClone(this.classFeatureState),
    };
  }

  static #createPosition(position, allowNull = true) {
    if (position === null && allowNull) {
      return null;
    }

    if (position === null || Array.isArray(position) || typeof position !== "object") {
      throw new TypeError("La position doit contenir une latitude et une longitude.");
    }

    const { latitude, longitude, accuracy, updatedAt } = position;

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new RangeError("La latitude doit être comprise entre -90 et 90.");
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new RangeError("La longitude doit être comprise entre -180 et 180.");
    }

    const normalizedPosition = { latitude, longitude };

    if (accuracy !== undefined) {
      normalizedPosition.accuracy = Hero.#requireNonNegativeNumber(accuracy, "La précision GPS");
    }

    if (updatedAt !== undefined) {
      normalizedPosition.updatedAt = Hero.#requireText(updatedAt, "La date de mise à jour");
    }

    return normalizedPosition;
  }

  static #createEquipment(equipment) {
    if (equipment === null || Array.isArray(equipment) || typeof equipment !== "object") {
      throw new TypeError("L'équipement du héros doit être un objet.");
    }

    return Object.fromEntries(
      Object.entries(equipment).map(([slot, itemId]) => [
        Hero.#requireText(slot, "L'emplacement d'équipement"),
        Hero.#requireText(itemId, "L'identifiant de l'équipement"),
      ]),
    );
  }

  static #createResources(resources) {
    if (resources === null || Array.isArray(resources) || typeof resources !== "object") throw new TypeError("Les ressources du hÃ©ros doivent Ãªtre un objet.");
    if (Object.hasOwn(resources, "population")) throw new RangeError("La population n'est pas une ressource de hÃ©ros.");
    return Object.fromEntries(Object.entries(resources).map(([name, amount]) => [Hero.#requireText(name, "Le nom de la ressource"), Hero.#requireNonNegativeNumber(amount, "Une ressource initiale")]));
  }

  static #createCommandStats(stats) {
    if (stats === null || Array.isArray(stats) || typeof stats !== "object") throw new TypeError("Les bonus de commandement doivent être un objet.");
    return Object.fromEntries(["attackBonus", "defenseBonus", "moraleBonus"].map((name) => {
      const value = stats[name] ?? 0;
      if (!Number.isFinite(value)) throw new RangeError(`Le bonus ${name} doit être un nombre.`);
      return [name, value];
    }));
  }

  static #createStats(stats, label, defaultZero = false) {
    if (stats === null || Array.isArray(stats) || typeof stats !== "object") throw new TypeError(`${label} doivent être un objet.`);
    return Object.fromEntries(["attack", "defense", "morale", "mobility", "command", "health"].map((name) => { const value = stats[name] ?? (defaultZero ? 0 : undefined); if (!Number.isFinite(value)) throw new RangeError(`${label} : ${name} doit être un nombre.`); return [name, value]; }));
  }

  static #createAptitudeRanks(ranks) { if (ranks === null || Array.isArray(ranks) || typeof ranks !== "object") throw new TypeError("Les rangs d'aptitude doivent être un objet."); return Object.fromEntries(Object.entries(ranks).map(([id, rank]) => [Hero.#requireText(id, "Une aptitude"), Hero.#requireText(rank, "Un rang")])); }
  static #createTextList(values, label) { if (!Array.isArray(values)) throw new TypeError(`${label} doit être une liste.`); return values.map((value) => Hero.#requireText(value, "Une valeur")); }
  static #requireList(values, label) { if (!Array.isArray(values)) throw new TypeError(`${label} doit être une liste.`); return values; }

  static #createMoraleHistory(entries) {
    if (!Array.isArray(entries)) throw new TypeError("L'historique de moral doit être une liste.");
    return entries.map((entry) => {
      const value = entry.value;
      if (!Number.isFinite(value)) throw new RangeError("La variation de moral doit être un nombre.");
      return { source: Hero.#requireText(entry.source, "La source de moral"), value, reason: entry.reason === null || entry.reason === undefined ? null : Hero.#requireText(entry.reason, "La raison du moral") };
    });
  }

  static #createCarriedLoot(entries) {
    if (!Array.isArray(entries)) throw new TypeError("Le butin transporté doit être une liste.");
    return entries.map((entry, index) => ({ id: entry.id === undefined ? `carried-${Hero.#requireText(entry.itemId, "L'objet transporté")}-${index}` : Hero.#requireText(entry.id, "L'identifiant du paquet transporté"), itemId: Hero.#requireText(entry.itemId, "L'objet transporté"), quantity: Hero.#requirePositiveInteger(entry.quantity, "La quantité transportée"), valuePerUnit: Hero.#requirePositiveNumber(entry.valuePerUnit ?? 1, "La valeur transportée") }));
  }

  static #createUniqueIds(ids, label) {
    if (!Array.isArray(ids)) {
      throw new TypeError(`${label} doivent être une liste.`);
    }

    return [...new Set(ids.map((id) => Hero.#requireText(id, "Un identifiant")))];
  }

  static #addUniqueId(ids, id, label) {
    const validId = Hero.#requireText(id, label);

    if (ids.includes(validId)) {
      return false;
    }

    ids.push(validId);
    return true;
  }

  static #removeId(ids, id) {
    const index = ids.indexOf(id);

    if (index === -1) {
      return false;
    }

    ids.splice(index, 1);
    return true;
  }

  static #requireText(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(`${label} doit être un texte non vide.`);
    }

    return value.trim();
  }

  static #requirePositiveInteger(value, label) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RangeError(`${label} doit être un entier strictement positif.`);
    }

    return value;
  }

  static #requireNonNegativeNumber(value, label) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${label} doit être un nombre positif ou nul.`);
    }

    return value;
  }

  static #requirePositiveNumber(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${label} doit être un nombre strictement positif.`);
    }

    return value;
  }

  static #requireHealth(value, maxHealth, allowZero = false) {
    if (!Number.isFinite(value) || value < (allowZero ? 0 : 1) || value > maxHealth) {
      throw new RangeError("Les PV doivent être compris entre zéro et les PV maximum.");
    }
    return value;
  }
  static #requireCommandPoints(value, maximum) { if (!Number.isInteger(value) || value < 0 || value > maximum) throw new RangeError("Les points de commandement doivent être compris entre zéro et leur maximum."); return value; }
}
