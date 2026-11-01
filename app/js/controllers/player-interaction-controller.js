import { astralTargetInReach } from "../core/astral-interaction.js";
import { alliedPlayers } from "../core/player-social-service.js";
import { watchedPosition } from "../core/location-watch-service.js";
import { buildPlayerInteractionIntel } from "../core/player-interaction-policy.js";
import { PlayerSocialView } from "../ui/player-social-view.js";
import { renderPlayerInteraction } from "../ui/player-interaction-view.js";
import { closeSheet } from "../ui/bottom-sheet.js";
export function createPlayerInteractionController({
  element,
  getSession,
  asGps,
  worldDistance,
  applyServerState,
  activateBattle,
  onLog,
  commandFeedback,
  renderView = renderPlayerInteraction,
  createSocialView = (options) => new PlayerSocialView(options),
}) {
  let epoch = 0,
    panelRevision = 0,
    playerSocialView = null;
  function nearbyMultiplayerHeroIds() {
    const {
      game,
      hero,
      playerId: localPlayerId,
      position,
      active,
      positions,
    } = getSession();
    if (!active) return [hero.id];
    const nearbyPlayerIds = positions
      .filter(
        (entry) =>
          entry.playerId !== localPlayerId &&
          alliedPlayers(game, localPlayerId, entry.playerId) &&
          entry.connected &&
          entry.position &&
          worldDistance(asGps(position), entry.position) <=
            game.setup.rules.engagementRadiusMeters,
      )
      .sort(
        (first, second) =>
          worldDistance(asGps(position), first.position) -
          worldDistance(asGps(position), second.position),
      )
      .slice(0, 2)
      .map((entry) => entry.playerId);
    return [
      hero.id,
      ...nearbyPlayerIds
        .map(
          (playerId) =>
            game.heroes.find(
              (candidate) =>
                candidate.playerId === playerId && candidate.state === "active",
            )?.id,
        )
        .filter(Boolean),
    ];
  }

  function playerMapIntel() {
    const {
      game,
      hero,
      playerId: localPlayerId,
      position,
      active,
      positions,
    } = getSession();
    if (!game || !position) return [];
    const detectionRange = game.heroClassFeatureService.visionRadius(hero);
    return positions
      .filter(
        (entry) =>
          entry.playerId !== localPlayerId && entry.connected && entry.position,
      )
      .map((target) =>
        buildPlayerInteractionIntel({
          observerPlayerId: localPlayerId,
          target,
          participants: game.setup.participants,
          observerPosition: asGps(position),
          interactionRange: astralTargetInReach(
            game,
            hero,
            "hero",
            game.heroes.find((item) => item.playerId === target.playerId),
          )
            ? Infinity
            : game.setup.rules.engagementRadiusMeters,
          allowPvP: game.setup.rules.allowPvP,
          detectionRange,
        }),
      )
      .filter(
        (entry) =>
          entry.relation === "ally" ||
          entry.distance <= detectionRange ||
          watchedPosition(game, localPlayerId, entry.position),
      );
  }

  function select(playerId) {
    const intel = playerMapIntel().find((entry) => entry.playerId === playerId);
    if (!intel) return;
    const revision = ++panelRevision;
    let handle,
      busy = false;
    const isOpen = () => revision === panelRevision && handle?.isOpen();
    handle = renderView({
      element,
      intel,
      interactionRange: getSession().game.setup.rules.engagementRadiusMeters,
      onClose: () => {
        if (isOpen()) {
          panelRevision++;
          closeSheet(element);
        }
      },
      onAction: async (action) => {
        if (!isOpen() || busy) return;
        if (action === "talk" || action === "trade")
          return social().request(playerId, action);
        if (action !== "attack") return;
        const { game, hero, authoritative, client } = getSession();
        const target = game.heroes.find(
          (candidate) => candidate.playerId === playerId,
        );
        const sessionEpoch = epoch;
        busy = true;
        try {
          if (authoritative && target) {
            const response = await client.sendGameCommand(
              "createPlayerEncounterBattle",
              [{ attackerHeroId: hero.id, targetHeroId: target.id }],
            );
            if (sessionEpoch !== epoch) return;
            if (!response.result?.success)
              throw new Error(
                `Attaque impossible : ${response.result?.reason ?? "refusée"}.`,
              );
            if (isOpen()) closeSheet(element);
            if (response.game?.state) applyServerState(response.game.state);
          } else {
            const result = target
              ? await game.createPlayerEncounterBattle({
                  attackerHeroId: hero.id,
                  targetHeroId: target.id,
                })
              : { success: false, reason: "invalid_target" };
            if (!result.success) {
              onLog(`Attaque impossible : ${result.reason}.`);
              return;
            }
            if (isOpen()) closeSheet(element);
            activateBattle(result.battle);
          }
        } catch (error) {
          if (sessionEpoch === epoch && isOpen())
            handle.feedback(error.message);
        } finally {
          busy = false;
        }
      },
    });
  }
  function social() {
    if (playerSocialView) return playerSocialView;
    const sessionEpoch = epoch;
    playerSocialView = createSocialView({
      sheet: element,
      getGame: () => getSession().game,
      getPlayerId: () => getSession().playerId,
      isCurrent: () => sessionEpoch === epoch,
      send: async (input) => {
        const { authoritative, client } = getSession();
        if (sessionEpoch !== epoch || !authoritative)
          throw new Error("Le serveur multijoueur n’est pas prêt.");
        let response;
        const feedback = commandFeedback?.begin("playerSocialCommand", [input]);
        try {
          response = await client.sendGameCommand("playerSocialCommand", [
            input,
          ]);
          if (sessionEpoch === epoch) {
            if (response.game?.state) applyServerState(response.game.state);
            feedback?.finish(response.result);
          }
        } catch (error) {
          if (sessionEpoch === epoch)
            feedback?.finish({ success: false, unconfirmed: true });
          if (sessionEpoch === epoch)
            await client.requestGameState().catch(() => {});
          throw error;
        } finally {
          feedback?.finish(null);
        }
        if (sessionEpoch !== epoch) return null;
        return response;
      },
    });
    return playerSocialView;
  }
  return {
    nearbyHeroIds: nearbyMultiplayerHeroIds,
    mapIntel: playerMapIntel,
    select,
    social,
    reset() {
      epoch++;
      panelRevision++;
      playerSocialView = null;
    },
  };
}
