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

  toJSON() {
    return {
      id: this.id, name: this.name, type: this.type, roles: [...this.roles], source: this.source,
      position: { ...this.position }, interactionRadius: this.interactionRadius, state: this.state,
      visibility: this.visibility, ownerId: this.ownerId, controllerId: this.controllerId, level: this.level,
      features: { ...this.features }, resources: Location.#copyResources(this.resources),
      infrastructure: { ...this.infrastructure }, heroIds: [...this.heroIds], garrison: this.garrison.toJSON(),
      recruitment: { availableUnitTypeIds: [...this.recruitment.availableUnitTypeIds] },
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
    const ids = recruitment.availableUnitTypeIds ?? [];
    return { availableUnitTypeIds: Location.#createTextList(ids, "Les unités recrutables") };
  }

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
}
