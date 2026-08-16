/**
 * Représente le joueur humain et ses possessions globales.
 * Les héros sont référencés par leur identifiant : ils restent gérés par Game.
 */
export class Player {
  constructor({ id, name, heroIds = [], resources = {} }) {
    this.id = Player.#requireText(id, "L'identifiant du joueur");
    this.name = Player.#requireText(name, "Le nom du joueur");
    this.heroIds = Player.#createHeroIds(heroIds);
    this.resources = Player.#createResources(resources);
  }

  addHero(heroId) {
    const validHeroId = Player.#requireText(heroId, "L'identifiant du héros");

    if (this.heroIds.includes(validHeroId)) {
      return false;
    }

    this.heroIds.push(validHeroId);
    return true;
  }

  removeHero(heroId) {
    const index = this.heroIds.indexOf(heroId);

    if (index === -1) {
      return false;
    }

    this.heroIds.splice(index, 1);
    return true;
  }

  getResourceAmount(resourceName) {
    const validName = Player.#requireText(resourceName, "Le nom de la ressource");
    return this.resources[validName] ?? 0;
  }

  addResource(resourceName, amount) {
    const validName = Player.#requireText(resourceName, "Le nom de la ressource");
    Player.#requirePositiveAmount(amount);

    this.resources[validName] = this.getResourceAmount(validName) + amount;
  }

  spendResource(resourceName, amount) {
    const validName = Player.#requireText(resourceName, "Le nom de la ressource");
    Player.#requirePositiveAmount(amount);

    if (this.getResourceAmount(validName) < amount) {
      return false;
    }

    this.resources[validName] -= amount;
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      heroIds: [...this.heroIds],
      resources: { ...this.resources },
    };
  }

  static #createHeroIds(heroIds) {
    if (!Array.isArray(heroIds)) {
      throw new TypeError("Les héros du joueur doivent être une liste.");
    }

    return [...new Set(heroIds.map((heroId) => Player.#requireText(heroId, "L'identifiant du héros")))];
  }

  static #createResources(resources) {
    if (resources === null || Array.isArray(resources) || typeof resources !== "object") {
      throw new TypeError("Les ressources du joueur doivent être un objet.");
    }

    return Object.fromEntries(
      Object.entries(resources).map(([name, amount]) => {
        Player.#requireText(name, "Le nom de la ressource");

        if (!Number.isFinite(amount) || amount < 0) {
          throw new RangeError("Une ressource initiale doit être un nombre positif ou nul.");
        }

        return [name, amount];
      }),
    );
  }

  static #requireText(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(`${label} doit être un texte non vide.`);
    }

    return value.trim();
  }

  static #requirePositiveAmount(amount) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new RangeError("Le montant doit être un nombre strictement positif.");
    }
  }
}
