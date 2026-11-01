import { closeSheet } from "../ui/bottom-sheet.js";
import {
  renderProspectingManager,
  renderTradingConvoyManager,
} from "../ui/location-logistics-view.js";
import {
  convoyMessage,
  prospectingMessage,
} from "./location-logistics-feedback.js";

// Les services du jeu déterminent les options et les coûts. Ce contrôleur possède
// les choix de l'écran et empêche une réponse tardive de rouvrir un autre panneau.
export function createLocationLogisticsController({
  element,
  getSession,
  applyServerState,
  onChange,
  views = {},
}) {
  const prospectingView = views.prospecting ?? renderProspectingManager;
  const convoyView = views.convoys ?? renderTradingConvoyManager;
  let epoch = 0,
    panelRevision = 0;
  function panel() {
    const revision = ++panelRevision;
    let handle,
      busy = false;
    return {
      mount(value) {
        handle = value;
      },
      isOpen: () => revision === panelRevision && Boolean(handle?.isOpen()),
      close() {
        if (revision === panelRevision) {
          panelRevision++;
          closeSheet(element);
        }
      },
      async execute(command, input, feedback, retry, reopen) {
        if (busy || !this.isOpen()) return;
        busy = true;
        const sessionEpoch = epoch;
        const { game, authoritative, client } = getSession();
        try {
          let result;
          if (authoritative) {
            const response = await client.sendGameCommand(command, [input]);
            if (sessionEpoch !== epoch) return;
            result = response.result;
            if (response.game?.state) applyServerState(response.game.state);
          } else result = await game[command](input);
          if (sessionEpoch !== epoch) return;
          onChange();
          if (this.isOpen()) reopen(feedback(result));
        } catch {
          if (sessionEpoch === epoch && this.isOpen()) reopen(retry);
        } finally {
          busy = false;
        }
      },
    };
  }
  function openProspecting(
    originLocationId,
    message = "",
    selectedSpecialistId = null,
    food = null,
  ) {
    const { game, playerId } = getSession();
    const origin = game.getLocation(originLocationId);
    if (!origin) return;
    const options = game.getProspectingOptions({ playerId, originLocationId });
    const specialists = options.specialists ?? [];
    const specialist =
      specialists.find((entry) => entry.id === selectedSpecialistId) ??
      specialists.find((entry) => entry.quantity > 0) ??
      specialists[0] ??
      null;
    const allocatedFood = Math.max(
      options.minimumFood ?? 1,
      Number.parseInt(food ?? options.minimumFood, 10) || 0,
    );
    const current = panel();
    current.mount(
      prospectingView({
        element,
        origin,
        options,
        specialists,
        specialist,
        message,
        onClose: () => current.close(),
        onSpecialist: (id) => {
          if (current.isOpen())
            openProspecting(originLocationId, message, id, allocatedFood);
        },
        onCreate: (supplies) => {
          if (!specialist || specialist.quantity <= 0) return;
          const { playerId, hero } = getSession();
          if (!hero) return;
          return current.execute(
            "createProspectingExpedition",
            {
              playerId,
              heroId: hero.id,
              originLocationId,
              specialistId: specialist.id,
              ...supplies,
            },
            prospectingMessage,
            "Départ non confirmé. Réessayez après synchronisation.",
            (feedback) =>
              openProspecting(
                originLocationId,
                feedback,
                specialist.id,
                supplies.food,
              ),
          );
        },
      }),
    );
  }
  function openConvoys(
    originLocationId,
    message = "",
    selectedDestinationId = null,
    selectedResourceId = null,
  ) {
    const { game, playerId, data } = getSession();
    const origin = game.getLocation(originLocationId);
    if (!origin) return;
    const rawOptions = game.getTradingConvoyOptions({
      playerId,
      originLocationId,
    });
    const options = {
      ...rawOptions,
      convoys: (rawOptions.convoys ?? []).map((convoy) => ({
        ...convoy,
        destinationName: game.getLocation(convoy.destinationLocationId)?.name,
      })),
    };
    const destination =
      options.destinations.find((item) => item.id === selectedDestinationId) ??
      options.destinations[0] ??
      null;
    const resourceId = destination?.resources.includes(selectedResourceId)
      ? selectedResourceId
      : (destination?.resources[0] ?? null);
    const current = panel();
    const reopen = (feedback) =>
      openConvoys(originLocationId, feedback, destination?.id, resourceId);
    current.mount(
      convoyView({
        element,
        origin,
        options,
        destination,
        resourceId,
        itemDefinitions: data?.itemDefinitions,
        message,
        onClose: () => current.close(),
        onDestination: (id) => {
          if (current.isOpen()) openConvoys(originLocationId, message, id);
        },
        onResource: (id) => {
          if (current.isOpen())
            openConvoys(originLocationId, message, destination?.id, id);
        },
        onCreate: () => {
          const { playerId, hero } = getSession();
          if (!destination || !resourceId || !hero) return;
          return current.execute(
            "createTradingConvoy",
            {
              playerId,
              heroId: hero.id,
              originLocationId,
              destinationLocationId: destination.id,
              resourceId,
            },
            convoyMessage,
            "Création non confirmée. Réessayez après synchronisation.",
            reopen,
          );
        },
        onStop: (groupId) =>
          current.execute(
            "stopTradingConvoy",
            { playerId: getSession().playerId, groupId },
            convoyMessage,
            "Arrêt non confirmé. Réessayez après synchronisation.",
            reopen,
          ),
      }),
    );
  }
  return {
    openProspecting,
    openConvoys,
    reset() {
      epoch++;
      panelRevision++;
    },
  };
}
