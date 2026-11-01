import {
  ensureCampaign,
  storeCurrentQuest,
  addCampaignQuest,
  switchCampaignQuest,
  linkCampaignQuests,
} from "./campaign-model.js";
import { newProject, uniqueId } from "./project.js";
import { renderFieldRoles } from "./field-help.js";
import { createCampaignGraph } from "./campaign-graph.js";
import { renderStructuredField } from "./structured-fields.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const outcomeName = (value) =>
  ({ success: "Réussite", failure: "Échec", abandoned: "Abandon" })[value] ??
  "Toute issue";
export function createCampaignView({
  element,
  getProject,
  catalog,
  changed,
  notify,
  openGraph,
}) {
  const diagram = createCampaignGraph({ element, getProject, changed, notify });
  const options = (quests) =>
    quests
      .map(
        (quest) =>
          `<option value="${escape(quest.id)}">${escape(quest.title)} · ${escape(quest.id)}</option>`,
      )
      .join("");
  function render() {
    const project = getProject(),
      campaign = ensureCampaign(project);
    const quests = campaign.quests.map((quest) =>
      quest.id === project.quest.id ? project.quest : quest,
    );
    const transitionFields = (quest, index, conditions) =>
      renderStructuredField(
        conditions,
        quest.id === project.quest.id
          ? ["quest", "transitions", index, "conditions"]
          : [
              "campaign",
              "quests",
              campaign.quests.findIndex((entry) => entry.id === quest.id),
              "transitions",
              index,
              "conditions",
            ],
        "Conditions",
        0,
        undefined,
        { project, catalog },
      );
    element.innerHTML = `<p class="help">Regroupez vos quêtes dans un monde commun. Une flèche publie la quête suivante après l’issue choisie ; elle ne l’accepte pas automatiquement.</p>
      <div class="field-row"><label class="field"><span>Identifiant du scénario</span><input data-campaign-field="id" value="${escape(campaign.id)}">${renderFieldRoles(["campaign", "id"])}<small>Identifiant stable pour le catalogue serveur.</small></label><label class="field"><span>Nom du scénario</span><input data-campaign-field="name" value="${escape(campaign.name)}">${renderFieldRoles(["campaign", "name"])}</label></div>
      <label class="field"><span>Introduction du scénario</span><textarea data-campaign-field="intro">${escape(campaign.intro)}</textarea>${renderFieldRoles(["campaign", "intro"])}<small>Contexte présenté au début de l’aventure.</small></label>
      <div class="toolbar-actions"><button class="button primary" data-store-current>+ Ajouter / actualiser la quête ouverte</button><button class="button" data-new-campaign-quest>+ Nouvelle quête du scénario</button></div>
      <div class="field-row" style="margin-top:18px"><label class="field"><span>Ajouter une quête de la bibliothèque</span><select id="campaign-sample">${catalog.samples.map((sample, index) => `<option value="${index}">${escape(sample.title)}</option>`).join("")}</select></label><button class="button small" data-add-campaign-sample ${catalog.samples.length ? "" : "disabled"}>Ajouter au scénario</button></div>
      <p class="help">Importer : un fichier de quête ou de projet peut aussi être ajouté à ce scénario.</p><label class="button small">Importer une quête dans le scénario<input id="campaign-import" type="file" accept=".json,application/json" hidden></label>
      <h3>Quêtes · ${quests.length}</h3><p class="help">Cochez Départ pour les quêtes à publier au lancement. Les autres sont publiées par leurs enchaînements. Chaque quête reste à accepter par le joueur.</p>
      ${diagram.render()}
      <h3>Blocs d’événements stratégiques</h3><p class="help">Ajoutez un modèle depuis Événements stratégiques. Les liens ci-dessous sont des liens de conception, sans exécution serveur actuellement.</p>
      <div class="campaign-graph">${(project.strategicBlocks ?? [])
        .map((block, index) => {
          const event = project.strategicEvents?.find(
            (e) => e.id === block.eventId,
          );
          return `<article class="campaign-node"><strong>⚑ ${escape(event?.title ?? block.eventId)}</strong><label class="field"><span>Après la quête (vide = début)</span><select data-strategic-block="${index}" data-block-key="afterQuestId"><option value="">Début du scénario</option>${quests.map((q) => `<option value="${escape(q.id)}" ${block.afterQuestId === q.id ? "selected" : ""}>${escape(q.title)}</option>`).join("")}</select></label>${(event?.outcomes ?? []).map((outcome) => `<label class="field"><span>${escape(outcome)} →</span><select data-strategic-block="${index}" data-block-outcome="${escape(outcome)}"><option value="">Fin de branche</option>${quests.map((q) => `<option value="${escape(q.id)}" ${block.outcomes[outcome] === q.id ? "selected" : ""}>${escape(q.title)}</option>`).join("")}</select></label>`).join("")}<button class="button small" data-remove-strategic="${index}">Retirer le bloc</button></article>`;
        })
        .join("")}</div>
      <h3>Enchaînements</h3><div class="campaign-links">${quests.flatMap((quest) => (quest.transitions ?? []).map((link, index) => `<div class="campaign-link"><strong>${escape(quest.title)}</strong><span>→ ${outcomeName(link.outcome)} →</span><strong>${escape(quests.find((entry) => entry.id === link.questId)?.title ?? link.questId)}</strong><details class="field-help"><summary>Conditions de cet enchaînement</summary>${transitionFields(quest, index, link.conditions ?? [])}<small>Toutes les conditions doivent être satisfaites ; une liste vide n’ajoute aucune restriction.</small></details><button class="button small" data-remove-transition="${escape(quest.id)}" data-index="${index}">Retirer le lien</button></div>`)).join("") || '<p class="help">Ajoutez un premier enchaînement ci-dessous.</p>'}</div>
      <div class="field-row"><label class="field"><span>Après la quête</span><select id="campaign-from">${options(quests)}</select></label><label class="field"><span>Issue</span><select id="campaign-outcome"><option value="success">Réussite</option><option value="failure">Échec</option><option value="abandoned">Abandon</option></select></label><label class="field"><span>Publier la quête</span><select id="campaign-to">${options(quests)}</select></label></div><button class="button primary" data-add-transition ${quests.length < 2 ? "disabled" : ""}>+ Relier les quêtes</button>
      <p class="help">Enregistrer conserve tout le scénario dans le projet. Valider contrôle toutes les quêtes ; Exporter contient leurs fiches et un manifeste des quêtes de départ. Enregistrer dans le jeu sauvegarde les fichiers et le catalogue. Redémarrez le serveur puis créez une nouvelle partie.</p>`;
    requestAnimationFrame(() => diagram.refresh());
  }
  const source = (id) =>
    id === getProject().quest.id
      ? getProject().quest
      : ensureCampaign(getProject()).quests.find((quest) => quest.id === id);
  element.addEventListener("input", (event) => {
    if (!event.target.dataset.campaignField) return;
    ensureCampaign(getProject())[event.target.dataset.campaignField] =
      event.target.value;
    changed(true, false);
  });
  element.addEventListener("change", async (event) => {
    const target = event.target,
      project = getProject(),
      campaign = ensureCampaign(project);
    try {
      if (target.hasAttribute("data-strategic-block")) {
        const block =
          project.strategicBlocks[Number(target.dataset.strategicBlock)];
        if (target.dataset.blockKey) block.afterQuestId = target.value;
        else if (target.value)
          block.outcomes[target.dataset.blockOutcome] = target.value;
        else delete block.outcomes[target.dataset.blockOutcome];
      } else if (target.dataset.startQuest) {
        const ids = new Set(campaign.initialQuestIds);
        target.checked
          ? ids.add(target.dataset.startQuest)
          : ids.delete(target.dataset.startQuest);
        campaign.initialQuestIds = [...ids];
      } else if (target.dataset.linkConditions) {
        const value = JSON.parse(target.value);
        if (!Array.isArray(value))
          throw new Error("Les conditions doivent être une liste JSON.");
        source(target.dataset.linkConditions).transitions[
          Number(target.dataset.index)
        ].conditions = value;
      } else if (target.id === "campaign-import") {
        if (!target.files[0]) return;
        if (target.files[0].size > 16777216)
          throw new Error("Projet supérieur à 16 Mo.");
        const value = JSON.parse(await target.files[0].text());
        addCampaignQuest(project, value.quest ? value : { quest: value });
      } else return;
      changed(true);
      notify("Scénario actualisé.");
    } catch (issue) {
      notify(issue.message, true);
    }
  });
  element.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const project = getProject(),
      campaign = ensureCampaign(project);
    try {
      if (button.hasAttribute("data-remove-strategic"))
        project.strategicBlocks.splice(
          Number(button.dataset.removeStrategic),
          1,
        );
      else if (button.hasAttribute("data-store-current"))
        storeCurrentQuest(project);
      else if (button.hasAttribute("data-new-campaign-quest")) {
        storeCurrentQuest(project);
        const next = newProject();
        next.quest.id = uniqueId("quete", campaign.quests);
        addCampaignQuest(project, next);
        switchCampaignQuest(project, next.quest.id);
        changed(true);
        openGraph();
        return;
      } else if (button.hasAttribute("data-add-campaign-sample"))
        addCampaignQuest(
          project,
          catalog.samples[
            Number(element.querySelector("#campaign-sample").value)
          ].project,
        );
      else if (button.dataset.openQuest) {
        switchCampaignQuest(project, button.dataset.openQuest);
        changed(true);
        openGraph();
        return;
      } else if (button.dataset.removeQuest) {
        const id = button.dataset.removeQuest;
        campaign.quests = campaign.quests.filter((quest) => quest.id !== id);
        campaign.initialQuestIds = campaign.initialQuestIds.filter(
          (entry) => entry !== id,
        );
        for (const quest of [...campaign.quests, project.quest])
          quest.transitions = (quest.transitions ?? []).filter(
            (entry) => entry.questId !== id,
          );
      } else if (button.dataset.removeTransition)
        source(button.dataset.removeTransition).transitions.splice(
          Number(button.dataset.index),
          1,
        );
      else if (button.hasAttribute("data-add-transition"))
        linkCampaignQuests(
          project,
          element.querySelector("#campaign-from").value,
          element.querySelector("#campaign-to").value,
          element.querySelector("#campaign-outcome").value,
        );
      else return;
      changed(true);
      notify("Scénario actualisé.");
    } catch (issue) {
      notify(issue.message, true);
    }
  });
  return { render };
}
