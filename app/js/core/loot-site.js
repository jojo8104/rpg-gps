import { distanceMeters, validatePosition } from "./geo.js";
import { getItemDefinition } from "./item-catalog.js";

/** Butin persistant récupérable uniquement depuis sa position réelle. */
export class LootSite {
  constructor({ id, battleId, position, entries, shares, interactionRadius = 75, reservedUntil = null, expiresAt = null, knownByPlayerIds = [], now = () => Date.now() }) {
    this.id = requireText(id, "L'identifiant du site"); this.battleId = requireText(battleId, "La bataille");
    validatePosition(position); this.position = { ...position }; this.interactionRadius = positive(interactionRadius, "Le rayon");
    this.entries = entries.map((entry) => structuredClone({ id: entry.id, itemId: entry.itemId, quantity: entry.quantity, portable: entry.portable, valuePerUnit: entry.valuePerUnit, allocations: entry.allocations ?? {} })); this.shares = structuredClone(shares); this.reservedUntil = reservedUntil;
    this.expiresAt = expiresAt; this.knownByPlayerIds = [...new Set(knownByPlayerIds)];
    this.status = "HIDDEN"; this.now = now; this.collectionLog = [];
  }

  discover(playerId) { if (this.isExpired()) return false; if (!this.knownByPlayerIds.includes(playerId)) this.knownByPlayerIds.push(playerId); this.status = "DISCOVERED"; return true; }
  isKnownBy(playerId) { return !this.isExpired() && this.knownByPlayerIds.includes(playerId); }
  isExpired() { return this.expiresAt !== null && this.now() >= this.expiresAt; }

  collect({ playerId, position, bag, selection }) {
    validatePosition(position); this.#updateStatus();
    if (this.isExpired()) return { success: false, reason: "loot_site_expired", collected: [] };
    if (!this.isKnownBy(playerId)) return { success: false, reason: "loot_not_discovered", collected: [] };
    if (distanceMeters(position, this.position) > this.interactionRadius) return { success: false, reason: "outside_loot_site", collected: [] };
    if (!this.shares.some((share) => share.playerId === playerId)) return { success: false, reason: "not_eligible", collected: [] };
    const inventory = bagState(bag); const requested = selectionState(selection); let remainingSlots = inventory.freeSlots; const planned = [];
    for (const entry of this.entries) {
      const allocated = entry.allocations[playerId] ?? 0;
      if (!entry.portable || allocated <= 0) continue;
      const requestedQuantity = requested[entry.id] ?? 0; if (requestedQuantity === 0) continue;
      if (requestedQuantity > allocated || requestedQuantity > entry.quantity) return { success: false, reason: "invalid_loot_selection", collected: [] };
      const bundleSize = getItemDefinition(entry.itemId)?.bundleSize ?? 1;
      const currentQuantity = inventory.quantitiesByItem[entry.itemId] ?? 0; const currentSlots = inventory.slotsByItem[entry.itemId] ?? 0;
      const maximumQuantity = currentSlots * bundleSize + remainingSlots * bundleSize;
      if (requestedQuantity > Math.max(0, maximumQuantity - currentQuantity)) return { success: false, reason: "insufficient_slots", collected: [] };
      const quantity = requestedQuantity;
      const requiredSlots = Math.max(0, Math.ceil((currentQuantity + quantity) / bundleSize) - currentSlots);
      remainingSlots -= requiredSlots;
      inventory.quantitiesByItem[entry.itemId] = currentQuantity + quantity; inventory.slotsByItem[entry.itemId] = currentSlots + requiredSlots;
      planned.push({ entry, itemId: entry.itemId, quantity, valuePerUnit: entry.valuePerUnit });
    }
    if (planned.length === 0) return { success: false, reason: "empty_selection", collected: [] };
    const collected = planned.map(({ entry, ...item }) => { entry.quantity -= item.quantity; entry.allocations[playerId] -= item.quantity; return item; });
    this.collectionLog.push({ playerId, collected: structuredClone(collected), at: this.now() }); this.#updateStatus();
    return { success: true, collected, remainingSlots };
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
function bagState(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new TypeError("L’état des bagages est requis.");
  if (!Number.isInteger(value.freeSlots) || value.freeSlots < 0) throw new RangeError("Le nombre de slots libres est invalide.");
  return { freeSlots: value.freeSlots, quantitiesByItem: { ...(value.quantitiesByItem ?? {}) }, slotsByItem: { ...(value.slotsByItem ?? {}) } };
}
function selectionState(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new TypeError("La sélection de butin est requise.");
  return Object.fromEntries(Object.entries(value).map(([id, quantity]) => {
    if (!Number.isInteger(quantity) || quantity < 0) throw new RangeError("Une quantité de butin sélectionnée est invalide.");
    return [requireText(id, "L’identifiant du butin sélectionné"), quantity];
  }));
}
