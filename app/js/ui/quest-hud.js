export function buildQuestHudModel({ quest, placement = null, actionSlotId = null } = {}) {
  if (!quest) return null;
  const activeObjective = quest.objectives.find((objective) => objective.state === "active") ?? null;
  const current = placement ? Math.max(0, Math.round(placement.distanceMeters ?? 0)) : null;
  const target = placement ? Math.max(1, Math.round(placement.minimumDistanceMeters ?? 0)) : null;
  const ready = Boolean(actionSlotId && placement?.status === "ready");
  return { id: quest.id, title: quest.title, summary: quest.description, objective: activeObjective?.text ?? "Quête terminée", objectives: quest.objectives.map(({ id, text, state }) => ({ id, text, state })), current, target, progressPercent: placement ? Math.min(100, current / target * 100) : null, ready, actionLabel: ready ? actionLabel(activeObjective, actionSlotId) : null };
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

export function renderQuestHud({ element, model, expanded = false, onToggle, onAction }) {
  if (!element) return;
  element.hidden = !model;
  if (!model) { element.replaceChildren(); return; }
  const progress = model.progressPercent === null ? "" : `<div class="quest-hud__progress" role="progressbar" aria-label="Progression : ${model.current} sur ${model.target} mètres" aria-valuemin="0" aria-valuemax="${model.target}" aria-valuenow="${model.current}"><span style="width:${model.progressPercent}%"></span><small>${model.current} / ${model.target} m</small></div>`;
  const details = expanded ? `<div class="quest-hud__details"><strong>${escapeHtml(model.title)}</strong><p class="quest-hud__summary">${escapeHtml(model.summary)}</p><ul>${model.objectives.map((objective) => `<li class="${objective.state === "completed" ? "is-completed" : ""}">${objective.state === "completed" ? "✓" : "○"} ${escapeHtml(objective.text)}</li>`).join("")}</ul></div>` : "";
  element.classList.toggle("is-ready", model.ready);
  element.classList.toggle("is-expanded", expanded);
  element.setAttribute("role", "button"); element.tabIndex = 0; element.setAttribute("aria-expanded", String(expanded));
  element.innerHTML = `<div class="quest-hud__compact"><p class="quest-hud__objective"><span aria-hidden="true">◎</span> ${escapeHtml(model.objective)}</p><span class="quest-hud__chevron" aria-hidden="true">⌄</span></div>${details}${progress}${model.ready ? `<button type="button" data-quest-action>${escapeHtml(model.actionLabel)}</button>` : ""}`;
  element.onclick = (event) => { if (!event.target.closest("button")) onToggle?.(); };
  element.onkeydown = (event) => { if ((event.key === "Enter" || event.key === " ") && event.target === element) { event.preventDefault(); onToggle?.(); } };
  element.querySelector("[data-quest-action]")?.addEventListener("click", onAction);
}

function actionLabel(objective, slotId) {
  if (objective?.trigger?.label) return objective.trigger.label;
  if (objective?.trigger?.type === "locationPlaced") return slotId.includes("camp") ? "Placer le camp" : "Placer le lieu";
  return objective?.text ?? "Continuer";
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }
