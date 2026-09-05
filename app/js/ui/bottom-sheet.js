let activeLocationId = null;

export function renderLocationSheet({
  element,
  location,
  onClose,
  onAction,
  onOpenWorld = null,
  onOpenReserves = null,
  onOpenGarrison = null,
}) {
  element.classList.remove("location-tab");
  if (activeLocationId !== location.id) {
    activeLocationId = location.id;
  }
  const recruitActions = location.actions.filter((action) =>
    action.id.startsWith("recruit:"),
  );
  const reserveActions = location.actions.filter(
    (action) =>
      action.id.startsWith("reserve-balance:") ||
      action.id.startsWith("production-stock:") ||
      action.id === "prepare-population" ||
      action.id === "stored-population" ||
      action.id.startsWith("settle-population:"),
  );
  const improvementActions = location.actions.filter((action) =>
    action.id.startsWith("build-improvement:"),
  );
  const chiefAction =
    location.actions.find((action) => action.id === "talk-chief") ?? null;
  const directActions = location.actions.filter(
    (action) =>
      !action.id.startsWith("recruit:") &&
      !action.id.startsWith("reserve-balance:") &&
      !action.id.startsWith("production-stock:") &&
      action.id !== "prepare-population" &&
      action.id !== "stored-population" &&
      !action.id.startsWith("settle-population:") &&
      !action.id.startsWith("build-improvement:") &&
      action.id !== "talk-chief",
  );
  const actionButtons = `${recruitActions.length ? '<button data-open-interaction="recruit" type="button">Recruter</button>' : ""}${reserveActions.length ? '<button data-open-reserves type="button">Gérer les réserves</button>' : ""}${improvementActions.length ? '<button data-open-interaction="improvements" type="button">Améliorations</button>' : ""}${chiefAction ? `<button data-action="talk-chief" type="button">${chiefAction.label}</button>` : ""}${directActions.map(serviceActionButton).join("")}`;
  element.hidden = false;
  element.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">${location.state}</span><h2>${location.name}</h2><p>${location.type} · ${Math.round(location.distance)} m</p><p>${location.description}</p>${campProgress(location.campDevelopment)}${structureList(location.structures)}<div class="sheet-actions">${location.nearby ? actionButtons : "Approchez-vous pour interagir."}</div>`;
  element.querySelector(".sheet-close").addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  });
  element.querySelectorAll("[data-action]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onAction(button.dataset.action);
    }),
  );
  element
    .querySelector("[data-open-reserves]")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onOpenReserves?.();
    });
  element.querySelectorAll("[data-open-interaction]").forEach((button) =>
    button.addEventListener("click", () =>
      onOpenWorld?.(button.dataset.openInteraction),
    ),
  );
  const grab = document.createElement("div");
  grab.className = "sheet-grab";
  grab.tabIndex = 0;
  grab.setAttribute("role", "button");
  grab.setAttribute("aria-label", "Ouvrir la fiche complète");
  grab.innerHTML = "<i></i>";
  element.prepend(grab);
  const defense = location.defense ?? {
    slots: 0,
    units: [],
    reinforcements: [],
  };
  const slotCount = Number.isInteger(defense.slots) ? defense.slots : 0;
  const occupied = defense.units?.slice(0, slotCount) ?? [];
  const reinforcements = defense.reinforcements ?? [];
  {
    const summary = document.createElement("button");
    summary.type = "button";
    summary.className = "sheet-defense";
    summary.disabled =
      !onOpenGarrison ||
      !location.nearby ||
      location.relation === "enemy" ||
      slotCount === 0;
    summary.innerHTML = `<span><strong>Défense</strong><small>${occupied.length}/${slotCount} slots · ${reinforcements.length} renfort(s)</small></span><span class="sheet-defense-slots">${Array.from({ length: slotCount }, (_, index) => (occupied[index] ? `<i class="is-occupied">⚔<small>${occupied[index].quantity}</small></i>` : "<i>＋</i>")).join("") || "<em>Aucun slot</em>"}</span>${reinforcements.length ? `<span class="sheet-defense-reinforcements">${reinforcements.map((unit) => `<i>♟ ${unit.quantity} ${unit.name}${unit.heroName ? ` · ${unit.heroName}` : ""}</i>`).join("")}</span>` : ""}<small>${location.relation === "enemy" ? "Forces ennemies observées" : location.relation === "neutral" ? "Forces neutres observées" : location.nearby ? "Touchez pour gérer" : "Approchez-vous pour gérer"}</small>`;
    element.querySelector(".sheet-actions")?.before(summary);
    summary.addEventListener("click", () => onOpenGarrison?.());
  }
  let touchStart = null;
  let openedByDrag = false;
  const isInteractive = (target) =>
    target.closest("button,input,select,textarea,a,[contenteditable]");
  element.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1 || isInteractive(event.target)) return;
      const touch = event.touches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    },
    { passive: true },
  );
  element.addEventListener(
    "touchend",
    (event) => {
      if (!touchStart || event.changedTouches.length !== 1) {
        touchStart = null;
        return;
      }
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(deltaY) < 48 || Math.abs(deltaY) <= Math.abs(deltaX) * 1.2)
        return;
      openedByDrag = true;
      if (deltaY < 0) onOpenWorld?.();
      else {
        onClose();
      }
    },
    { passive: true },
  );
  grab.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!openedByDrag) onOpenWorld?.();
    openedByDrag = false;
  });
  grab.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenWorld?.();
    }
  });
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

export function renderLocationTab({ element, location, onOpen }) {
  element.hidden = false;
  element.innerHTML = "";
  element.classList.remove("garrison-sheet");
  element.classList.add("location-tab");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "location-tab__button";
  button.setAttribute("aria-label", `Ouvrir la fiche de ${location.name}`);
  const type = document.createElement("small");
  type.textContent = location.type;
  const name = document.createElement("strong");
  name.textContent = location.name;
  const chevron = document.createElement("span");
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "‹";
  button.append(type, name, chevron);
  button.addEventListener("click", onOpen);
  element.append(button);
}

function serviceActionButton(action) {
  const costs = Object.entries(action.details?.costs ?? {})
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => `${amount} ${id}`)
    .join(" · ");
  const unavailable = action.details?.unavailableReason;
  return `<button data-action="${action.id}" type="button" ${unavailable ? `disabled title="${unavailable}"` : ""}><span>${action.label}</span>${costs ? `<small>${costs}</small>` : ""}${unavailable ? `<small>${unavailable}</small>` : ""}</button>`;
}

function structureList(structures = []) {
  if (!structures.length) return "";
  return `<section class="location-structures"><h3>Bâtiments</h3><ul>${structures.map((structure) => `<li><span>${structure.id} <small>Niv. ${structure.level}</small></span>${structure.dismantling ? '<small class="structure-dismantling">Démontage en cours</small>' : structure.canDismantle ? `<button class="structure-remove" data-action="dismantle:${structure.id}" type="button" aria-label="Démanteler ${structure.id}" title="Démanteler">×</button>` : ""}</li>`).join("")}</ul></section>`;
}
function reserveBalanceForm(action) {
  const details = action.details ?? {};
  return `<form class="reserve-balance" data-reserve-action="${action.id}" data-total="${details.total}"><strong>${details.resourceName}</strong><div class="reserve-balance__amounts"><span>Lieu <output data-location-amount>${details.locationAmount}</output></span><span>Héros <output data-hero-amount>${details.heroAmount}</output></span></div><input aria-label="Répartition de ${details.resourceName}" type="range" min="0" max="${details.total}" value="${details.heroAmount}" step="1" /><button type="submit">Appliquer</button></form>`;
}
function updateReserveBalance(input) {
  const form = input.closest("[data-reserve-action]");
  const heroAmount = Number(input.value);
  form.querySelector("[data-hero-amount]").value = heroAmount;
  form.querySelector("[data-location-amount]").value =
    Number(form.dataset.total) - heroAmount;
}
function campProgress(development) {
  if (!development) return "";
  const blockers = development.levelUp.blockers ?? [];
  return `<section class="camp-progress"><strong>Camp ${development.experience}/${development.experienceRequired} XP</strong><span>${development.slots.used}/${development.slots.maximum} emplacements de développement</span>${blockers.length ? `<small>${blockers.join(" · ")}</small>` : development.levelUp.eligible ? "<small>Prêt à évoluer</small>" : ""}</section>`;
}

export function closeSheet(element) {
  element.hidden = true;
  element.innerHTML = "";
  element.classList.remove("garrison-sheet", "location-tab");
  activeLocationId = null;
}
