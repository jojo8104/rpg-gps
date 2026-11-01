/** Présentation narrative définie par le scénario, sans accès au navigateur. */
export function scenarioDialogueSpeaker(
  definition,
  entry = {},
  phaseId = null,
) {
  const scene =
    entry.scene ??
    definition.phases?.[phaseId]?.scene ??
    definition.defaultScene;
  return {
    name: entry.speaker ?? definition.defaultSpeaker,
    portrait:
      definition.portraits?.[scene] ??
      definition.scenePortraitPattern?.replace("{scene}", scene) ??
      null,
  };
}

export function buildScenarioDialogue({
  definition,
  phaseId,
  entries = [],
  choices = [],
  description = "",
}) {
  const phase = definition.phases?.[phaseId] ?? {};
  const availableChoices = phase.hideChoices ? [] : choices;
  return {
    conversation: {
      title: definition.title,
      ...scenarioDialogueSpeaker(definition, entries.at(-1), phaseId),
      options: availableChoices.length
        ? availableChoices.map((choice) => ({
            id: `${definition.choicePrefix}${choice.id}`,
            label: choice.label,
          }))
        : [
            {
              id: definition.closeOptionId,
              label: phase.battleLocationId
                ? definition.battleLabel
                : definition.continueLabel,
            },
          ],
    },
    lines: entries.length ? entries.map((entry) => entry.text) : [description],
    battleLocationId: phase.battleLocationId ?? null,
  };
}
