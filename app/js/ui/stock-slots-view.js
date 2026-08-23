import { getItemDefinition } from "../core/item-catalog.js";

export function renderStockSlots(actions) {
  const resources = actions.filter((action) => action.id.startsWith("reserve-balance:"));
  const productions = actions.filter((action) => action.id.startsWith("production-stock:"));
  const prepare = actions.find((action) => action.id === "prepare-population");
  const storedPopulation = actions.find((action) => action.id === "stored-population");
  const settle = actions.filter((action) => action.id.startsWith("settle-population:"));
  const heroStacks = resources.flatMap((action) => stacks(action, "hero"));
  const locationStacks = resources.flatMap((action) => stacks(action, "location"));
  const locationPopulationStacks = populationStockSlots(storedPopulation);
  const heroCapacity = resources[0]?.details?.heroSlotCapacity ?? Math.max(8, heroStacks.length + settle.length);
  const locationCapacity = resources[0]?.details?.locationSlotCapacity ?? prepare?.details?.storageSlotCapacity ?? locationStacks.length;
  const populationStacks = settle.map((action) => `<button type="button" class="stock-slot" draggable="true" data-inventory-action="${action.id}" title="Installer cette population"><span>👥</span><strong>${action.details.quantity}/5</strong><small>Population</small></button>`);
  const locationUsed = locationStacks.length + locationPopulationStacks.length;
  return `<div class="stock-manager"><section class="stock-container" data-stock-side="hero"><header><strong>Bagages</strong><span>${heroStacks.length + populationStacks.length}/${heroCapacity} slots</span></header><div class="stock-slot-grid">${heroStacks.join("")}${populationStacks.join("")}${emptySlots(Math.max(0, heroCapacity - heroStacks.length - populationStacks.length), 8)}</div></section><div class="stock-transfer-mark" aria-hidden="true">⇅</div><section class="stock-container" data-stock-side="location"><header><strong>Réserves universelles</strong><span>${locationUsed}/${locationCapacity} slots</span></header><div class="stock-slot-grid">${locationStacks.join("")}${locationPopulationStacks.join("")}${prepare ? populationButton(prepare) : ""}${emptySlots(Math.max(0, locationCapacity - locationUsed - (prepare ? 1 : 0)), 12)}</div></section>${productions.length ? `<section class="production-reserves"><header><strong>Production</strong><span>${productions.length * 4} slots spécialisés</span></header>${productions.map(productionSlots).join("")}</section>` : ""}</div>`;
}

export function bindStockSlots(element, onAction) {
  element.querySelectorAll("[data-inventory-action]").forEach((slot) => {
    slot.addEventListener("click", () => onAction(slot.dataset.inventoryAction));
    slot.addEventListener("dragstart", (event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", slot.dataset.inventoryAction); if (slot.dataset.universalAction) event.dataTransfer.setData("application/x-production-action", slot.dataset.universalAction); slot.classList.add("is-dragging"); });
    slot.addEventListener("dragend", () => slot.classList.remove("is-dragging"));
  });
  element.querySelectorAll("[data-stock-side]").forEach((container) => {
    container.addEventListener("dragover", (event) => { event.preventDefault(); container.classList.add("is-drop-target"); });
    container.addEventListener("dragleave", () => container.classList.remove("is-drop-target"));
    container.addEventListener("drop", (event) => { event.preventDefault(); container.classList.remove("is-drop-target"); const productionAction = container.dataset.stockSide === "location" ? event.dataTransfer.getData("application/x-production-action") : ""; const action = productionAction || event.dataTransfer.getData("text/plain"); if (action) onAction(action); });
  });
}

function stacks(action, side) {
  const details = action.details; const definition = getItemDefinition(details.resourceName); const maximum = definition?.bundleSize ?? 1; let remaining = side === "hero" ? details.heroAmount : details.locationAmount; const result = [];
  while (remaining > 0) {
    const quantity = Math.min(maximum, remaining); const targetHeroAmount = side === "hero" ? details.heroAmount - quantity : details.heroAmount + quantity;
    result.push(`<button type="button" class="stock-slot" draggable="true" data-inventory-action="${action.id}:${targetHeroAmount}" title="${side === "hero" ? "Déposer" : "Prendre"} ${quantity} ${definition?.name ?? details.resourceName}"><span>${definition?.icon ?? "◆"}</span><strong>${quantity}/${maximum}</strong><small>${definition?.name ?? details.resourceName}</small></button>`); remaining -= quantity;
  }
  return result;
}

function productionSlots(action) {
  const details = action.details; const definition = getItemDefinition(details.resourceName); const maximum = definition?.bundleSize ?? 1; const capacity = details.productionSlotCapacity ?? 4; let remaining = details.productionAmount; const slots = [];
  for (let index = 0; index < capacity; index += 1) {
    const quantity = Math.min(maximum, remaining); remaining -= quantity;
    slots.push(quantity > 0 ? `<button type="button" class="stock-slot production-slot" draggable="true" data-inventory-action="production-transfer:${details.resourceName}:hero:${quantity}" data-universal-action="production-transfer:${details.resourceName}:universal:${quantity}" title="Prendre ${quantity} ${definition?.name ?? details.resourceName}"><i aria-hidden="true">${definition?.icon ?? "◆"}</i><span>${definition?.icon ?? "◆"}</span><strong>${quantity}/${maximum}</strong><small>${definition?.name ?? details.resourceName}</small></button>` : `<span class="stock-slot production-slot is-empty" aria-hidden="true"><i>${definition?.icon ?? "◆"}</i>＋</span>`);
  }
  return `<section class="production-stock"><header><span>${definition?.icon ?? "◆"}</span><strong>${definition?.name ?? details.resourceName}</strong><small>${details.productionAmount}/${capacity * maximum}</small></header><div class="stock-slot-grid">${slots.join("")}</div></section>`;
}

function populationButton(action) { const amount = Math.min(5, action.details.population); return `<button type="button" class="stock-slot population-slot-button" data-inventory-action="prepare-population:${amount}" title="Créer un paquet de ${amount} habitant(s)"><span>👥</span><strong>＋${amount}</strong><small>${action.details.population} habitant(s)</small></button>`; }
function populationStockSlots(action) { let remaining = action?.details?.quantity ?? 0; const result = []; while (remaining > 0) { const quantity = Math.min(5, remaining); result.push(`<button type="button" class="stock-slot" draggable="true" data-inventory-action="take-population:${quantity}" title="Prendre ${quantity} habitant(s)"><span>👥</span><strong>${quantity}/5</strong><small>Population</small></button>`); remaining -= quantity; } return result; }
function emptySlots(count, visibleMaximum) { return Array.from({ length: Math.min(count, visibleMaximum) }, () => '<span class="stock-slot is-empty" aria-hidden="true">＋</span>').join(""); }
