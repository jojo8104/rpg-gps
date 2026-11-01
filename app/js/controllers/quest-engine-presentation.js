/** Boutons déjà autorisés par la projection serveur ; aucune règle de progression. */
export function questEngineOptions(game, locationId, { includeOffers = true } = {}) {
  const view = game.getQuestEngineView?.();
  if (!view?.enabled) return [];
  return [
    ...view.offers
      .filter((offer) => includeOffers && offer.locationId === locationId)
      .map((offer) =>
        option(
          { type: "accept", questId: offer.id, mode: "solo" },
          offer.label,
        ),
      ),
    ...view.instances
      .filter((instance) => instance.status === "active")
      .flatMap((instance) =>
        instance.actions
          .filter((action) => action.button && action.locationId === locationId)
          .map((action) =>
            option(
              { type: "act", instanceId: instance.id, actionId: action.id },
              action.button,
            ),
          ),
      ),
  ];
}

export function questEngineOptionId(request) {
  return `engine:${encodeURIComponent(JSON.stringify(request))}`;
}
function option(request, label) {
  return { id: questEngineOptionId(request), label, kind: "quest_engine" };
}
