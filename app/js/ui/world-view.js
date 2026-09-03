import { bindStockSlots, renderStockSlots } from "./stock-slots-view.js";
import { renderUnitTypeIcon } from "./unit-icon.js";

let filtersExpanded = false;
let activeDetailActionMenu = null;
let activeDetailLocationId = null;

const LOCATION_ART = Object.freeze({
  fort: "assets/markers/fort.png",
  village: "assets/markers/village.png",
  mine: "assets/markers/mine.png",
  camp: "assets/markers/camp.png",
  capital: "assets/markers/capital.png",
  quarry: "assets/markers/quarry.png",
  "lumber-camp": "assets/markers/lumber-camp.png",
  quest: "assets/markers/quest.png",
});

export function renderWorldDirectory({
  element,
  locations,
  types = [],
  filters,
  onFilter,
  onOpen,
  onShowMap,
}) {
  const activeFilterCount = [
    filters.search,
    filters.type,
    filters.owner,
  ].filter(Boolean).length;
  element.innerHTML = `<section class="world-section"><div class="world-directory-heading"><h2>Annuaire du monde</h2><button class="world-filter-toggle secondary-button" type="button" data-toggle-filters aria-expanded="${filtersExpanded}" aria-controls="world-filters">⌕ Filtres${activeFilterCount ? ` (${activeFilterCount})` : ""}</button></div><div id="world-filters" class="world-filters" ${filtersExpanded ? "" : "hidden"}><label>Rechercher<input data-filter="search" type="search" value="${filters.search}" placeholder="Nom du lieu" /></label><label>Nature<select data-filter="type"><option value="">Toutes</option>${types.map((type) => `<option value="${type}" ${filters.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></label><label>Propriétaire<select data-filter="owner"><option value="">Tous</option><option value="known" ${filters.owner === "known" ? "selected" : ""}>Connu</option><option value="unknown" ${filters.owner === "unknown" ? "selected" : ""}>Inconnu</option></select></label><label>Classement<select data-filter="sort"><option value="distance" ${filters.sort === "distance" ? "selected" : ""}>Distance</option><option value="name" ${filters.sort === "name" ? "selected" : ""}>Nom</option><option value="type" ${filters.sort === "type" ? "selected" : ""}>Nature</option><option value="owner" ${filters.sort === "owner" ? "selected" : ""}>Propriétaire</option></select></label></div><div class="world-grid">${locations.map(card).join("") || '<p class="world-empty">Aucun lieu ne correspond aux filtres.</p>'}</div></section>`;
  element.querySelector(".world-directory-heading h2")?.remove();
  element.querySelector("[data-toggle-filters]").onclick = () => {
    filtersExpanded = !filtersExpanded;
    renderWorldDirectory({
      element,
      locations,
      types,
      filters,
      onFilter,
      onOpen,
      onShowMap,
    });
  };
  element
    .querySelectorAll("[data-filter]")
    .forEach(
      (control) =>
        (control.oninput = () =>
          onFilter(control.dataset.filter, control.value)),
    );
  element
    .querySelectorAll("[data-location-card]")
    .forEach(
      (cardElement) =>
        (cardElement.onclick = () => onOpen(cardElement.dataset.locationCard)),
    );
  element.querySelectorAll("[data-show-map]").forEach(
    (button) =>
      (button.onclick = (event) => {
        event.stopPropagation();
        onShowMap(button.dataset.showMap);
      }),
  );
}

export function renderLocationDetail({
  element,
  location,
  index,
  total,
  initialActionMenu = null,
  onBack,
  onPrevious,
  onNext,
  onShowMap,
  onAction,
  onOpenGarrison = null,
}) {
  if (activeDetailLocationId !== location.id) {
    activeDetailLocationId = location.id;
    activeDetailActionMenu = null;
  }
  if (initialActionMenu) activeDetailActionMenu = initialActionMenu;
  const value = (input) =>
    input === null || input === undefined || input === "" ? "inconnue" : input;
  const list = (items, render, empty = "Aucune information") =>
    items.length
      ? `<ul>${items.map(render).join("")}</ul>`
      : `<p class="text-muted">${empty}</p>`;
  const resourceIds = [
    ...new Set([
      ...location.production.map((item) => item.id),
      ...location.stock.map((item) => item.id),
    ]),
  ];
  const resources = list(
    resourceIds,
    (id) => {
      const productionEntry = location.production.find(
        (item) => item.id === id,
      );
      const stockEntry = location.stock.find((item) => item.id === id);
      const production = productionEntry?.amount;
      const stock = stockEntry?.amount ?? 0;
      const capacity =
        stockEntry?.capacity ??
        productionEntry?.capacity ??
        location.storageCapacity;
      return `<li><span>${id}${production === undefined ? "" : ` <small>(+${value(production)}/cycle)</small>`}</span><strong>${value(stock)}/${value(capacity)}</strong></li>`;
    },
    "Aucune ressource connue",
  );
  const presences = list(
    location.presences,
    (hero) => {
      const army = hero.army?.length
        ? ` · Armée : ${hero.army.map((unit) => `${unit.quantity} ${unit.type}`).join(", ")}`
        : "";
      const stats = hero.stats
        .map(
          (stat) =>
            `${stat.id}: ${stat.assessment}${stat.value === null ? "" : ` (${stat.value})`}`,
        )
        .join(" · ");
      return `<li><span>${hero.label}</span><strong>${stats || "Présence détectée"}${army}</strong></li>`;
    },
    "Aucun héros ennemi connu",
  );
  const structures = list(
    location.defense.structures,
    (structure) =>
      `<li><span>${structure.type}</span><strong>Niv. ${value(structure.level)}</strong>${structure.dismantling ? '<small class="structure-dismantling">Démontage en cours</small>' : structure.canDismantle ? `<button type="button" class="structure-remove" data-action="dismantle:${structure.id}" aria-label="Démanteler ${structure.type}" title="Démanteler">×</button>` : ""}</li>`,
    "Aucune structure défensive",
  );
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
  const directActions = location.actions.filter(
    (action) =>
      !action.id.startsWith("recruit:") &&
      !action.id.startsWith("reserve-balance:") &&
      !action.id.startsWith("production-stock:") &&
      action.id !== "prepare-population" &&
      action.id !== "stored-population" &&
      !action.id.startsWith("settle-population:") &&
      !action.id.startsWith("build-improvement:"),
  );
  const actionButtons = `${recruitActions.length ? '<button type="button" data-open-action-menu="recruit" aria-expanded="false">Recruter</button>' : ""}${reserveActions.length ? '<button type="button" data-open-action-menu="reserves" aria-expanded="false">Gérer les réserves</button>' : ""}${improvementActions.length ? '<button type="button" data-open-action-menu="improvements" aria-expanded="false">Améliorations</button>' : ""}${directActions.map(serviceActionButton).join("")}`;
  const recruitMenu = recruitActions.length
    ? `<div class="location-action-menu" data-action-menu="recruit" hidden><div class="action-menu-heading"><h4>Recruter une unité</h4><button type="button" class="secondary-button" data-close-action-menu>Fermer</button></div><div class="recruit-options">${recruitActions
        .map((action) => {
          const details = action.details ?? {};
          const stats = details.stats ?? {};
          const costs =
            Object.entries(details.costs ?? {})
              .filter(([, amount]) => amount > 0)
              .map(([id, amount]) => `${amount} ${id}`)
              .join(" · ") || "Gratuit";
          const unavailable = details.unavailableReason;
          return `<article class="recruit-option${unavailable ? " is-unavailable" : ""}"><div><strong>${details.name ?? action.label}</strong><span>${details.available ?? 0} recrue(s) disponible(s)</span></div><p>ATQ ${stats.attack ?? "?"} · DÉF ${stats.defense ?? "?"} · VIT ${stats.speed ?? "?"} · POR ${stats.range ?? "?"} · MOR ${stats.morale ?? "?"}</p>${unavailable ? `<p class="recruit-unavailable" role="status">${unavailable}</p>` : ""}<footer><span>${costs}</span><button type="button" data-action="${action.id}" ${unavailable ? `disabled title="${unavailable}"` : ""}>Recruter</button></footer></article>`;
        })
        .join("")}</div></div>`
    : "";
  const reserveMenu = reserveActions.length
    ? `<div class="location-action-menu" data-action-menu="reserves" hidden><div class="action-menu-heading"><h4>Gérer les stocks</h4><button type="button" class="secondary-button" data-close-action-menu>Fermer</button></div>${renderStockSlots(reserveActions)}</div>`
    : "";
  const improvementMenu = improvementActions.length
    ? `<div class="location-action-menu" data-action-menu="improvements" hidden><div class="action-menu-heading"><h4>Améliorations</h4><button type="button" class="secondary-button" data-close-action-menu>Fermer</button></div><div class="recruit-options">${improvementActions.map(improvementCard).join("")}</div></div>`
    : "";
  const actions = location.nearby
    ? actionButtons || "Aucune action disponible."
    : `<span>Approchez à moins de ${Math.round(location.interactionRadius)} m pour interagir.</span>`;
  const population =
    location.populationCapacity === "inconnue"
      ? value(location.population)
      : `${value(location.population)} / ${value(location.populationCapacity)}`;
  const description = compactLocationDescription(location.description);
  element.innerHTML = `<section class="location-detail location-detail--compact"><div class="detail-nav"><button type="button" data-back>← Monde</button><span>${index + 1} / ${total}</span><button type="button" data-map>Afficher sur la carte</button></div><header class="location-overview"><div class="location-detail-art" aria-hidden="true"><img src="${LOCATION_ART[artType(location.type)]}" alt=""></div><div class="location-overview-body"><div class="location-heading"><div><p class="eyebrow">${location.nature} · information ${location.knowledgeLevel}/3</p><h2>${location.name}</h2></div><span>${Math.round(location.distance)} m</span></div><div class="location-header-facts"><span>Niv. <strong>${value(location.level)}</strong></span><span>Population <strong>${population}</strong></span><span class="world-owner"><i style="--owner-color:${location.owner.color}"></i><strong>${location.owner.name}</strong></span></div><p class="location-description">${description}</p>${campProgress(location.campDevelopment)}</div></header><section class="location-actions"><h3>Actions</h3><div class="world-actions">${actions}</div>${location.nearby ? recruitMenu + reserveMenu + improvementMenu : ""}</section><section class="location-resources"><h3>Ressources</h3>${resources}</section><section class="location-defense"><h3>Présence et défense</h3>${presences}<h4>Structures défensives</h4>${structures}</section><footer class="detail-pager"><button type="button" data-previous ${index <= 0 ? "disabled" : ""}>← Lieu précédent</button><button type="button" data-next ${index >= total - 1 ? "disabled" : ""}>Lieu suivant →</button></footer></section>`;
  element
    .querySelectorAll('[data-action-menu="recruit"] .recruit-option')
    .forEach((card, index) => {
      const typeId = recruitActions[index]?.id.split(":")[1];
      if (typeId)
        card.insertAdjacentHTML(
          "afterbegin",
          `<div class="recruit-illustration" aria-hidden="true">${renderUnitTypeIcon({ typeId })}</div>`,
        );
    });
  const defenseSection = element.querySelector(
    ".location-detail > section:last-of-type",
  );
  const slotCount = Number.isInteger(location.defense.slots)
    ? location.defense.slots
    : 0;
  if (defenseSection) {
    const occupied = location.defense.units.slice(0, slotCount);
    const reinforcements = location.defense.reinforcements ?? [];
    const slots = Array.from(
      { length: slotCount },
      (_, index) => occupied[index] ?? null,
    );
    defenseSection.insertAdjacentHTML(
      "beforeend",
      `<button type="button" class="garrison-summary" data-open-garrison ${onOpenGarrison && location.nearby && location.relation !== "enemy" && slotCount > 0 ? "" : "disabled"}><span><strong>Défense</strong><small>${occupied.length}/${slotCount} slots · ${reinforcements.length} renfort(s)</small></span><span class="garrison-summary-slots">${slots.map((unit) => `<i class="${unit ? "is-occupied" : ""}" title="${unit ? unit.name : "Slot vide"}">${unit ? "⚔" : "＋"}</i>`).join("") || "<em>Aucun slot</em>"}</span>${reinforcements.length ? `<span class="garrison-reinforcements">${reinforcements.map((unit) => `<i>♟ ${unit.quantity} ${unit.name}${unit.heroName ? ` · ${unit.heroName}` : ""}</i>`).join("")}</span>` : ""}<small>${location.relation === "enemy" ? "Forces ennemies observées" : location.relation === "neutral" ? "Forces neutres observées" : location.nearby ? "Touchez pour gérer la garnison" : "Approchez-vous pour gérer la garnison"}</small></button>`,
    );
    element
      .querySelector("[data-open-garrison]")
      ?.addEventListener("click", () => onOpenGarrison?.());
  }
  element.querySelector("[data-back]").onclick = onBack;
  element.querySelector("[data-map]").onclick = onShowMap;
  element.querySelector("[data-previous]").onclick = onPrevious;
  element.querySelector("[data-next]").onclick = onNext;
  const detailNav = element.querySelector(".detail-nav");
  const backButton = element.querySelector("[data-back]");
  const mapButton = element.querySelector("[data-map]");
  const title = element.querySelector(".location-heading h2");
  const titleRow = document.createElement("div");
  detailNav.classList.add("detail-nav--compact");
  backButton.textContent = "←";
  backButton.setAttribute("aria-label", "Retour au monde");
  backButton.title = "Retour au monde";
  titleRow.className = "location-title-row";
  title.before(titleRow);
  titleRow.append(title, mapButton);
  mapButton.textContent = "⌖";
  mapButton.className = "location-title-map secondary-button";
  mapButton.setAttribute(
    "aria-label",
    `Afficher ${location.name} sur la carte`,
  );
  mapButton.title = "Afficher sur la carte";
  const previousButton = element.querySelector("[data-previous]");
  const nextButton = element.querySelector("[data-next]");
  previousButton.textContent = "←";
  previousButton.setAttribute("aria-label", "Localisation précédente");
  previousButton.title = "Localisation précédente";
  nextButton.textContent = "→";
  nextButton.setAttribute("aria-label", "Localisation suivante");
  nextButton.title = "Localisation suivante";
  if (recruitActions.length) {
    const details = recruitActions[0].details;
    const status = document.createElement("p");
    status.className = `recruit-capacity${details.totalAvailable >= details.capacity ? " is-full" : ""}`;
    status.textContent = `Stock total : ${details.totalAvailable}/${details.capacity}${details.totalAvailable >= details.capacity ? " · capacité atteinte" : ""}`;
    element.querySelector(".recruit-options")?.before(status);
  }
  element
    .querySelectorAll("[data-action]")
    .forEach(
      (button) => (button.onclick = () => onAction(button.dataset.action)),
    );
  element.querySelectorAll("[data-open-action-menu]").forEach(
    (button) =>
      (button.onclick = () => {
        const menu = element.querySelector(
          `[data-action-menu="${button.dataset.openActionMenu}"]`,
        );
        element.querySelectorAll("[data-action-menu]").forEach((candidate) => {
          candidate.hidden = candidate !== menu || !candidate.hidden;
        });
        element
          .querySelectorAll("[data-open-action-menu]")
          .forEach((candidate) =>
            candidate.setAttribute(
              "aria-expanded",
              String(candidate === button && !menu.hidden),
            ),
          );
      }),
  );
  element.querySelectorAll("[data-close-action-menu]").forEach(
    (button) =>
      (button.onclick = () => {
        const menu = button.closest("[data-action-menu]");
        menu.hidden = true;
        element
          .querySelector(`[data-open-action-menu="${menu.dataset.actionMenu}"]`)
          ?.setAttribute("aria-expanded", "false");
      }),
  );
  const actionBar = element.querySelector(".location-actions > .world-actions");
  if (activeDetailActionMenu) {
    actionBar.hidden = true;
    const activeMenu = element.querySelector(
      `[data-action-menu="${activeDetailActionMenu}"]`,
    );
    if (activeMenu) activeMenu.hidden = false;
  }
  element.querySelectorAll("[data-open-action-menu]").forEach(
    (button) =>
      (button.onclick = () => {
        activeDetailActionMenu = button.dataset.openActionMenu;
        actionBar.hidden = true;
        element.querySelectorAll("[data-action-menu]").forEach((menu) => {
          menu.hidden = menu.dataset.actionMenu !== activeDetailActionMenu;
        });
      }),
  );
  element.querySelectorAll("[data-close-action-menu]").forEach(
    (button) =>
      (button.onclick = () => {
        activeDetailActionMenu = null;
        button.closest("[data-action-menu]").hidden = true;
        actionBar.hidden = false;
      }),
  );
  bindStockSlots(element, onAction);
  const detail = element.querySelector(".location-detail");
  let swipeStart = null;
  detail.addEventListener(
    "touchstart",
    (event) => {
      if (
        event.touches.length !== 1 ||
        event.target.closest("button,input,select,a")
      )
        return;
      const touch = event.touches[0];
      swipeStart = { x: touch.clientX, y: touch.clientY };
    },
    { passive: true },
  );
  detail.addEventListener(
    "touchend",
    (event) => {
      if (!swipeStart || event.changedTouches.length !== 1) return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - swipeStart.x;
      const deltaY = touch.clientY - swipeStart.y;
      swipeStart = null;
      if (Math.abs(deltaX) < 60 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25)
        return;
      if (deltaX < 0 && index < total - 1) onNext();
      else if (deltaX > 0 && index > 0) onPrevious();
    },
    { passive: true },
  );
  detail.addEventListener("keydown", (event) => {
    if (event.target.closest("input,select")) return;
    if (event.key === "ArrowLeft" && index > 0) onPrevious();
    if (event.key === "ArrowRight" && index < total - 1) onNext();
  });
}

export function compactLocationDescription(value, maximumLength = 150) {
  const text = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (text.length <= maximumLength) return text;
  const excerpt = text.slice(0, Math.max(1, maximumLength - 1));
  const boundary = excerpt.lastIndexOf(" ");
  return `${excerpt.slice(0, boundary > maximumLength * 0.6 ? boundary : excerpt.length).trimEnd()}…`;
}

function serviceActionButton(action) {
  const costs = Object.entries(action.details?.costs ?? {})
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => `${amount} ${id}`)
    .join(" · ");
  const unavailable = action.details?.unavailableReason;
  return `<button type="button" data-action="${action.id}" ${unavailable ? `disabled title="${unavailable}"` : ""}><span>${action.label}</span>${costs ? `<small>${costs}</small>` : ""}${unavailable ? `<small>${unavailable}</small>` : ""}</button>`;
}

function improvementCard(action) {
  const details = action.details ?? {};
  const costs = Object.entries(details.costs ?? {})
    .map(([id, amount]) => `${amount} ${id}`)
    .join(" · ");
  return `<article class="recruit-option"><div><strong>${action.label}</strong><span>${details.slotType === "fundamental" ? "Fondation" : "Développement"}</span></div><p>${details.description ?? ""}</p><footer><span>${costs}</span><button type="button" data-action="${action.id}">Construire</button></footer></article>`;
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
  return `<div class="camp-progress"><strong>${development.experience}/${development.experienceRequired} XP</strong><span>${development.slots.used}/${development.slots.maximum} emplacements de développement</span>${blockers.length ? `<small>${blockers.join(" · ")}</small>` : development.levelUp.eligible ? "<small>Prêt à évoluer</small>" : ""}</div>`;
}

function card(location) {
  const illustration = `<img src="${LOCATION_ART[artType(location.type)]}" alt="">`;
  const facts = [
    location.level !== null && location.level !== undefined
      ? `Niv. ${location.level}`
      : null,
    location.population !== null && location.population !== undefined
      ? `${location.population} hab.`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `<article class="world-card" data-relation="${location.relation}" data-location-card="${location.id}"><div class="world-illustration" aria-hidden="true">${illustration}</div><div class="world-card__content"><div class="world-card__heading"><p class="eyebrow">${location.nature}</p><span class="world-distance">${Math.round(location.distance)} m</span></div><h3>${location.name}</h3><div class="world-card__meta"><p class="world-owner"><i style="--owner-color:${location.owner.color}"></i>${location.owner.name}</p>${facts ? `<span>${facts}</span>` : ""}</div></div><button type="button" class="world-map-button secondary-button" data-show-map="${location.id}" aria-label="Afficher ${location.name} sur la carte" title="Afficher sur la carte">⌖</button></article>`;
}

function artType(type) {
  return LOCATION_ART[type] ? type : "quest";
}
