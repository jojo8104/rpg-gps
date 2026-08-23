/** Le compte joueur conserve les héros et les informations connues, pas leurs possessions. */
export class Player {
  constructor({ id, name, heroIds = [], discoveredLocationIds = [], locationKnowledge = {}, informationRecords = [] }) {
    this.id = Player.#requireText(id, "L'identifiant du joueur");
    this.name = Player.#requireText(name, "Le nom du joueur");
    this.heroIds = Player.#createIds(heroIds, "Les héros du joueur");
    this.discoveredLocationIds = Player.#createIds(discoveredLocationIds, "Les lieux découverts");
    this.locationKnowledge = Object.fromEntries(this.discoveredLocationIds.map((id) => [id, 1]));
    for (const [id, level] of Object.entries(locationKnowledge)) this.discoverLocation(id, level);
    if (!Array.isArray(informationRecords)) throw new TypeError("Les renseignements doivent être une liste.");
    this.informationRecords = informationRecords.map((record) => structuredClone(record));
  }
  addHero(heroId) { return Player.#addUnique(this.heroIds, heroId, "L'identifiant du héros"); }
  removeHero(heroId) { const index = this.heroIds.indexOf(heroId); if (index < 0) return false; this.heroIds.splice(index, 1); return true; }
  discoverLocation(locationId, level = 1) { const id = Player.#requireText(locationId, "L'identifiant du lieu"); if (!Number.isInteger(level) || level < 1 || level > 3) throw new RangeError("Le niveau d'information doit être compris entre 1 et 3."); const previous = this.locationKnowledge[id] ?? 0; if (!this.discoveredLocationIds.includes(id)) this.discoveredLocationIds.push(id); this.locationKnowledge[id] = Math.max(previous, level); return this.locationKnowledge[id] > previous; }
  knowsLocation(locationId) { return this.discoveredLocationIds.includes(locationId); }
  getLocationKnowledge(locationId) { return this.locationKnowledge[locationId] ?? 0; }
  receiveLocationInformation(locationIds) { if (!Array.isArray(locationIds)) throw new TypeError("Les informations de lieux doivent être une liste."); return locationIds.filter((id) => this.discoverLocation(id)); }
  receiveInformation(record) { if (!record || typeof record !== "object" || Array.isArray(record)) throw new TypeError("Le renseignement doit être un objet."); const id = Player.#requireText(record.id, "L'identifiant du renseignement"); if (this.informationRecords.some((entry) => entry.id === id)) return false; this.informationRecords.push(structuredClone({ ...record, id })); return true; }
  getInformation(informationId) { return structuredClone(this.informationRecords.find((record) => record.id === informationId) ?? null); }
  toJSON() { return { id: this.id, name: this.name, heroIds: [...this.heroIds], discoveredLocationIds: [...this.discoveredLocationIds], locationKnowledge: { ...this.locationKnowledge }, informationRecords: structuredClone(this.informationRecords) }; }
  static #addUnique(ids, value, label) { const id = Player.#requireText(value, label); if (ids.includes(id)) return false; ids.push(id); return true; }
  static #createIds(ids, label) { if (!Array.isArray(ids)) throw new TypeError(`${label} doivent être une liste.`); return [...new Set(ids.map((id) => Player.#requireText(id, "Un identifiant")))]; }
  static #requireText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
}
