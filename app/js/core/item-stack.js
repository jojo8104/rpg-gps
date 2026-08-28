import { getItemDefinition } from "./item-catalog.js";

export class ItemStack {
  constructor({ id, itemId, quantity, metadata = {} }) {
    this.id = requireText(id, "L'identifiant du paquet");
    this.itemId = requireText(itemId, "L'identifiant de l'item");
    this.quantity = requirePositiveInteger(quantity, "La quantité du paquet");
    this.metadata = structuredClone(
      requireObject(metadata, "Les métadonnées du paquet"),
    );
    const definition = this.definition;
    if (definition && this.quantity > definition.bundleSize)
      throw new RangeError("La quantité dépasse la taille du paquet.");
    if (definition?.unique && this.quantity !== 1)
      throw new RangeError("Un item unique occupe seul son paquet.");
  }

  get definition() {
    return getItemDefinition(this.itemId);
  }
  get maximumQuantity() {
    return this.definition?.bundleSize ?? 1;
  }
  get remainingCapacity() {
    return this.maximumQuantity - this.quantity;
  }
  get isFull() {
    return this.remainingCapacity === 0;
  }

  canMerge(other) {
    return (
      other instanceof ItemStack &&
      this.itemId === other.itemId &&
      !this.definition?.unique &&
      JSON.stringify(this.metadata) === JSON.stringify(other.metadata)
    );
  }

  merge(other) {
    if (!this.canMerge(other)) return 0;
    const moved = Math.min(this.remainingCapacity, other.quantity);
    this.quantity += moved;
    other.quantity -= moved;
    return moved;
  }

  split(quantity, id) {
    const amount = requirePositiveInteger(quantity, "La quantité séparée");
    if (amount >= this.quantity)
      throw new RangeError(
        "La séparation doit laisser une quantité dans le paquet d'origine.",
      );
    this.quantity -= amount;
    return new ItemStack({
      id,
      itemId: this.itemId,
      quantity: amount,
      metadata: this.metadata,
    });
  }

  toJSON() {
    return {
      id: this.id,
      itemId: this.itemId,
      quantity: this.quantity,
      metadata: structuredClone(this.metadata),
    };
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${label} doit être un texte non vide.`);
  return value.trim();
}
function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0)
    throw new RangeError(`${label} doit être un entier strictement positif.`);
  return value;
}
function requireObject(value, label) {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new TypeError(`${label} doivent être un objet.`);
  return value;
}
