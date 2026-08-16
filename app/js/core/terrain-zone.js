const TERRAIN_TYPES = new Set(["UNKNOWN", "NEUTRAL", "PLAIN", "ROAD", "FOREST", "SWAMP"]);
const CERTAINTY_LEVELS = new Set(["UNKNOWN", "SUSPECTED", "CONFIRMED"]);

/** Zone tactique dont le type et la certitude peuvent évoluer indépendamment du GPS. */
export class TerrainZone {
  constructor({ id, type = "UNKNOWN", certainty = "UNKNOWN", cells, source = null, discoveredBy = null, discoveredAt = null, modifiers = {} }) {
    this.id = TerrainZone.#requireText(id, "L'identifiant de zone");
    if (!TERRAIN_TYPES.has(type)) throw new RangeError("Le type de terrain est invalide.");
    if (!CERTAINTY_LEVELS.has(certainty)) throw new RangeError("Le niveau de certitude est invalide.");
    this.type = type;
    this.certainty = certainty;
    this.cells = TerrainZone.#createCells(cells);
    this.source = source === null ? null : TerrainZone.#requireText(source, "La source du terrain");
    this.discoveredBy = discoveredBy === null ? null : TerrainZone.#requireText(discoveredBy, "Le découvreur");
    this.discoveredAt = discoveredAt;
    this.modifiers = TerrainZone.#createModifiers(modifiers);
  }

  contains(position) { return this.cells.some((cell) => cell.x === position.x && cell.y === position.y); }
  toJSON() { return { id: this.id, type: this.type, certainty: this.certainty, cells: this.cells.map((cell) => ({ ...cell })), source: this.source, discoveredBy: this.discoveredBy, discoveredAt: this.discoveredAt, modifiers: { ...this.modifiers } }; }

  static #createCells(cells) {
    if (!Array.isArray(cells) || cells.length === 0) throw new RangeError("Une zone de terrain doit contenir au moins une case.");
    const uniqueCells = new Set();
    return cells.map((cell) => {
      if (cell === null || typeof cell !== "object" || !Number.isInteger(cell.x) || !Number.isInteger(cell.y) || cell.x < 0 || cell.y < 0) throw new RangeError("Une case de terrain est invalide.");
      const key = `${cell.x}:${cell.y}`;
      if (uniqueCells.has(key)) throw new RangeError("Une zone ne peut pas contenir deux fois la même case.");
      uniqueCells.add(key);
      return { x: cell.x, y: cell.y };
    });
  }

  static #createModifiers(modifiers) {
    if (modifiers === null || Array.isArray(modifiers) || typeof modifiers !== "object") throw new TypeError("Les modificateurs de terrain doivent être un objet.");
    return Object.fromEntries(Object.entries(modifiers).map(([name, value]) => {
      if (!Number.isFinite(value) || value <= 0) throw new RangeError("Un modificateur de terrain doit être positif.");
      return [TerrainZone.#requireText(name, "Le nom de modificateur"), value];
    }));
  }

  static #requireText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
}
