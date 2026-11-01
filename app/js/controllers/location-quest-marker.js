/** Lecture de la projection serveur, sans modifier la progression. */
export function locationQuestMarker(game, locationId) {
  const quest =
    game.questSystemEnabled === false ? null : game.getActiveQuest?.();
  const objectives = (quest?.objectives ?? []).filter((objective) => {
    if (objective.completed === true || objective.status === "completed")
      return false;
    const trigger = objective.trigger ?? {};
    const binding = (game.scenarioLocationBindings ?? []).find(
      (item) => item.locationSlotId === trigger.locationSlotId,
    );
    return (trigger.locationId ?? binding?.locationId) === locationId;
  });
  const view = game.getQuestEngineView?.();
  const actions = (view?.enabled ? (view.instances ?? []) : [])
    .filter((instance) => instance.status === "active")
    .flatMap((instance) => instance.actions ?? [])
    .filter((action) => action.locationId === locationId);
  if (!objectives.length && !actions.length) return null;
  return [...objectives.map((item) => item.trigger), ...actions].some((item) =>
    /battle|combat|capture|attack|defeat/i.test(JSON.stringify(item)),
  )
    ? "combat"
    : "objective";
}
