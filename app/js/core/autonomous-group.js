import { Army } from "./army.js";

export const AUTONOMOUS_GROUP_TYPES = Object.freeze(["rogue", "army", "messenger", "convoy", "prospecting"]);
export const AUTONOMOUS_OWNER_KINDS = Object.freeze(["player", "faction", "location", "independent"]);

/** Groupe non directement contrôlé par un joueur, indépendant du DOM. */
export class AutonomousGroup {
  constructor({
    id, type, owner, position, factionId = null, originLocationId = null,
    status = "idle", behavior = "passive", mission = null, army = {},
    cargo = [], message = null, morale = null, movement = null,
    interruption = null, ambush = null, history = [], traceAnchor = null,
    detectionMultiplier = 1, concealmentMultiplier = 1,
  }) {
    this.id = AutonomousGroup.#text(id, "L'identifiant du groupe autonome");
    this.type = AutonomousGroup.#choice(type, AUTONOMOUS_GROUP_TYPES, "Le type du groupe autonome");
    this.owner = AutonomousGroup.#owner(owner);
    this.position = AutonomousGroup.#position(position);
    this.factionId = AutonomousGroup.#optionalText(factionId, "La faction");
    this.originLocationId = AutonomousGroup.#optionalText(originLocationId, "Le lieu d'origine");
    this.status = AutonomousGroup.#text(status, "Le statut");
    this.behavior = AutonomousGroup.#text(behavior, "Le comportement");
    this.mission = AutonomousGroup.#optionalRecord(mission, "La mission");
    this.army = army instanceof Army ? army : new Army(army);
    this.cargo = AutonomousGroup.#records(cargo, "La cargaison");
    this.message = AutonomousGroup.#optionalRecord(message, "Le message");
    if (morale !== null && (!Number.isFinite(morale) || morale < 0)) throw new RangeError("Le moral doit être positif, nul ou absent.");
    this.morale = morale;
    this.movement = AutonomousGroup.#optionalRecord(movement, "Le déplacement");
    this.interruption = AutonomousGroup.#optionalRecord(interruption, "L'interruption");
    this.ambush = AutonomousGroup.#optionalRecord(ambush, "L'embuscade");
    this.history = AutonomousGroup.#records(history, "L'historique");
    this.traceAnchor = traceAnchor === null ? { ...this.position } : AutonomousGroup.#position(traceAnchor);
    this.detectionMultiplier = AutonomousGroup.#positiveNumber(detectionMultiplier, "Le multiplicateur de détection");
    this.concealmentMultiplier = AutonomousGroup.#positiveNumber(concealmentMultiplier, "Le multiplicateur de discrétion");
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      owner: { ...this.owner },
      position: { ...this.position },
      factionId: this.factionId,
      originLocationId: this.originLocationId,
      status: this.status,
      behavior: this.behavior,
      mission: this.mission === null ? null : structuredClone(this.mission),
      army: this.army.toJSON(),
      cargo: this.cargo.map((entry) => structuredClone(entry)),
      message: this.message === null ? null : structuredClone(this.message),
      morale: this.morale,
      movement: this.movement === null ? null : structuredClone(this.movement),
      interruption: this.interruption === null ? null : structuredClone(this.interruption),
      ambush: this.ambush === null ? null : structuredClone(this.ambush),
      history: this.history.map((entry) => structuredClone(entry)),
      traceAnchor: { ...this.traceAnchor },
      detectionMultiplier: this.detectionMultiplier,
      concealmentMultiplier: this.concealmentMultiplier,
    };
  }

  static #owner(owner) {
    if (owner === null || Array.isArray(owner) || typeof owner !== "object") throw new TypeError("Le propriétaire doit être un objet.");
    return {
      kind: AutonomousGroup.#choice(owner.kind, AUTONOMOUS_OWNER_KINDS, "Le type de propriétaire"),
      id: AutonomousGroup.#text(owner.id, "L'identifiant du propriétaire"),
    };
  }

  static #position(position) {
    if (position === null || Array.isArray(position) || typeof position !== "object" || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) throw new TypeError("La position du groupe autonome est invalide.");
    return { latitude: position.latitude, longitude: position.longitude };
  }

  static #optionalRecord(value, label) {
    if (value === null) return null;
    if (Array.isArray(value) || typeof value !== "object") throw new TypeError(`${label} doit être un objet ou null.`);
    return structuredClone(value);
  }

  static #records(values, label) {
    if (!Array.isArray(values)) throw new TypeError(`${label} doit être une liste.`);
    return values.map((value) => {
      if (value === null || Array.isArray(value) || typeof value !== "object") throw new TypeError(`Chaque entrée de ${label.toLowerCase()} doit être un objet.`);
      return structuredClone(value);
    });
  }

  static #choice(value, choices, label) {
    const checked = AutonomousGroup.#text(value, label);
    if (!choices.includes(checked)) throw new RangeError(`${label} n'est pas reconnu.`);
    return checked;
  }

  static #optionalText(value, label) { return value === null ? null : AutonomousGroup.#text(value, label); }
  static #positiveNumber(value, label) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} doit être strictement positif.`); return value; }
  static #text(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
}
