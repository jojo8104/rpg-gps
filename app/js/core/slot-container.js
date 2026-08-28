import { ItemStack } from "./item-stack.js";

export class SlotContainer {
  constructor({ id, name, slotCount, slots = [] }) {
    this.id = requireText(id, "L'identifiant du conteneur");
    this.name = requireText(name, "Le nom du conteneur");
    this.slotCount = requireNonNegativeInteger(slotCount, "Le nombre de slots");
    if (!Array.isArray(slots) || slots.length > this.slotCount)
      throw new RangeError("Le contenu dépasse la capacité du conteneur.");
    this.slots = Array.from({ length: this.slotCount }, (_, index) =>
      slots[index] ? new ItemStack(slots[index]) : null,
    );
  }

  get usedSlots() {
    return this.slots.filter(Boolean).length;
  }
  get freeSlots() {
    return this.slotCount - this.usedSlots;
  }
  get isOverCapacity() {
    return this.slots.filter(Boolean).length > this.slotCount;
  }

  add(item, preferredIndex = null) {
    const stack = item instanceof ItemStack ? item : new ItemStack(item);
    for (const existing of this.slots) {
      if (!existing || !existing.canMerge(stack) || existing.isFull) continue;
      existing.merge(stack);
      if (stack.quantity === 0) return { success: true, remainder: null };
    }
    const index =
      preferredIndex === null ? this.slots.indexOf(null) : preferredIndex;
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.slotCount ||
      this.slots[index] !== null
    )
      return { success: false, reason: "container_full", remainder: stack };
    this.slots[index] = stack;
    return { success: true, remainder: null };
  }

  remove(index) {
    requireSlot(index, this.slotCount);
    const stack = this.slots[index];
    this.slots[index] = null;
    return stack;
  }

  moveTo(target, sourceIndex, targetIndex = null) {
    if (!(target instanceof SlotContainer))
      throw new TypeError("La destination doit être un conteneur à slots.");
    requireSlot(sourceIndex, this.slotCount);
    const stack = this.slots[sourceIndex];
    if (!stack) return { success: false, reason: "empty_slot" };
    const snapshot = stack.toJSON();
    const result = target.add(stack, targetIndex);
    if (!result.success) return result;
    this.slots[sourceIndex] =
      result.remainder?.quantity > 0
        ? new ItemStack(result.remainder.toJSON())
        : null;
    return {
      success: true,
      moved: snapshot.quantity - (result.remainder?.quantity ?? 0),
    };
  }

  quantityOf(itemId) {
    return this.slots.reduce(
      (sum, stack) => sum + (stack?.itemId === itemId ? stack.quantity : 0),
      0,
    );
  }
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      slotCount: this.slotCount,
      slots: this.slots.map((stack) => stack?.toJSON() ?? null),
    };
  }
}

export function createStacksForQuantity({
  itemId,
  quantity,
  idPrefix = itemId,
}) {
  const total = requireNonNegativeInteger(quantity, "La quantité à empaqueter");
  if (total === 0) return [];
  const probe = new ItemStack({ id: `${idPrefix}-probe`, itemId, quantity: 1 });
  const maximum = probe.maximumQuantity;
  const stacks = [];
  for (let remaining = total, index = 1; remaining > 0; index += 1) {
    const amount = Math.min(maximum, remaining);
    stacks.push(
      new ItemStack({ id: `${idPrefix}-${index}`, itemId, quantity: amount }),
    );
    remaining -= amount;
  }
  return stacks;
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${label} doit être un texte non vide.`);
  return value.trim();
}
function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0)
    throw new RangeError(`${label} doit être un entier positif ou nul.`);
  return value;
}
function requireSlot(value, maximum) {
  if (!Number.isInteger(value) || value < 0 || value >= maximum)
    throw new RangeError("Le slot est invalide.");
}
