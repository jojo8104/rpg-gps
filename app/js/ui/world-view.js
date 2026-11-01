import { patchLiveElement } from "./live-dom.js";
import { formatInteger } from "./number-format.js";
import { bindStockSlots, renderStockSlots } from "./stock-slots-view.js";
import { renderUnitTypeIcon } from "./unit-icon.js";

const detailSessions = new WeakMap();

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
  detailSessions.set(element, {
    locationId: location.id,
    options: {
      index,
      total,
      onBack,
      onPrevious,
      onNext,
      onShowMap,
      onAction,
      onOpenGarrison,
    },
  });
  if (activeDetailLocationId !== location.id) {
    activeDetailLocationId = location.id;
    activeDetailActionMenu = null;
  }
  if (initialActionMenu) activeDetailActionMenu = initialActionMenu;
  const value = (input) =>
    input === null || input === undefined || input === ""
      ? "inconnue"
      : formatInteger(input);
  const list = (items, render, empty = "Aucune information") =>
    items.length
      ? `<ul>${items.map(render).join("")}</ul>`
      : `<p class="text-muted">${empty}</p>`;
  const resourceIds = [
    ...new Set([...location.production.map((item) => item.id)]),
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
      return `<li data-live-key="${id}"><span>${id}${production === undefined ? "" : ` <small>(+${value(production)}/cycle)</small>`}</span><strong>${value(stock)}/${value(capacity)}</strong></li>`;
    },
    "Aucune ressource connue",
  );
  const presences = list(
    location.presences,
    (hero) => {
      const army = hero.army?.length
        ? ` · Armée : ${hero.army.map((unit) => `${formatInteger(unit.quantity)} ${unit.type}`).join(", ")}`
        : "";
      const stats = hero.stats
        .map(
          (stat) =>
            `${stat.id}: ${stat.assessment}${stat.value === null ? "" : ` (${formatInteger(stat.value)})`}`,
        )
        .join(" · ");
      return `<li><span>${hero.label}</span><strong>${stats || "Présence détectée"}${army}</strong></li>`;
    },
    "Aucun autre héros connu",
  );
  const improvements = location.improvements ?? [];
  const freeImprovementSlots = location.improvementSlots?.free ?? 0;
  const improvementGallery =
    improvements.length || freeImprovementSlots > 0
      ? `<section class="location-improvements" aria-labelledby="location-improvements-title"><h3 id="location-improvements-title">Bâtiments et services</h3><div class="improvement-tile-grid">${improvements.map((entry) => improvementTile(entry)).join("")}${Array.from({ length: freeImprovementSlots }, (_, index) => emptyImprovementTile(index + 1)).join("")}</div></section>`
      : "";
  const defenseStructures = location.defense.structures ?? [];
  const freeDefenseSlots = location.defense.improvementSlots?.free ?? 0;
  const defenseImprovementGallery =
    defenseStructures.length || freeDefenseSlots > 0
      ? `<div class="location-improvements location-improvements--defense"><h4>Structures défensives</h4><div class="improvement-tile-grid">${defenseStructures.map((entry) => improvementTile(entry, { defensive: true })).join("")}${Array.from({ length: freeDefenseSlots }, (_, index) => emptyImprovementTile(index + 1, "défensif")).join("")}</div></div>`
      : "";
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
    ? `<div class="location-action-menu" data-action-menu="recruit" hidden><div class="action-menu-heading"><button type="button" class="secondary-button interaction-menu-back" data-close-action-menu>← Retour à la localisation</button><h4>Recruter une unité</h4></div><div class="recruit-options">${recruitActions
        .map((action) => {
          const details = action.details ?? {};
          const stats = details.stats ?? {};
          const costs =
            Object.entries(details.costs ?? {})
              .filter(([, amount]) => amount > 0)
              .map(([id, amount]) => `${formatInteger(amount)} ${id}`)
              .join(" · ") || "Gratuit";
          const unavailable = details.unavailableReason;
          return `<article data-live-key="${action.id}" class="recruit-option${unavailable ? " is-unavailable" : ""}"><div><strong>${details.name ?? action.label}</strong><span>${formatInteger(details.available ?? 0)} recrue(s) disponible(s)</span></div><p>ATQ ${formatInteger(stats.attack ?? "?")} · DÉF ${formatInteger(stats.defense ?? "?")} · VIT ${formatInteger(stats.speed ?? "?")} · POR ${formatInteger(stats.range ?? "?")} · MOR ${formatInteger(stats.morale ?? "?")}</p>${unavailable ? `<p class="recruit-unavailable" role="status">${unavailable}</p>` : ""}<footer><span>${costs}</span><button type="button" data-action="${action.id}" ${unavailable ? `disabled title="${unavailable}"` : ""}>Recruter</button></footer></article>`;
        })
        .join("")}</div></div>`
    : "";
  const reserveMenu = reserveActions.length
    ? `<div class="location-action-menu" data-action-menu="reserves" hidden><div class="action-menu-heading"><button type="button" class="secondary-button interaction-menu-back" data-close-action-menu>← Retour à la localisation</button><h4>Gérer les stocks</h4></div>${renderStockSlots(reserveActions)}</div>`
    : "";
  const improvementMenu = `<div class="location-action-menu" data-action-menu="improvements" hidden><div class="action-menu-heading"><button type="button" class="secondary-button interaction-menu-back" data-close-action-menu>← Retour à la localisation</button><h4>Améliorations</h4></div><div class="improvement-options">${renderImprovementOptions(improvementActions)}</div></div>`;
  const actions = location.nearby
    ? actionButtons || "Aucune action disponible."
    : `<span class="location-distance-notice">Approchez à moins de ${Math.round(location.interactionRadius)} m pour interagir.</span>`;
  const population =
    location.populationCapacity === "inconnue"
      ? value(location.population)
      : `${value(location.population)} / ${value(location.populationCapacity)}`;
  const description = compactLocationDescription(location.description);
  const defenseFrame = defenseFrameClass(location.defense.structures);
  element.innerHTML = `<section class="location-detail location-detail--compact"><div class="detail-nav"><button type="button" data-back>← Carte</button><span>${index + 1} / ${total}</span><button type="button" data-map>Afficher sur la carte</button></div><header class="location-overview"><div class="location-detail-art${defenseFrame ? ` ${defenseFrame}` : ""}" aria-hidden="true"><img src="${location.visual?.illustration ?? location.visual?.icon ?? LOCATION_ART[artType(location.type)]}" alt=""></div><div class="location-overview-body"><div class="location-heading"><div><p class="eyebrow">${location.nature} · information ${location.knowledgeLevel}/3</p><h2>${location.name}</h2></div><span>${Math.round(location.distance)} m</span></div><div class="location-header-facts"><span>Niv. <strong>${value(location.level)}</strong></span><span>Population <strong>${population}</strong></span><span class="world-owner"><i style="--owner-color:${location.owner.color}"></i><strong>${location.owner.name}</strong></span></div><p class="location-description">${description}</p>${campProgress(location.relation === "owned" ? location.campDevelopment : null)}${improvementGallery}</div></header><section class="location-actions"><h3>Actions</h3><div class="world-actions">${actions}</div>${location.nearby ? recruitMenu + reserveMenu + improvementMenu : ""}</section><section class="location-resources"><h3>Ressources</h3>${resources}</section><section class="location-defense"><h3>Présence et défense</h3>${defenseImprovementGallery}${presences}</section><footer class="detail-pager"><button type="button" data-previous ${index <= 0 ? "disabled" : ""}>← Lieu précédent</button><button type="button" data-next ${index >= total - 1 ? "disabled" : ""}>Lieu suivant →</button></footer><button type="button" class="location-return-map" data-return-map><strong>↑ Retour à la carte</strong><small>Touchez ou glissez vers le haut</small></button></section>`;
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
      `<button type="button" class="garrison-summary" data-open-garrison ${onOpenGarrison && location.nearby && location.relation !== "enemy" && slotCount > 0 ? "" : "disabled"}><span><strong>Garnison</strong><small>${occupied.length}/${slotCount} slots · ${reinforcements.length} renfort(s)</small></span><span class="garrison-summary-slots">${slots.map((unit) => `<i class="${unit ? "is-occupied" : ""}" title="${unit ? unit.name : "Slot vide"}">${unit ? "⚔" : "＋"}</i>`).join("") || "<em>Aucun slot</em>"}</span>${reinforcements.length ? `<span class="garrison-reinforcements">${reinforcements.map((unit) => `<i>♟ ${formatInteger(unit.quantity)} ${unit.name}${unit.heroName ? ` · ${unit.heroName}` : ""}</i>`).join("")}</span>` : ""}<small>${location.relation === "enemy" ? "Forces ennemies observées" : location.relation === "neutral" ? "Forces neutres observées" : location.nearby ? "Touchez pour gérer la garnison" : "Approchez-vous pour gérer la garnison"}</small></button>`,
    );
    element
      .querySelector("[data-open-garrison]")
      ?.addEventListener("click", () => onOpenGarrison?.());
  }
  element.querySelector("[data-back]").onclick = onBack;
  bindLocationMapReturn(element.querySelector("[data-return-map]"), onBack);
  element.querySelector("[data-map]").onclick = onShowMap;
  element.querySelector("[data-previous]").onclick = onPrevious;
  element.querySelector("[data-next]").onclick = onNext;
  bindImprovementInfo(element);
  const detailNav = element.querySelector(".detail-nav");
  const backButton = element.querySelector("[data-back]");
  const mapButton = element.querySelector("[data-map]");
  const title = element.querySelector(".location-heading h2");
  const titleRow = document.createElement("div");
  detailNav.classList.add("detail-nav--compact");
  backButton.textContent = "←";
  backButton.setAttribute("aria-label", "Retour à la carte");
  backButton.title = "Retour à la carte";
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
    status.textContent = `Stock total : ${formatInteger(details.totalAvailable)}/${formatInteger(details.capacity)}${details.totalAvailable >= details.capacity ? " · capacité atteinte" : ""}`;
    element.querySelector(".recruit-options")?.before(status);
  }
  element
    .querySelectorAll("[data-action]")
    .forEach(
      (button) =>
        (button.onclick = async () => await onAction(button.dataset.action)),
    );
  const detail = element.querySelector(".location-detail");
  const actionBar = element.querySelector(".location-actions > .world-actions");
  if (activeDetailActionMenu) {
    const activeMenu = element.querySelector(
      `[data-action-menu="${activeDetailActionMenu}"]`,
    );
    if (activeMenu) {
      actionBar.hidden = true;
      detail.classList.add("is-interaction-open");
      activeMenu.hidden = false;
    } else activeDetailActionMenu = null;
  }
  element.querySelectorAll("[data-open-action-menu]").forEach(
    (button) =>
      (button.onclick = () => {
        activeDetailActionMenu = button.dataset.openActionMenu;
        actionBar.hidden = true;
        detail.classList.add("is-interaction-open");
        element.querySelectorAll("[data-action-menu]").forEach((menu) => {
          menu.hidden = menu.dataset.actionMenu !== activeDetailActionMenu;
        });
      }),
  );
  element.querySelectorAll("[data-open-improvement-menu]").forEach(
    (button) =>
      (button.onclick = () => {
        const menu = element.querySelector('[data-action-menu="improvements"]');
        if (!menu) {
          element
            .querySelector(".location-distance-notice")
            ?.scrollIntoView({ block: "center" });
          return;
        }
        activeDetailActionMenu = "improvements";
        actionBar.hidden = true;
        detail.classList.add("is-interaction-open");
        element.querySelectorAll("[data-action-menu]").forEach((item) => {
          item.hidden = item !== menu;
        });
      }),
  );
  element.querySelectorAll("[data-close-action-menu]").forEach(
    (button) =>
      (button.onclick = () => {
        activeDetailActionMenu = null;
        button.closest("[data-action-menu]").hidden = true;
        actionBar.hidden = false;
        detail.classList.remove("is-interaction-open");
      }),
  );
  bindStockSlots(element, onAction);
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
    .map(
      ([id, amount]) =>
        `${formatInteger(amount)} ${id}${action.details?.payment ? ` : ${formatInteger(action.details.payment.fromLocation[id])} du lieu + ${formatInteger(action.details.payment.fromBag[id])} du bagage` : ""}`,
    )
    .join(" · ");
  const unavailable = action.details?.unavailableReason;
  return `<button type="button" data-action="${action.id}" ${unavailable ? `disabled title="${unavailable}"` : ""}><span>${action.label}</span>${costs ? `<small>${costs}</small>` : ""}${unavailable ? `<small>${unavailable}</small>` : ""}</button>`;
}

export function renderImprovementOptions(actions) {
  const progression = actions.filter(
    (action) => action.details?.progressionRequirements?.length,
  );
  const optional = actions.filter(
    (action) => !action.details?.progressionRequirements?.length,
  );
  const section = (title, entries, key) =>
    entries.length
      ? `<section class="improvement-group" data-live-key="${key}"><h5>${title}</h5>${entries.map(improvementCard).join("")}</section>`
      : "";
  return (
    section("Pour évoluer", progression, "progression") +
      section(
        "Autres améliorations possibles à ce stade",
        optional,
        "optional",
      ) ||
    '<p class="text-muted">Aucune amélioration disponible actuellement.</p>'
  );
}

export function improvementCard(action) {
  const details = action.details ?? {};
  const missingIds = new Set(
    (details.missingResources ?? []).map((entry) => entry.id),
  );
  const costs = Object.entries(details.costs ?? {})
    .map(([id, amount]) => {
      const available = details.availableResources?.[id] ?? 0;
      return `<span class="improvement-cost${missingIds.has(id) ? " is-missing" : ""}">${formatInteger(amount)} ${id}<small>${formatInteger(available)} disponible${available > 1 ? "s" : ""}</small>${details.payment ? `<small>${formatInteger(details.payment.fromLocation[id])} du lieu + ${formatInteger(details.payment.fromBag[id])} du bagage</small>` : ""}</span>`;
    })
    .join("");
  const unavailable = missingIds.size > 0 || Boolean(details.unavailableReason);
  const progression = (details.progressionRequirements ?? [])
    .map((requirement) =>
      requirement.kind === "required"
        ? `Requis pour ${requirement.label} : niveau ${requirement.level}`
        : `Au choix pour ${requirement.label} : nouvelle catégorie de développement`,
    )
    .join(" · ");
  return `<article data-live-key="${action.id}" class="improvement-option${unavailable ? " is-unavailable" : ""}"><div><strong>${action.label}</strong><span>${details.reservedSlot ? "Emplacement réservé aux prérequis" : details.slotType === "fundamental" ? "Fondation" : "Développement"}</span></div><p>${details.description ?? ""}</p>${progression ? `<p class="improvement-progression">${progression}</p>` : ""}<footer><div class="improvement-costs">${costs}</div><button type="button" data-action="${action.id}" ${unavailable ? 'disabled aria-disabled="true"' : ""}>${details.currentLevel > 0 ? "Améliorer" : "Construire"}</button></footer>${details.unavailableReason ? `<p class="improvement-missing-summary">${details.unavailableReason}</p>` : ""}${missingIds.size > 0 ? `<p class="improvement-missing-summary">Ressources manquantes : ${(details.missingResources ?? []).map((entry) => `${formatInteger(entry.missing)} ${entry.id}`).join(" · ")}</p>` : ""}</article>`;
}
function reserveBalanceForm(action) {
  const details = action.details ?? {};
  return `<form class="reserve-balance" data-reserve-action="${action.id}" data-total="${details.total}"><strong>${details.resourceName}</strong><div class="reserve-balance__amounts"><span>Lieu <output data-location-amount>${formatInteger(details.locationAmount)}</output></span><span>Héros <output data-hero-amount>${formatInteger(details.heroAmount)}</output></span></div><input aria-label="Répartition de ${details.resourceName}" type="range" min="0" max="${details.total}" value="${details.heroAmount}" step="1" /><button type="submit">Appliquer</button></form>`;
}
function updateReserveBalance(input) {
  const form = input.closest("[data-reserve-action]");
  const heroAmount = Number(input.value);
  form.querySelector("[data-hero-amount]").value = heroAmount;
  form.querySelector("[data-location-amount]").value = formatInteger(
    Number(form.dataset.total) - heroAmount,
  );
}
function campProgress(development) {
  if (!development) return "";
  const blockers = development.levelUp.blockers ?? [];
  return `<div class="camp-progress"><div class="location-xp-bar" role="progressbar" aria-label="Expérience du lieu" aria-valuemin="0" aria-valuemax="${development.experienceRequired}" aria-valuenow="${development.experience}"><i style="width:${Math.min(100, Math.max(0, (development.experience / Math.max(1, development.experienceRequired)) * 100))}%"></i><strong>${formatInteger(development.experience)}/${formatInteger(development.experienceRequired)}</strong></div><span>${development.slots.used}/${formatInteger(development.slots.maximum)} emplacements de spécialisation occupés</span>${development.reservedSlots ? `<span>${development.reservedSlots.used}/${development.reservedSlots.maximum} emplacements réservés aux prérequis</span>` : ""}${blockers.length ? `<small>${blockers.join(" · ")}</small>` : development.levelUp.eligible ? "<small>Prêt à évoluer</small>" : ""}</div>`;
}

function card(location) {
  const illustration = `<img src="${location.visual?.illustration ?? location.visual?.icon ?? LOCATION_ART[artType(location.type)]}" alt="">`;
  const facts = [
    location.level !== null && location.level !== undefined
      ? `Niv. ${location.level}`
      : null,
    location.population !== null && location.population !== undefined
      ? `${formatInteger(location.population)} hab.`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const improvementSummary = location.improvements ?? [];
  return `<article class="world-card" data-relation="${location.relation}" data-location-card="${location.id}"><div class="world-illustration" aria-hidden="true">${illustration}</div><div class="world-card__content"><div class="world-card__heading"><p class="eyebrow">${location.nature}</p><span class="world-distance">${Math.round(location.distance)} m</span></div><h3>${location.name}</h3><div class="world-card__meta"><p class="world-owner"><i style="--owner-color:${location.owner.color}"></i>${location.owner.name}</p>${facts ? `<span>${facts}</span>` : ""}</div>${
    improvementSummary.length
      ? `<div class="improvement-summary" aria-label="${improvementSummary.length} amélioration(s)">${improvementSummary
          .slice(0, 8)
          .map(
            (entry) =>
              `<span title="${entry.name}">${improvementIcon(entry.id)}</span>`,
          )
          .join(
            "",
          )}${improvementSummary.length > 8 ? `<small>+${improvementSummary.length - 8}</small>` : ""}</div>`
      : ""
  }</div><button type="button" class="world-map-button secondary-button" data-show-map="${location.id}" aria-label="Afficher ${location.name} sur la carte" title="Afficher sur la carte">⌖</button></article>`;
}

export function improvementIcon(id) {
  const png = {
    housing: "housing.png",
    barricades: "barricades.png",
    depot: "depot.png",
    trading_post: "trading-post.png",
    watch_post: "watch-post.png",
    defense_tower: "defense-tower.png",
    healing_tent: "healing-tent.png",
    hunting_lodge: "hunting-lodge.png",
    prospecting_post: "prospecting-post.png",
    messenger_relay: "messenger-relay.png",
    stable: "stable.png",
    armorers: "armorers.png",
    archery_range: "archery-range.png",
    palisades: "palisades.png",
    palisade: "palisades.png",
    palissade: "palisades.png",
    ramparts: "ramparts.png",
    chapel: "chapel.png",
    habitation: "habitation.png",
    palace: "palace.png",
    houses: "houses.png",
    brewery: "brewery.png",
    military_school: "military-school.png",
    farm: "farm.png",
    forge: "forge.png",
    barracks: "barracks.png",
    magic_academy: "magic-academy.png",
    walls: "walls.png",
    wall: "walls.png",
    tavern: "tavern.png",
  }[id];
  if (png)
    return `<img src="assets/improvements/${png}" alt="" loading="lazy">`;
  return (
    {
      housing: "⛺",
      barricades: "🪵",
      depot: "📦",
      trading_post: "⚖️",
      watch_post: "🔭",
      healing_tent: "⚕️",
      hunting_lodge: "🏹",
      prospecting_post: "🧭",
      messenger_relay: "📯",
      tavern: "🍻",
      forge: "🔥",
      stable: "🐎",
      barracks: "⚔️",
      magic_academy: "🔮",
      armorers: "🛡️",
      archery_range: "🎯",
      palisades: "🪵",
      palisade: "🪵",
      palissade: "🪵",
      walls: "🧱",
      wall: "🧱",
      ramparts: "🏰",
      chapel: "⛪",
      habitation: "🏘️",
      farm: "🌾",
      field: "🌾",
      palace: "👑",
      houses: "🏠",
      brewery: "🍺",
      military_school: "🎖️",
      manor: "🏛️",
      expanded_granary: "🌽",
    }[id] ?? "◆"
  );
}

export function defenseFrameClass(structures = []) {
  const ids = new Set(structures.map((entry) => entry.id));
  if (["rampart", "ramparts"].some((id) => ids.has(id)))
    return "location-detail-art--ramparts";
  if (
    ["wall", "walls", "tower", "towers", "tour", "tours", "watchtower"].some(
      (id) => ids.has(id),
    )
  )
    return "location-detail-art--walls";
  if (
    ["barricade", "barricades", "palisade", "palissade", "palisades"].some(
      (id) => ids.has(id),
    )
  )
    return "location-detail-art--barricades";
  return "";
}

function improvementTile(entry, { defensive = false } = {}) {
  const name = entry.name ?? entry.type ?? entry.id;
  return `<article data-live-key="${entry.id}" class="improvement-tile${defensive ? " improvement-tile--defense" : ""}"><button type="button" class="improvement-tile__button" data-improvement-info aria-expanded="false" aria-label="Informations sur ${name}"><span class="improvement-tile__art" aria-hidden="true">${improvementIcon(entry.id)}</span><strong>${name}</strong><small>Niv. ${entry.level}</small></button><div class="improvement-popover" role="dialog" aria-label="${name}" hidden><header><strong>${name}</strong><span>Niveau ${entry.level}</span></header><p>${entry.description ?? "Amélioration du lieu."}</p><footer>${entry.dismantling ? '<small class="structure-dismantling">Démontage en cours</small>' : entry.canDismantle ? `<button type="button" class="structure-remove" data-action="dismantle:${entry.id}">Démanteler</button>` : ""}${entry.upgradeActionId ? `<button type="button" data-action="${entry.upgradeActionId}">${entry.upgradeLabel ?? "Améliorer"}</button>` : ""}</footer></div></article>`;
}

function emptyImprovementTile(number, kind = "") {
  return `<button type="button" class="improvement-tile__button improvement-tile__button--empty" data-open-improvement-menu aria-label="Construire dans l’emplacement ${kind ? `${kind} ` : ""}libre ${number}"><span class="improvement-tile__art" aria-hidden="true">＋</span><strong>Emplacement libre</strong><small>Construire</small></button>`;
}

function bindImprovementInfo(element) {
  element.querySelectorAll("[data-improvement-info]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      const popover = button.nextElementSibling;
      const willOpen = popover.hidden;
      element
        .querySelectorAll(".improvement-popover")
        .forEach((item) => (item.hidden = true));
      element
        .querySelectorAll("[data-improvement-info]")
        .forEach((item) => item.setAttribute("aria-expanded", "false"));
      popover.hidden = !willOpen;
      button.setAttribute("aria-expanded", String(willOpen));
    };
  });
  element
    .querySelector(".location-detail")
    ?.addEventListener("click", (event) => {
      if (event.target.closest(".improvement-tile")) return;
      element
        .querySelectorAll(".improvement-popover")
        .forEach((item) => (item.hidden = true));
      element
        .querySelectorAll("[data-improvement-info]")
        .forEach((item) => item.setAttribute("aria-expanded", "false"));
    });
}

function artType(type) {
  return LOCATION_ART[type] ? type : "quest";
}

/** Refresh volatile values without replacing the detail or its open menus. */
export function updateLocationDetail({ element, location }) {
  const session = detailSessions.get(element);
  if (
    !session ||
    session.locationId !== location.id ||
    !element.querySelector(".location-detail")
  )
    return false;
  // Never replace a slot while the player is dragging it.
  if (element.querySelector(".is-dragging")) return true;
  const draft = document.createElement("div");
  renderLocationDetail({ element: draft, location, ...session.options });
  for (const selector of [
    ".location-actions > .world-actions",
    ".location-resources",
    ".camp-progress",
    ".location-header-facts",
    ".recruit-options",
    ".recruit-capacity",
    ".improvement-options",
    ".stock-manager",
  ]) {
    const current = element.querySelector(selector);
    const next = draft.querySelector(selector);
    if (current && next) patchLiveElement(current, next);
    else if (current && !next) current.remove();
  }
  for (const tile of element.querySelectorAll(
    ".improvement-tile[data-live-key]",
  )) {
    const fresh = [
      ...draft.querySelectorAll(".improvement-tile[data-live-key]"),
    ].find((item) => item.dataset.liveKey === tile.dataset.liveKey);
    const footer = tile.querySelector(".improvement-popover footer");
    if (fresh && footer)
      patchLiveElement(
        footer,
        fresh.querySelector(".improvement-popover footer"),
      );
  }
  const availableActions = new Map(
    location.actions.map((action) => [action.id, action]),
  );
  element.querySelectorAll("[data-action]").forEach((button) => {
    button.onclick = () => session.options.onAction(button.dataset.action);
    if (!button.dataset.action.startsWith("dismantle:")) {
      const action = availableActions.get(button.dataset.action);
      button.disabled =
        !location.nearby ||
        !action ||
        Boolean(action.details?.unavailableReason) ||
        (action.details?.missingResources?.length ?? 0) > 0;
    } else button.disabled = !location.nearby || !location.canDismantle;
  });
  element.querySelectorAll("[data-open-action-menu]").forEach((button) => {
    button.onclick = () => {
      activeDetailActionMenu = button.dataset.openActionMenu;
      const menu = element.querySelector(
        `[data-action-menu="${activeDetailActionMenu}"]`,
      );
      if (!menu) return;
      element.querySelector(".location-actions > .world-actions").hidden = true;
      element
        .querySelector(".location-detail")
        .classList.add("is-interaction-open");
      element.querySelectorAll("[data-action-menu]").forEach((item) => {
        item.hidden = item !== menu;
      });
    };
  });
  bindStockSlots(element, session.options.onAction);
  return true;
}

// Le geste démarre sur la poignée uniquement : lire la fiche ne la ferme pas.
export function bindLocationMapReturn(button, onReturn) {
  let start = null;
  button.addEventListener("click", onReturn);
  button.addEventListener(
    "touchstart",
    (event) => {
      start =
        event.touches.length === 1
          ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
          : null;
    },
    { passive: true },
  );
  button.addEventListener("touchcancel", () => {
    start = null;
  });
  button.addEventListener(
    "touchend",
    (event) => {
      const origin = start;
      start = null;
      if (!origin || event.changedTouches.length !== 1 || event.touches.length)
        return;
      const touch = event.changedTouches[0];
      const up = origin.y - touch.clientY;
      if (up < 60 || up <= Math.abs(touch.clientX - origin.x) * 1.25) return;
      event.preventDefault(); // Évite le clic synthétique après le retour.
      event.stopPropagation();
      onReturn();
    },
    { passive: false },
  );
}
