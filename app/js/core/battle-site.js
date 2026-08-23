import { distanceMeters, validatePosition } from "./geo.js";

export const BATTLE_SITE_SEARCH_TYPES = Object.freeze(["loot", "information", "survivors"]);
export const BATTLE_SITE_TTL_MS = 5 * 60_000;

/** Trace temporaire d'une bataille, visible et fouillable sur le terrain. */
export class BattleSite {
  constructor({ id, battleId, position, participantPlayerIds, visibilityRadius = 500, interactionRadius = 100, activeExpiresAt = null, searches = {}, visitedByPlayerIds = [], now = () => Date.now() }) {
    this.id = text(id, "L'identifiant du champ de bataille"); this.battleId = text(battleId, "La bataille");
    validatePosition(position); this.position = { ...position };
    this.participantPlayerIds = [...new Set(participantPlayerIds)];
    this.visibilityRadius = positive(visibilityRadius, "Le rayon de visibilité"); this.interactionRadius = positive(interactionRadius, "Le rayon d'interaction");
    this.status = "ACTIVE"; this.expiresAt = activeExpiresAt; this.now = now;
    this.searches = Object.fromEntries(BATTLE_SITE_SEARCH_TYPES.map((type) => [type, [...new Set(searches[type] ?? [])]]));
    this.visitedByPlayerIds = [...new Set(visitedByPlayerIds)];
  }
  finish({ ttlMs = BATTLE_SITE_TTL_MS } = {}) { this.status = "FINISHED"; this.expiresAt = this.now() + positive(ttlMs, "La durée du site"); }
  isExpired() { return this.expiresAt !== null && this.now() >= this.expiresAt; }
  isVisibleTo({ playerId, position }) { if (this.isExpired()) return false; if (this.participantPlayerIds.includes(playerId)) return true; validatePosition(position); return distanceMeters(position, this.position) <= this.visibilityRadius; }
  canSearch(position) { validatePosition(position); return !this.isExpired() && this.status === "FINISHED" && distanceMeters(position, this.position) <= this.interactionRadius; }
  visit(playerId) { const id = text(playerId, "Le joueur"); if (this.isExpired()) return false; if (!this.visitedByPlayerIds.includes(id)) this.visitedByPlayerIds.push(id); return true; }
  isVisitedBy(playerId) { return this.visitedByPlayerIds.includes(playerId); }
  search({ type, playerId, position }) {
    if (!BATTLE_SITE_SEARCH_TYPES.includes(type)) return { success: false, reason: "unknown_search_type" };
    if (!this.canSearch(position)) return { success: false, reason: "outside_battlefield" };
    if (this.searches[type].includes(playerId)) return { success: false, reason: "already_searched" };
    this.searches[type].push(playerId); return { success: true, type };
  }
  toJSON() { return { id: this.id, battleId: this.battleId, position: { ...this.position }, participantPlayerIds: [...this.participantPlayerIds], visibilityRadius: this.visibilityRadius, interactionRadius: this.interactionRadius, status: this.status, expiresAt: this.expiresAt, searches: structuredClone(this.searches), visitedByPlayerIds: [...this.visitedByPlayerIds] }; }
}
function text(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} est requis.`); return value.trim(); }
function positive(value, label) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} doit être positif.`); return value; }
