/** Construit et résout les conversations locales sans dépendre de l'interface. */
export class LocationChiefService {
  getConversation({
    location,
    canTrade = false,
    currentPhaseId = null,
    currentPhaseStatus = null,
    isObjectiveCompleted = () => false,
  }) {
    if (location?.chief === null || location?.chief === undefined) return null;
    const options = [];
    if (location.chief.trade && canTrade)
      options.push({
        id: "trade",
        kind: "trade",
        label: `Commercer (${location.statistics.chiefTradeRemaining ?? 0} restant)`,
      });
    location.chief.secondaryQuestIds.forEach((questId) =>
      options.push({
        id: `quest:${questId}`,
        kind: "secondary_quest",
        questId,
        label: "Parler d’une mission",
      }),
    );
    location.chief.dialogues
      .filter(
        (dialogue) =>
          dialogue.objectiveId === null ||
          dialogue.when === "always" ||
          isObjectiveCompleted(dialogue.objectiveId) ===
            (dialogue.when === "completed"),
      )
      .forEach((dialogue) =>
        options.push({
          id: `dialogue:${dialogue.id}`,
          kind: "dialogue",
          dialogueId: dialogue.id,
          label: dialogue.label,
        }),
      );
    const context = location.chief.contexts.find(
      (candidate) =>
        (candidate.phaseIds.length === 0 ||
          candidate.phaseIds.includes(currentPhaseId)) &&
        (candidate.phaseStatuses.length === 0 ||
          candidate.phaseStatuses.includes(currentPhaseStatus)) &&
        (candidate.completedObjectiveId === null ||
          isObjectiveCompleted(candidate.completedObjectiveId)),
    );
    return {
      locationId: location.id,
      name: location.chief.name,
      title: location.chief.title,
      portrait: location.chief.portrait,
      contextId: context?.id ?? null,
      openingLines: [...(context?.openingLines ?? location.chief.openingLines)],
      options,
    };
  }

  select({
    location,
    optionId,
    canTrade = false,
    currentPhaseId = null,
    currentPhaseStatus = null,
    isObjectiveCompleted = () => false,
  }) {
    const conversation = this.getConversation({
      location,
      canTrade,
      currentPhaseId,
      currentPhaseStatus,
      isObjectiveCompleted,
    });
    const option = conversation?.options.find((entry) => entry.id === optionId);
    if (!option) return { success: false, reason: "chief_option_unavailable" };
    if (option.kind === "trade")
      return {
        success: true,
        kind: "trade",
        message: "Le chef vous présente les offres disponibles.",
        lines: [
          "Je peux vous montrer ce que le camp est encore capable d’échanger.",
        ],
        options: location.chief.tradeOffers.map((offer) => ({
          id: `trade-offer:${offer.id}`,
          kind: "trade_offer",
          label: `Donner ${offer.give.amount} ${offer.give.resource} · recevoir ${offer.receive.amount} ${offer.receive.resource}`,
        })),
      };
    if (option.kind === "secondary_quest")
      return {
        success: true,
        kind: option.kind,
        questId: option.questId,
        message: `Mission secondaire proposée : ${option.questId}.`,
        lines: ["Une autre affaire réclame votre attention."],
      };
    const dialogue = location.chief.dialogues.find(
      (entry) => entry.id === option.dialogueId,
    );
    return {
      success: true,
      kind: "dialogue",
      dialogueId: dialogue.id,
      objectiveId: dialogue.objectiveId,
      message: dialogue.text,
      lines: [...dialogue.lines],
    };
  }
}
