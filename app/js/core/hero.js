import { Army } from "./army.js";
import { HERO_COMMAND_RANKS, rankForExperience, requireRank } from "./rank-system.js";

/** Représente un personnage contrôlé sur la carte. */
export class Hero {
  constructor({
    id,
    playerId,
    name,
    classId = null,
    maxHealth = 100,
    health = maxHealth,
    state = "active",
    pursuitCooldownUntil = null,
    army = {},
    position = null,
    experience = 0,
    level = 1,
    equipment = {},
    carryCapacity = 20,
    carriedLoot = [],
    abilityIds = [],
    resources = {},
    commandRank = "captain",
  }) {
    this.id = Hero.#requireText(id, "L'identifiant du héros");
    this.playerId = Hero.#requireText(playerId, "L'identifiant du joueur");
    this.name = Hero.#requireText(name, "Le nom du héros");
    this.classId = classId === null ? null : Hero.#requireText(classId, "L'identifiant de classe");
    this.maxHealth = Hero.#requirePositiveNumber(maxHealth, "Les PV maximum");
    this.health = Hero.#requireHealth(health, this.maxHealth);
    this.state = Hero.#requireText(state, "L'état du héros");
    this.pursuitCooldownUntil = pursuitCooldownUntil === null ? null : Hero.#requireNonNegativeNumber(pursuitCooldownUntil, "La fin du cooldown");
    this.army = army instanceof Army ? army : new Army(army);
    this.position = Hero.#createPosition(position);
    this.resources = Hero.#createResources(resources);
    this.commandRank = requireRank(HERO_COMMAND_RANKS, commandRank, "Le grade de commandement").id;
    this.experience = Hero.#requireNonNegativeNumber(experience, "L'expérience");
    this.level = Hero.#requirePositiveInteger(level, "Le niveau");
    this.equipment = Hero.#createEquipment(equipment);
    this.carryCapacity = Hero.#requirePositiveNumber(carryCapacity, "La capacité de transport");
    this.carriedLoot = Hero.#createCarriedLoot(carriedLoot);
    this.abilityIds = Hero.#createUniqueIds(abilityIds, "Les capacités du héros");
  }

  addUnit(unit) {
    if (this.army.units.length >= this.maxUnitStacks) return false;
    return this.army.addUnit(unit);
  }

  get maxUnitStacks() { return requireRank(HERO_COMMAND_RANKS, this.commandRank, "Le grade de commandement").capacity; }

  removeUnit(unitId) {
    return this.army.removeUnit(unitId);
  }

  updatePosition(position) {
    this.position = Hero.#createPosition(position, false);
  }

  addExperience(amount) {
    this.experience += Hero.#requirePositiveNumber(amount, "Le gain d'expérience");
    this.refreshCommandRank();
  }

  getResourceAmount(resourceName) { return this.resources[Hero.#requireText(resourceName, "Le nom de la ressource")] ?? 0; }
  addResource(resourceName, amount) { const name = Hero.#requireText(resourceName, "Le nom de la ressource"); this.resources[name] = this.getResourceAmount(name) + Hero.#requirePositiveNumber(amount, "Le montant"); }
  spendResource(resourceName, amount) { const name = Hero.#requireText(resourceName, "Le nom de la ressource"); const value = Hero.#requirePositiveNumber(amount, "Le montant"); if (this.getResourceAmount(name) < value) return false; this.resources[name] -= value; return true; }

  refreshCommandRank() { this.commandRank = rankForExperience(HERO_COMMAND_RANKS, this.experience).id; return this.commandRank; }

  setBattleState({ health, state }) {
    this.health = Hero.#requireHealth(health, this.maxHealth, true);
    this.state = Hero.#requireText(state, "L'état du héros");
  }

  setLevel(level) {
    this.level = Hero.#requirePositiveInteger(level, "Le niveau");
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

  getRemainingCarryCapacity() { return Math.max(0, this.carryCapacity - this.carriedLoot.reduce((total, entry) => total + entry.quantity * entry.weightPerUnit, 0)); }
  addCarriedLoot(entries) { this.carriedLoot.push(...Hero.#createCarriedLoot(entries)); }

  addAbility(abilityId) {
    return Hero.#addUniqueId(this.abilityIds, abilityId, "L'identifiant de la capacité");
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
      maxUnitStacks: this.maxUnitStacks,
      carryCapacity: this.carryCapacity,
      carriedLoot: this.carriedLoot.map((entry) => ({ ...entry })),
      abilityIds: [...this.abilityIds],
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

  static #createCarriedLoot(entries) {
    if (!Array.isArray(entries)) throw new TypeError("Le butin transporté doit être une liste.");
    return entries.map((entry) => ({ itemId: Hero.#requireText(entry.itemId, "L'objet transporté"), quantity: Hero.#requirePositiveInteger(entry.quantity, "La quantité transportée"), weightPerUnit: Hero.#requireNonNegativeNumber(entry.weightPerUnit ?? 0, "Le poids transporté"), valuePerUnit: Hero.#requirePositiveNumber(entry.valuePerUnit ?? 1, "La valeur transportée") }));
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
}
