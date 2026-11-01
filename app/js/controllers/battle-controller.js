import { createTacticalBattleController } from "./tactical-battle-controller.js";
import {
  renderBattleDuelView,
  updateDuelCountdown,
} from "../ui/battle-duel-view.js";
import { renderBattleResultView } from "../ui/battle-result-view.js";
import { confirmedAction } from "./confirmed-action.js";

/** Possède la bataille affichée, les brouillons de cartes et leur cycle de vie.
 * Les règles et les conséquences persistantes restent dans le moteur.
 */
export function createBattleController({
  element,
  getSession,
  applyServerState,
  onEnter,
  onReturnToMap,
  onNavigationLocked,
  onResolved,
  onChange,
  onPublish,
  onAttackDenied,
  onLog,
  isPaused = () => false,
  now = () => Date.now(),
  schedule = (fn, ms) => setInterval(fn, ms),
  cancel = (id) => clearInterval(id),
  renderDuelView = renderBattleDuelView,
  renderResultView = renderBattleResultView,
  updateCountdown = updateDuelCountdown,
}) {
  const tactics = createTacticalBattleController();
  let activeBattle = null,
    battleTimer = null,
    battleResult = null,
    battleResolved = false;
  let battleMessage = "",
    battleLootMessage = "",
    pendingBattleRender = false;
  let generation = 0;
  async function openLocation({
    ambushTeamId = null,
    locationId = null,
    position,
    defenderHeroId,
  } = {}) {
    const { game, heroId, playerId } = getSession();
    const hero = game.getHero(heroId);
    const enemyHero = game.getHero(defenderHeroId);
    if (activeBattle && activeBattle.status !== "finished") return;

    const sourceLocationId = locationId;
    if (
      ambushTeamId === null &&
      sourceLocationId &&
      !game.canPerformLocationAction({
        playerId: playerId,
        locationId: sourceLocationId,
        action: "attack",
      })
    ) {
      return onAttackDenied(sourceLocationId);
    }
    const battleLocationId = locationId ?? "bandit-camp";
    const battleLocation = game.getLocation(battleLocationId);
    const defenderHeroIds =
      battleLocation?.heroIds.filter(
        (id) => game.getHero(id)?.playerId !== hero.playerId,
      ) ?? (enemyHero ? [enemyHero.id] : []);
    const battle = await game.createBattle({
      teamParticipants: [
        { id: "heroes", heroIds: [hero.id] },
        {
          id: "bandits",
          heroIds: defenderHeroIds,
          locationId: battleLocationId,
        },
      ],
      position: position,
      sourceLocationId: battleLocationId,
      sourceEnemyTeamId: "bandits",
      config: { ambushTeamId },
      loot: [
        {
          id: "bandit-gold",
          itemId: "gold",
          quantity: 12,
          portable: true,
          valuePerUnit: 1,
        },
      ],
    });
    if (battle == null) return;
    activateBattle(battle, { ambushTeamId });
  }

  async function openAutonomous(group, { ambushResult = null, heroIds } = {}) {
    const { game } = getSession();
    if (
      (activeBattle && activeBattle.status !== "finished") ||
      group.status === "destroyed"
    )
      return false;
    const battle = await game.createBattle({
      teamParticipants: [
        { id: "heroes", heroIds: heroIds },
        {
          id: `autonomous-${group.id}`,
          heroIds: [],
          autonomousGroupId: group.id,
        },
      ],
      position: group.position,
      config:
        ambushResult && ambushResult.level !== "cancelled"
          ? { ambushTeamId: "heroes", ambushEffects: ambushResult.effects }
          : {},
    });
    if (battle == null) return;
    activateBattle(battle, { ambushTeamId: battle.config.ambushTeamId });
    return true;
  }

  function activateBattle(
    battle,
    { ambushTeamId = null, restore = false } = {},
  ) {
    if (activeBattle?.id !== battle.id) {
      tactics.reset();
      generation += 1;
      duelDraftBattleId = null;
      duelDraftCards = [];
      duelDraftOrder = "ATTACK";
      duelDraftSend = Promise.resolve();
      duelSubmitting = false;
      battleLootMessage = "";
    }
    activeBattle = battle;
    battleResolved = false;
    battleResult = null;
    battleMessage = ambushTeamId
      ? "Embuscade ! Réagissez immédiatement."
      : "Choisissez une carte et une technique pour le duel.";
    onNavigationLocked(true);
    const revealBattle = () => {
      onEnter();
      renderBattle();
    };
    revealBattle();
    onLog(
      `${ambushTeamId ? "Embuscade" : "Combat"} déclenché à la position du joueur.`,
    );
    startBattleTimer();
  }
  let duelDraftBattleId = null;
  let duelDraftRound = 0;
  let duelDraftCards = [];
  let duelDraftOrder = "ATTACK";
  let duelSubmitting = false;
  let duelDraftSend = Promise.resolve();
  function duelHumanTeamIds() {
    const { game } = getSession();
    const humanIds = getSession().multiplayer
      ? new Set(
          game.setup.participants.map((participant) => participant.playerId),
        )
      : new Set([getSession().playerId]);
    return activeBattle.teams
      .filter((team) =>
        team.heroes.some((entry) => humanIds.has(entry.playerId)),
      )
      .map((team) => team.id);
  }
  function renderBattleDuel(team) {
    const state = activeBattle.duel;
    const battleId = activeBattle.id;
    const round = state.round;
    const token = generation;
    const sameBattle = () =>
      generation === token && activeBattle?.id === battleId;
    const sameRound = () =>
      sameBattle() &&
      activeBattle.status === "active" &&
      activeBattle.duel.round === round &&
      !activeBattle.duel.players.find((player) => player.id === team.id)
        ?.locked;
    if (
      duelDraftBattleId !== activeBattle.id ||
      duelDraftRound !== state.round
    ) {
      duelDraftBattleId = activeBattle.id;
      duelDraftRound = state.round;
      duelDraftCards = state.pendingChoices[team.id]?.cards ?? [];
      duelDraftOrder = state.pendingChoices[team.id]?.order ?? "ATTACK";
    }
    const refresh = () => renderBattle();
    const queueDuelDraft = () => {
      if (!getSession().authoritative || !getSession().client) return;
      const choice = {
        cards: [...duelDraftCards],
        order: duelDraftCards.length ? duelDraftOrder : "ATTACK",
      };
      duelDraftSend = duelDraftSend
        .catch(() => {})
        .then(async () => {
          if (!sameRound() || duelSubmitting) return;
          const response = await getSession().client.sendBattleCommand(
            battleId,
            "submitDuelChoice",
            [choice, round],
          );
          if (response.game?.state && sameRound())
            applyServerState(response.game.state, {
              renderNow: false,
            });
        })
        .catch((error) => {
          if (sameBattle()) battleMessage = error.message;
        });
    };
    const finishChoice = async (choice) => {
      if (!sameRound() || duelSubmitting) return;
      choice = structuredClone(choice);
      duelSubmitting = true;
      battleMessage = "Envoi du choix…";
      refresh();
      try {
        await duelDraftSend;
        if (!sameRound()) return;
        if (getSession().authoritative) {
          if (!sameRound()) return;
          const response = await getSession().client.sendBattleCommand(
            battleId,
            "lockDuelChoice",
            [choice, round],
          );
          if (response.game?.state && sameBattle())
            applyServerState(response.game.state, { renderNow: false });
        } else {
          activeBattle.submitDuelChoice(team.id, choice);
          activeBattle.lockDuelChoice(team.id);
          activeBattle.advanceDuel({ humanTeamIds: duelHumanTeamIds() });
          resolveFinishedBattle();
        }
        if (sameBattle()) battleMessage = "Choix validé.";
      } catch (error) {
        if (sameBattle()) battleMessage = error.message;
      } finally {
        if (sameBattle()) {
          duelSubmitting = false;
          refresh();
          onChange();
        }
      }
    };
    renderDuelView({
      element,
      battle: activeBattle,
      teamId: team.id,
      selectedCards: duelDraftCards,
      order: duelDraftOrder,
      message: battleMessage,
      submitting: duelSubmitting,
      onToggleCard: (id) => {
        if (!sameRound() || duelSubmitting) return;
        const max =
          1 +
          (state.players.find((entry) => entry.id === team.id)
            ?.extraCardsNext ?? 0);
        duelDraftCards = duelDraftCards.includes(id)
          ? duelDraftCards.filter((entry) => entry !== id)
          : [...(max > 1 ? duelDraftCards.slice(-(max - 1)) : []), id];
        const validTechnique = duelDraftCards.some((entry) => {
          const troop = state.troops.find((item) => item.id === entry);
          return (
            troop &&
            (duelDraftOrder === "CHARGE"
              ? /caval|mounted|horse/i.test(troop.typeId ?? "")
              : /spear|lancier/i.test(troop.typeId ?? ""))
          );
        });
        if (
          ["CHARGE", "SPEAR_WALL"].includes(duelDraftOrder) &&
          !validTechnique
        )
          duelDraftOrder = "ATTACK";
        if (
          duelDraftOrder !== "ATTACK" &&
          duelDraftCards.includes("HERO") &&
          state.players.find((entry) => entry.id === team.id)
            ?.commandPointsMax < 2
        )
          duelDraftOrder = "ATTACK";
        queueDuelDraft();
        refresh();
      },
      onPlayCard: (id) => {
        if (!sameRound() || duelSubmitting) return;
        duelDraftCards = duelDraftCards.includes(id)
          ? [...duelDraftCards]
          : [id];
        const troop = activeBattle.duel.troops.find((entry) => entry.id === id);
        const techniqueFits =
          duelDraftOrder === "ATTACK" ||
          duelDraftOrder === "DEFEND" ||
          (duelDraftOrder === "CHARGE" &&
            /caval|mounted|horse/i.test(troop?.typeId ?? "")) ||
          (duelDraftOrder === "SPEAR_WALL" &&
            /spear|lancier/i.test(troop?.typeId ?? ""));
        if (!techniqueFits) duelDraftOrder = "ATTACK";
        queueDuelDraft();
        refresh();
      },
      onReplayEnd: () => {
        if (sameBattle()) refresh();
      },
      onOrder: (id) => {
        if (!sameRound() || duelSubmitting) return;
        const available =
          state.players.find((entry) => entry.id === team.id)
            ?.commandPointsMax ?? 0;
        if (
          (id === "ATTACK" ? 0 : 1) +
            (duelDraftCards.includes("HERO") ? 1 : 0) >
          available
        ) {
          battleMessage = "PC insuffisants.";
          refresh();
          return;
        }
        duelDraftOrder = id;
        queueDuelDraft();
        refresh();
      },
      onLock: () =>
        finishChoice({ cards: duelDraftCards, order: duelDraftOrder }),
      onPass: () => finishChoice({ cards: [], order: "ATTACK" }),
      onFlee: () => finishChoice({ cards: [], order: "ATTACK", flee: true }),
    });
  }
  function startBattleTimer() {
    stopTimer();
    battleTimer = schedule(() => {
      if (!activeBattle || activeBattle.status === "finished") {
        stopTimer();
        return;
      }
      if (activeBattle.duel?.mode === "DUEL") {
        updateCountdown(element, activeBattle.decisionDeadlineAt);
        if (getSession().authoritative || activeBattle.duel.tactics) return;
        if (getSession().multiplayer && !getSession().isHost) return;
        const previousRound = activeBattle.duel.round;
        const previousPhase = activeBattle.duel.phase;
        if (now() >= activeBattle.decisionDeadlineAt) {
          const localTeam = activeBattle.teams.find((entry) =>
            entry.heroes.some(
              (participant) => participant.playerId === getSession().playerId,
            ),
          );
          const localDecision = activeBattle.duel.players.find(
            (entry) => entry.id === localTeam?.id,
          );
          if (
            localDecision &&
            !localDecision.locked &&
            !activeBattle.duel.pendingChoices[localTeam.id]
          ) {
            const cards =
              duelDraftBattleId === activeBattle.id &&
              duelDraftRound === activeBattle.duel.round
                ? duelDraftCards
                : [];
            try {
              activeBattle.submitDuelChoice(localTeam.id, {
                cards,
                order: cards.length ? duelDraftOrder : "ATTACK",
              });
            } catch {
              activeBattle.submitDuelChoice(localTeam.id, {
                cards: [],
                order: "ATTACK",
              });
            }
          }
          activeBattle.advanceDuel({
            now: now(),
            humanTeamIds: duelHumanTeamIds(),
          });
          resolveFinishedBattle();
          if (
            activeBattle.duel.round !== previousRound ||
            activeBattle.duel.phase !== previousPhase
          ) {
            renderBattle();
            onChange();
          }
        }
        return;
      }
    }, 500);
  }
  function renderBattle() {
    if (!activeBattle) return;
    if (isPaused()) {
      pendingBattleRender = true;
      return;
    }
    onPublish();
    const team =
      activeBattle.teams.find((entry) =>
        entry.heroes.some(
          (participant) => participant.playerId === getSession().playerId,
        ),
      ) ?? activeBattle.teams[0];
    if (
      battleResult &&
      !(activeBattle.duel.tactics && tactics.hasPlayback(activeBattle))
    ) {
      renderResultView({
        element,
        battle: activeBattle,
        result: battleResult,
        playerId: getSession().playerId,
        playerTeamId: team.id,
        lootMessage: battleLootMessage,
        onReturnToMap: () => {
          onReturnToMap();
          onChange();
        },
      });
      return;
    }
    if (activeBattle.duel.tactics) {
      tactics.show({
        element,
        battle: activeBattle,
        teamId: team.id,
        getSession,
        applyServerState,
        refresh: renderBattle,
        onChange,
      });
      updateCountdown(element, activeBattle.decisionDeadlineAt);
      return;
    }
    if (activeBattle.duel.mode === "DUEL") {
      renderBattleDuel(team);
      return;
    }
  }
  function resolveFinishedBattle() {
    if (!activeBattle || activeBattle.status !== "finished" || battleResolved)
      return;
    const result = getSession().game.resolveBattle(activeBattle.id);
    battleResolved = true;
    battleResult = result;
    stopTimer();
    onNavigationLocked(false);
    onResolved({ battle: activeBattle, result });
    battleMessage = `Bataille terminée · vainqueur ${activeBattle.winnerTeamId ?? "aucun"}.`;
    onLog(
      `Champ de bataille créé${result.lootSite ? " et butin calculé" : ", sans butin"}${result.destroyedLocationId ? " · camp ennemi détruit" : ""}${result.capturedLocationId ? " · lieu capturé" : ""}.`,
    );
  }
  async function collectLoot() {
    const { game, heroId, playerId } = getSession();
    if (!game || !activeBattle || !battleResult?.battleLoot) return;
    const selection = Object.fromEntries(
      battleResult.battleLoot.entries.map((entry) => [
        entry.id,
        entry.allocations?.[playerId] ?? 0,
      ]),
    );
    const result = await game.collectBattleLoot({
      battleId: activeBattle.id,
      playerId: playerId,
      heroId,
      selection,
    });
    if (result == null) return;
    battleLootMessage = result.success
      ? "Butin transféré dans les bagages."
      : result.reason === "insufficient_slots"
        ? "Les bagages n’ont pas assez de place."
        : `Récupération impossible : ${result.reason}.`;
    if (result.battleLoot) battleResult.battleLoot = result.battleLoot;
    renderBattle();
    onChange();
  }

  function stopTimer() {
    if (battleTimer !== null) cancel(battleTimer);
    battleTimer = null;
  }
  function fingerprint() {
    return activeBattle
      ? JSON.stringify([
          activeBattle.id,
          activeBattle.duel,
          activeBattle.decisionDeadlineAt,
          activeBattle.status,
          battleResult,
        ])
      : null;
  }
  function sync() {
    const previous = fingerprint();
    const { game, playerId } = getSession();
    if (activeBattle)
      activeBattle =
        game.battles.find((battle) => battle.id === activeBattle.id) ?? null;
    if (!activeBattle) {
      const joined = [...game.battles]
        .reverse()
        .find(
          (battle) =>
            battle.status !== "finished" &&
            battle.teams.some((team) =>
              team.heroes.some((hero) => hero.playerId === playerId),
            ),
        );
      if (joined)
        activateBattle(joined, {
          ambushTeamId: joined.config.ambushTeamId,
          restore: true,
        });
      else {
        reset();
      }
    }
    if (activeBattle?.status === "finished") {
      battleResolved = true;
      battleResult =
        [...game.battleReports]
          .reverse()
          .find((report) => report.battleId === activeBattle.id) ??
        battleResult;
      stopTimer();
      onNavigationLocked(false);
    }
    return fingerprint() !== previous;
  }
  function syncAutonomous() {
    if (activeBattle && activeBattle.status !== "finished") return;
    const { game, heroId } = getSession();
    const joined = [...game.battles]
      .reverse()
      .find(
        (battle) =>
          battle.status !== "finished" &&
          battle.teams.some((team) =>
            team.heroes.some((hero) => hero.sourceId === heroId),
          ),
      );
    if (joined)
      activateBattle(joined, { ambushTeamId: joined.config.ambushTeamId });
  }
  function reset() {
    generation += 1;
    tactics.reset();
    stopTimer();
    activeBattle = null;
    battleResult = null;
    battleResolved = false;
    duelDraftBattleId = null;
    duelDraftRound = 0;
    duelDraftCards = [];
    duelDraftOrder = "ATTACK";
    duelDraftSend = Promise.resolve();
    duelSubmitting = false;
    battleMessage = "";
    battleLootMessage = "";
    pendingBattleRender = false;
    onNavigationLocked(false);
  }
  return {
    get active() {
      return activeBattle;
    },
    activate: activateBattle,
    openLocation: confirmedAction(openLocation, onLog),
    openAutonomous: confirmedAction(openAutonomous, onLog),
    render: renderBattle,
    collectLoot: confirmedAction(collectLoot, onLog),
    sync,
    syncAutonomous,
    resume() {
      if (pendingBattleRender) {
        pendingBattleRender = false;
        renderBattle();
      }
    },
    reset,
  };
}
