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
    features = {},
    resources = {},
    infrastructure = {},
    recruitment = { availableUnitTypeIds: [] },
    heroIds = [],
    garrison = {},
    questIds = [],
    eventIds = [],
    interactionIds = [],
    qr = { enabled: false },
    statistics = {},
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
    this.level = Location.#requirePositiveInteger(level, "Le niveau");
    this.features = Location.#createBooleanMap(features, "Les fonctionnalités");
    this.resources = Location.#createResources(resources);
    this.infrastructure = Location.#createNonNegativeMap(infrastructure, "Les infrastructures");
    this.recruitment = Location.#createRecruitment(recruitment);
    this.heroIds = Location.#createTextList(heroIds, "Les héros présents");
    this.garrison = garrison instanceof Army ? garrison : new Army(garrison);
    this.questIds = Location.#createTextList(questIds, "Les quêtes");
    this.eventIds = Location.#createTextList(eventIds, "Les événements");
    this.interactionIds = Location.#createTextList(interactionIds, "Les interactions");
    this.qr = Location.#createQr(qr);
    this.statistics = Location.#createStatistics(statistics);
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

  produceResources(cycles = 1) {
    if (!Number.isFinite(cycles) || cycles <= 0) throw new RangeError("Le nombre de cycles doit être positif.");
    if (this.features.resourceProduction !== true) return {};
    const produced = {};
    let remainingCapacity = Math.max(0, this.resources.storageCapacity - Object.values(this.resources.stock).reduce((sum, amount) => sum + amount, 0));
    for (const [resource, rate] of Object.entries(this.resources.production)) {
      const amount = Math.min(remainingCapacity, rate * cycles);
      if (amount <= 0) continue;
      this.resources.stock[resource] = (this.resources.stock[resource] ?? 0) + amount;
      produced[resource] = amount;
      remainingCapacity -= amount;
    }
    return produced;
  }

  produceRecruits(cycles = 1, random = Math.random) {
    if (!Number.isFinite(cycles) || cycles <= 0) throw new RangeError("Le nombre de cycles doit être positif.");
    if (typeof random !== "function") throw new TypeError("La source aléatoire doit être une fonction.");
    if (this.features.recruitment !== true) return {};
    const produced = {};
    let remainingCapacity = Math.max(0, this.recruitment.capacity - Object.values(this.recruitment.stock).reduce((sum, amount) => sum + amount, 0));
    for (const [typeId, rate] of Object.entries(this.recruitment.production)) {
      const factor = 1 + (random() * 2 - 1) * this.recruitment.variance;
      const amount = Math.min(remainingCapacity, Math.max(0, Math.floor(rate * cycles * factor)));
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
      visibility: this.visibility, ownerId: this.ownerId, controllerId: this.controllerId, level: this.level,
      features: { ...this.features }, resources: Location.#copyResources(this.resources),
      infrastructure: { ...this.infrastructure }, heroIds: [...this.heroIds], garrison: this.garrison.toJSON(),
      recruitment: Location.#copyRecruitment(this.recruitment),
      questIds: [...this.questIds], eventIds: [...this.eventIds], interactionIds: [...this.interactionIds],
      qr: { ...this.qr }, statistics: { ...this.statistics },
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
    return { availableUnitTypeIds: ids, production, stock, capacity: Location.#requireNonNegativeNumber(recruitment.capacity ?? 0, "La capacité de recrutement"), variance: Location.#requireRatio(recruitment.variance ?? 0, "La variance de recrutement") };
  }

  static #copyRecruitment(value) { return { availableUnitTypeIds: [...value.availableUnitTypeIds], production: { ...value.production }, stock: { ...value.stock }, capacity: value.capacity, variance: value.variance }; }

  static #createStatistics(statistics) {
    if (statistics === null || Array.isArray(statistics) || typeof statistics !== "object") throw new TypeError("Les statistiques doivent être un objet.");
    return Location.#createNonNegativeMap(statistics, "Les statistiques");
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
  static #requireRatio(value, label) { if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${label} doit être comprise entre 0 et 1.`); return value; }
}
