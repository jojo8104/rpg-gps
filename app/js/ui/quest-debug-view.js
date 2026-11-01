import { QUEST_SYSTEM_ENABLED } from "../core/quest-system-policy.js";
import { QUEST_SEQUENCE } from "../core/scenario-quest-catalog.js";
// Le sélecteur émet un identifiant de quête et l'effectif du test local.
export function createQuestDebugView({ element, launchButton, onLaunch }) {
  if (!QUEST_SYSTEM_ENABLED) {
    element.parentElement.hidden = true;
    launchButton.hidden = true;
    return { reset() {} };
  }
  const questSelect = element;
  questSelect.innerHTML = QUEST_SEQUENCE.map(
    (quest) => `<option value="${quest.id}">${quest.title}</option>`,
  ).join("");
  questSelect.insertAdjacentHTML(
    "beforeend",
    '<option value="team-fort-test">Un fort pour le royaume (équipe · test solo)</option>',
  );
  const teamFortTestSize = document.createElement("label");
  teamFortTestSize.hidden = true;
  teamFortTestSize.innerHTML =
    '<small>Effectif simulé</small><select aria-label="Effectif simulé pour la quête d’équipe"><option value="2">2 joueurs</option><option value="4">4 joueurs</option><option value="6">6 joueurs</option></select>';
  questSelect.parentElement.after(teamFortTestSize);
  questSelect.addEventListener("change", () => {
    teamFortTestSize.hidden = questSelect.value !== "team-fort-test";
  });

  launchButton.onclick = () =>
    onLaunch({
      questId: questSelect.value,
      participantCount: Number(teamFortTestSize.querySelector("select").value),
    });
  return {
    reset: () => {
      teamFortTestSize.hidden = questSelect.value !== "team-fort-test";
    },
  };
}
