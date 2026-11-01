import { renderUnitTypeIcon } from "./unit-icon.js";

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function renderArmyFormation(hero, game) {
  return `<section class="army-deployment" aria-label="Formation de départ"><strong>Prêts pour la bataille</strong><p data-deployment-help aria-live="polite">Glisse une troupe sur une case, ou touche « Placer » puis une case.</p><div class="army-deployment__slots">${["Gauche", "Centre", "Droite"].map((label, slot) => {
    const unit = hero.army.units.find((candidate) => candidate.battleSlot === slot);
    const definition = unit && game.unitDefinitions.get(unit.typeId);
    return `<div class="army-deployment__position"><button type="button" class="army-deployment__slot" data-deployment-slot="${slot}" data-occupant="${escape(unit?.id ?? "")}" aria-label="${label}${unit ? ` : ${escape(unit.name ?? definition?.name ?? unit.typeId)}` : " : libre"}"><span>${label}</span>${unit ? `${renderUnitTypeIcon({ typeId: unit.typeId, tags: definition?.tags ?? [], range: definition?.stats?.range ?? 1 })}<small>${escape(unit.name ?? definition?.name ?? unit.typeId)}</small>` : '<span class="army-deployment__empty">＋</span><small>Libre</small>'}</button>${unit ? `<button type="button" class="army-deployment__remove" data-deployment-remove="${escape(unit.id)}" aria-label="Remettre la troupe ${label.toLowerCase()} en réserve">↩ Réserve</button>` : ""}</div>`;
  }).join("")}</div></section>`;
}

// Only sends intentions: the displayed formation comes from the server snapshot.
export function bindArmyFormation(element, actions) {
  let selected = null;
  let pending = false;
  const help = element.querySelector("[data-deployment-help]");
  const slots = [...element.querySelectorAll("[data-deployment-slot]")];
  const select = (id) => {
    selected = id;
    element.querySelectorAll("[data-formation-pick]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.formationPick === id)));
    if (help) help.textContent = "Choisis une case libre pour cette troupe.";
  };
  const submit = async (id, slot) => {
    if (pending || !id) return;
    pending = true;
    try { await actions.setFormation?.(id, slot); }
    finally { pending = false; }
  };
  const place = (slot) => {
    if (!slot || !selected) return;
    if (slot.dataset.occupant && slot.dataset.occupant !== selected) {
      if (help) help.textContent = "Remets d’abord la troupe de cette case en réserve.";
      return;
    }
    void submit(selected, Number(slot.dataset.deploymentSlot));
  };
  slots.forEach((slot) => slot.addEventListener("click", () => place(slot)));
  element.querySelectorAll("[data-deployment-remove]").forEach((button) => button.addEventListener("click", () => void submit(button.dataset.deploymentRemove, null)));
  element.querySelectorAll("[data-formation-pick]").forEach((handle) => {
    let gesture = null;
    let suppressClick = false;
    handle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (suppressClick) { suppressClick = false; return; }
      select(handle.dataset.formationPick);
    });
    handle.addEventListener("pointerdown", (event) => {
      if (handle.disabled || pending || event.button !== 0) return;
      suppressClick = false;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, ghost: null };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      if (!gesture.ghost && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 8) return;
      if (!gesture.ghost) {
        select(handle.dataset.formationPick);
        const card = handle.closest(".army-card");
        const ghost = document.createElement("div");
        ghost.className = "army-deployment__ghost";
        ghost.innerHTML = card.querySelector(".army-illustration").innerHTML;
        const name = document.createElement("small");
        name.textContent = card.querySelector("h3").textContent;
        ghost.append(name);
        element.append(ghost);
        gesture.ghost = ghost;
        suppressClick = true;
      }
      gesture.ghost.style.left = `${event.clientX}px`;
      gesture.ghost.style.top = `${event.clientY}px`;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-deployment-slot]");
      slots.forEach((slot) => slot.classList.toggle("is-drop-target", slot === target));
    });
    const finish = (event) => {
      if (!gesture || gesture.id !== event.pointerId) return;
      if (gesture.ghost && event.type === "pointerup") {
        const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-deployment-slot]");
        if (slots.includes(slot)) place(slot);
      }
      gesture.ghost?.remove();
      gesture = null;
      slots.forEach((slot) => slot.classList.remove("is-drop-target"));
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", finish);
  });
}
