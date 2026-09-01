/** Balise de surveillance posée par un Éclaireur, sérialisable et indépendante du DOM. */
export class ScoutWatchBeacon {
  constructor({ id, ownerPlayerId, sourceHeroId, position, radius = 75, placedAt = Date.now(), visibleTargets = [] }) {
    this.id = text(id, "L'identifiant de la balise");
    this.ownerPlayerId = text(ownerPlayerId, "Le propriétaire de la balise");
    this.sourceHeroId = text(sourceHeroId, "Le héros ayant posé la balise");
    this.position = positionValue(position);
    if (!Number.isFinite(radius) || radius <= 0) throw new RangeError("Le rayon de la balise doit être positif.");
    if (!Number.isFinite(placedAt) || placedAt < 0) throw new RangeError("La date de pose de la balise est invalide.");
    if (!Array.isArray(visibleTargets)) throw new TypeError("Les cibles visibles doivent être une liste.");
    this.radius = radius;
    this.placedAt = placedAt;
    this.visibleTargets = visibleTargets.map((target) => structuredClone(target));
  }

  toJSON() {
    return { id: this.id, ownerPlayerId: this.ownerPlayerId, sourceHeroId: this.sourceHeroId, position: { ...this.position }, radius: this.radius, placedAt: this.placedAt, visibleTargets: structuredClone(this.visibleTargets) };
  }
}

function text(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
function positionValue(position) { if (!position || Array.isArray(position) || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) throw new TypeError("La position de la balise est invalide."); return { latitude: position.latitude, longitude: position.longitude }; }
