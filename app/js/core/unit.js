import { UNIT_RANKS, rankForExperience, requireRank } from "./rank-system.js";

/** Troupe persistante dont le grade détermine l'effectif maximal. */
export class Unit {
  constructor({ id, ownerPlayerId, typeId, quantity, rank = "soldier", level = 1, experience = 0, equipmentIds = [], state = "active" }) {
    this.id = Unit.#text(id, "L'identifiant de l'unité");
    this.ownerPlayerId = Unit.#text(ownerPlayerId, "L'identifiant du propriétaire");
    this.typeId = Unit.#text(typeId, "L'identifiant du type d'unité");
    this.rank = requireRank(UNIT_RANKS, rank, "Le grade d'unité").id;
    this.maxQuantity = requireRank(UNIT_RANKS, this.rank, "Le grade d'unité").capacity;
    this.quantity = Unit.#quantity(quantity, this.maxQuantity);
    this.level = Unit.#positiveInteger(level, "Le niveau");
    this.experience = Unit.#nonNegative(experience, "L'expérience");
    this.equipmentIds = Unit.#ids(equipmentIds);
    this.state = Unit.#text(state, "L'état de l'unité");
    this.#applyExperienceRank();
  }
  get isDefeated() { return this.quantity === 0; }
  get missingQuantity() { return this.maxQuantity - this.quantity; }
  lose(quantity) { const losses = Math.min(Unit.#positiveInteger(quantity, "Les pertes"), this.quantity); this.quantity -= losses; if (this.isDefeated) this.state = "defeated"; return losses; }
  reinforce(quantity) { const reinforcements = Math.min(Unit.#positiveInteger(quantity, "Le renfort"), this.missingQuantity); this.quantity += reinforcements; if (this.quantity > 0 && this.state === "defeated") this.state = "active"; return reinforcements; }
  addExperience(amount) { this.experience += Unit.#positiveInteger(amount, "Le gain d'expérience"); return this.#applyExperienceRank(); }
  promote(rank) { const current = UNIT_RANKS.findIndex((item) => item.id === this.rank); const next = UNIT_RANKS.findIndex((item) => item.id === rank); if (next <= current) return false; const value = requireRank(UNIT_RANKS, rank, "Le grade d'unité"); this.rank = value.id; this.maxQuantity = value.capacity; return true; }
  appointOfficer(rank) { return this.promote(rank); }
  setLevel(level) { this.level = Unit.#positiveInteger(level, "Le niveau"); }
  toJSON() { return { id: this.id, ownerPlayerId: this.ownerPlayerId, typeId: this.typeId, quantity: this.quantity, maxQuantity: this.maxQuantity, rank: this.rank, level: this.level, experience: this.experience, equipmentIds: [...this.equipmentIds], state: this.state }; }
  #applyExperienceRank() { const earned = rankForExperience(UNIT_RANKS, this.experience); return earned.id === this.rank ? false : this.promote(earned.id); }
  static #ids(ids) { if (!Array.isArray(ids)) throw new TypeError("Les équipements doivent être une liste."); return [...new Set(ids.map((id) => Unit.#text(id, "L'identifiant de l'équipement")))]; }
  static #quantity(value, maximum) { if (!Number.isInteger(value) || value < 0 || value > maximum) throw new RangeError("L'effectif dépasse la capacité du grade."); return value; }
  static #text(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
  static #positiveInteger(value, label) { if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} doit être un entier strictement positif.`); return value; }
  static #nonNegative(value, label) { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} doit être positif ou nul.`); return value; }
}
