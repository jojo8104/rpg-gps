import { teamFortReward } from "../core/team-fort-quest.js";

/** Mission journal presentation; mutations stay in the game services. */
export function appendTeamFortQuest(container, game, playerId, showLocation) {
  const quest = game.teamFortQuestService.forPlayer(playerId);
  if (!quest) return;
  container.querySelector(".text-muted")?.remove();
  const camp = game.getLocation(quest.locationId);
  const elapsed = Math.max(
    0,
    (quest.completedAt ?? game.now()) - quest.startedAt,
  );
  const reward = quest.reward ?? teamFortReward(elapsed);
  const card = document.createElement("article");
  card.className = "quest-card";
  const text = (tag, value) => {
    const element = document.createElement(tag);
    element.textContent = value;
    card.append(element);
  };
  text(
    "small",
    `Quête d’équipe · ${quest.participantCount} participants${quest.localTest ? " simulés — test solo" : ""}`,
  );
  text("strong", quest.title);
  text(
    "p",
    `${quest.status === "completed" ? "Mission accomplie" : "Mission en cours"} · ${Math.floor(elapsed / 60_000)} min. ${quest.status === "completed" ? "Récompense reçue" : "Récompense actuelle"} par participant : ${reward.gold} or et ${reward.experience} XP.`,
  );
  if (quest.status === "active") {
    text(
      "p",
      "Achevez le camp en fort et déposez une unité complète de 6 lanciers au grade Soldat. Équipez le Mandat d’autorité dans Héros → Accessoire : +3 autorité.",
    );
    if (camp?.type === "camp") {
      const state = game.campImprovementService.getEvolutionStatus(
        camp,
        "fort",
      );
      text(
        "p",
        state.eligible
          ? "Le camp est prêt : utilisez « Ériger un fort » sur place."
          : `À préparer : ${state.blockers.join(" · ")}. Les ressources des héros présents peuvent aussi financer les travaux.`,
      );
    }
    text(
      "p",
      `Fort : ${camp?.type === "fort" ? "prêt" : "à ériger"} · Garnison : ${camp?.garrison.units.some((unit) => unit.typeId === "spearman" && unit.rank === "soldier" && unit.quantity === unit.maxQuantity && unit.state === "active") ? "prête" : "à installer"}.`,
    );
    if (quest.localTest)
      text(
        "p",
        "Test solo : récupérez les ressources et retirez les lanciers du dépôt de test, puis rejoignez le camp. Vous effectuez les tâches de toute l’équipe ; aucun partenaire connecté n’est nécessaire.",
      );
  }
  for (const [id, label] of [
    [quest.locationId, "Afficher le camp / fort"],
    [quest.supplyLocationId, "Afficher le dépôt de test"],
  ]) {
    if (!id) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quest-location-button secondary-button";
    button.textContent = `⌖ ${label}`;
    button.addEventListener("click", () => showLocation(id));
    card.append(button);
  }
  container.prepend(card);
}
