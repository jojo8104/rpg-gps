import { closeSheet } from "../ui/bottom-sheet.js";
import { renderRelayCompose, renderRelayInbox } from "../ui/relay-view.js";

// Possède l'envoi et la lecture du courrier, sans règles de transport du messager.
export function createRelayController({
  element,
  getSession,
  applyServerState,
  beforeOpen,
  views = {},
}) {
  const composeView = views.compose ?? renderRelayCompose;
  const inboxView = views.inbox ?? renderRelayInbox;
  let epoch = 0,
    panelRevision = 0;
  function messages() {
    const { game, playerId } = getSession();
    return (game?.getPlayer(playerId)?.informationRecords ?? []).filter(
      (entry) =>
        ["player_message", "watch_alert", "attack_alert"].includes(entry.kind),
    );
  }
  function close(revision) {
    if (revision === panelRevision) {
      panelRevision++;
      closeSheet(element);
    }
  }
  function openCompose(locationId) {
    const { game, playerId } = getSession();
    if (!game.getLocation(locationId)) return;
    beforeOpen({ inbox: false });
    const revision = ++panelRevision;
    let busy = false,
      handle;
    const isOpen = () => revision === panelRevision && handle?.isOpen();
    handle = composeView({
      element,
      recipients: game.players.filter((player) => player.id !== playerId),
      onClose: () => close(revision),
      onSend: async ({ recipientPlayerId, text }) => {
        if (busy || !isOpen()) return;
        const { game, hero, playerId, authoritative, client } = getSession();
        if (!hero) return;
        const sessionEpoch = epoch;
        const input = {
          playerId,
          heroId: hero.id,
          locationId,
          recipientPlayerId,
          text,
        };
        busy = true;
        handle.setBusy(true);
        try {
          let result;
          if (authoritative) {
            const response = await client.sendGameCommand("sendRelayMessage", [
              input,
            ]);
            if (sessionEpoch !== epoch) return;
            result = response.result;
            if (response.game?.state) applyServerState(response.game.state);
          } else result = await game.sendRelayMessage(input);
          if (sessionEpoch !== epoch || !isOpen()) return;
          handle.setFeedback(
            result?.success
              ? "Messager en route. Le message sera remis à son arrivée."
              : "Envoi impossible : vérifiez le message, le destinataire et votre présence au relais.",
          );
          if (result?.success) handle.clearMessage();
        } catch {
          if (sessionEpoch === epoch && isOpen())
            handle.setFeedback(
              "Envoi non confirmé. Réessayez après synchronisation.",
            );
        } finally {
          busy = false;
          if (sessionEpoch === epoch && isOpen()) handle.setBusy(false);
        }
      },
    });
  }
  function openInbox() {
    const { game } = getSession();
    beforeOpen({ inbox: true });
    const revision = ++panelRevision;
    inboxView({
      element,
      messages: messages()
        .slice()
        .reverse()
        .map((message) => ({
          ...message,
          senderName: game.getPlayer(message.senderPlayerId)?.name ?? "Relais",
        })),
      onClose: () => close(revision),
    });
  }
  return {
    openCompose,
    openInbox,
    messages,
    reset() {
      epoch++;
      panelRevision++;
    },
  };
}
