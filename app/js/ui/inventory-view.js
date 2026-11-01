import { itemRarityLabel, itemStatsLabel } from "./item-details.js";
import { formatInteger } from "./number-format.js";
import { getItemDefinition } from "../core/item-catalog.js";
import { createStacksForQuantity } from "../core/slot-container.js";
import { itemVisual } from "./item-visual.js";
import { isBagFreeDocument } from "../core/item-baggage.js";

export function renderInventoryView({
  element,
  hero,
  slotCount,
  explorationView = null,
}) {
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
  const documents = stacks.filter((stack) => isBagFreeDocument(stack.itemId));
  const baggage = stacks.filter((stack) => !isBagFreeDocument(stack.itemId));
  const visibleCount = Math.max(slotCount, baggage.length);
  const slots = Array.from({ length: visibleCount }, (_, index) =>
    slot(
      baggage[index] ?? null,
      index,
      index >= slotCount,
      explorationView?.clues?.find(
        (clue) => clue.id === baggage[index]?.itemId,
      ),
    ),
  );
  const documentSection = documents.length
    ? `<section class="inventory-documents"><header><h4>Documents</h4><small>Hors capacité des bagages</small></header><div class="inventory-slots" role="list" aria-label="Documents sans encombrement">${documents
        .map((stack, index) =>
          slot(
            stack,
            index,
            false,
            explorationView?.clues?.find((clue) => clue.id === stack.itemId),
          ),
        )
        .join("")}</div></section>`
    : "";
  const wagons = hero.wagons?.length
    ? `<section class="inventory-wagons" aria-label="Train logistique"><header><h4>Train logistique</h4><small>${hero.wagonSlotCount} slots supplémentaires</small></header><div class="inventory-slots">${hero.wagons.map((wagon) => `<div class="inventory-slot inventory-wagon" title="${wagon.name} · +${formatInteger(wagon.slotBonus)} slots"><span class="inventory-slot__icon" aria-hidden="true">▣</span><strong>+${formatInteger(wagon.slotBonus)}</strong><small>${wagon.name}</small></div>`).join("")}</div></section>`
    : "";
  element.innerHTML = `<section class="inventory-panel"><header><h3>Bagages</h3><strong>${baggage.length}/${slotCount} slots</strong></header>${wagons}<div class="inventory-slots" role="list" aria-label="Bagages du héros">${slots.join("")}</div>${documentSection}${baggage.length > slotCount ? '<p class="inventory-warning">Capacité dépassée : libérez des slots avant tout nouveau dépôt.</p>' : ""}</section><dialog class="inventory-item-dialog"><article class="inventory-item-detail"></article></dialog>`;
  if (typeof element.querySelectorAll !== "function") return;
  const dialog = element.querySelector(".inventory-item-dialog");
  element.querySelectorAll("[data-item-id]").forEach((button) =>
    button.addEventListener("click", () =>
      openItemDialog(
        dialog,
        button.dataset.itemId,
        Number(button.dataset.quantity),
        explorationView?.clues?.find(
          (clue) => clue.id === button.dataset.itemId,
        ),
      ),
    ),
  );
  dialog?.addEventListener("click", (event) => {
    if (event.target === dialog) closeItemDialog(dialog);
  });
}

function slot(stack, index, overflow, clue) {
  if (!stack)
    return `<button type="button" class="inventory-slot is-empty" role="listitem" disabled aria-label="Slot ${index + 1} vide"><span>＋</span></button>`;
  const definition = getItemDefinition(stack.itemId);
  const maximum = definition?.bundleSize ?? 1;
  const name = clue
    ? clue.kind === "localization"
      ? "Carte de localisation"
      : clue.medium === "message"
        ? "Message de recherche"
        : "Parchemin de recherche"
    : (definition?.name ?? stack.itemId);
  const icon = clue?.kind === "localization" ? "🗺️" : itemVisual(definition);
  return `<button type="button" class="inventory-slot${overflow ? " is-overflow" : ""}" role="listitem" data-stack-id="${stack.id}" data-item-id="${stack.itemId}" data-quantity="${stack.quantity}" title="${name} ${formatInteger(stack.quantity)}/${formatInteger(maximum)}"><span class="inventory-slot__icon" aria-hidden="true">${icon}</span><strong>${formatInteger(stack.quantity)}/${formatInteger(maximum)}</strong><small>${name}</small></button>`;
}

export function renderInventoryItemDetail(itemId, quantity = 1, clue = null) {
  const definition = getItemDefinition(itemId);
  const name = clue
    ? clue.kind === "localization"
      ? "Carte de localisation"
      : clue.medium === "message"
        ? "Message de recherche"
        : "Parchemin de recherche"
    : (definition?.name ?? itemId);
  const category =
    {
      resource: "Ressource",
      consumable: "Consommable",
      livestock: "Monture",
      population: "Personnage transporté",
      character: "Personnage",
      unique: "Objet de quête",
      equipment: "Équipement",
      clue: "Indice réutilisable",
      document: "Document sans encombrement",
    }[definition?.category] ?? "Objet";
  const icon = clue?.kind === "localization" ? "🗺️" : itemVisual(definition);
  const description = clue
    ? escapeClueText(
        `${clue.siteName ? `${clue.siteName} · ` : ""}${clue.text}${clue.fragmentCount ? ` · Fragment ${clue.fragmentIndex}/${clue.fragmentCount}` : ""}${clue.status === "obsolete" ? " · Archive : cet indice n’est plus utilisable. Il reste un document sans encombrement, vendable au cartographe ou géographe pour 5 à 10 or selon son type." : ""}`,
      )
    : (definition?.description ??
      "Aucune description n’est encore disponible pour cet objet.");
  const equipmentDetails =
    definition?.category === "equipment"
      ? `<section><p>${itemRarityLabel(definition)}</p></section><section><h4>Statistiques modifiées</h4><p>${itemStatsLabel(definition)}</p></section>`
      : "";
  const usage =
    definition?.usage ?? "Son usage sera précisé au cours de l’aventure.";
  return `<button type="button" class="inventory-item-detail__close" data-close-item-dialog aria-label="Fermer">×</button><header><span class="inventory-item-detail__icon" aria-hidden="true">${icon}</span><div><small>${category}</small><h3>${name}</h3><strong>Quantité : ${formatInteger(quantity)}</strong></div></header><section><h4>Description</h4><p>${description}</p></section>${equipmentDetails}<section><h4>Utilité</h4><p>${usage}</p>${isBagFreeDocument(itemId) ? "<p>Ce document ne compte pas dans la limite des bagages.</p>" : ""}</section>`;
}

function openItemDialog(dialog, itemId, quantity, clue) {
  if (!dialog) return;
  dialog.querySelector(".inventory-item-detail").innerHTML =
    renderInventoryItemDetail(itemId, quantity, clue);
  dialog
    .querySelector("[data-close-item-dialog]")
    ?.addEventListener("click", () => closeItemDialog(dialog));
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function escapeClueText(text) {
  return String(text).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function closeItemDialog(dialog) {
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}
