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
  element.innerHTML = `<section class="inventory-panel"><header><h3>Bagages</h3><strong>${stacks.length}/${slotCount} slots</strong></header>${wagons}<div class="inventory-slots" role="list" aria-label="Bagages du héros">${slots.join("")}</div>${stacks.length > slotCount ? '<p class="inventory-warning">Capacité dépassée : libérez des slots avant tout nouveau dépôt.</p>' : ""}</section>`;
}

function slot(stack, index, overflow) {
  if (!stack)
    return `<button type="button" class="inventory-slot is-empty" role="listitem" disabled aria-label="Slot ${index + 1} vide"><span>＋</span></button>`;
  const definition = getItemDefinition(stack.itemId);
  const maximum = definition?.bundleSize ?? 1;
  const name = definition?.name ?? stack.itemId;
  const icon = definition?.icon ?? "◆";
  return `<button type="button" class="inventory-slot${overflow ? " is-overflow" : ""}" role="listitem" data-stack-id="${stack.id}" title="${name} ${stack.quantity}/${maximum}"><span class="inventory-slot__icon" aria-hidden="true">${icon}</span><strong>${stack.quantity}/${maximum}</strong><small>${name}</small></button>`;
}
