import { distanceMeters, validatePosition } from "./geo.js";

/** Trace temporaire et visible d'une bataille dans le monde GPS. */
export class BattleSite {
  constructor({ id, battleId, position, participantPlayerIds, visibilityRadius = 500, interactionRadius = 100, activeExpiresAt = null, now = () => Date.now() }) {
    this.id = requireText(id, "L'identifiant du champ de bataille"); this.battleId = requireText(battleId, "La bataille");
    validatePosition(position); this.position = { ...position };
    this.participantPlayerIds = [...new Set(participantPlayerIds)];
    this.visibilityRadius = positive(visibilityRadius, "Le rayon de visibilité"); this.interactionRadius = positive(interactionRadius, "Le rayon d'interaction");
    this.status = "ACTIVE"; this.expiresAt = activeExpiresAt; this.now = now;
  }
  finish({ ttlMs = 30 * 60_000 } = {}) { this.status = "FINISHED"; this.expiresAt = this.now() + positive(ttlMs, "La durée du site"); }
  isExpired() { return this.expiresAt !== null && this.now() >= this.expiresAt; }
  isVisibleTo({ playerId, position }) { if (this.isExpired()) return false; if (this.participantPlayerIds.includes(playerId)) return true; validatePosition(position); return distanceMeters(position, this.position) <= this.visibilityRadius; }
  canSearch(position) { validatePosition(position); return !this.isExpired() && this.status === "FINISHED" && distanceMeters(position, this.position) <= this.interactionRadius; }
  toJSON() { return { id: this.id, battleId: this.battleId, position: { ...this.position }, participantPlayerIds: [...this.participantPlayerIds], visibilityRadius: this.visibilityRadius, interactionRadius: this.interactionRadius, status: this.status, expiresAt: this.expiresAt }; }
}
function requireText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} est requis.`); return value.trim(); }
function positive(value, label) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} doit être positif.`); return value; }

