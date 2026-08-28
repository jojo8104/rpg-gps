import { getItemDefinition } from "./item-catalog.js";

/** Butin attribué à la fin d'un combat, sans présence ni contrainte géographique. */
export class BattleLoot {
  constructor({ id, battleId, entries, shares, now = () => Date.now() }) {
    this.id = requireText(id, "L'identifiant du butin");
    this.battleId = requireText(battleId, "La bataille");
    this.entries = entries.map((entry) =>
      structuredClone({
        id: entry.id,
        itemId: entry.itemId,
        quantity: entry.quantity,
        portable: entry.portable,
        valuePerUnit: entry.valuePerUnit,
        allocations: entry.allocations ?? {},
      }),
    );
    this.shares = structuredClone(shares);
    this.status = "AVAILABLE";
    this.now = now;
    this.collectionLog = [];
  }

  collect({ playerId, bag, selection }) {
    if (!this.shares.some((share) => share.playerId === playerId))
      return { success: false, reason: "not_eligible", collected: [] };
    const inventory = bagState(bag);
    const requested = selectionState(selection);
    let remainingSlots = inventory.freeSlots;
    const planned = [];
    for (const entry of this.entries) {
      const allocated = entry.allocations[playerId] ?? 0;
      if (!entry.portable || allocated <= 0) continue;
      const requestedQuantity = requested[entry.id] ?? 0;
      if (requestedQuantity === 0) continue;
      if (requestedQuantity > allocated || requestedQuantity > entry.quantity)
        return {
          success: false,
          reason: "invalid_loot_selection",
          collected: [],
        };
      const bundleSize = getItemDefinition(entry.itemId)?.bundleSize ?? 1;
      const currentQuantity = inventory.quantitiesByItem[entry.itemId] ?? 0;
      const currentSlots = inventory.slotsByItem[entry.itemId] ?? 0;
      const maximumQuantity =
        currentSlots * bundleSize + remainingSlots * bundleSize;
      if (requestedQuantity > Math.max(0, maximumQuantity - currentQuantity))
        return { success: false, reason: "insufficient_slots", collected: [] };
      const requiredSlots = Math.max(
        0,
        Math.ceil((currentQuantity + requestedQuantity) / bundleSize) -
          currentSlots,
      );
      remainingSlots -= requiredSlots;
      inventory.quantitiesByItem[entry.itemId] =
        currentQuantity + requestedQuantity;
      inventory.slotsByItem[entry.itemId] = currentSlots + requiredSlots;
      planned.push({
        entry,
        itemId: entry.itemId,
        quantity: requestedQuantity,
        valuePerUnit: entry.valuePerUnit,
      });
    }
    if (planned.length === 0)
      return { success: false, reason: "empty_selection", collected: [] };
    const collected = planned.map(({ entry, ...item }) => {
      entry.quantity -= item.quantity;
      entry.allocations[playerId] -= item.quantity;
      return item;
    });
    this.collectionLog.push({
      playerId,
      collected: structuredClone(collected),
      at: this.now(),
    });
    if (
      this.entries.every(
        (entry) =>
          !entry.portable ||
          entry.quantity === 0 ||
          Object.values(entry.allocations).every((quantity) => quantity === 0),
      )
    )
      this.status = "COLLECTED";
    return { success: true, collected, remainingSlots };
  }

  toJSON() {
    return {
      id: this.id,
      battleId: this.battleId,
      entries: structuredClone(this.entries),
      shares: structuredClone(this.shares),
      status: this.status,
      collectionLog: structuredClone(this.collectionLog),
    };
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${label} est requis.`);
  return value.trim();
}
function bagState(value) {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new TypeError("L’état des bagages est requis.");
  if (!Number.isInteger(value.freeSlots) || value.freeSlots < 0)
    throw new RangeError("Le nombre de slots libres est invalide.");
  return {
    freeSlots: value.freeSlots,
    quantitiesByItem: { ...(value.quantitiesByItem ?? {}) },
    slotsByItem: { ...(value.slotsByItem ?? {}) },
  };
}
function selectionState(value) {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new TypeError("La sélection de butin est requise.");
  return Object.fromEntries(
    Object.entries(value).map(([id, quantity]) => {
      if (!Number.isInteger(quantity) || quantity < 0)
        throw new RangeError(
          "Une quantité de butin sélectionnée est invalide.",
        );
      return [requireText(id, "L’identifiant du butin sélectionné"), quantity];
    }),
  );
}
