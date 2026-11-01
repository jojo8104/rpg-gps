import { makeQuestCardsCollapsible } from "./quest-card-view.js";
import { sideQuestRewardLabel } from "../core/side-quest-service.js";
import { appendTeamFortQuest } from "./team-fort-quest-view.js";
import { renderQuestHud } from "./quest-hud.js";
// Journal de campagne, missions annexes et d'équipe ; aucune mutation de Game.
export function renderQuestJournal({
  element,
  game,
  hero,
  localPlayerId,
  activeQuest,
  availableQuests,
  questResult,
  activeQuestLocations,
  placement,
  questHudModel,
  highlightedQuestOfferId,
  now,
  onPlacement,
  onAbandon,
  showLocationOnMap,
}) {
  const objectives =
    activeQuest?.objectives
      .map(
        (objective) =>
          `<li class="${objective.state === "completed" ? "is-completed" : objective.state === "failed" ? "is-failed" : ""}">${objective.state === "completed" ? "✓" : objective.state === "failed" ? "✕" : "○"} ${objective.text}</li>`,
      )
      .join("") ?? "";
  const distanceProgress = placement
    ? `<p>${Math.round(placement.distanceMeters)} / ${placement.minimumDistanceMeters} m parcourus${placement.minimumDistanceFromOriginMeters > 0 ? ` · ${Math.round(placement.distanceFromOriginMeters)} / ${placement.minimumDistanceFromOriginMeters} m d'éloignement du départ` : ""}</p>`
    : "";
  const placementAction = questHudModel?.ready
    ? `<button type="button" id="confirm-scenario-placement">${questHudModel.actionLabel}</button>`
    : "";
  const evacuation = game.evacuationStates["royal-camp-evacuation"];
  const evacuationClock =
    evacuation && !evacuation.completedAt && !evacuation.attackedAt
      ? `<p class="quest-deadline">Armée principale : arrivée estimée dans ${Math.max(0, Math.ceil((evacuation.expiresAt - now) / 60_000))} min (aucun échec automatique)</p>`
      : "";
  const messageDeadline = game.questDeadlines["fort-message-delivery"];
  const messageClock =
    messageDeadline && !messageDeadline.completedAt && !messageDeadline.failedAt
      ? `<p class="quest-deadline">Message urgent : ${Math.max(0, Math.ceil((messageDeadline.expiresAt - now) / 60_000))} min restantes</p>`
      : "";
  const abandonAction =
    activeQuest?.status === "active" && activeQuest.objectives.length
      ? '<button type="button" class="secondary-button" id="abandon-current-quest">Abandonner la quête</button>'
      : "";
  const failureNotice =
    activeQuest?.status === "failed"
      ? '<p class="quest-deadline">Quête échouée</p>'
      : "";
  const availableAction = availableQuests
    .map((offer) => {
      const highlighted =
        offer.id === highlightedQuestOfferId ? " is-highlighted" : "";
      return `<article class="quest-card quest-offer${highlighted}"><small>Quête disponible — rendez-vous à la capitale</small><strong>${offer.title}</strong><p>${offer.description}</p><button type="button" class="quest-location-button secondary-button" data-show-convocation-map aria-label="Afficher la capitale sur la carte">⌖ Afficher la capitale</button></article>`;
    })
    .join("");
  const resultLabels = {
    completed: ["Quête réussie", "Tous les objectifs ont été accomplis."],
    abandoned: ["Quête annulée", "Vous avez abandonné cette mission."],
    deadline_expired: ["Quête échouée", "Le délai de la mission est dépassé."],
    failed: ["Quête échouée", "La mission n’a pas été accomplie."],
    battle_lost: ["Quête échouée", "La mission a échoué après la bataille."],
  };
  const [resultTitle, resultText] = resultLabels[questResult?.outcome] ?? [
    "Quête échouée",
    "La mission n’a pas été accomplie.",
  ];
  const resultCard = questResult
    ? `<article class="quest-card quest-result quest-result--${questResult.outcome === "completed" ? "success" : "failure"}"><small>Résultat de la dernière quête</small><strong>${resultTitle} — ${questResult.title}</strong><p>${resultText}</p><p>${questResult.nextQuestId ? "La quête suivante attend votre confirmation." : "Aucune nouvelle quête n’est disponible pour le moment."}</p></article>`
    : "";
  const activeLocationActions = activeQuestLocations.length
    ? `<div class="quest-location-actions">${activeQuestLocations.map((location) => `<button type="button" class="quest-location-button secondary-button" data-show-quest-location="${location.id}">⌖ ${location.name}</button>`).join("")}</div>`
    : "";
  element.innerHTML = `<div class="quest-journal-summary"><strong>Journal de quêtes</strong><p>Vos missions et leur progression</p></div>${resultCard}${activeQuest ? `<article class="quest-card"><small>Quête en cours</small><strong>${activeQuest.title}</strong><p>${activeQuest.description}</p>${failureNotice}${evacuationClock}${messageClock}${distanceProgress}<ul class="quest-objectives">${objectives}</ul>${activeLocationActions}${placementAction}${abandonAction}</article>` : ""}${availableAction || (!activeQuest && !resultCard ? '<p class="text-muted quest-empty">Aucune quête active. Acceptez une mission auprès de son donneur pour commencer.</p>' : "")}`;
  appendTeamFortQuest(element, game, localPlayerId, showLocationOnMap);
  if (hero.sideQuests.some((quest) => quest.status !== "offered")) {
    const sideQuestNow = game.now();
    element.querySelector(".text-muted")?.remove();
    for (const quest of hero.sideQuests.filter(
      (entry) => entry.status !== "offered",
    )) {
      const card = document.createElement("article");
      card.className = "quest-card";
      const heading = document.createElement("small");
      heading.textContent = `Quête annexe — ${quest.source === "tavern" ? "Taverne" : "Chef du village"}`;
      const title = document.createElement("strong");
      title.textContent = quest.title;
      const description = document.createElement("p");
      description.textContent =
        quest.status === "active"
          ? `${quest.description} Récompense : ${sideQuestRewardLabel(quest)}. Vous pouvez l’abandonner auprès du donneur de quête.`
          : `${quest.status === "completed" ? "Mission accomplie." : "Mission abandonnée."} ${sideQuestNow < quest.availableAt ? `Nouvelle offre dans ${Math.ceil((quest.availableAt - sideQuestNow) / 60_000)} min.` : "Une nouvelle offre vous attend au lieu de départ."}`;
      const mapButton = document.createElement("button");
      mapButton.type = "button";
      mapButton.className = "quest-location-button secondary-button";
      mapButton.textContent =
        quest.status === "active"
          ? "⌖ Afficher la destination"
          : "⌖ Afficher le donneur de quête";
      mapButton.addEventListener("click", () =>
        showLocationOnMap(
          quest.status === "active" ? quest.targetId : quest.locationId,
        ),
      );
      card.append(heading, title, description, mapButton);
      element.append(card);
    }
  }
  element
    .querySelector("#confirm-scenario-placement")
    ?.addEventListener("click", onPlacement);
  element
    .querySelectorAll("[data-show-convocation-map]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showLocationOnMap("royal-capital"),
      ),
    );
  element
    .querySelectorAll("[data-show-quest-location]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showLocationOnMap(button.dataset.showQuestLocation),
      ),
    );
  element
    .querySelector("#abandon-current-quest")
    ?.addEventListener("click", onAbandon);
  makeQuestCardsCollapsible(element);
}
export function renderQuestOverlay({
  questHud,
  questHudModel,
  questHudExpanded,
  onToggle,
  onPlacement,
  showLocationOnMap,
  onChoice,
}) {
  renderQuestHud({
    element: questHud,
    model: questHudModel,
    expanded: questHudExpanded,
    onToggle: () => {
      onToggle();
    },
    onAction: onPlacement,
    onShowLocation: showLocationOnMap,
    onChoice,
  });
}
