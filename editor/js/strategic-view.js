import { renderStructuredField } from "./structured-fields.js";
import { createStrategicEvent, addStrategicBlock } from "./strategic-model.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function createStrategicView({ element, getProject, changed, notify }) {
  const jsonField = (label, path, value, help) =>
    `<div class="field">${renderStructuredField(value, path, label)}<p class="help">${escape(help)}</p></div>`;
  function render() {
    const project = getProject();
    element.innerHTML =
      `<p class="help">Créez un modèle réutilisable : conseil physique, vote d’une stratégie parmi au moins trois et vote du stratège. Tous préparent les défis ; le stratège commande depuis l’arrière par messagers GA. Conception uniquement : exécution tactique serveur à développer.</p><button class="button primary" data-new-event>+ Nouvel événement stratégique</button>` +
      (project.strategicEvents ?? [])
        .map(
          (
            event,
            index,
          ) => `<article class="campaign-node"><h3>${escape(event.title)}</h3>
      <label class="field"><span>Nom</span><input data-strategic-path='${JSON.stringify(["strategicEvents", index, "title"])}' value="${escape(event.title)}"></label>
      <label class="field"><span>Narration</span><textarea data-strategic-path='${JSON.stringify(["strategicEvents", index, "description"])}'>${escape(event.description)}</textarea></label>
      <label class="field"><span>Crédits de stratégie par joueur</span><input type="number" min="0" data-number data-strategic-path='${JSON.stringify(["strategicEvents", index, "strategyCreditsPerPlayer"])}' value="${event.strategyCreditsPerPlayer}"></label><p>Conseil physique · deux votes · messagers GA · assaut simulé sans GA ennemi</p>
      <button class="button" data-add-strategy="${index}">+ Ajouter une stratégie</button>
      ${event.strategies
        .map(
          (
            strategy,
            si,
          ) => `<details open><summary>${escape(strategy.title)}</summary><label class="field"><span>Nom de stratégie</span><input data-strategic-path='${JSON.stringify(["strategicEvents", index, "strategies", si, "title"])}' value="${escape(strategy.title)}"></label><label class="field"><span>Préparation (secondes)</span><input type="number" min="1" data-number data-strategic-path='${JSON.stringify(["strategicEvents", index, "strategies", si, "preparationSeconds"])}' value="${strategy.preparationSeconds}"></label>
      ${jsonField("Défis et possibilités débloquées", ["strategicEvents", index, "strategies", si, "challenges"], strategy.challenges, 'Exemple : [{"id":"reperage","questId":"quete-1","actionId":"atteindre-1","strategyCost":1,"requirements":[{"type":"class","id":"eclaireur","minimum":1}]}]. Types de prérequis : class, unit, authority, command, resource, equipment, improvement. Les mécaniques coopératives sont définies sur les actions référencées.')}</details>`,
        )
        .join("")}
      ${jsonField("Positions du terrain", ["strategicEvents", index, "positions"], event.positions, "Chaque position référence un locationSlotId du monde. Rôles : strategist à l’arrière, ally sur le terrain.")}
      ${jsonField("Phases, informations et ordres", ["strategicEvents", index, "phases"], event.phases, "Description de conception en JSON : informations au stratège, ordres, fenêtres en secondes et positions concernées. Cette rubrique ne déclenche aucune simulation.")}
      ${jsonField("Issues du bloc", ["strategicEvents", index, "outcomes"], event.outcomes, "Identifiants des résultats utilisés pour les sorties dans le scénario.")}
      <button class="button" data-add-strategic="${escape(event.id)}">+ Utiliser comme bloc de scénario</button><button class="button" data-delete-event="${index}">Supprimer le modèle et ses blocs</button></article>`,
        )
        .join("");
  }
  element.addEventListener("change", (event) => {
    const target = event.target;
    if (!target.dataset.strategicPath) return;
    try {
      const path = JSON.parse(target.dataset.strategicPath),
        key = path.pop();
      const parent = path.reduce((data, key) => data[key], getProject());
      parent[key] = target.hasAttribute("data-json")
        ? JSON.parse(target.value)
        : target.hasAttribute("data-number")
          ? Number(target.value)
          : target.value;
      changed(true, false);
    } catch (issue) {
      notify(issue.message, true);
    }
  });
  element.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const project = getProject();
    if (button.hasAttribute("data-new-event")) createStrategicEvent(project);
    else if (button.hasAttribute("data-add-strategy")) {
      const model = project.strategicEvents[Number(button.dataset.addStrategy)];
      let i = 1;
      while (model.strategies.some((s) => s.id === `strategie-${i}`)) i++;
      model.strategies.push({
        id: `strategie-${i}`,
        title: "Nouvelle stratégie",
        preparationSeconds: 1800,
        challenges: [],
      });
    } else if (button.dataset.addStrategic) {
      addStrategicBlock(project, button.dataset.addStrategic);
      notify("Bloc ajouté dans Scénario & quêtes.");
    } else if (button.hasAttribute("data-delete-event")) {
      const [removed] = project.strategicEvents.splice(
        Number(button.dataset.deleteEvent),
        1,
      );
      project.strategicBlocks = (project.strategicBlocks ?? []).filter(
        (block) => block.eventId !== removed.id,
      );
    } else return;
    changed(true);
  });
  return { render };
}
