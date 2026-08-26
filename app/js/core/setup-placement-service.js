import { distanceMeters } from "./geo.js";

/** Génère des positions espacées dans une PlayArea, sans dépendance au DOM. */
export class SetupPlacementService {
  constructor({ distanceFn = distanceMeters } = {}) { this.distanceFn = distanceFn; }

  generate({ playArea, count, occupied = [], minimumDistance = 0 }) {
    if (!Number.isInteger(count) || count < 0) throw new RangeError("Le nombre de placements doit être un entier positif ou nul.");
    const candidates = this.#candidates(playArea); const selected = [];
    while (selected.length < count) {
      const references = [...occupied, ...selected];
      const ranked = candidates.filter((candidate) => !selected.some((position) => this.distanceFn(position, candidate) === 0)).map((candidate) => ({ candidate, distance: references.length === 0 ? Infinity : Math.min(...references.map((position) => this.distanceFn(position, candidate))) })).sort((a, b) => b.distance - a.distance);
      const choice = ranked.find((entry) => entry.distance >= minimumDistance) ?? ranked[0];
      if (!choice) throw new Error("La zone ne contient pas assez d’emplacements distincts.");
      selected.push(choice.candidate);
    }
    return selected;
  }

  resolveInside({ playArea, preferred, origin = null, minimumDistance = 0 }) {
    if (playArea.contains(preferred) && (origin === null || this.distanceFn(origin, preferred) >= minimumDistance)) return { ...preferred };
    const ranked = this.#candidates(playArea)
      .filter((candidate) => origin === null || this.distanceFn(origin, candidate) >= minimumDistance)
      .map((candidate) => ({ candidate, distance: this.distanceFn(preferred, candidate) }))
      .sort((first, second) => first.distance - second.distance);
    if (ranked.length === 0) throw new RangeError("La zone de jeu est trop petite pour placer cet objectif à la distance demandée.");
    return { ...ranked[0].candidate };
  }

  findPosition({ playArea, origin, preferredDistance, preferredDirectionDegrees = 0, occupied = [], minimumSpacing = 0, excludedAreas = [] }) {
    if (!Number.isFinite(preferredDistance) || preferredDistance < 0) throw new RangeError("La distance préférée doit être positive ou nulle.");
    if (!Number.isFinite(preferredDirectionDegrees)) throw new TypeError("La direction préférée doit être un nombre.");
    const candidates = this.#candidates(playArea)
      .filter((candidate) => !excludedAreas.some((area) => area.contains(candidate)))
      .filter((candidate) => occupied.every((position) => this.distanceFn(position, candidate) >= minimumSpacing));
    if (candidates.length === 0) throw new RangeError("La PlayArea ne contient aucune position autorisée pour cet objectif.");
    const direction = normalizeDegrees(preferredDirectionDegrees);
    return { ...candidates.map((candidate) => {
      const distance = this.distanceFn(origin, candidate); const bearing = bearingDegrees(origin, candidate);
      const distanceError = Math.abs(distance - preferredDistance);
      const directionError = angularDistance(direction, bearing);
      const score = distanceError + directionError / 180 * Math.max(preferredDistance, 1);
      return { candidate, score, distanceError, directionError };
    }).sort((first, second) => first.score - second.score || first.distanceError - second.distanceError || first.directionError - second.directionError)[0].candidate };
  }

  #candidates(playArea) {
    const latitudes = playArea.polygon.map((point) => point.latitude); const longitudes = playArea.polygon.map((point) => point.longitude);
    const minLat = Math.min(...latitudes); const maxLat = Math.max(...latitudes); const minLon = Math.min(...longitudes); const maxLon = Math.max(...longitudes); const candidates = [];
    for (let row = 1; row < 12; row += 1) for (let column = 1; column < 12; column += 1) { const position = { latitude: minLat + (maxLat - minLat) * row / 12, longitude: minLon + (maxLon - minLon) * column / 12 }; if (playArea.contains(position)) candidates.push(position); }
    return candidates;
  }
}

function bearingDegrees(origin, target) {
  const averageLatitude = (origin.latitude + target.latitude) / 2 * Math.PI / 180;
  const east = (target.longitude - origin.longitude) * Math.cos(averageLatitude);
  const north = target.latitude - origin.latitude;
  return normalizeDegrees(Math.atan2(east, north) * 180 / Math.PI);
}
function normalizeDegrees(value) { return ((value % 360) + 360) % 360; }
function angularDistance(first, second) { const delta = Math.abs(normalizeDegrees(first) - normalizeDegrees(second)); return Math.min(delta, 360 - delta); }
