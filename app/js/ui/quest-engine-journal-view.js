import { makeQuestCardsCollapsible } from "./quest-card-view.js";
export function renderQuestEngineJournal(element, view) {
  const labels = {
    active: "En cours",
    completed: "Accomplie",
    failed: "Échouée",
    abandoned: "Abandonnée",
  };
  const instances = view.instances ?? [];
  const active = instances.filter((instance) => instance.status === "active");
  const history = instances.filter((instance) => instance.status !== "active");
  const cards = (entries) =>
    entries
      .map((instance) => {
        const actions = instance.actions.filter(
          (action) => action.status !== "skipped",
        );
        const completed = actions.filter(
          (action) => action.status === "completed",
        ).length;
        return `<article class="quest-card quest-status--${escape(instance.status)}"><small>${labels[instance.status] ?? ""}</small><h3>${escape(instance.title)}</h3><p class="quest-progress-label">${completed}/${actions.length} actions accomplies</p><progress max="${Math.max(1, actions.length)}" value="${completed}" aria-label="Progression de la quête"></progress><ol class="quest-objectives">${instance.actions.map((action) => `<li class="is-${escape(action.status)}">${action.status === "completed" ? "✓" : action.status === "active" ? "○" : action.status === "skipped" ? "—" : "🔒"} ${escape(action.label)}${action.status === "skipped" ? " (chemin écarté)" : ""}</li>`).join("")}</ol>${instance.status === "completed" ? `<p>${escape(instance.completionText ?? "Mission accomplie.")}</p>` : ""}</article>`;
      })
      .join("");
  element.innerHTML = `<div class="quest-journal-summary"><strong>Journal de quêtes</strong><p>${active.length} mission${active.length > 1 ? "s" : ""} en cours</p></div>${cards(active)}${!active.length ? '<p class="quest-empty">Aucune quête en cours. Acceptez une mission auprès de son donneur pour commencer.</p>' : ""}${history.length ? `<h3>Historique</h3>${cards(history)}` : ""}`;
  makeQuestCardsCollapsible(element);
}
function escape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
