import { Army } from "./army.js";
import { getItemDefinition } from "./item-catalog.js";

const PRODUCTION_SLOTS_PER_RESOURCE = 4;
export const ABANDONMENT_EXPIRY_CYCLES = 24;

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
    populationCapacity = null,
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
    chief = null,
    qr = { enabled: false },
    statistics = {},
    progression = {},
    durability = null,
    abandonmentCycles = 0,
    dismantlings = [],
    improvements = [],
  }) {
    this.id = Location.#requireText(id, "L'identifiant du lieu");
    this.name = Location.#requireText(name, "Le nom du lieu");
    this.type = Location.#requireText(type, "Le type du lieu");
    this.roles = Location.#createTextList(roles, "Les rôles");
    this.source = Location.#requireText(source, "La source du lieu");
    this.position = Location.#createPosition(position);
    this.interactionRadius = Location.#requirePositiveNumber(
      interactionRadius,
      "Le rayon d'interaction",
    );
    this.detectionRadius = Location.#requirePositiveNumber(
      detectionRadius,
      "Le rayon de détection",
    );
    if (this.detectionRadius < this.interactionRadius)
      throw new RangeError(
        "Le rayon de détection doit couvrir le rayon d'interaction.",
      );
    this.state = Location.#requireText(state, "L'état du lieu");
    this.visibility = Location.#requireText(
      visibility,
      "La visibilité du lieu",
    );
    this.ownerId = Location.#createOptionalId(
      ownerId,
      "L'identifiant du propriétaire",
    );
    this.controllerId = Location.#createOptionalId(
      controllerId,
      "L'identifiant du contrôleur",
    );
    this.level = Location.#requireNonNegativeInteger(level, "Le niveau");
    this.population =
      population === null
        ? null
        : Location.#requireNonNegativeNumber(population, "La population");
    this.populationCapacity =
      populationCapacity === null
        ? null
        : Location.#requireNonNegativeNumber(
            populationCapacity,
            "La capacité de population",
          );
    this.defenseSlots = Location.#requireNonNegativeInteger(
      defenseSlots,
      "Les emplacements de défense",
    );
    this.features = Location.#createBooleanMap(features, "Les fonctionnalités");
    this.resources = Location.#createResources(resources);
    this.storedItems = Location.#createStoredItems(storedItems);
    this.contentment =
      contentment === null
        ? null
        : Location.#requirePercentage(contentment, "Le contentement");
    this.capture = Location.#createCapture(capture);
    this.infrastructure = Location.#createNonNegativeMap(
      infrastructure,
      "Les infrastructures",
    );
    this.recruitment = Location.#createRecruitment(
      recruitment,
      this.population,
    );
    this.heroIds = Location.#createTextList(heroIds, "Les héros présents");
    this.garrison = garrison instanceof Army ? garrison : new Army(garrison);
    this.questIds = Location.#createTextList(questIds, "Les quêtes");
    this.eventIds = Location.#createTextList(eventIds, "Les événements");
    this.interactionIds = Location.#createTextList(
      interactionIds,
      "Les interactions",
    );
    this.chief = Location.#createChief(chief);
    this.qr = Location.#createQr(qr);
    this.statistics = Location.#createStatistics(statistics);
    if (
      this.chief?.tradeOffers.length > 0 &&
      this.statistics.chiefTradeRemaining === undefined
    )
      this.statistics.chiefTradeRemaining = this.chief.tradeLimitPerCycle;
    this.progression = {
      experience: Location.#requireNonNegativeNumber(
        progression.experience ?? 0,
        "L'expérience du lieu",
      ),
    };
    this.durability =
      durability === null ? null : Location.#createDurability(durability);
    this.abandonmentCycles = Location.#requireNonNegativeNumber(
      abandonmentCycles,
      "La durée d'abandon",
    );
    this.dismantlings = Array.isArray(dismantlings)
      ? structuredClone(dismantlings)
      : [];
    if (!Array.isArray(improvements))
      throw new TypeError("Les améliorations doivent être une liste.");
    this.improvements = improvements.map((item) => ({
      id: Location.#requireText(item?.id, "L'identifiant d'amélioration"),
      type: Location.#requireText(
        item?.type ?? "utility",
        "Le type d'amélioration",
      ),
      defenseBonus: Location.#requireNonNegativeNumber(
        item?.defenseBonus ?? 0,
        "Le bonus de défense",
      ),
      militiaCapacityBonus: Location.#requireNonNegativeInteger(
        item?.militiaCapacityBonus ?? 0,
        "Le bonus de miliciens",
      ),
      destroyed: item?.destroyed === true,
    }));
    if (
      new Set(this.improvements.map(({ id }) => id)).size !==
      this.improvements.length
    )
      throw new RangeError(
        "Les améliorations doivent avoir des identifiants uniques.",
      );
    if (this.population === 0 && this.state === "active")
      this.state = "abandoned";
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
    this.controllerId = Location.#createOptionalId(
      controllerId,
      "L'identifiant du contrôleur",
    );
  }

  setOwner(ownerId) {
    this.ownerId = Location.#createOptionalId(
      ownerId,
      "L'identifiant du propriétaire",
    );
  }

  getContentmentModifier(enabled = true) {
    if (!enabled || this.contentment === null) return 1;
    return 0.25 + (this.contentment / 100) * 0.75;
  }

  adjustContentment(delta) {
    if (this.contentment === null) return null;
    if (!Number.isFinite(delta))
      throw new TypeError("La variation de contentement doit être un nombre.");
    this.contentment = Math.max(0, Math.min(100, this.contentment + delta));
    return this.contentment;
  }

  removePopulation(amount) {
    const removed = Math.min(
      this.population ?? 0,
      Location.#requirePositiveNumber(amount, "La population retirée"),
    );
    this.population = Math.max(0, (this.population ?? 0) - removed);
    if (this.population === 0) {
      this.state = "abandoned";
      this.abandonmentCycles = 0;
    }
    this.recalculateStorageCapacity();
    return removed;
  }

  addPopulation(amount) {
    this.population =
      (this.population ?? 0) +
      Location.#requirePositiveNumber(amount, "La population ajoutée");
    if (this.population > 0 && this.state === "abandoned") {
      this.state = "active";
      this.abandonmentCycles = 0;
    }
    this.recalculateStorageCapacity();
    return this.population;
  }

  advanceAbandonment(cycles = 1) {
    if (this.state !== "abandoned") return false;
    this.abandonmentCycles += Location.#requirePositiveNumber(
      cycles,
      "La durée écoulée",
    );
    if (this.abandonmentCycles >= ABANDONMENT_EXPIRY_CYCLES)
      this.state = "destroyed";
    return this.state === "destroyed";
  }

  getImprovement(id) {
    return this.improvements.find((item) => item.id === id) ?? null;
  }
  destroyImprovement(id) {
    const item = this.getImprovement(id);
    if (item === null || item.destroyed) return false;
    item.destroyed = true;
    return true;
  }
  get defenseBonus() {
    return this.improvements
      .filter((item) => !item.destroyed)
      .reduce((sum, item) => sum + item.defenseBonus, 0);
  }
  get militiaCapacityBonus() {
    return this.improvements
      .filter((item) => !item.destroyed)
      .reduce((sum, item) => sum + item.militiaCapacityBonus, 0);
  }
  get militiaCapacity() {
    return (this.recruitment.capacity ?? 0) + this.militiaCapacityBonus;
  }

  depositResource(resourceName, amount) {
    this.recalculateStorageCapacity();
    const name = Location.#requireText(resourceName, "Le nom de la ressource");
    const value = Location.#requirePositiveNumber(amount, "Le montant déposé");
    const usedSlots = this.getUniversalUsedSlots();
    if (usedSlots > this.storageSlotCapacity) return 0;
    const bundleSize = getItemDefinition(name)?.bundleSize ?? 1;
    const current = this.resources.stock[name] ?? 0;
    const partialRoom =
      current % bundleSize === 0 ? 0 : bundleSize - (current % bundleSize);
    const accepted = Math.min(
      value,
      partialRoom +
        Math.max(0, this.storageSlotCapacity - usedSlots) * bundleSize,
    );
    if (accepted > 0)
      this.resources.stock[name] = (this.resources.stock[name] ?? 0) + accepted;
    return accepted;
  }

  recalculateStorageCapacity() {
    this.resources.storageCapacity = this.storageSlotCapacity;
    return this.resources.storageCapacity;
  }

  get storageSlotCapacity() {
    return Math.min(
      40,
      Math.max(
        4,
        Math.floor((this.population ?? 0) / 2) +
          Math.floor(this.resources.infrastructureStorage),
      ),
    );
  }

  get productionSlotCapacity() {
    return (
      Object.keys(this.resources.production).length *
      PRODUCTION_SLOTS_PER_RESOURCE
    );
  }

  getUniversalUsedSlots() {
    return Object.entries(this.resources.stock).reduce(
      (sum, [itemId, quantity]) =>
        sum +
        Math.ceil(quantity / (getItemDefinition(itemId)?.bundleSize ?? 1)),
      0,
    );
  }

  transferProductionResource(resourceName, amount, destination = "universal") {
    const name = Location.#requireText(resourceName, "Le nom de la ressource");
    const requested = Location.#requirePositiveNumber(
      amount,
      "Le montant transféré",
    );
    const available = Math.min(
      requested,
      this.resources.productionStock[name] ?? 0,
    );
    if (available <= 0) return 0;
    const transferred =
      destination === "universal"
        ? this.depositResource(name, available)
        : available;
    if (transferred > 0) this.resources.productionStock[name] -= transferred;
    return transferred;
  }

  depositItem(item) {
    const [entry] = Location.#createStoredItems([item]);
    const existing = this.storedItems.find(
      (candidate) =>
        candidate.itemId === entry.itemId &&
        candidate.portable === entry.portable &&
        candidate.valuePerUnit === entry.valuePerUnit,
    );
    if (existing) existing.quantity += entry.quantity;
    else this.storedItems.push(entry);
    return { ...entry };
  }

  produceResources(cycles = 1, modifier = 1) {
    if (!Number.isFinite(cycles) || cycles <= 0)
      throw new RangeError("Le nombre de cycles doit être positif.");
    if (
      this.features.resourceProduction !== true ||
      this.population === 0 ||
      this.state === "abandoned"
    )
      return {};
    const produced = {};
    for (const [resource, rate] of Object.entries(this.resources.production)) {
      const bundleSize = getItemDefinition(resource)?.bundleSize ?? 1;
      const remainingCapacity = Math.max(
        0,
        bundleSize * PRODUCTION_SLOTS_PER_RESOURCE -
          (this.resources.productionStock[resource] ?? 0),
      );
      const amount = Math.min(remainingCapacity, rate * cycles * modifier);
      if (amount <= 0) continue;
      this.resources.productionStock[resource] =
        (this.resources.productionStock[resource] ?? 0) + amount;
      produced[resource] = amount;
    }
    return produced;
  }

  produceRecruits(cycles = 1, random = Math.random, modifier = 1) {
    if (!Number.isFinite(cycles) || cycles <= 0)
      throw new RangeError("Le nombre de cycles doit être positif.");
    if (typeof random !== "function")
      throw new TypeError("La source aléatoire doit être une fonction.");
    if (
      this.features.recruitment !== true ||
      this.population === 0 ||
      this.state === "abandoned"
    )
      return {};
    const produced = {};
    for (const [typeId, rate] of Object.entries(this.recruitment.production)) {
      const factor = 1 + (random() * 2 - 1) * this.recruitment.variance;
      const remainingCapacity = Math.max(
        0,
        (this.recruitment.capacities[typeId] ?? 0) -
          (this.recruitment.stock[typeId] ?? 0),
      );
      const amount = Math.min(
        remainingCapacity,
        Math.max(0, Math.floor(rate * cycles * factor * modifier)),
      );
      if (amount <= 0) continue;
      this.recruitment.stock[typeId] =
        (this.recruitment.stock[typeId] ?? 0) + amount;
      produced[typeId] = amount;
    }
    return produced;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      roles: [...this.roles],
      source: this.source,
      position: { ...this.position },
      interactionRadius: this.interactionRadius,
      detectionRadius: this.detectionRadius,
      state: this.state,
      visibility: this.visibility,
      ownerId: this.ownerId,
      controllerId: this.controllerId,
      level: this.level,
      population: this.population,
      populationCapacity: this.populationCapacity,
      defenseSlots: this.defenseSlots,
      features: { ...this.features },
      resources: Location.#copyResources(this.resources),
      storedItems: this.storedItems.map((item) => ({ ...item })),
      contentment: this.contentment,
      capture: { ...this.capture },
      storageSlotCapacity: this.storageSlotCapacity,
      infrastructure: { ...this.infrastructure },
      heroIds: [...this.heroIds],
      garrison: this.garrison.toJSON(),
      dismantlings: structuredClone(this.dismantlings),
      improvements: this.improvements.map((item) => ({ ...item })),
      recruitment: Location.#copyRecruitment(this.recruitment),
      questIds: [...this.questIds],
      eventIds: [...this.eventIds],
      interactionIds: [...this.interactionIds],
      chief: this.chief === null ? null : structuredClone(this.chief),
      qr: { ...this.qr },
      statistics: { ...this.statistics },
      progression: { ...this.progression },
      durability: this.durability === null ? null : { ...this.durability },
      abandonmentCycles: this.abandonmentCycles,
    };
  }

  static #createPosition(position) {
    if (
      position === null ||
      Array.isArray(position) ||
      typeof position !== "object"
    )
      throw new TypeError("La position doit être un objet.");
    const { latitude, longitude } = position;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
      throw new RangeError("La latitude doit être comprise entre -90 et 90.");
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
      throw new RangeError(
        "La longitude doit être comprise entre -180 et 180.",
      );
    return { latitude, longitude };
  }

  static #createResources(resources) {
    if (
      resources === null ||
      Array.isArray(resources) ||
      typeof resources !== "object"
    )
      throw new TypeError("Les ressources doivent être un objet.");
    const {
      production = {},
      productionStock = {},
      stock = {},
      storageCapacity = 0,
      infrastructureStorage = 0,
    } = resources;
    return {
      production: Location.#createNonNegativeMap(production, "La production"),
      productionStock: Location.#createNonNegativeMap(
        productionStock,
        "Le stock de production",
      ),
      stock: Location.#createNonNegativeMap(stock, "Le stock"),
      storageCapacity: Location.#requireNonNegativeNumber(
        storageCapacity,
        "La capacité de stockage",
      ),
      infrastructureStorage: Location.#requireNonNegativeNumber(
        infrastructureStorage,
        "Le stockage des infrastructures",
      ),
    };
  }

  static #copyResources(resources) {
    return {
      production: { ...resources.production },
      productionStock: { ...resources.productionStock },
      stock: { ...resources.stock },
      storageCapacity: resources.storageCapacity,
      infrastructureStorage: resources.infrastructureStorage,
    };
  }

  static #createStoredItems(items) {
    if (!Array.isArray(items))
      throw new TypeError("Le stockage d'objets doit être une liste.");
    return items.map((item) => {
      if (item === null || Array.isArray(item) || typeof item !== "object")
        throw new TypeError("Un objet stocké doit être un objet.");
      return {
        id:
          item.id === undefined
            ? `stored-${Location.#requireText(item.itemId, "L'identifiant de l'objet")}`
            : Location.#requireText(item.id, "L'identifiant du lot"),
        itemId: Location.#requireText(item.itemId, "L'identifiant de l'objet"),
        quantity: Location.#requirePositiveNumber(
          item.quantity,
          "La quantité d'objets",
        ),
        portable: item.portable ?? true,
        valuePerUnit: Location.#requireNonNegativeNumber(
          item.valuePerUnit ?? 0,
          "La valeur de l'objet",
        ),
      };
    });
  }

  static #createCapture(capture) {
    if (
      capture === null ||
      Array.isArray(capture) ||
      typeof capture !== "object"
    )
      throw new TypeError("La configuration de capture doit être un objet.");
    return {
      questObjectiveId:
        capture.questObjectiveId === undefined ||
        capture.questObjectiveId === null
          ? null
          : Location.#requireText(
              capture.questObjectiveId,
              "L'objectif protégeant le lieu",
            ),
    };
  }

  static #createQr(qr) {
    if (
      qr === null ||
      Array.isArray(qr) ||
      typeof qr !== "object" ||
      typeof qr.enabled !== "boolean"
    )
      throw new TypeError("Le QR doit indiquer s'il est activé.");
    const normalized = { enabled: qr.enabled, required: qr.required ?? false };
    if (typeof normalized.required !== "boolean")
      throw new TypeError("L'obligation du QR doit être un booléen.");
    if (qr.id !== undefined)
      normalized.id = Location.#requireText(qr.id, "L'identifiant du QR");
    return normalized;
  }

  static #createChief(chief) {
    if (chief === null) return null;
    if (Array.isArray(chief) || typeof chief !== "object")
      throw new TypeError("Le chef local doit être un objet.");
    const dialogues = chief.dialogues ?? [];
    if (!Array.isArray(dialogues))
      throw new TypeError("Les dialogues du chef doivent être une liste.");
    const contexts = chief.contexts ?? [];
    if (!Array.isArray(contexts))
      throw new TypeError("Les contextes du chef doivent être une liste.");
    const tradeOffers = chief.tradeOffers ?? [];
    if (!Array.isArray(tradeOffers))
      throw new TypeError("Les offres du chef doivent être une liste.");
    return {
      name: Location.#requireText(chief.name ?? "Chef local", "Le nom du chef"),
      title: Location.#requireText(
        chief.title ?? "Chef du lieu",
        "Le titre du chef",
      ),
      greeting: Location.#requireText(
        chief.greeting ?? "Que puis-je faire pour vous ?",
        "L'accueil du chef",
      ),
      openingLines: Location.#createTextList(
        chief.openingLines ?? [
          chief.greeting ?? "Que puis-je faire pour vous ?",
        ],
        "Les répliques d'accueil",
      ),
      portrait:
        chief.portrait == null
          ? null
          : Location.#requireText(chief.portrait, "L'illustration du chef"),
      isHero: chief.isHero === true,
      trade: chief.trade === true,
      tradeLimitPerCycle: Location.#requireNonNegativeInteger(
        chief.tradeLimitPerCycle ?? (tradeOffers.length > 0 ? 2 : 0),
        "Le quota de commerce du chef",
      ),
      tradeOffers: tradeOffers.map((offer, index) => ({
        id: Location.#requireText(
          offer.id ?? `offer-${index + 1}`,
          "L'identifiant de l'offre",
        ),
        give: Location.#createTradeResource(offer.give, "La ressource donnée"),
        receive: Location.#createTradeResource(
          offer.receive,
          "La ressource reçue",
        ),
      })),
      secondaryQuestIds: Location.#createTextList(
        chief.secondaryQuestIds ?? [],
        "Les quêtes secondaires du chef",
      ),
      contexts: contexts.map((context, index) => ({
        id: Location.#requireText(
          context.id ?? `context-${index + 1}`,
          "Le contexte de dialogue",
        ),
        phaseIds: Location.#createTextList(
          context.phaseIds ?? [],
          "Les phases du contexte",
        ),
        phaseStatuses: Location.#createTextList(
          context.phaseStatuses ?? [],
          "Les états du contexte",
        ),
        completedObjectiveId:
          context.completedObjectiveId == null
            ? null
            : Location.#requireText(
                context.completedObjectiveId,
                "L'objectif du contexte",
              ),
        openingLines: Location.#createTextList(
          context.openingLines,
          "Les répliques contextuelles",
        ),
      })),
      dialogues: dialogues.map((dialogue) => ({
        id: Location.#requireText(dialogue.id, "L'identifiant du dialogue"),
        label: Location.#requireText(
          dialogue.label ?? "Discuter",
          "Le libellé du dialogue",
        ),
        text: Location.#requireText(dialogue.text, "Le texte du dialogue"),
        lines: Location.#createTextList(
          dialogue.lines ?? [dialogue.text],
          "Les répliques du dialogue",
        ),
        objectiveId:
          dialogue.objectiveId == null
            ? null
            : Location.#requireText(
                dialogue.objectiveId,
                "L'objectif du dialogue",
              ),
        when: ["always", "active", "completed"].includes(
          dialogue.when ?? "always",
        )
          ? (dialogue.when ?? "always")
          : "always",
      })),
    };
  }

  static #createTradeResource(value, label) {
    if (value === null || Array.isArray(value) || typeof value !== "object")
      throw new TypeError(`${label} doit être un objet.`);
    return {
      resource: Location.#requireText(value.resource, label),
      amount: Location.#requirePositiveNumber(value.amount, label),
    };
  }

  static #createRecruitment(recruitment, population) {
    if (
      recruitment === null ||
      Array.isArray(recruitment) ||
      typeof recruitment !== "object"
    )
      throw new TypeError("Le recrutement doit être un objet.");
    const ids = Location.#createTextList(
      recruitment.availableUnitTypeIds ?? [],
      "Les unités recrutables",
    );
    const production = Location.#createNonNegativeMap(
      recruitment.production ?? {},
      "La production de recrues",
    );
    const stock = Location.#createNonNegativeMap(
      recruitment.stock ?? {},
      "Le stock de recrues",
    );
    for (const typeId of [...Object.keys(production), ...Object.keys(stock)])
      if (!ids.includes(typeId))
        throw new RangeError(
          "Un stock de recrues doit correspondre à une unité disponible.",
        );
    const capacity =
      population === null
        ? Location.#requireNonNegativeNumber(
            recruitment.capacity ?? 0,
            "La capacité de recrutement",
          )
        : Math.floor(population / 4);
    const configuredWeights = Location.#createNonNegativeMap(
      recruitment.weights ?? {},
      "Les poids de recrutement",
    );
    const weights = Object.fromEntries(
      ids.map((typeId) => [typeId, configuredWeights[typeId] ?? 1]),
    );
    if (Object.values(weights).some((weight) => weight <= 0))
      throw new RangeError("Chaque type recruté doit avoir un poids positif.");
    const capacities = Location.#distributeCapacity(capacity, ids, weights);
    for (const typeId of Object.keys(stock))
      stock[typeId] = Math.min(stock[typeId], capacities[typeId] ?? 0);
    return {
      availableUnitTypeIds: ids,
      production,
      stock,
      capacity,
      weights,
      capacities,
      variance: Location.#requireRatio(
        recruitment.variance ?? 0,
        "La variance de recrutement",
      ),
    };
  }

  static #copyRecruitment(value) {
    return {
      availableUnitTypeIds: [...value.availableUnitTypeIds],
      production: { ...value.production },
      stock: { ...value.stock },
      capacity: value.capacity,
      weights: { ...value.weights },
      capacities: { ...value.capacities },
      variance: value.variance,
    };
  }

  static #distributeCapacity(capacity, ids, weights) {
    if (ids.length === 0) return {};
    const totalWeight = ids.reduce((sum, typeId) => sum + weights[typeId], 0);
    const shares = ids.map((typeId, index) => {
      const exact = (capacity * weights[typeId]) / totalWeight;
      return {
        typeId,
        index,
        capacity: Math.floor(exact),
        remainder: exact - Math.floor(exact),
      };
    });
    let remaining =
      capacity - shares.reduce((sum, share) => sum + share.capacity, 0);
    [...shares]
      .sort(
        (first, second) =>
          second.remainder - first.remainder || first.index - second.index,
      )
      .forEach((share) => {
        if (remaining > 0) {
          share.capacity += 1;
          remaining -= 1;
        }
      });
    return Object.fromEntries(
      shares.map((share) => [share.typeId, share.capacity]),
    );
  }

  static #createStatistics(statistics) {
    if (
      statistics === null ||
      Array.isArray(statistics) ||
      typeof statistics !== "object"
    )
      throw new TypeError("Les statistiques doivent être un objet.");
    return Location.#createNonNegativeMap(statistics, "Les statistiques");
  }

  static #createDurability(value) {
    if (value === null || Array.isArray(value) || typeof value !== "object")
      throw new TypeError("La durabilité doit être un objet.");
    const maxHealth = Location.#requirePositiveNumber(
      value.maxHealth,
      "Les points de vie maximum",
    );
    const health = Location.#requireNonNegativeNumber(
      value.health,
      "Les points de vie",
    );
    if (health > maxHealth)
      throw new RangeError(
        "Les points de vie ne peuvent pas dépasser le maximum.",
      );
    const lastRegenerationAt = value.lastRegenerationAt ?? null;
    if (lastRegenerationAt !== null && !Number.isFinite(lastRegenerationAt))
      throw new TypeError("La date de régénération doit être un timestamp.");
    return { health, maxHealth, lastRegenerationAt };
  }

  static #createBooleanMap(values, label) {
    if (values === null || Array.isArray(values) || typeof values !== "object")
      throw new TypeError(`${label} doivent être un objet.`);
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => {
        if (typeof value !== "boolean")
          throw new TypeError(`${label} doivent contenir des booléens.`);
        return [Location.#requireText(key, "Une clé"), value];
      }),
    );
  }

  static #createNonNegativeMap(values, label) {
    if (values === null || Array.isArray(values) || typeof values !== "object")
      throw new TypeError(`${label} doivent être un objet.`);
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        Location.#requireText(key, "Une clé"),
        Location.#requireNonNegativeNumber(value, label),
      ]),
    );
  }

  static #createTextList(values, label) {
    if (!Array.isArray(values))
      throw new TypeError(`${label} doivent être une liste.`);
    return [
      ...new Set(
        values.map((value) => Location.#requireText(value, "Un identifiant")),
      ),
    ];
  }

  static #createOptionalId(value, label) {
    return value === null ? null : Location.#requireText(value, label);
  }
  static #requireText(value, label) {
    if (typeof value !== "string" || value.trim() === "")
      throw new TypeError(`${label} doit être un texte non vide.`);
    return value.trim();
  }
  static #requirePositiveInteger(value, label) {
    if (!Number.isInteger(value) || value <= 0)
      throw new RangeError(`${label} doit être un entier strictement positif.`);
    return value;
  }
  static #requirePositiveNumber(value, label) {
    if (!Number.isFinite(value) || value <= 0)
      throw new RangeError(`${label} doit être un nombre strictement positif.`);
    return value;
  }
  static #requireNonNegativeNumber(value, label) {
    if (!Number.isFinite(value) || value < 0)
      throw new RangeError(`${label} doit être un nombre positif ou nul.`);
    return value;
  }
  static #requireNonNegativeInteger(value, label) {
    if (!Number.isInteger(value) || value < 0)
      throw new RangeError(`${label} doit être un entier positif ou nul.`);
    return value;
  }
  static #requireRatio(value, label) {
    if (!Number.isFinite(value) || value < 0 || value > 1)
      throw new RangeError(`${label} doit être comprise entre 0 et 1.`);
    return value;
  }
  static #requirePercentage(value, label) {
    if (!Number.isFinite(value) || value < 0 || value > 100)
      throw new RangeError(`${label} doit être compris entre 0 et 100.`);
    return value;
  }
}
