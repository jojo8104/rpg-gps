import { renderUnitTypeIcon } from "./unit-icon.js";
import { renderUnitHealthBar } from "./unit-health-bar.js";

const LONG_PRESS_MS = 300;
const cleanupBySheet = new WeakMap();

export function renderGarrisonSheet({
  element,
  location,
  hero,
  playerId,
  unitDefinitions = new Map(),
  message = "",
  onClose,
  onTransfer,
}) {
  cleanupBySheet.get(element)?.();
  const occupied = location.garrison.units.length;
  const garrisonSlots = Array.from(
    { length: location.defenseSlots },
    (_, index) => location.garrison.units[index] ?? null,
  );
  const armySlots = Array.from(
    { length: hero.maxUnitStacks },
    (_, index) => hero.army.units[index] ?? null,
  );
  const unitSlot = (unit, source, index, locked = false) =>
    unit
      ? renderGarrisonUnitSlot({
          unit,
          source,
          index,
          locked,
          definition: unitDefinitions.get(unit.typeId),
        })
      : `<button type="button" class="garrison-slot is-empty" data-slot-index="${index}" data-garrison-target="${source}"><span class="garrison-slot__plus" aria-hidden="true">+</span><strong>Emplacement ${index + 1}</strong><small>Vide</small></button>`;
  element.hidden = false;
  element.classList.add("garrison-sheet");
  element.innerHTML = `<button class="sheet-close" type="button">Terminer</button><span class="sheet-state">Garnison · ${occupied}/${location.defenseSlots}</span><h2>${location.name}</h2><p class="garrison-help">Glissez une unité vers un emplacement vide, ou touchez successivement l’unité et sa destination.</p>${message ? `<p class="sheet-feedback" role="status">${message}</p>` : ""}<section><h3>Garnison</h3><div class="garrison-slots">${garrisonSlots.map((unit, index) => unitSlot(unit, "garrison", index, unit?.ownerPlayerId !== playerId)).join("") || '<p class="text-muted">Cette localisation ne possède aucun emplacement.</p>'}</div></section><section class="garrison-army-dock"><h3>Armée du héros · ${hero.army.units.length}/${hero.maxUnitStacks}</h3><div class="garrison-army-zone">${armySlots.map((unit, index) => unitSlot(unit, "army", index)).join("")}</div></section>`;

  let selected = null;
  let drag = null;
  let suppressClick = false;
  let pressTimer = null;
  const clearSelection = () => {
    selected = null;
    element
      .querySelectorAll(".is-selected,.is-drop-target")
      .forEach((node) =>
        node.classList.remove("is-selected", "is-drop-target"),
      );
  };
  const showTargets = (source) => {
    element
      .querySelectorAll(
        source === "army"
          ? '[data-garrison-target="garrison"]'
          : '[data-garrison-target="army"]',
      )
      .forEach((node) => node.classList.add("is-drop-target"));
  };
  const clearPressTimer = () => {
    clearTimeout(pressTimer);
    pressTimer = null;
  };
  const cleanupDrag = () => {
    clearPressTimer();
    drag?.controller.abort();
    drag?.ghost.remove();
    drag = null;
    document
      .querySelectorAll(".garrison-drag-ghost")
      .forEach((ghost) => ghost.remove());
    clearSelection();
  };
  cleanupBySheet.set(element, cleanupDrag);
  element.oncontextmenu = (event) => event.preventDefault();
  const transfer = (source, unitId, target) => {
    if (
      (source === "army" && target !== "garrison") ||
      (source === "garrison" && target !== "army")
    )
      return false;
    clearSelection();
    onTransfer({
      direction: source === "army" ? "deposit" : "withdraw",
      unitId,
    });
    return true;
  };
  element.querySelector(".sheet-close").onclick = () => {
    cleanupDrag();
    element.classList.remove("garrison-sheet");
    onClose();
  };
  element.querySelectorAll("[data-unit-id]:not(:disabled)").forEach((card) => {
    card.addEventListener("click", () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (selected?.unitId === card.dataset.unitId) return clearSelection();
      clearSelection();
      selected = { unitId: card.dataset.unitId, source: card.dataset.source };
      card.classList.add("is-selected");
      showTargets(selected.source);
    });
    card.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      clearPressTimer();
      pressTimer = setTimeout(
        () => {
          const ghost = card.cloneNode(true);
          const controller = new AbortController();
          ghost.className = "garrison-drag-ghost";
          ghost.removeAttribute("data-unit-id");
          ghost.disabled = true;
          document.body.append(ghost);
          drag = {
            pointerId: event.pointerId,
            unitId: card.dataset.unitId,
            source: card.dataset.source,
            ghost,
            controller,
          };
          showTargets(drag.source);
          moveGhost(ghost, event.clientX, event.clientY);
          document.addEventListener(
            "pointermove",
            (moveEvent) => {
              if (drag?.pointerId === moveEvent.pointerId) {
                moveEvent.preventDefault();
                moveGhost(ghost, moveEvent.clientX, moveEvent.clientY);
              }
            },
            { signal: controller.signal, passive: false },
          );
          document.addEventListener(
            "pointerup",
            (upEvent) => {
              if (drag?.pointerId !== upEvent.pointerId) return;
              const source = drag.source;
              const unitId = drag.unitId;
              const target = document
                .elementFromPoint(upEvent.clientX, upEvent.clientY)
                ?.closest("[data-garrison-target]")?.dataset.garrisonTarget;
              suppressClick = true;
              cleanupDrag();
              transfer(source, unitId, target);
            },
            { signal: controller.signal },
          );
          document.addEventListener(
            "pointercancel",
            (cancelEvent) => {
              if (drag?.pointerId === cancelEvent.pointerId) cleanupDrag();
            },
            { signal: controller.signal },
          );
        },
        event.pointerType === "mouse" ? 0 : LONG_PRESS_MS,
      );
      card.addEventListener("pointerup", clearPressTimer, { once: true });
      card.addEventListener("pointercancel", cleanupDrag, { once: true });
    });
  });
  element.querySelectorAll("[data-garrison-target]").forEach((target) =>
    target.addEventListener("click", () => {
      if (selected)
        transfer(
          selected.source,
          selected.unitId,
          target.dataset.garrisonTarget,
        );
    }),
  );
  [
    "click",
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchmove",
    "touchend",
  ].forEach((type) =>
    element.addEventListener(type, (event) => event.stopPropagation()),
  );
}

function moveGhost(element, x, y) {
  element.style.left = `${x}px`;
  element.style.top = `${y}px`;
}

export function renderGarrisonUnitSlot({
  unit,
  source,
  index = 0,
  locked = false,
  definition = null,
}) {
  const maximum = Math.max(1, unit.maxQuantity ?? unit.quantity);
  const icon = renderUnitTypeIcon({
    typeId: unit.typeId,
    tags: definition?.tags ?? [],
    range: definition?.stats?.range ?? 1,
  });
  const health = renderUnitHealthBar(unit, { tag: "span" });
  return `<div class="garrison-slot is-occupied" data-slot-index="${index}"><button type="button" class="garrison-unit${locked ? " is-locked" : ""}" data-unit-id="${unit.id}" data-source="${source}" ${locked ? "disabled" : ""}><span class="garrison-unit__icon">${icon}</span><span class="garrison-unit__body"><strong>${unit.name ?? definition?.name ?? unit.typeId}</strong><small>${unit.rank ?? "soldier"} · ${unit.quantity}/${maximum}</small>${health}${locked ? `<small>Appartient à ${unit.ownerPlayerId}</small>` : ""}</span></button></div>`;
}
