import { namedPortraitAppearance } from "./portrait-characters.js";
import { resolveLocationChief } from "./location-chief-catalog.js";
import { createPortraitAppearance } from "./portrait-catalog.js";

/** Construit et résout les conversations locales sans dépendre de l'interface. */
export class LocationChiefService {
  getConversation({
    location,
    canTrade = false,
    questsEnabled = true,
    currentPhaseId = null,
    currentPhaseStatus = null,
    isObjectiveCompleted = () => false,
  }) {
    const chief = resolveLocationChief(location);
    if (!chief) return null;
    const options = [];
    if (chief.trade && canTrade)
      options.push({
        id: "trade",
        kind: "trade",
        label: `Commercer (${location.statistics.chiefTradeRemaining ?? 0} restant)`,
      });
    if (questsEnabled)
      chief.secondaryQuestIds.forEach((questId) =>
        options.push({
          id: `quest:${questId}`,
          kind: "secondary_quest",
          questId,
          label: "Parler d’une mission",
        }),
      );
    chief.dialogues
      .filter((dialogue) =>
        !questsEnabled
          ? dialogue.objectiveId === null
          : dialogue.objectiveId === null ||
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
    const context = chief.contexts.find(
      (candidate) =>
        (candidate.phaseIds.length === 0 ||
          candidate.phaseIds.includes(currentPhaseId)) &&
        (candidate.phaseStatuses.length === 0 ||
          candidate.phaseStatuses.includes(currentPhaseStatus)) &&
        (candidate.completedObjectiveId === null ||
          isObjectiveCompleted(candidate.completedObjectiveId)),
    );
    const namedAppearance = namedPortraitAppearance(chief.portrait);
    return {
      locationId: location.id,
      name: chief.name,
      title: chief.title,
      portrait: namedAppearance ? null : chief.portrait,
      appearance:
        namedAppearance ??
        (chief.portrait
          ? null
          : createPortraitAppearance({
              identity: `chief:${location.id}`,
              locationType: location.type,
              role: location.type,
            })),
      contextId: context?.id ?? null,
      openingLines: [...(context?.openingLines ?? chief.openingLines)],
      options,
    };
  }

  select({
    location,
    optionId,
    canTrade = false,
    questsEnabled = true,
    currentPhaseId = null,
    currentPhaseStatus = null,
    isObjectiveCompleted = () => false,
  }) {
    const chief = resolveLocationChief(location);
    const conversation = this.getConversation({
      location,
      canTrade,
      questsEnabled,
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
        options: chief.tradeOffers.map((offer) => ({
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
    const dialogue = chief.dialogues.find(
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
