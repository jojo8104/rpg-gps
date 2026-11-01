/** Interrupteur temporaire de l'application, conservé hors des règles de quête. */
export const QUEST_SYSTEM_ENABLED = false;
// Nouveau moteur : ravitaillement et prospecteurs perdus.
export const QUEST_ENGINE_ENABLED = true;

export const QUEST_SYSTEM_DISABLED = "quest_system_disabled";

export const QUEST_COMMANDS = new Set([
  "prepareTestQuest",
  "startCurrentScenarioPlacements",
  "updateScenarioPosition",
  "placeScenarioLocation",
  "dispatchQuestEvent",
  "selectQuestChoice",
  "inspectTrailPoint",
  "acceptAvailableQuest",
  "abandonCurrentQuest",
]);

export function questSystemUnavailable() {
  return { success: false, reason: QUEST_SYSTEM_DISABLED };
}

/** Les groupes déjà créés par une quête restent sauvegardés, sans activité automatique. */
export function isSuspendedQuestGroup(game, group) {
  if (game.questSystemEnabled !== false) return false;
  return (
    Boolean(group.mission?.questId || group.message?.questId) ||
    (game.scenario?.events ?? []).some((event) =>
      event.effects.some((effect) => effect.groupId === group.id),
    )
  );
}
