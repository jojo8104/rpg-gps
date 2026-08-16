import { distanceMeters, validatePosition } from "./geo.js";
import { PlayArea } from "./play-area.js";

/** Etat sérialisable des outils d'essai terrain, sans dépendance au DOM ni au GPS. */
export class FieldTestSession {
  constructor({ minimumQuestDistanceMeters = 300 } = {}) {
    if (!Number.isFinite(minimumQuestDistanceMeters) || minimumQuestDistanceMeters <= 0) throw new RangeError("La distance de quête doit être positive.");
    this.minimumQuestDistanceMeters = minimumQuestDistanceMeters;
    this.playAreaPoints = [];
    this.questStart = null;
    this.questDistanceMeters = 0;
    this.questCompleted = false;
  }

  addPlayAreaPoint(position) { validatePosition(position); this.playAreaPoints.push(copy(position)); return this.playAreaPoints.length; }
  clearPlayArea() { this.playAreaPoints = []; }
  createPlayArea({ id = "field-area", name = "Zone de test IRL" } = {}) {
    return new PlayArea({ id, name, polygon: this.playAreaPoints });
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
    this.questCompleted = this.questDistanceMeters >= this.minimumQuestDistanceMeters;
    return { distanceMeters: this.questDistanceMeters, completed: this.questCompleted };
  }

  canPlaceQuestLocation(position) {
    validatePosition(position);
    return this.questStart !== null && distanceMeters(this.questStart, position) >= this.minimumQuestDistanceMeters;
  }

  toJSON() {
    return { minimumQuestDistanceMeters: this.minimumQuestDistanceMeters, playAreaPoints: this.playAreaPoints.map(copy), questStart: this.questStart && copy(this.questStart), questDistanceMeters: this.questDistanceMeters, questCompleted: this.questCompleted };
  }
}

function copy(position) { return { latitude: position.latitude, longitude: position.longitude }; }
