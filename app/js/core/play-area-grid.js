import { PlayArea } from "./play-area.js";

/** Subdivision carrée d'une PlayArea et métriques d'activité sérialisables. */
export class PlayAreaGrid {
  constructor({ playArea, cellSizeMeters = 100, cells = null }) {
    this.playArea =
      playArea instanceof PlayArea ? playArea : new PlayArea(playArea);
    if (!Number.isFinite(cellSizeMeters) || cellSizeMeters <= 0)
      throw new RangeError("La taille des cellules doit être positive.");
    this.cellSizeMeters = cellSizeMeters;
    const latitudes = this.playArea.polygon.map((point) => point.latitude);
    const longitudes = this.playArea.polygon.map((point) => point.longitude);
    this.origin = {
      latitude: Math.min(...latitudes),
      longitude: Math.min(...longitudes),
    };
    this.averageLatitude =
      latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length;
    this.latitudeStep = cellSizeMeters / 111_320;
    this.longitudeStep =
      cellSizeMeters /
      (111_320 *
        Math.max(0.01, Math.cos((this.averageLatitude * Math.PI) / 180)));
    this.cells =
      cells === null
        ? this.#generate(Math.max(...latitudes), Math.max(...longitudes))
        : cells.map(normalizeCell);
    this.cellByCoordinates = new Map(
      this.cells.map((cell) => [`${cell.row}:${cell.column}`, cell]),
    );
  }

  getCellAt(position) {
    if (!this.playArea.contains(position)) return null;
    const row = Math.floor(
      (position.latitude - this.origin.latitude) / this.latitudeStep,
    );
    const column = Math.floor(
      (position.longitude - this.origin.longitude) / this.longitudeStep,
    );
    return this.cellByCoordinates.get(`${row}:${column}`) ?? null;
  }

  recordVisit(position, { activity = 1, visitedAt = Date.now() } = {}) {
    if (!Number.isFinite(activity) || activity < 0)
      throw new RangeError("L'activité doit être positive ou nulle.");
    const cell = this.getCellAt(position);
    if (cell === null) return null;
    cell.visits += 1;
    cell.activity += activity;
    cell.explored = true;
    cell.lastVisitedAt = visitedAt;
    return { ...cell, bounds: cell.bounds.map((point) => ({ ...point })) };
  }

  revealWithinRadius(position, { radius, coordinateMode = "gps" }) {
    if (!Number.isFinite(radius) || radius <= 0)
      throw new RangeError("Le rayon d'exploration doit être positif.");
    const distanceTo =
      coordinateMode === "simulation"
        ? (point) =>
            Math.hypot(
              point.latitude - position.latitude,
              point.longitude - position.longitude,
            )
        : (point) => distanceMeters(position, point);
    const revealedCellIds = [];
    this.cells.forEach((cell) => {
      if (cell.explored || distanceTo(cell.center) > radius) return;
      cell.explored = true;
      revealedCellIds.push(cell.id);
    });
    return revealedCellIds;
  }

  setQuestSignal(position, { radiusCells = 1 } = {}) {
    const target = this.getCellAt(position);
    if (target === null) return null;
    this.cells.forEach((cell) => {
      const distance = Math.max(
        Math.abs(cell.row - target.row),
        Math.abs(cell.column - target.column),
      );
      cell.questSignal =
        distance <= radiusCells ? 1 - distance / (radiusCells + 1) : 0;
    });
    return {
      targetCellId: target.id,
      signaledCellIds: this.cells
        .filter((cell) => cell.questSignal > 0)
        .map((cell) => cell.id),
    };
  }

  clearQuestSignal() {
    this.cells.forEach((cell) => {
      cell.questSignal = 0;
    });
  }

  getMaximumActivity() {
    return this.cells.reduce(
      (maximum, cell) => Math.max(maximum, cell.activity),
      0,
    );
  }
  toJSON() {
    return {
      playArea: this.playArea.toJSON(),
      cellSizeMeters: this.cellSizeMeters,
      cells: this.cells.map((cell) => ({
        ...cell,
        bounds: cell.bounds.map((point) => ({ ...point })),
      })),
    };
  }

  #generate(maxLatitude, maxLongitude) {
    const rows = Math.ceil(
      (maxLatitude - this.origin.latitude) / this.latitudeStep,
    );
    const columns = Math.ceil(
      (maxLongitude - this.origin.longitude) / this.longitudeStep,
    );
    if (rows * columns > 20_000)
      throw new RangeError(
        "La zone est trop grande pour cette taille de cellule.",
      );
    const cells = [];
    for (let row = 0; row < rows; row += 1)
      for (let column = 0; column < columns; column += 1) {
        const south = this.origin.latitude + row * this.latitudeStep;
        const west = this.origin.longitude + column * this.longitudeStep;
        const north = south + this.latitudeStep;
        const east = west + this.longitudeStep;
        const center = {
          latitude: (south + north) / 2,
          longitude: (west + east) / 2,
        };
        if (!this.playArea.contains(center)) continue;
        cells.push({
          id: `cell-${row}-${column}`,
          row,
          column,
          center,
          bounds: [
            { latitude: south, longitude: west },
            { latitude: north, longitude: east },
          ],
          visits: 0,
          explored: false,
          activity: 0,
          questSignal: 0,
          lastVisitedAt: null,
        });
      }
    return cells;
  }
}

function normalizeCell(cell) {
  if (
    cell === null ||
    typeof cell !== "object" ||
    !Number.isInteger(cell.row) ||
    !Number.isInteger(cell.column) ||
    !Array.isArray(cell.bounds)
  )
    throw new TypeError("Une cellule est invalide.");
  return {
    id: String(cell.id),
    row: cell.row,
    column: cell.column,
    center: { ...cell.center },
    bounds: cell.bounds.map((point) => ({ ...point })),
    visits: cell.visits ?? 0,
    explored: cell.explored ?? (cell.visits ?? 0) > 0,
    activity: cell.activity ?? 0,
    questSignal: cell.questSignal ?? 0,
    lastVisitedAt: cell.lastVisitedAt ?? null,
  };
}

function distanceMeters(first, second) {
  const latitudeMeters = (second.latitude - first.latitude) * 111_320;
  const longitudeMeters =
    (second.longitude - first.longitude) *
    111_320 *
    Math.cos((first.latitude * Math.PI) / 180);
  return Math.hypot(latitudeMeters, longitudeMeters);
}
