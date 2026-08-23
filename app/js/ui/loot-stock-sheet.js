import { getItemDefinition } from "../core/item-catalog.js";

export function renderLootStockSheet({ element, site, playerId, bag, message = "", onCollect, onClose }) {
  const entries = site.entries.map((entry) => ({ ...entry, available: Math.min(entry.quantity, entry.allocations[playerId] ?? 0) })).filter((entry) => entry.available > 0 || entry.portable === false);
  const fieldSlots = entries.flatMap(entrySlots); const movedSlotIds = new Set();
  element.hidden = false;
  element.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Gestion des ressources · butin</span><h2>Champ de bataille</h2><p>Touchez un groupe pour le transvaser. Les transferts ne sont appliqués qu’après validation.</p>${message ? `<p class="sheet-feedback" role="status">${message}</p>` : ""}<div data-loot-manager></div>`;
  element.querySelector(".sheet-close").onclick = onClose;

  const renderManager = (feedback = "") => {
    const selection = selectionFrom(fieldSlots, movedSlotIds); const estimate = estimateSelection({ bag, entries, selection });
    const field = fieldSlots.filter((slot) => !movedSlotIds.has(slot.id)); const moved = fieldSlots.filter((slot) => movedSlotIds.has(slot.id)); const stagedItemIds = new Set(moved.map((slot) => slot.itemId)); const projectedBag = bagSlots(projectedQuantities(bag.quantitiesByItem, moved));
    element.querySelector("[data-loot-manager]").innerHTML = `<div class="stock-manager loot-transfer-manager"><section class="stock-container" data-loot-side="field"><header><strong>Champ de bataille</strong><span>${field.length} groupe(s)</span></header><div class="stock-slot-grid">${field.map((slot) => slotButton(slot)).join("") || emptySlots(1)}${entries.filter((entry) => !entry.portable).map(fixedSlot).join("")}</div></section><div class="stock-transfer-mark" aria-hidden="true">⇅</div><section class="stock-container" data-loot-side="bag"><header><strong>Bagages du héros</strong><span>${estimate.usedSlots}/${bag.slotCapacity} slots</span></header><div class="stock-slot-grid">${projectedBag.map((slot) => bagSlot(slot, stagedItemIds)).join("")}${emptySlots(Math.max(0, bag.slotCapacity - estimate.usedSlots))}</div></section>${feedback ? `<p class="loot-transfer-feedback" role="status">${feedback}</p>` : ""}<div class="sheet-actions"><button type="button" data-confirm-loot ${moved.length === 0 ? "disabled" : ""}>Valider les transferts</button></div></div>`;
    bindTransfers({ element, movedSlotIds, fieldSlots, bag, entries, renderManager });
    element.querySelector("[data-confirm-loot]")?.addEventListener("click", () => onCollect(selection));
  };
  renderManager();
}

function entrySlots(entry) {
  if (!entry.portable) return [];
  const definition = getItemDefinition(entry.itemId); const maximum = definition?.bundleSize ?? 1; const slots = [];
  for (let remaining = entry.available, index = 0; remaining > 0; index += 1) { const quantity = Math.min(maximum, remaining); remaining -= quantity; slots.push({ id: `${entry.id}:${index}`, entryId: entry.id, itemId: entry.itemId, quantity, maximum, name: definition?.name ?? entry.itemId, icon: definition?.icon ?? "◆" }); }
  return slots;
}

function bagSlots(quantitiesByItem) {
  return Object.entries(quantitiesByItem ?? {}).flatMap(([itemId, total]) => {
    const definition = getItemDefinition(itemId); const maximum = definition?.bundleSize ?? 1; const slots = [];
    for (let remaining = total, index = 0; remaining > 0; index += 1) { const quantity = Math.min(maximum, remaining); remaining -= quantity; slots.push({ id: `bag:${itemId}:${index}`, itemId, quantity, maximum, name: definition?.name ?? itemId, icon: definition?.icon ?? "◆" }); }
    return slots;
  });
}

function slotButton(slot) { return `<button type="button" class="stock-slot loot-transfer-slot" draggable="true" data-loot-slot="${slot.id}" title="Placer dans les bagages"><span>${slot.icon}</span><strong>${slot.quantity}/${slot.maximum}</strong><small>${slot.name}</small></button>`; }
function bagSlot(slot, stagedItemIds) { return stagedItemIds.has(slot.itemId) ? `<button type="button" class="stock-slot loot-transfer-slot is-staged" draggable="true" data-loot-return-item="${slot.itemId}" title="Remettre un groupe sur le champ de bataille"><span>${slot.icon}</span><strong>${slot.quantity}/${slot.maximum}</strong><small>${slot.name}</small></button>` : `<span class="stock-slot loot-bag-existing" title="Déjà dans les bagages"><span>${slot.icon}</span><strong>${slot.quantity}/${slot.maximum}</strong><small>${slot.name}</small></span>`; }
function fixedSlot(entry) { const definition = getItemDefinition(entry.itemId); return `<span class="stock-slot loot-fixed-slot" title="Non transportable"><span>${definition?.icon ?? "◆"}</span><strong>${entry.quantity}</strong><small>${definition?.name ?? entry.itemId}</small></span>`; }
function emptySlots(count) { return Array.from({ length: Math.min(count, 8) }, () => '<span class="stock-slot is-empty" aria-hidden="true">＋</span>').join(""); }

function bindTransfers({ element, movedSlotIds, fieldSlots, bag, entries, renderManager }) {
  const move = (slotId, destination) => {
    if (!fieldSlots.some((slot) => slot.id === slotId)) return;
    if (destination === "field") { movedSlotIds.delete(slotId); renderManager(); return; }
    movedSlotIds.add(slotId); const estimate = estimateSelection({ bag, entries, selection: selectionFrom(fieldSlots, movedSlotIds) });
    if (!estimate.fits) { movedSlotIds.delete(slotId); renderManager("Aucun slot disponible pour ce groupe."); return; }
    renderManager();
  };
  element.querySelectorAll("[data-loot-slot]").forEach((slot) => {
    slot.addEventListener("click", () => move(slot.dataset.lootSlot, "bag"));
    slot.addEventListener("dragstart", (event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", slot.dataset.lootSlot); slot.classList.add("is-dragging"); });
    slot.addEventListener("dragend", () => slot.classList.remove("is-dragging"));
  });
  const returnItem = (itemId) => { const slot = fieldSlots.findLast((candidate) => candidate.itemId === itemId && movedSlotIds.has(candidate.id)); if (slot) move(slot.id, "field"); };
  element.querySelectorAll("[data-loot-return-item]").forEach((slot) => {
    slot.addEventListener("click", () => returnItem(slot.dataset.lootReturnItem));
    slot.addEventListener("dragstart", (event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", `return:${slot.dataset.lootReturnItem}`); slot.classList.add("is-dragging"); });
    slot.addEventListener("dragend", () => slot.classList.remove("is-dragging"));
  });
  element.querySelectorAll("[data-loot-side]").forEach((container) => {
    container.addEventListener("dragover", (event) => { event.preventDefault(); container.classList.add("is-drop-target"); });
    container.addEventListener("dragleave", () => container.classList.remove("is-drop-target"));
    container.addEventListener("drop", (event) => { event.preventDefault(); container.classList.remove("is-drop-target"); const payload = event.dataTransfer.getData("text/plain"); if (payload.startsWith("return:")) { if (container.dataset.lootSide === "field") returnItem(payload.slice(7)); return; } move(payload, container.dataset.lootSide); });
  });
}

function projectedQuantities(base, moved) { const result = { ...(base ?? {}) }; moved.forEach((slot) => { result[slot.itemId] = (result[slot.itemId] ?? 0) + slot.quantity; }); return result; }

function selectionFrom(fieldSlots, movedSlotIds) {
  const selection = {};
  fieldSlots.filter((slot) => movedSlotIds.has(slot.id)).forEach((slot) => { selection[slot.entryId] = (selection[slot.entryId] ?? 0) + slot.quantity; });
  return selection;
}

function estimateSelection({ bag, entries, selection }) {
  const quantities = { ...bag.quantitiesByItem }; const slots = { ...bag.slotsByItem }; let remainingSlots = bag.freeSlots;
  entries.filter((entry) => entry.portable).forEach((entry) => {
    const selected = selection[entry.id] ?? 0; if (selected <= 0) return;
    const bundleSize = getItemDefinition(entry.itemId)?.bundleSize ?? 1; const currentQuantity = quantities[entry.itemId] ?? 0; const currentSlots = slots[entry.itemId] ?? 0;
    const requiredSlots = Math.max(0, Math.ceil((currentQuantity + selected) / bundleSize) - currentSlots); remainingSlots -= requiredSlots;
    quantities[entry.itemId] = currentQuantity + selected; slots[entry.itemId] = currentSlots + requiredSlots;
  });
  return { fits: remainingSlots >= 0, usedSlots: bag.usedSlots + bag.freeSlots - remainingSlots };
}
