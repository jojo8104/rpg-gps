import { distanceMeters, validatePosition } from "./geo.js";
import { PlayArea } from "./play-area.js";

/** Etat sérialisable des outils d'essai terrain, sans dépendance au DOM ni au GPS. */
export class FieldTestSession {
  constructor({ minimumQuestDistanceMeters = 300 } = {}) {
    if (
      !Number.isFinite(minimumQuestDistanceMeters) ||
      minimumQuestDistanceMeters <= 0
    )
      throw new RangeError("La distance de quête doit être positive.");
    this.minimumQuestDistanceMeters = minimumQuestDistanceMeters;
    this.playAreaPoints = [];
    this.exclusionDraftPoints = [];
    this.excludedPolygons = [];
    this.questStart = null;
    this.questDistanceMeters = 0;
    this.questCompleted = false;
  }

  addPlayAreaPoint(position) {
    validatePosition(position);
    this.playAreaPoints.push(copy(position));
    return this.playAreaPoints.length;
  }
  clearPlayArea() {
    this.playAreaPoints = [];
    this.clearExclusions();
  }
  addExclusionPoint(position) {
    validatePosition(position);
    this.exclusionDraftPoints.push(copy(position));
    return this.exclusionDraftPoints.length;
  }
  completeExclusion() {
    if (this.exclusionDraftPoints.length < 3)
      throw new RangeError(
        "Une zone d’exclusion doit contenir au moins trois points.",
      );
    const polygon = this.exclusionDraftPoints.map(copy);
    if (this.playAreaPoints.length >= 3)
      new PlayArea({
        id: "exclusion-validation",
        name: "Validation des exclusions",
        polygon: this.playAreaPoints,
        excludedPolygons: [...this.excludedPolygons, polygon],
      });
    this.excludedPolygons.push(polygon);
    this.exclusionDraftPoints = [];
    return polygon.map(copy);
  }
  clearExclusions() {
    this.exclusionDraftPoints = [];
    this.excludedPolygons = [];
  }
  loadTerrain({ polygon, excludedPolygons = [] }) {
    const area = new PlayArea({
      id: "loaded-terrain",
      name: "Terrain chargé",
      polygon,
      excludedPolygons,
    });
    this.playAreaPoints = area.polygon.map(copy);
    this.excludedPolygons = area.excludedPolygons.map((points) =>
      points.map(copy),
    );
    this.exclusionDraftPoints = [];
    return area;
  }
  createPlayArea({ id = "field-area", name = "Zone de test IRL" } = {}) {
    return new PlayArea({
      id,
      name,
      polygon: this.playAreaPoints,
      excludedPolygons: this.excludedPolygons,
    });
  }

  startDistanceQuest(position) {
    validatePosition(position);
    this.questStart = copy(position);
    this.questDistanceMeters = 0;
    this.questCompleted = false;
  }

  updatePosition(position) {
    validatePosition(position);
    if (this.questStart === null) return null;
    this.questDistanceMeters = distanceMeters(this.questStart, position);
    this.questCompleted =
      this.questDistanceMeters >= this.minimumQuestDistanceMeters;
    return {
      distanceMeters: this.questDistanceMeters,
      completed: this.questCompleted,
    };
  }

  canPlaceQuestLocation(position, playArea = null) {
    validatePosition(position);
    return (
      (playArea === null || playArea.contains(position)) &&
      this.questStart !== null &&
      distanceMeters(this.questStart, position) >=
        this.minimumQuestDistanceMeters
    );
  }

  toJSON() {
    return {
      minimumQuestDistanceMeters: this.minimumQuestDistanceMeters,
      playAreaPoints: this.playAreaPoints.map(copy),
      excludedPolygons: this.excludedPolygons.map((polygon) =>
        polygon.map(copy),
      ),
      questStart: this.questStart && copy(this.questStart),
      questDistanceMeters: this.questDistanceMeters,
      questCompleted: this.questCompleted,
    };
  }
}

function copy(position) {
  return { latitude: position.latitude, longitude: position.longitude };
}
