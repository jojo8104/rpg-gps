/** Zone géographique dans laquelle se déroule une partie. */
export class PlayArea {
  constructor({ id, name, polygon, excludedPolygons = [] }) {
    this.id = PlayArea.#requireText(id, "L'identifiant de l'aire de jeu");
    this.name = PlayArea.#requireText(name, "Le nom de l'aire de jeu");
    this.polygon = PlayArea.#createPolygon(polygon);
    if (!Array.isArray(excludedPolygons))
      throw new TypeError("Les zones d’exclusion doivent être une liste.");
    this.excludedPolygons = excludedPolygons.map((excluded, index) => {
      const points = PlayArea.#createPolygon(excluded);
      if (!points.every((point) => PlayArea.#containsIn(this.polygon, point)))
        throw new RangeError(
          `La zone d’exclusion ${index + 1} doit rester dans l’aire de jeu.`,
        );
      return points;
    });
  }

  contains(position) {
    const point = PlayArea.#createPoint(position, "La position");
    return PlayArea.#containsIn(this.polygon, point);
  }

  allowsPlacement(position) {
    const point = PlayArea.#createPoint(position, "La position");
    return (
      PlayArea.#containsIn(this.polygon, point) &&
      !this.excludedPolygons.some((polygon) =>
        PlayArea.#containsIn(polygon, point),
      )
    );
  }

  static #containsIn(polygon, point) {
    let isInside = false;

    for (
      let current = 0, previous = polygon.length - 1;
      current < polygon.length;
      previous = current++
    ) {
      const currentPoint = polygon[current];
      const previousPoint = polygon[previous];
      const intersects =
        currentPoint.latitude > point.latitude !==
          previousPoint.latitude > point.latitude &&
        point.longitude <
          ((previousPoint.longitude - currentPoint.longitude) *
            (point.latitude - currentPoint.latitude)) /
            (previousPoint.latitude - currentPoint.latitude) +
            currentPoint.longitude;

      if (intersects) {
        isInside = !isInside;
      }
    }

    return isInside;
  }

  getAreaSquareMeters() {
    const outerArea = PlayArea.#polygonAreaSquareMeters(this.polygon);
    const excludedArea = this.excludedPolygons.reduce(
      (total, polygon) => total + PlayArea.#polygonAreaSquareMeters(polygon),
      0,
    );
    return Math.max(0, outerArea - excludedArea);
  }

  static #polygonAreaSquareMeters(polygon) {
    const averageLatitude =
      polygon.reduce((total, point) => total + point.latitude, 0) /
      polygon.length;
    const metersPerLatitudeDegree = 111_320;
    const metersPerLongitudeDegree =
      metersPerLatitudeDegree * Math.cos((averageLatitude * Math.PI) / 180);
    let twiceArea = 0;

    for (let current = 0; current < polygon.length; current += 1) {
      const next = (current + 1) % polygon.length;
      const point = polygon[current];
      const followingPoint = polygon[next];
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
    return {
      id: this.id,
      name: this.name,
      polygon: this.polygon.map((point) => ({ ...point })),
      excludedPolygons: this.excludedPolygons.map((polygon) =>
        polygon.map((point) => ({ ...point })),
      ),
    };
  }

  static #createPolygon(polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) {
      throw new RangeError("Le polygone doit contenir au moins trois points.");
    }

    return polygon.map((point) =>
      PlayArea.#createPoint(point, "Un point du polygone"),
    );
  }

  static #createPoint(point, label) {
    if (point === null || Array.isArray(point) || typeof point !== "object") {
      throw new TypeError(
        `${label} doit contenir une latitude et une longitude.`,
      );
    }

    const { latitude, longitude } = point;

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new RangeError(
        `${label} doit avoir une latitude comprise entre -90 et 90.`,
      );
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new RangeError(
        `${label} doit avoir une longitude comprise entre -180 et 180.`,
      );
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
