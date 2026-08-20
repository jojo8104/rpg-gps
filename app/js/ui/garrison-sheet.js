const LONG_PRESS_MS = 300;
const cleanupBySheet = new WeakMap();

export function renderGarrisonSheet({ element, location, hero, playerId, message = "", onClose, onTransfer }) {
  cleanupBySheet.get(element)?.();
  const occupied = location.garrison.units.length;
  const slots = Array.from({ length: location.defenseSlots }, (_, index) => location.garrison.units[index] ?? null);
  const unitCard = (unit, source, locked = false) => `<button type="button" class="garrison-unit${locked ? " is-locked" : ""}" data-unit-id="${unit.id}" data-source="${source}" ${locked ? "disabled" : ""}><strong>${unit.name ?? unit.typeId}</strong><span>${unit.quantity}/${unit.maxQuantity} soldats</span>${locked ? `<small>Appartient à ${unit.ownerPlayerId}</small>` : ""}</button>`;
  element.hidden = false;
  element.classList.add("garrison-sheet");
  element.innerHTML = `<button class="sheet-close" type="button">Terminer</button><span class="sheet-state">Garnison · ${occupied}/${location.defenseSlots}</span><h2>${location.name}</h2><p class="garrison-help">Glissez une unité ou touchez-la, puis touchez sa destination.</p>${message ? `<p class="sheet-feedback" role="status">${message}</p>` : ""}<section><h3>Slots de garnison</h3><div class="garrison-slots">${slots.map((unit, index) => unit ? `<div class="garrison-slot is-occupied" data-slot-index="${index}">${unitCard(unit, "garrison", unit.ownerPlayerId !== playerId)}</div>` : `<button type="button" class="garrison-slot" data-slot-index="${index}" data-garrison-target="garrison"><span>Slot ${index + 1}</span><small>Vide</small></button>`).join("") || '<p class="text-muted">Cette localisation ne possède aucun slot.</p>'}</div></section><section class="garrison-army-dock"><h3>Mon armée</h3><div class="garrison-army-zone" data-garrison-target="army">${hero.army.units.map((unit) => unitCard(unit, "army")).join("") || '<span class="garrison-empty">Armée vide</span>'}</div></section>`;

  let selected = null; let drag = null; let suppressClick = false; let pressTimer = null;
  const clearSelection = () => { selected = null; element.querySelectorAll(".is-selected,.is-drop-target").forEach((node) => node.classList.remove("is-selected", "is-drop-target")); };
  const showTargets = (source) => { element.querySelectorAll(source === "army" ? '[data-garrison-target="garrison"]' : '[data-garrison-target="army"]').forEach((node) => node.classList.add("is-drop-target")); };
  const clearPressTimer = () => { clearTimeout(pressTimer); pressTimer = null; };
  const cleanupDrag = () => {
    clearPressTimer();
    drag?.controller.abort();
    drag?.ghost.remove();
    drag = null;
    document.querySelectorAll(".garrison-drag-ghost").forEach((ghost) => ghost.remove());
    clearSelection();
  };
  cleanupBySheet.set(element, cleanupDrag);
  element.oncontextmenu = (event) => event.preventDefault();
  const transfer = (source, unitId, target) => {
    if ((source === "army" && target !== "garrison") || (source === "garrison" && target !== "army")) return false;
    clearSelection(); onTransfer({ direction: source === "army" ? "deposit" : "withdraw", unitId }); return true;
  };
  element.querySelector(".sheet-close").onclick = () => { cleanupDrag(); element.classList.remove("garrison-sheet"); onClose(); };
  element.querySelectorAll("[data-unit-id]:not(:disabled)").forEach((card) => {
    card.addEventListener("click", () => { if (suppressClick) { suppressClick = false; return; } if (selected?.unitId === card.dataset.unitId) return clearSelection(); clearSelection(); selected = { unitId: card.dataset.unitId, source: card.dataset.source }; card.classList.add("is-selected"); showTargets(selected.source); });
    card.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      clearPressTimer();
      pressTimer = setTimeout(() => {
        const ghost = card.cloneNode(true); const controller = new AbortController();
        ghost.className = "garrison-drag-ghost"; ghost.removeAttribute("data-unit-id"); ghost.disabled = true;
        document.body.append(ghost);
        drag = { pointerId: event.pointerId, unitId: card.dataset.unitId, source: card.dataset.source, ghost, controller };
        showTargets(drag.source); moveGhost(ghost, event.clientX, event.clientY);
        document.addEventListener("pointermove", (moveEvent) => { if (drag?.pointerId === moveEvent.pointerId) { moveEvent.preventDefault(); moveGhost(ghost, moveEvent.clientX, moveEvent.clientY); } }, { signal: controller.signal, passive: false });
        document.addEventListener("pointerup", (upEvent) => {
          if (drag?.pointerId !== upEvent.pointerId) return;
          const source = drag.source; const unitId = drag.unitId;
          const target = document.elementFromPoint(upEvent.clientX, upEvent.clientY)?.closest("[data-garrison-target]")?.dataset.garrisonTarget;
          suppressClick = true; cleanupDrag(); transfer(source, unitId, target);
        }, { signal: controller.signal });
        document.addEventListener("pointercancel", (cancelEvent) => { if (drag?.pointerId === cancelEvent.pointerId) cleanupDrag(); }, { signal: controller.signal });
      }, event.pointerType === "mouse" ? 0 : LONG_PRESS_MS);
      card.addEventListener("pointerup", clearPressTimer, { once: true });
      card.addEventListener("pointercancel", cleanupDrag, { once: true });
    });
  });
  element.querySelectorAll("[data-garrison-target]").forEach((target) => target.addEventListener("click", () => { if (selected) transfer(selected.source, selected.unitId, target.dataset.garrisonTarget); }));
  ["click", "pointerdown", "pointerup", "touchstart", "touchmove", "touchend"].forEach((type) => element.addEventListener(type, (event) => event.stopPropagation()));
}

function moveGhost(element, x, y) { element.style.left = `${x}px`; element.style.top = `${y}px`; }
