/** Validation de définitions uniquement ; aucune progression locale. */
export function validateStrategicProject(project) {
  try {
    return validate(project);
  } catch {
    return [
      {
        path: "strategicEvents",
        message: "Structure des événements stratégiques invalide.",
      },
    ];
  }
}
function validate(project) {
  const errors = [];
  const fail = (message) => errors.push({ path: "strategicEvents", message });
  const events = project.strategicEvents ?? [],
    blocks = project.strategicBlocks ?? [];
  if (!Array.isArray(events) || !Array.isArray(blocks))
    return [
      {
        path: "strategicEvents",
        message: "Les événements et blocs doivent être des listes.",
      },
    ];
  const unique = (rows, label) => {
    if (
      !Array.isArray(rows) ||
      rows.some(
        (row) => !row || typeof row.id !== "string" || !row.id.trim(),
      ) ||
      new Set(rows.map((row) => row.id)).size !== rows.length
    ) {
      fail(`${label} : identifiants uniques requis.`);
      return false;
    }
    return true;
  };
  if (!unique(events, "Événements") || !unique(blocks, "Blocs")) return errors;
  const quests = [...(project.campaign?.quests ?? []), project.quest].filter(
    Boolean,
  );
  const locations = new Set(
    (project.world?.locationSlots ?? []).map((slot) => slot.id),
  );
  for (const event of events) {
    if (
      !Number.isSafeInteger(event.strategyCreditsPerPlayer) ||
      event.strategyCreditsPerPlayer < 0
    )
      fail(`${event.id} : crédits de stratégie invalides.`);
    if (
      !event.title?.trim() ||
      event.invitations !== "ga-messenger" ||
      event.enemySimulation !== "without-ga"
    )
      fail(
        `${event.id} : titre, messagers GA et adversaires simulés sans GA requis.`,
      );
    if (
      !event.council?.physicalPresence ||
      !event.council.strategyVote ||
      !event.council.strategistVote
    )
      fail(`${event.id} : conseil physique et deux votes requis.`);
    if (!unique(event.strategies, "Stratégies")) continue;
    if (event.strategies.length < 3)
      fail(`${event.id} : au moins trois stratégies requises.`);
    if (!unique(event.positions, "Positions")) continue;
    if (
      !event.positions.some((p) => p.role === "strategist") ||
      !event.positions.some((p) => p.role === "ally")
    )
      fail(`${event.id} : positions du stratège et des alliés requises.`);
    for (const position of event.positions)
      if (!locations.has(position.locationSlotId))
        fail(`${event.id} : lieu de position inconnu (${position.id}).`);
    if (
      !Array.isArray(event.outcomes) ||
      !event.outcomes.length ||
      event.outcomes.some(
        (value) => typeof value !== "string" || !value.trim(),
      ) ||
      new Set(event.outcomes).size !== event.outcomes.length
    )
      fail(`${event.id} : issues uniques requises.`);
    if (!Array.isArray(event.phases)) fail(`${event.id} : phases attendues.`);
    for (const strategy of event.strategies) {
      if (
        !strategy.title?.trim() ||
        !Number.isSafeInteger(strategy.preparationSeconds) ||
        strategy.preparationSeconds < 1
      )
        fail(`${strategy.id} : titre et durée positive en secondes requis.`);
      if (!unique(strategy.challenges, "Défis")) continue;
      for (const challenge of strategy.challenges) {
        if (
          !quests.some(
            (quest) =>
              quest.id === challenge.questId &&
              quest.actions.some((action) => action.id === challenge.actionId),
          )
        )
          fail(`${challenge.id} : action de quête inconnue.`);
        if (
          !Number.isSafeInteger(challenge.strategyCost) ||
          challenge.strategyCost < 0 ||
          !Array.isArray(challenge.requirements)
        )
          fail(`${challenge.id} : coût positif ou nul et prérequis requis.`);
        for (const requirement of challenge.requirements ?? [])
          if (
            ![
              "class",
              "unit",
              "authority",
              "command",
              "resource",
              "equipment",
              "improvement",
            ].includes(requirement.type) ||
            typeof requirement.id !== "string" ||
            !requirement.id.trim() ||
            !Number.isFinite(requirement.minimum) ||
            requirement.minimum < 0
          )
            fail(`${challenge.id} : prérequis invalide.`);
      }
    }
  }
  for (const block of blocks) {
    const event = events.find((event) => event.id === block.eventId);
    if (!event) {
      fail(`${block.id} : événement inconnu.`);
      continue;
    }
    if (block.afterQuestId && !quests.some((q) => q.id === block.afterQuestId))
      fail(`${block.id} : quête source inconnue.`);
    if (
      !block.outcomes ||
      typeof block.outcomes !== "object" ||
      Array.isArray(block.outcomes)
    ) {
      fail(`${block.id} : sorties attendues.`);
      continue;
    }
    for (const [outcome, questId] of Object.entries(block.outcomes))
      if (
        !event.outcomes?.includes(outcome) ||
        !quests.some((q) => q.id === questId)
      )
        fail(`${block.id} : sortie ou quête cible inconnue.`);
  }
  return errors;
}
