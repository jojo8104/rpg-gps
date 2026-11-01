import { getItemDefinition } from "./item-catalog.js";

/** Propriété officielle du type d’objet, jamais une valeur fournie par le client. */
export function isBagFreeDocument(itemId) {
  return getItemDefinition(itemId)?.bagSlots === 0;
}
