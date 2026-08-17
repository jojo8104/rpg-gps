/**
 * Décrit un type d'unité configurable, chargé depuis les fichiers de données.
 * Cette classe ne contient aucun état propre à l'armée d'un joueur.
 */
export class UnitDefinition {
  constructor({ id, name, faction, maxQuantity, stats, retreat = {}, abilities = [], costs = {}, tags = [] }) {
    this.id = UnitDefinition.#requireText(id, "L'identifiant du type d'unité");
    this.name = UnitDefinition.#requireText(name, "Le nom du type d'unité");
    this.faction = UnitDefinition.#requireText(faction, "La faction de l'unité");
    this.maxQuantity = UnitDefinition.#requirePositiveInteger(maxQuantity, "L'effectif maximal");
    this.stats = UnitDefinition.#createStats(stats);
    this.retreat = UnitDefinition.#createRetreat(retreat, this.stats);
    this.abilities = UnitDefinition.#createTextList(abilities, "Les capacités");
    this.costs = UnitDefinition.#createAmounts(costs, "Les coûts");
    this.tags = UnitDefinition.#createTextList(tags, "Les tags");
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      faction: this.faction,
      maxQuantity: this.maxQuantity,
      stats: { ...this.stats },
      retreat: { ...this.retreat },
      abilities: [...this.abilities],
      costs: { ...this.costs },
      tags: [...this.tags],
    };
  }

  static #createStats(stats) {
    if (stats === null || Array.isArray(stats) || typeof stats !== "object") {
      throw new TypeError("Les statistiques doivent être un objet.");
    }

    const requiredStats = ["attack", "defense", "speed", "range", "morale"];
    const normalizedStats = {};

    for (const statName of requiredStats) {
      normalizedStats[statName] = UnitDefinition.#requireNonNegativeNumber(
        stats[statName],
        `La statistique ${statName}`,
      );
    }

    return normalizedStats;
  }

  static #createRetreat(retreat, stats) {
    if (retreat === null || Array.isArray(retreat) || typeof retreat !== "object") throw new TypeError("Les statistiques de retraite doivent etre un objet.");
    return {
      speed: UnitDefinition.#requirePositiveNumber(retreat.speed ?? stats.speed, "La vitesse de retraite"),
      defense: UnitDefinition.#requireNonNegativeNumber(retreat.defense ?? stats.defense, "La defense de retraite"),
      attack: UnitDefinition.#requireNonNegativeNumber(retreat.attack ?? stats.attack, "L'attaque de retraite"),
      range: UnitDefinition.#requirePositiveNumber(retreat.range ?? stats.range, "La portee de retraite"),
    };
  }

  static #createAmounts(amounts, label) {
    if (amounts === null || Array.isArray(amounts) || typeof amounts !== "object") {
      throw new TypeError(`${label} doivent être un objet.`);
    }

    return Object.fromEntries(
      Object.entries(amounts).map(([name, amount]) => [
        UnitDefinition.#requireText(name, "Le nom de la ressource"),
        UnitDefinition.#requireNonNegativeNumber(amount, "Le montant de la ressource"),
      ]),
    );
  }

  static #createTextList(values, label) {
    if (!Array.isArray(values)) {
      throw new TypeError(`${label} doivent être une liste.`);
    }

    return [...new Set(values.map((value) => UnitDefinition.#requireText(value, "Un identifiant")))];
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
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} doit etre un nombre strictement positif.`);
    return value;
  }
}
