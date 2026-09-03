import { getItemDefinition } from "../core/item-catalog.js";
import { createStacksForQuantity } from "../core/slot-container.js";

export function renderInventoryView({ element, hero, slotCount }) {
  const stacks = [];
  Object.entries(hero.resources).forEach(([itemId, quantity]) => {
    if (
      !Number.isInteger(quantity) ||
      quantity <= 0 ||
      !getItemDefinition(itemId)
    )
      return;
    stacks.push(
      ...createStacksForQuantity({
        itemId,
        quantity,
        idPrefix: `hero-${itemId}`,
      }),
    );
  });
  hero.carriedLoot.forEach((entry, index) =>
    stacks.push({
      id: `loot-${index}`,
      itemId: entry.itemId,
      quantity: entry.quantity,
    }),
  );
  const visibleCount = Math.max(slotCount, stacks.length);
  const slots = Array.from({ length: visibleCount }, (_, index) =>
    slot(stacks[index] ?? null, index, index >= slotCount),
  );
  const wagons = hero.wagons?.length
    ? `<section class="inventory-wagons" aria-label="Train logistique"><header><h4>Train logistique</h4><small>${hero.wagonSlotCount} slots supplémentaires</small></header><div class="inventory-slots">${hero.wagons.map((wagon) => `<div class="inventory-slot inventory-wagon" title="${wagon.name} · +${wagon.slotBonus} slots"><span class="inventory-slot__icon" aria-hidden="true">▣</span><strong>+${wagon.slotBonus}</strong><small>${wagon.name}</small></div>`).join("")}</div></section>`
    : "";
  element.innerHTML = `<section class="inventory-panel"><header><h3>Bagages</h3><strong>${stacks.length}/${slotCount} slots</strong></header>${wagons}<div class="inventory-slots" role="list" aria-label="Bagages du héros">${slots.join("")}</div>${stacks.length > slotCount ? '<p class="inventory-warning">Capacité dépassée : libérez des slots avant tout nouveau dépôt.</p>' : ""}</section><dialog class="inventory-item-dialog"><article class="inventory-item-detail"></article></dialog>`;
  if (typeof element.querySelectorAll !== "function") return;
  const dialog = element.querySelector(".inventory-item-dialog");
  element.querySelectorAll("[data-item-id]").forEach((button) =>
    button.addEventListener("click", () => openItemDialog(dialog, button.dataset.itemId, Number(button.dataset.quantity))),
  );
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) closeItemDialog(dialog);
  });
}

function slot(stack, index, overflow) {
  if (!stack)
    return `<button type="button" class="inventory-slot is-empty" role="listitem" disabled aria-label="Slot ${index + 1} vide"><span>＋</span></button>`;
  const definition = getItemDefinition(stack.itemId);
  const maximum = definition?.bundleSize ?? 1;
  const name = definition?.name ?? stack.itemId;
  const icon = definition?.icon ?? "◆";
  return `<button type="button" class="inventory-slot${overflow ? " is-overflow" : ""}" role="listitem" data-stack-id="${stack.id}" data-item-id="${stack.itemId}" data-quantity="${stack.quantity}" title="${name} ${stack.quantity}/${maximum}"><span class="inventory-slot__icon" aria-hidden="true">${icon}</span><strong>${stack.quantity}/${maximum}</strong><small>${name}</small></button>`;
}

export function renderInventoryItemDetail(itemId, quantity = 1) {
  const definition = getItemDefinition(itemId);
  const name = definition?.name ?? itemId;
  const category = { resource: "Ressource", consumable: "Consommable", livestock: "Monture", population: "Personnage transporté", character: "Personnage", unique: "Objet de quête", equipment: "Équipement" }[definition?.category] ?? "Objet";
  const icon = definition?.icon ?? "◆";
  const description = definition?.description ?? "Aucune description n’est encore disponible pour cet objet.";
  const usage = definition?.usage ?? "Son usage sera précisé au cours de l’aventure.";
  return `<button type="button" class="inventory-item-detail__close" data-close-item-dialog aria-label="Fermer">×</button><header><span class="inventory-item-detail__icon" aria-hidden="true">${icon}</span><div><small>${category}</small><h3>${name}</h3><strong>Quantité : ${quantity}</strong></div></header><section><h4>Description</h4><p>${description}</p></section><section><h4>Utilité</h4><p>${usage}</p></section>`;
}

function openItemDialog(dialog, itemId, quantity) {
  if (!dialog) return;
  dialog.querySelector(".inventory-item-detail").innerHTML = renderInventoryItemDetail(itemId, quantity);
  dialog.querySelector("[data-close-item-dialog]")?.addEventListener("click", () => closeItemDialog(dialog));
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeItemDialog(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}
