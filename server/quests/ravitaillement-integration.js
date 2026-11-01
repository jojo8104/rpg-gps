import { QuestService } from "./quest-service.js";
import { questCatalog } from "./quest-catalog.js";
import { bindQuestToScenarioLocations } from "./scenario-location-resolver.js";
import { getScenarioBundle } from "../lobby/scenario-catalog.js";

/** Catalogue des quêtes à actions, lié aux lieux officiels de la partie. */
export function ravitaillementService(lobby, now) {
  const game = lobby.game;
  if (!game) return null;
  const scenarioQuestIds = getScenarioBundle(
    lobby.configuration?.scenarioId ?? "chaos",
  ).questIds;
  const available = questCatalog.filter(({ definition }) => {
    if (scenarioQuestIds && !scenarioQuestIds.includes(definition.id))
      return false;
    if (
      lobby.configuration?.preparation?.excludedQuestIds?.includes(
        definition.id,
      )
    )
      return false;
    try {
      bindQuestToScenarioLocations(definition, game);
      return true;
    } catch (error) {
      if (
        error instanceof RangeError &&
        error.message.startsWith("Lieu de quête absent")
      )
        return false;
      throw error;
    }
  });
  if (!available.length) return null;
  try {
    return new QuestService({
      definitions: available.map(({ definition }) => definition),
      dialogues: Object.assign(
        {},
        ...available.map(({ dialogues }) => dialogues),
      ),
      getGame: () => lobby.game,
      replaceGame: (restored) => {
        lobby.game = restored;
      },
      now,
    });
  } catch (error) {
    if (
      error instanceof RangeError &&
      error.message.startsWith("Lieu de quête absent")
    )
      return null;
    throw error;
  }
}

export function installRavitaillement(lobby, now) {
  const service = ravitaillementService(lobby, now);
  if (!service) return;
  const actor = lobby.game.heroes.find(
    (hero) => lobby.game.getPlayer(hero.playerId) && hero.state === "active",
  );
  if (!actor) return;
  for (const definition of service.engine.definitions.values())
    if (
      questCatalog.find((entry) => entry.definition.id === definition.id)
        ?.initial !== false &&
      !service.engine.state.published.includes(definition.id)
    )
      service.command(actor.playerId, {
        type: "publish",
        questId: definition.id,
      });
}

/** Projection de présentation, sans stocks privés ni contenu des dialogues. */
export function ravitaillementView(state, playerId) {
  const saved = state.questEngineState?.engine;
  if (!saved?.published?.length) return null;
  const resolve = (id) =>
    state.scenarioLocationBindings?.find(
      (binding) => binding.locationSlotId === id,
    )?.locationId ?? id;
  const locationName = (id) =>
    state.locations?.find((location) => location.id === id)?.name ?? id;
  const definitions = new Map(
    questCatalog.map(({ definition }) => [definition.id, definition]),
  );
  const instances = saved.instances.filter(
    (instance) =>
      instance.playerIds.includes(playerId) &&
      definitions.has(instance.questId),
  );
  return {
    enabled: true,
    offers: saved.published.flatMap((id) => {
      const definition = definitions.get(id);
      if (!definition || instances.some((instance) => instance.questId === id))
        return [];
      return [
        {
          id,
          title: definition.title,
          description: definition.description,
          locationId: resolve(definition.locationSlotId),
          label: definition.interactionLabel,
        },
      ];
    }),
    instances: instances.map((instance) => {
      const definition = definitions.get(instance.questId);
      return {
        id: instance.id,
        questId: instance.questId,
        title: definition.title,
        status: instance.status,
        completionText: definition.outcomes.success.find(
          (effect) => effect.type === "narration",
        )?.text,
        actions: definition.actions.map((action) => {
          const locationId = resolve(
            action.lieu ??
              action.origine ??
              action.destinataire ??
              action.targetLocationId,
          );
          const status = instance.actions[action.id].status;
          return {
            id: action.id,
            type: action.action,
            status,
            locationId,
            label:
              action.label ??
              action.interaction ??
              action.action + " : " + locationName(locationId),
            ...(instance.status === "active" &&
            status === "active" &&
            action.interaction
              ? { button: action.interaction }
              : {}),
          };
        }),
      };
    }),
  };
}
