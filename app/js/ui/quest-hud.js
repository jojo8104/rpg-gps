export function buildQuestHudModel({ quest, placement = null, actionSlotId = null } = {}) {
  if (!quest) return null;
  const activeObjective = quest.objectives.find((objective) => objective.state === "active") ?? null;
  const current = placement ? Math.max(0, Math.round(placement.distanceMeters ?? 0)) : null;
  const target = placement ? Math.max(1, Math.round(placement.minimumDistanceMeters ?? 0)) : null;
  const ready = Boolean(actionSlotId && placement?.status === "ready");
  return { id: quest.id, title: quest.title, summary: quest.description, objective: activeObjective?.text ?? "Quête terminée", current, target, progressPercent: placement ? Math.min(100, current / target * 100) : null, ready, actionLabel: ready ? actionLabel(activeObjective, actionSlotId) : null };
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

export function renderQuestHud({ element, model, onAction }) {
  if (!element) return;
  element.hidden = !model;
  if (!model) { element.replaceChildren(); return; }
  const progress = model.progressPercent === null ? "" : `<div class="quest-hud__progress" role="progressbar" aria-label="Progression de la quête" aria-valuemin="0" aria-valuemax="${model.target}" aria-valuenow="${model.current}"><span style="width:${model.progressPercent}%"></span></div><p class="quest-hud__distance">${model.current} / ${model.target} m parcourus</p>`;
  element.classList.toggle("is-ready", model.ready);
  element.innerHTML = `<p class="eyebrow">Quête en cours</p><strong>${escapeHtml(model.title)}</strong><p class="quest-hud__summary">${escapeHtml(model.summary)}</p><p class="quest-hud__objective"><span aria-hidden="true">◎</span> ${escapeHtml(model.objective)}</p>${progress}${model.ready ? `<button type="button" data-quest-action>${escapeHtml(model.actionLabel)}</button>` : ""}`;
  element.querySelector("[data-quest-action]")?.addEventListener("click", onAction);
}

function actionLabel(objective, slotId) {
  if (objective?.trigger?.label) return objective.trigger.label;
  if (objective?.trigger?.type === "locationPlaced") return slotId.includes("camp") ? "Placer le camp" : "Placer le lieu";
  return objective?.text ?? "Continuer";
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }
