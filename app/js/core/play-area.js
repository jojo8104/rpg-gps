/** Zone géographique dans laquelle se déroule une partie. */
export class PlayArea {
  constructor({ id, name, polygon }) {
    this.id = PlayArea.#requireText(id, "L'identifiant de l'aire de jeu");
    this.name = PlayArea.#requireText(name, "Le nom de l'aire de jeu");
    this.polygon = PlayArea.#createPolygon(polygon);
  }

  contains(position) {
    const point = PlayArea.#createPoint(position, "La position");
    let isInside = false;

    for (let current = 0, previous = this.polygon.length - 1; current < this.polygon.length; previous = current++) {
      const currentPoint = this.polygon[current];
      const previousPoint = this.polygon[previous];
      const intersects =
        (currentPoint.latitude > point.latitude) !== (previousPoint.latitude > point.latitude) &&
        point.longitude <
          ((previousPoint.longitude - currentPoint.longitude) * (point.latitude - currentPoint.latitude)) /
            (previousPoint.latitude - currentPoint.latitude) +
            currentPoint.longitude;

      if (intersects) {
        isInside = !isInside;
      }
    }

    return isInside;
  }

  getAreaSquareMeters() {
    const averageLatitude = this.polygon.reduce((total, point) => total + point.latitude, 0) / this.polygon.length;
    const metersPerLatitudeDegree = 111_320;
    const metersPerLongitudeDegree = metersPerLatitudeDegree * Math.cos((averageLatitude * Math.PI) / 180);
    let twiceArea = 0;

    for (let current = 0; current < this.polygon.length; current += 1) {
      const next = (current + 1) % this.polygon.length;
      const point = this.polygon[current];
      const followingPoint = this.polygon[next];
      const x1 = point.longitude * metersPerLongitudeDegree;
      const y1 = point.latitude * metersPerLatitudeDegree;
      const x2 = followingPoint.longitude * metersPerLongitudeDegree;
      const y2 = followingPoint.latitude * metersPerLatitudeDegree;
      twiceArea += x1 * y2 - x2 * y1;
    }

    return Math.abs(twiceArea) / 2;
  }

  getAreaSquareKilometers() {
    return this.getAreaSquareMeters() / 1_000_000;
  }

  toJSON() {
    return { id: this.id, name: this.name, polygon: this.polygon.map((point) => ({ ...point })) };
  }

  static #createPolygon(polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) {
      throw new RangeError("Le polygone doit contenir au moins trois points.");
    }

    return polygon.map((point) => PlayArea.#createPoint(point, "Un point du polygone"));
  }

  static #createPoint(point, label) {
    if (point === null || Array.isArray(point) || typeof point !== "object") {
      throw new TypeError(`${label} doit contenir une latitude et une longitude.`);
    }

    const { latitude, longitude } = point;

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new RangeError(`${label} doit avoir une latitude comprise entre -90 et 90.`);
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new RangeError(`${label} doit avoir une longitude comprise entre -180 et 180.`);
    }

    return { latitude, longitude };
  }

  static #requireText(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(`${label} doit être un texte non vide.`);
    }

    return value.trim();
  }
}
