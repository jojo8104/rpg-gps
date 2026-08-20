import { Army } from "./army.js";

/** Lieu persistant et configurable du monde de jeu. */
export class Location {
  constructor({
    id,
    name,
    type,
    roles = [],
    source,
    position,
    interactionRadius = 25,
    detectionRadius = interactionRadius * 3,
    state = "active",
    visibility = "hidden",
    ownerId = null,
    controllerId = null,
    level = 1,
    population = null,
    defenseSlots = 0,
    features = {},
    resources = {},
    storedItems = [],
    contentment = null,
    capture = {},
    infrastructure = {},
    recruitment = { availableUnitTypeIds: [] },
    heroIds = [],
    garrison = {},
    questIds = [],
    eventIds = [],
    interactionIds = [],
    qr = { enabled: false },
    statistics = {},
    progression = {},
    durability = null,
  }) {
    this.id = Location.#requireText(id, "L'identifiant du lieu");
    this.name = Location.#requireText(name, "Le nom du lieu");
    this.type = Location.#requireText(type, "Le type du lieu");
    this.roles = Location.#createTextList(roles, "Les rôles");
    this.source = Location.#requireText(source, "La source du lieu");
    this.position = Location.#createPosition(position);
    this.interactionRadius = Location.#requirePositiveNumber(interactionRadius, "Le rayon d'interaction");
    this.detectionRadius = Location.#requirePositiveNumber(detectionRadius, "Le rayon de détection");
    if (this.detectionRadius < this.interactionRadius) throw new RangeError("Le rayon de détection doit couvrir le rayon d'interaction.");
    this.state = Location.#requireText(state, "L'état du lieu");
    this.visibility = Location.#requireText(visibility, "La visibilité du lieu");
    this.ownerId = Location.#createOptionalId(ownerId, "L'identifiant du propriétaire");
    this.controllerId = Location.#createOptionalId(controllerId, "L'identifiant du contrôleur");
    this.level = Location.#requireNonNegativeInteger(level, "Le niveau");
    this.population = population === null ? null : Location.#requireNonNegativeNumber(population, "La population");
    this.defenseSlots = Location.#requireNonNegativeInteger(defenseSlots, "Les emplacements de défense");
    this.features = Location.#createBooleanMap(features, "Les fonctionnalités");
    this.resources = Location.#createResources(resources);
    this.storedItems = Location.#createStoredItems(storedItems);
    this.contentment = contentment === null ? null : Location.#requirePercentage(contentment, "Le contentement");
    this.capture = Location.#createCapture(capture);
    this.infrastructure = Location.#createNonNegativeMap(infrastructure, "Les infrastructures");
    this.recruitment = Location.#createRecruitment(recruitment);
    this.heroIds = Location.#createTextList(heroIds, "Les héros présents");
    this.garrison = garrison instanceof Army ? garrison : new Army(garrison);
    this.questIds = Location.#createTextList(questIds, "Les quêtes");
    this.eventIds = Location.#createTextList(eventIds, "Les événements");
    this.interactionIds = Location.#createTextList(interactionIds, "Les interactions");
    this.qr = Location.#createQr(qr);
    this.statistics = Location.#createStatistics(statistics);
    this.progression = { experience: Location.#requireNonNegativeNumber(progression.experience ?? 0, "L'expérience du lieu") };
    this.durability = durability === null ? null : Location.#createDurability(durability);
  }

  addHero(heroId) {
    const validId = Location.#requireText(heroId, "L'identifiant du héros");
    if (this.heroIds.includes(validId)) return false;
    this.heroIds.push(validId);
    return true;
  }

  removeHero(heroId) {
    const index = this.heroIds.indexOf(heroId);
    if (index === -1) return false;
    this.heroIds.splice(index, 1);
    return true;
  }

  setController(controllerId) {
    this.controllerId = Location.#createOptionalId(controllerId, "L'identifiant du contrôleur");
  }

  setOwner(ownerId) {
    this.ownerId = Location.#createOptionalId(ownerId, "L'identifiant du propriétaire");
  }

  getContentmentModifier(enabled = true) {
    if (!enabled || this.contentment === null) return 1;
    return 0.25 + (this.contentment / 100) * 0.75;
  }

  adjustContentment(delta) {
    if (this.contentment === null) return null;
    if (!Number.isFinite(delta)) throw new TypeError("La variation de contentement doit être un nombre.");
    this.contentment = Math.max(0, Math.min(100, this.contentment + delta));
    return this.contentment;
  }

  depositResource(resourceName, amount) {
    const name = Location.#requireText(resourceName, "Le nom de la ressource");
    const value = Location.#requirePositiveNumber(amount, "Le montant déposé");
    const stored = Object.values(this.resources.stock).reduce((sum, entry) => sum + entry, 0);
    const accepted = Math.min(value, Math.max(0, this.resources.storageCapacity - stored));
    if (accepted > 0) this.resources.stock[name] = (this.resources.stock[name] ?? 0) + accepted;
    return accepted;
  }

  depositItem(item) {
    const [entry] = Location.#createStoredItems([item]);
    const existing = this.storedItems.find((candidate) => candidate.itemId === entry.itemId && candidate.portable === entry.portable && candidate.weightPerUnit === entry.weightPerUnit && candidate.valuePerUnit === entry.valuePerUnit);
    if (existing) existing.quantity += entry.quantity;
    else this.storedItems.push(entry);
    return { ...entry };
  }

  produceResources(cycles = 1, modifier = 1) {
    if (!Number.isFinite(cycles) || cycles <= 0) throw new RangeError("Le nombre de cycles doit être positif.");
    if (this.features.resourceProduction !== true) return {};
    const produced = {};
    let remainingCapacity = Math.max(0, this.resources.storageCapacity - Object.values(this.resources.stock).reduce((sum, amount) => sum + amount, 0));
    for (const [resource, rate] of Object.entries(this.resources.production)) {
      const amount = Math.min(remainingCapacity, rate * cycles * modifier);
      if (amount <= 0) continue;
      this.resources.stock[resource] = (this.resources.stock[resource] ?? 0) + amount;
      produced[resource] = amount;
      remainingCapacity -= amount;
    }
    return produced;
  }

  produceRecruits(cycles = 1, random = Math.random, modifier = 1) {
    if (!Number.isFinite(cycles) || cycles <= 0) throw new RangeError("Le nombre de cycles doit être positif.");
    if (typeof random !== "function") throw new TypeError("La source aléatoire doit être une fonction.");
    if (this.features.recruitment !== true) return {};
    const produced = {};
    let remainingCapacity = Math.max(0, this.recruitment.capacity - Object.values(this.recruitment.stock).reduce((sum, amount) => sum + amount, 0));
    for (const [typeId, rate] of Object.entries(this.recruitment.production)) {
      const factor = 1 + (random() * 2 - 1) * this.recruitment.variance;
      const amount = Math.min(remainingCapacity, Math.max(0, Math.floor(rate * cycles * factor * modifier)));
      if (amount <= 0) continue;
      this.recruitment.stock[typeId] = (this.recruitment.stock[typeId] ?? 0) + amount;
      produced[typeId] = amount; remainingCapacity -= amount;
    }
    return produced;
  }

  toJSON() {
    return {
      id: this.id, name: this.name, type: this.type, roles: [...this.roles], source: this.source,
      position: { ...this.position }, interactionRadius: this.interactionRadius, detectionRadius: this.detectionRadius, state: this.state,
      visibility: this.visibility, ownerId: this.ownerId, controllerId: this.controllerId, level: this.level, population: this.population, defenseSlots: this.defenseSlots,
      features: { ...this.features }, resources: Location.#copyResources(this.resources), storedItems: this.storedItems.map((item) => ({ ...item })), contentment: this.contentment, capture: { ...this.capture },
      infrastructure: { ...this.infrastructure }, heroIds: [...this.heroIds], garrison: this.garrison.toJSON(),
      recruitment: Location.#copyRecruitment(this.recruitment),
      questIds: [...this.questIds], eventIds: [...this.eventIds], interactionIds: [...this.interactionIds],
      qr: { ...this.qr }, statistics: { ...this.statistics }, progression: { ...this.progression }, durability: this.durability === null ? null : { ...this.durability },
    };
  }

  static #createPosition(position) {
    if (position === null || Array.isArray(position) || typeof position !== "object") throw new TypeError("La position doit être un objet.");
    const { latitude, longitude } = position;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new RangeError("La latitude doit être comprise entre -90 et 90.");
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new RangeError("La longitude doit être comprise entre -180 et 180.");
    return { latitude, longitude };
  }

  static #createResources(resources) {
    if (resources === null || Array.isArray(resources) || typeof resources !== "object") throw new TypeError("Les ressources doivent être un objet.");
    const { production = {}, stock = {}, storageCapacity = 0 } = resources;
    return {
      production: Location.#createNonNegativeMap(production, "La production"),
      stock: Location.#createNonNegativeMap(stock, "Le stock"),
      storageCapacity: Location.#requireNonNegativeNumber(storageCapacity, "La capacité de stockage"),
    };
  }

  static #copyResources(resources) {
    return { production: { ...resources.production }, stock: { ...resources.stock }, storageCapacity: resources.storageCapacity };
  }

  static #createStoredItems(items) {
    if (!Array.isArray(items)) throw new TypeError("Le stockage d'objets doit être une liste.");
    return items.map((item) => {
      if (item === null || Array.isArray(item) || typeof item !== "object") throw new TypeError("Un objet stocké doit être un objet.");
      return {
        id: item.id === undefined ? `stored-${Location.#requireText(item.itemId, "L'identifiant de l'objet")}` : Location.#requireText(item.id, "L'identifiant du lot"),
        itemId: Location.#requireText(item.itemId, "L'identifiant de l'objet"),
        quantity: Location.#requirePositiveNumber(item.quantity, "La quantité d'objets"),
        portable: item.portable ?? true,
        weightPerUnit: Location.#requireNonNegativeNumber(item.weightPerUnit ?? 0, "Le poids de l'objet"),
        valuePerUnit: Location.#requireNonNegativeNumber(item.valuePerUnit ?? 0, "La valeur de l'objet"),
      };
    });
  }

  static #createCapture(capture) {
    if (capture === null || Array.isArray(capture) || typeof capture !== "object") throw new TypeError("La configuration de capture doit être un objet.");
    return { questObjectiveId: capture.questObjectiveId === undefined || capture.questObjectiveId === null ? null : Location.#requireText(capture.questObjectiveId, "L'objectif protégeant le lieu") };
  }

  static #createQr(qr) {
    if (qr === null || Array.isArray(qr) || typeof qr !== "object" || typeof qr.enabled !== "boolean") throw new TypeError("Le QR doit indiquer s'il est activé.");
    const normalized = { enabled: qr.enabled, required: qr.required ?? false };
    if (typeof normalized.required !== "boolean") throw new TypeError("L'obligation du QR doit être un booléen.");
    if (qr.id !== undefined) normalized.id = Location.#requireText(qr.id, "L'identifiant du QR");
    return normalized;
  }

  static #createRecruitment(recruitment) {
    if (recruitment === null || Array.isArray(recruitment) || typeof recruitment !== "object") throw new TypeError("Le recrutement doit être un objet.");
    const ids = Location.#createTextList(recruitment.availableUnitTypeIds ?? [], "Les unités recrutables");
    const production = Location.#createNonNegativeMap(recruitment.production ?? {}, "La production de recrues");
    const stock = Location.#createNonNegativeMap(recruitment.stock ?? {}, "Le stock de recrues");
    for (const typeId of [...Object.keys(production), ...Object.keys(stock)]) if (!ids.includes(typeId)) throw new RangeError("Un stock de recrues doit correspondre à une unité disponible.");
    const capacity = Location.#requireNonNegativeNumber(recruitment.capacity ?? 0, "La capacité de recrutement");
    let remainingCapacity = capacity;
    for (const typeId of Object.keys(stock)) { stock[typeId] = Math.min(stock[typeId], remainingCapacity); remainingCapacity -= stock[typeId]; }
    return { availableUnitTypeIds: ids, production, stock, capacity, variance: Location.#requireRatio(recruitment.variance ?? 0, "La variance de recrutement") };
  }

  static #copyRecruitment(value) { return { availableUnitTypeIds: [...value.availableUnitTypeIds], production: { ...value.production }, stock: { ...value.stock }, capacity: value.capacity, variance: value.variance }; }

  static #createStatistics(statistics) {
    if (statistics === null || Array.isArray(statistics) || typeof statistics !== "object") throw new TypeError("Les statistiques doivent être un objet.");
    return Location.#createNonNegativeMap(statistics, "Les statistiques");
  }

  static #createDurability(value) {
    if (value === null || Array.isArray(value) || typeof value !== "object") throw new TypeError("La durabilité doit être un objet.");
    const maxHealth = Location.#requirePositiveNumber(value.maxHealth, "Les points de vie maximum");
    const health = Location.#requireNonNegativeNumber(value.health, "Les points de vie");
    if (health > maxHealth) throw new RangeError("Les points de vie ne peuvent pas dépasser le maximum.");
    const lastRegenerationAt = value.lastRegenerationAt ?? null;
    if (lastRegenerationAt !== null && !Number.isFinite(lastRegenerationAt)) throw new TypeError("La date de régénération doit être un timestamp.");
    return { health, maxHealth, lastRegenerationAt };
  }

  static #createBooleanMap(values, label) {
    if (values === null || Array.isArray(values) || typeof values !== "object") throw new TypeError(`${label} doivent être un objet.`);
    return Object.fromEntries(Object.entries(values).map(([key, value]) => {
      if (typeof value !== "boolean") throw new TypeError(`${label} doivent contenir des booléens.`);
      return [Location.#requireText(key, "Une clé"), value];
    }));
  }

  static #createNonNegativeMap(values, label) {
    if (values === null || Array.isArray(values) || typeof values !== "object") throw new TypeError(`${label} doivent être un objet.`);
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [Location.#requireText(key, "Une clé"), Location.#requireNonNegativeNumber(value, label)]));
  }

  static #createTextList(values, label) {
    if (!Array.isArray(values)) throw new TypeError(`${label} doivent être une liste.`);
    return [...new Set(values.map((value) => Location.#requireText(value, "Un identifiant")))];
  }

  static #createOptionalId(value, label) { return value === null ? null : Location.#requireText(value, label); }
  static #requireText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
  static #requirePositiveInteger(value, label) { if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} doit être un entier strictement positif.`); return value; }
  static #requirePositiveNumber(value, label) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} doit être un nombre strictement positif.`); return value; }
  static #requireNonNegativeNumber(value, label) { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} doit être un nombre positif ou nul.`); return value; }
  static #requireNonNegativeInteger(value, label) { if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} doit être un entier positif ou nul.`); return value; }
  static #requireRatio(value, label) { if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${label} doit être comprise entre 0 et 1.`); return value; }
  static #requirePercentage(value, label) { if (!Number.isFinite(value) || value < 0 || value > 100) throw new RangeError(`${label} doit être compris entre 0 et 100.`); return value; }
}
