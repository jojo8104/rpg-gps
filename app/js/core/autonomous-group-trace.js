export class AutonomousGroupTrace {
  constructor({ id, groupId, groupType, owner, kind = "passage", position, soldierCount = 0, occupiedCargoSlots = 0, directionDegrees = null, createdAt, decayPerMinute = 1 }) {
    this.id = text(id, "L'identifiant de la trace");
    this.groupId = text(groupId, "L'identifiant du groupe");
    this.groupType = text(groupType, "Le type du groupe");
    this.owner = structuredClone(owner);
    this.kind = text(kind, "Le type de trace");
    this.position = { ...position };
    this.soldierCount = nonNegativeInteger(soldierCount, "Le nombre de soldats");
    this.occupiedCargoSlots = nonNegativeInteger(occupiedCargoSlots, "Les slots de cargaison");
    this.initialDetectionScore = Math.min(15, 1 + Math.ceil(this.soldierCount / 10) + this.occupiedCargoSlots);
    this.directionDegrees = directionDegrees;
    if (!Number.isFinite(createdAt)) throw new TypeError("L'heure de création de la trace est invalide.");
    if (!Number.isFinite(decayPerMinute) || decayPerMinute <= 0) throw new RangeError("La décroissance doit être strictement positive.");
    this.createdAt = createdAt;
    this.decayPerMinute = decayPerMinute;
  }

  getScore(at) { return Math.max(0, this.initialDetectionScore - this.decayPerMinute * Math.max(0, at - this.createdAt) / 60_000); }
  getPerceivedScore({ at, distance = 0, distancePerPoint = 50, detectionBonus = 0 }) {
    if (!Number.isFinite(distance) || distance < 0) throw new RangeError("La distance de lecture doit être positive ou nulle.");
    if (!Number.isFinite(distancePerPoint) || distancePerPoint <= 0) throw new RangeError("La portée par point doit être strictement positive.");
    if (!Number.isFinite(detectionBonus) || detectionBonus < 0) throw new RangeError("Le bonus de détection doit être positif ou nul.");
    return Math.max(0, this.getScore(at) + detectionBonus - distance / distancePerPoint);
  }
  isDetectable({ at, minimumScore, distance = 0, distancePerPoint = 50, detectionBonus = 0 }) {
    return this.getScore(at) > 0 && this.getPerceivedScore({ at, distance, distancePerPoint, detectionBonus }) >= minimumScore;
  }
  read({ at, minimumScore = 5, analysisBonus = 0 }) {
    const score = this.getScore(at);
    if (score <= 0 || score < minimumScore) return null;
    const level = Math.max(1, Math.min(5, Math.floor((score + analysisBonus) / 3) + 1));
    return {
      traceId: this.id, level, kind: this.kind,
      importance: level >= 2 ? approximateImportance(this.soldierCount, this.occupiedCargoSlots) : null,
      directionDegrees: level >= 3 ? this.directionDegrees : null,
      groupType: level >= 3 ? this.groupType : null,
      soldierCount: level >= 4 ? this.soldierCount : null,
      occupiedCargoSlots: level >= 4 ? this.occupiedCargoSlots : null,
      owner: level >= 5 ? structuredClone(this.owner) : null,
    };
  }
  toJSON() { return structuredClone({ id: this.id, groupId: this.groupId, groupType: this.groupType, owner: this.owner, kind: this.kind, position: this.position, soldierCount: this.soldierCount, occupiedCargoSlots: this.occupiedCargoSlots, directionDegrees: this.directionDegrees, createdAt: this.createdAt, decayPerMinute: this.decayPerMinute }); }
}

function approximateImportance(soldiers, slots) { const value = soldiers + slots * 10; return value >= 80 ? "very_large" : value >= 40 ? "large" : value >= 15 ? "medium" : "small"; }
function text(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
function nonNegativeInteger(value, label) { if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} doit être un entier positif ou nul.`); return value; }
