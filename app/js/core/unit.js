/** Représente une troupe appartenant à un joueur, dans une armée ou une garnison. */
export class Unit {
  constructor({
    id,
    ownerPlayerId,
    typeId,
    quantity,
    maxQuantity,
    level = 1,
    experience = 0,
    equipmentIds = [],
    state = "active",
  }) {
    this.id = Unit.#requireText(id, "L'identifiant de l'unité");
    this.ownerPlayerId = Unit.#requireText(ownerPlayerId, "L'identifiant du propriétaire");
    this.typeId = Unit.#requireText(typeId, "L'identifiant du type d'unité");
    this.maxQuantity = Unit.#requirePositiveInteger(maxQuantity, "L'effectif maximal");
    this.quantity = Unit.#requireQuantity(quantity, this.maxQuantity);
    this.level = Unit.#requirePositiveInteger(level, "Le niveau");
    this.experience = Unit.#requireNonNegativeNumber(experience, "L'expérience");
    this.equipmentIds = Unit.#createIds(equipmentIds);
    this.state = Unit.#requireText(state, "L'état de l'unité");
  }

  get isDefeated() {
    return this.quantity === 0;
  }

  get missingQuantity() {
    return this.maxQuantity - this.quantity;
  }

  lose(quantity) {
    const validQuantity = Unit.#requirePositiveInteger(quantity, "Les pertes");
    const losses = Math.min(validQuantity, this.quantity);
    this.quantity -= losses;

    if (this.isDefeated) {
      this.state = "defeated";
    }

    return losses;
  }

  reinforce(quantity) {
    const validQuantity = Unit.#requirePositiveInteger(quantity, "Le renfort");
    const reinforcements = Math.min(validQuantity, this.missingQuantity);
    this.quantity += reinforcements;

    if (this.quantity > 0 && this.state === "defeated") {
      this.state = "active";
    }

    return reinforcements;
  }

  addExperience(amount) {
    this.experience += Unit.#requirePositiveInteger(amount, "Le gain d'expérience");
  }

  setLevel(level) {
    this.level = Unit.#requirePositiveInteger(level, "Le niveau");
  }

  toJSON() {
    return {
      id: this.id,
      ownerPlayerId: this.ownerPlayerId,
      typeId: this.typeId,
      quantity: this.quantity,
      maxQuantity: this.maxQuantity,
      level: this.level,
      experience: this.experience,
      equipmentIds: [...this.equipmentIds],
      state: this.state,
    };
  }

  static #createIds(ids) {
    if (!Array.isArray(ids)) {
      throw new TypeError("Les équipements doivent être une liste.");
    }

    return [...new Set(ids.map((id) => Unit.#requireText(id, "L'identifiant de l'équipement")))];
  }

  static #requireQuantity(value, maxQuantity) {
    if (!Number.isInteger(value) || value < 0 || value > maxQuantity) {
      throw new RangeError("L'effectif doit être un entier compris entre 0 et l'effectif maximal.");
    }

    return value;
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
}
