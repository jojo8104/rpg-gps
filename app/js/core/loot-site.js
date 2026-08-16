import { distanceMeters, validatePosition } from "./geo.js";

/** Butin persistant récupérable uniquement depuis sa position réelle. */
export class LootSite {
  constructor({ id, battleId, position, entries, shares, interactionRadius = 75, reservedUntil = null, expiresAt = null, knownByPlayerIds = [], now = () => Date.now() }) {
    this.id = requireText(id, "L'identifiant du site"); this.battleId = requireText(battleId, "La bataille");
    validatePosition(position); this.position = { ...position }; this.interactionRadius = positive(interactionRadius, "Le rayon");
    this.entries = structuredClone(entries); this.shares = structuredClone(shares); this.reservedUntil = reservedUntil;
    this.expiresAt = expiresAt; this.knownByPlayerIds = [...new Set(knownByPlayerIds)];
    this.status = "HIDDEN"; this.now = now; this.collectionLog = [];
  }

  discover(playerId) { if (this.isExpired()) return false; if (!this.knownByPlayerIds.includes(playerId)) this.knownByPlayerIds.push(playerId); this.status = "DISCOVERED"; return true; }
  isKnownBy(playerId) { return !this.isExpired() && this.knownByPlayerIds.includes(playerId); }
  isExpired() { return this.expiresAt !== null && this.now() >= this.expiresAt; }

  collect({ playerId, position, capacity }) {
    validatePosition(position); this.#updateStatus();
    if (this.isExpired()) return { success: false, reason: "loot_site_expired", collected: [] };
    if (!this.isKnownBy(playerId)) return { success: false, reason: "loot_not_discovered", collected: [] };
    if (distanceMeters(position, this.position) > this.interactionRadius) return { success: false, reason: "outside_loot_site", collected: [] };
    if (!this.shares.some((share) => share.playerId === playerId)) return { success: false, reason: "not_eligible", collected: [] };
    let remainingCapacity = nonNegative(capacity, "La capacité"); const collected = [];
    for (const entry of this.entries) {
      const allocated = entry.allocations[playerId] ?? 0;
      if (!entry.portable || allocated <= 0) continue;
      const maxByCapacity = entry.weightPerUnit === 0 ? allocated : Math.floor(remainingCapacity / entry.weightPerUnit);
      const quantity = Math.min(allocated, entry.quantity, maxByCapacity); if (quantity <= 0) continue;
      entry.quantity -= quantity; entry.allocations[playerId] -= quantity; remainingCapacity -= quantity * entry.weightPerUnit;
      collected.push({ itemId: entry.itemId, quantity, weightPerUnit: entry.weightPerUnit, valuePerUnit: entry.valuePerUnit });
    }
    if (collected.length === 0) return { success: false, reason: "nothing_transportable", collected: [] };
    this.collectionLog.push({ playerId, collected: structuredClone(collected), at: this.now() }); this.#updateStatus();
    return { success: true, collected, remainingCapacity };
  }

  #updateStatus() {
    if (this.isExpired()) this.status = "EXPIRED";
    else if (this.entries.every((entry) => entry.quantity === 0)) this.status = "DEPLETED";
    else if (this.reservedUntil !== null && this.now() >= this.reservedUntil) this.status = "CONTESTABLE";
    else if (this.knownByPlayerIds.length > 0) this.status = "DISCOVERED";
  }
  toJSON() { return { id: this.id, battleId: this.battleId, position: { ...this.position }, interactionRadius: this.interactionRadius, entries: structuredClone(this.entries), shares: structuredClone(this.shares), reservedUntil: this.reservedUntil, expiresAt: this.expiresAt, knownByPlayerIds: [...this.knownByPlayerIds], status: this.status, collectionLog: structuredClone(this.collectionLog) }; }
}
function requireText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} est requis.`); return value.trim(); }
function positive(value, label) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} doit être positif.`); return value; }
function nonNegative(value, label) { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} doit être positif ou nul.`); return value; }
