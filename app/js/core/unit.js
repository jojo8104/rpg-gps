import { UNIT_RANKS, requireRank } from "./rank-system.js";

/** Troupe persistante dont le grade determine l'effectif maximal. */
export class Unit {
  constructor({
    id, ownerPlayerId, typeId, quantity, name = null, number = null, rank = "soldier",
    level = 1, experience = 0, equipmentIds = [], specialPowerIds = [], state = "active",
    healthPerSoldier = 10, combatHealthThreshold = 4, soldierHealth = null,
  }) {
    this.id = Unit.#text(id, "L'identifiant de l'unite");
    this.ownerPlayerId = Unit.#text(ownerPlayerId, "L'identifiant du proprietaire");
    this.typeId = Unit.#text(typeId, "L'identifiant du type d'unite");
    this.name = name === null ? null : Unit.#text(name, "Le nom de l'unite");
    this.number = number === null ? null : Unit.#positiveInteger(number, "Le numero de l'unite");
    this.rank = requireRank(UNIT_RANKS, rank, "Le grade d'unite").id;
    this.maxQuantity = requireRank(UNIT_RANKS, this.rank, "Le grade d'unite").capacity;
    this.healthPerSoldier = Unit.#positiveInteger(healthPerSoldier, "Les PV par soldat");
    this.combatHealthThreshold = Unit.#nonNegativeInteger(combatHealthThreshold, "Le seuil de blessure");
    if (this.combatHealthThreshold >= this.healthPerSoldier) throw new RangeError("Le seuil de blessure doit etre inferieur aux PV par soldat.");
    const checkedQuantity = Unit.#quantity(quantity, this.maxQuantity);
    this.soldierHealth = Unit.#soldierHealth(soldierHealth, checkedQuantity, this.healthPerSoldier);
    this.quantity = this.soldierHealth.length;
    this.level = Unit.#positiveInteger(level, "Le niveau");
    this.experience = Unit.#nonNegative(experience, "L'experience");
    this.equipmentIds = Unit.#ids(equipmentIds);
    this.specialPowerIds = Unit.#ids(specialPowerIds);
    this.state = Unit.#text(state, "L'etat de l'unite");
  }

  get isDefeated() { return this.quantity === 0; }
  get missingQuantity() { return this.maxQuantity - this.quantity; }
  get unavailableCount() { return this.maxQuantity - this.combatantCount - this.woundedCount; }
  get combatantCount() { return this.soldierHealth.filter((health) => health > this.combatHealthThreshold).length; }
  get woundedCount() { return this.soldierHealth.filter((health) => health > 0 && health <= this.combatHealthThreshold).length; }

  lose(quantity) {
    const losses = Math.min(Unit.#positiveInteger(quantity, "Les pertes"), this.quantity);
    this.soldierHealth.splice(Math.max(0, this.soldierHealth.length - losses), losses);
    this.quantity = this.soldierHealth.length;
    if (this.isDefeated) this.state = "defeated";
    return losses;
  }

  reinforce(quantity) {
    const reinforcements = Math.min(Unit.#positiveInteger(quantity, "Le renfort"), this.missingQuantity);
    this.soldierHealth.push(...Array(reinforcements).fill(this.healthPerSoldier));
    this.quantity = this.soldierHealth.length;
    if (this.quantity > 0 && this.state === "defeated") this.state = "active";
    return reinforcements;
  }

  heal(timeUnits = 1) {
    if (!Number.isInteger(timeUnits) || timeUnits <= 0) throw new RangeError("Le temps de soin doit être un entier positif.");
    let restoredHealth = 0;
    this.soldierHealth = this.soldierHealth.map((health) => {
      const healed = Math.min(this.healthPerSoldier, health + timeUnits);
      restoredHealth += healed - health;
      return healed;
    });
    return { restoredHealth, healedSoldiers: this.soldierHealth.filter((health) => health === this.healthPerSoldier).length };
  }

  applyBattleHealth(soldierHealth) {
    this.soldierHealth = Unit.#soldierHealth(soldierHealth, null, this.healthPerSoldier)
      .filter((health) => health > 0)
      .slice(0, this.maxQuantity);
    this.quantity = this.soldierHealth.length;
    this.state = this.isDefeated ? "defeated" : "active";
    return { quantity: this.quantity, combatants: this.combatantCount, wounded: this.woundedCount };
  }

  addExperience(amount) { this.experience += Unit.#positiveInteger(amount, "Le gain d'experience"); return this.canPromote; }
  get nextRank() { const index = UNIT_RANKS.findIndex((item) => item.id === this.rank); return UNIT_RANKS[index + 1] ?? null; }
  get canPromote() { return this.nextRank !== null && this.experience >= this.nextRank.experience; }
  promote(rank) { const current = UNIT_RANKS.findIndex((item) => item.id === this.rank); const next = UNIT_RANKS.findIndex((item) => item.id === rank); if (next !== current + 1) return false; const value = requireRank(UNIT_RANKS, rank, "Le grade d'unite"); if (this.experience < value.experience) return false; this.rank = value.id; this.maxQuantity = value.capacity; this.level += 1; return true; }
  appointOfficer(rank) { return this.promote(rank); }
  setLevel(level) { this.level = Unit.#positiveInteger(level, "Le niveau"); }
  toJSON() { return { id: this.id, ownerPlayerId: this.ownerPlayerId, typeId: this.typeId, name: this.name, number: this.number, quantity: this.quantity, maxQuantity: this.maxQuantity, rank: this.rank, level: this.level, experience: this.experience, equipmentIds: [...this.equipmentIds], specialPowerIds: [...this.specialPowerIds], state: this.state, healthPerSoldier: this.healthPerSoldier, combatHealthThreshold: this.combatHealthThreshold, soldierHealth: [...this.soldierHealth] }; }

  static #ids(ids) { if (!Array.isArray(ids)) throw new TypeError("Les equipements doivent etre une liste."); return [...new Set(ids.map((id) => Unit.#text(id, "L'identifiant de l'equipement")))]; }
  static #quantity(value, maximum) { if (!Number.isInteger(value) || value < 0 || value > maximum) throw new RangeError("L'effectif depasse la capacite du grade."); return value; }
  static #soldierHealth(values, quantity, maximum) { if (values === null) return Array(quantity).fill(maximum); if (!Array.isArray(values)) throw new TypeError("Les PV des soldats doivent etre une liste."); if (quantity !== null && values.length !== quantity) throw new RangeError("Les PV des soldats ne correspondent pas a l'effectif."); return values.map((health) => { if (!Number.isInteger(health) || health < 0 || health > maximum) throw new RangeError("Les PV d'un soldat sont invalides."); return health; }); }
  static #text(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit etre un texte non vide.`); return value.trim(); }
  static #positiveInteger(value, label) { if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} doit etre un entier strictement positif.`); return value; }
  static #nonNegative(value, label) { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} doit etre positif ou nul.`); return value; }
  static #nonNegativeInteger(value, label) { if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} doit etre un entier positif ou nul.`); return value; }
}
