import { Army } from "./army.js";

/** Armée persistante issue de désertions ou de conséquences de bataille. */
export class RogueArmy {
  constructor({ id, position, army, factionId = null, behavior = "roaming", morale = 3, history = [] }) {
    this.id = RogueArmy.#requireText(id, "L'identifiant de l'armée rogue");
    this.position = RogueArmy.#createPosition(position);
    this.army = army instanceof Army ? army : new Army(army);
    this.factionId = factionId === null ? null : RogueArmy.#requireText(factionId, "La faction");
    this.behavior = RogueArmy.#requireText(behavior, "Le comportement");
    if (!Number.isFinite(morale) || morale < 0) throw new RangeError("Le moral doit être positif ou nul.");
    this.morale = morale;
    if (!Array.isArray(history)) throw new TypeError("L'historique doit être une liste.");
    this.history = history.map((entry) => ({ ...entry }));
  }

  toJSON() { return { id: this.id, position: { ...this.position }, army: this.army.toJSON(), factionId: this.factionId, behavior: this.behavior, morale: this.morale, history: this.history.map((entry) => ({ ...entry })) }; }
  static #createPosition(position) { if (position === null || typeof position !== "object" || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) throw new TypeError("La position de l'armée rogue est invalide."); return { latitude: position.latitude, longitude: position.longitude }; }
  static #requireText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
}
