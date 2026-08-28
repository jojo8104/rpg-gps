export function buildQuestHudModel({
  quest,
  placement = null,
  actionSlotId = null,
  locations = [],
  deadlines = [],
  now = Date.now(),
} = {}) {
  if (!quest) return null;
  const activeObjective =
    quest.objectives.find((objective) => objective.state === "active") ?? null;
  const current = placement
    ? Math.max(0, Math.round(placement.distanceMeters ?? 0))
    : null;
  const target = placement
    ? Math.max(1, Math.round(placement.minimumDistanceMeters ?? 0))
    : null;
  const distanceFromOrigin = placement
    ? Math.max(0, Math.round(placement.distanceFromOriginMeters ?? 0))
    : null;
  const minimumDistanceFromOrigin = placement
    ? Math.max(0, Math.round(placement.minimumDistanceFromOriginMeters ?? 0))
    : null;
  const ready = Boolean(actionSlotId && placement?.status === "ready");
  const clocks = deadlines
    .filter(
      (deadline) =>
        Number.isFinite(deadline?.expiresAt) &&
        !deadline.completedAt &&
        !deadline.failedAt &&
        !deadline.endedAt,
    )
    .map((deadline) => ({
      id: deadline.id,
      label: deadline.label ?? "Temps restant",
      remainingMs: Math.max(0, deadline.expiresAt - now),
      expired: deadline.expiresAt <= now,
    }));
  return {
    id: quest.id,
    title: quest.title,
    summary: quest.description,
    objective:
      activeObjective?.text ??
      (quest.choices?.length ? "Choisissez votre réponse" : "Quête terminée"),
    objectives: quest.objectives.map(({ id, text, state }) => ({
      id,
      text,
      state,
    })),
    choices: (quest.choices ?? []).map(({ id, label }) => ({ id, label })),
    locations: locations.map(({ id, name }) => ({ id, name })),
    deadlines: clocks,
    current,
    target,
    distanceFromOrigin,
    minimumDistanceFromOrigin,
    progressPercent: placement ? Math.min(100, (current / target) * 100) : null,
    ready,
    actionLabel: ready ? actionLabel(activeObjective, actionSlotId) : null,
  };
}

export function createQuestHud(mapViewElement) {
  const element = document.createElement("aside");
  element.id = "quest-hud";
  element.className = "quest-hud";
  element.setAttribute("aria-live", "polite");
  element.hidden = true;
  mapViewElement.append(element);
  return element;
}

export function renderQuestHud({
  element,
  model,
  expanded = false,
  onToggle,
  onAction,
  onShowLocation,
  onChoice,
}) {
  if (!element) return;
  element.hidden = !model;
  if (!model) {
    element.replaceChildren();
    return;
  }
  const originRequirement =
    model.minimumDistanceFromOrigin > 0
      ? ` · éloignement ${model.distanceFromOrigin} / ${model.minimumDistanceFromOrigin} m`
      : "";
  const progress =
    model.progressPercent === null
      ? ""
      : `<div class="quest-hud__progress" role="progressbar" aria-label="Distance parcourue : ${model.current} sur ${model.target} mètres${originRequirement}" aria-valuemin="0" aria-valuemax="${model.target}" aria-valuenow="${model.current}"><span style="width:${model.progressPercent}%"></span><small>${model.current} / ${model.target} m parcourus${originRequirement}</small></div>`;
  const locationButtons =
    model.locations
      ?.map(
        (location) =>
          `<button type="button" class="quest-location-button secondary-button" data-quest-location="${escapeHtml(location.id)}" aria-label="Afficher ${escapeHtml(location.name)} sur la carte">⌖ ${escapeHtml(location.name)}</button>`,
      )
      .join("") ?? "";
  const choices =
    model.choices
      ?.map(
        (choice) =>
          `<button type="button" class="quest-choice-button" data-quest-choice="${escapeHtml(choice.id)}">${escapeHtml(choice.label)}</button>`,
      )
      .join("") ?? "";
  const deadlines =
    model.deadlines
      ?.map(
        (deadline) =>
          `<p class="quest-hud__deadline${deadline.expired ? " is-expired" : ""}"><span aria-hidden="true">◷</span> ${escapeHtml(deadline.label)} : ${formatRemainingTime(deadline.remainingMs)}</p>`,
      )
      .join("") ?? "";
  const details = expanded
    ? `<div class="quest-hud__details"><strong>${escapeHtml(model.title)}</strong><p class="quest-hud__summary">${escapeHtml(model.summary)}</p><ul>${model.objectives.map((objective) => `<li class="${objective.state === "completed" ? "is-completed" : ""}">${objective.state === "completed" ? "✓" : "○"} ${escapeHtml(objective.text)}</li>`).join("")}</ul>${choices ? `<div class="quest-choice-actions">${choices}</div>` : ""}${locationButtons ? `<div class="quest-location-actions">${locationButtons}</div>` : ""}</div>`
    : "";
  element.classList.toggle("is-ready", model.ready);
  element.classList.toggle("is-expanded", expanded);
  element.setAttribute("role", "button");
  element.tabIndex = 0;
  element.setAttribute("aria-expanded", String(expanded));
  element.innerHTML = `<div class="quest-hud__compact"><div><p class="quest-hud__objective"><span aria-hidden="true">◎</span> ${escapeHtml(model.objective)}</p>${deadlines}</div><span class="quest-hud__chevron" aria-hidden="true">⌄</span></div>${details}${progress}${model.ready ? `<button type="button" data-quest-action>${escapeHtml(model.actionLabel)}</button>` : ""}`;
  element.onclick = (event) => {
    if (!event.target.closest("button")) onToggle?.();
  };
  element.onkeydown = (event) => {
    if (
      (event.key === "Enter" || event.key === " ") &&
      event.target === element
    ) {
      event.preventDefault();
      onToggle?.();
    }
  };
  element
    .querySelector("[data-quest-action]")
    ?.addEventListener("click", onAction);
  element
    .querySelectorAll("[data-quest-location]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        onShowLocation?.(button.dataset.questLocation),
      ),
    );
  element
    .querySelectorAll("[data-quest-choice]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        onChoice?.(button.dataset.questChoice),
      ),
    );
}

function actionLabel(objective, slotId) {
  if (objective?.trigger?.label) return objective.trigger.label;
  if (objective?.trigger?.type === "locationPlaced")
    return slotId.includes("camp") ? "Placer le camp" : "Placer le lieu";
  return objective?.text ?? "Continuer";
}

function formatRemainingTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0
    ? `${minutes} min ${String(remainder).padStart(2, "0")} s`
    : `${remainder} s`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}
