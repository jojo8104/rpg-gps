import { renderTacticalBattleView } from "../ui/tactical-battle-view.js";

/** Brouillons d'intentions et sélection ; aucune résolution locale. */
export function createTacticalBattleController({
  render = renderTacticalBattleView,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer),
} = {}) {
  let replay = null,
    replayTimer = null,
    seenReport = null;
  let key = null,
    selected = null,
    orders = [],
    fanOpen = false,
    specialOpen = false;
  let harassing = false;
  let charge = false,
    submitting = false,
    message = "",
    epoch = 0;
  let draftQueue = Promise.resolve(),
    draftVersion = 0;
  function reset() {
    if (replayTimer !== null) cancel(replayTimer);
    replayTimer = null;
    replay = null;
    epoch++;
    key = null;
    orders = [];
    selected = null;
    fanOpen = false;
    specialOpen = false;
    charge = false;
    harassing = false;
    submitting = false;
    message = "";
    draftQueue = Promise.resolve();
    draftVersion++;
  }
  function show({
    element,
    battle,
    teamId,
    getSession,
    applyServerState,
    refresh,
    onChange,
  }) {
    const state = battle.duel;
    const nextKey = `${battle.id}:${state.round}`;
    if (nextKey !== key) {
      reset();
      key = nextKey;
      orders = structuredClone(state.pendingChoices[teamId]?.orders ?? []);
    }
    const token = epoch;
    const current = () => token === epoch && key === nextKey;
    const player = state.players.find((entry) => entry.id === teamId);
    const editable = () =>
      current() &&
      !replay &&
      !submitting &&
      !player.locked &&
      state.phase === "CHOICE";
    const report = state.lastResult;
    const reportKey = report && `${battle.id}:${report.round}`;
    if (report?.initial && report.steps.length && reportKey !== seenReport) {
      seenReport = reportKey;
      replay = { snapshot: report.initial, index: -1, stage: "start", report };
    }
    if (replay && replayTimer === null) {
      replayTimer = schedule(
        () => {
          replayTimer = null;
          if (!current() || !replay) return;
          if (replay.stage === "move") {
            replay.snapshot =
              replay.report.steps[replay.index].combat ??
              replay.report.steps[replay.index].after;
            replay.stage = "impact";
          } else if (
            replay.stage === "impact" &&
            replay.report.steps[replay.index].events.some((event) =>
              ["return", "advance"].includes(event.type),
            )
          ) {
            replay.snapshot = replay.report.steps[replay.index].after;
            replay.stage = "return";
          } else {
            replay.index++;
            if (replay.index >= replay.report.steps.length) replay = null;
            else {
              replay.snapshot = replay.report.steps[replay.index].movement;
              replay.stage = "move";
            }
          }
          refresh();
        },
        replay.stage === "start"
          ? 300
          : ["move", "return"].includes(replay.stage)
            ? 800
            : 650,
      );
    }
    function queueDraft() {
      const session = getSession();
      if (!session.authoritative || !session.client) return;
      const version = ++draftVersion;
      const choice = { orders: structuredClone(orders) };
      draftQueue = draftQueue
        .catch(() => {})
        .then(async () => {
          if (!editable() || version !== draftVersion) return;
          const response = await session.client.sendBattleCommand(
            battle.id,
            "submitDuelChoice",
            [choice, state.round],
          );
          if (current() && !submitting && response.game?.state)
            applyServerState(response.game.state, { renderNow: false });
        })
        .catch((error) => {
          if (current()) {
            message = error.message;
            refresh();
          }
        });
    }
    function setOrder(order) {
      if (!editable()) return;
      const index = orders.findIndex(
        (entry) => entry.actorId === order.actorId,
      );
      if (index < 0 && orders.length >= player.orderBudget) {
        message =
          "Tous vos ordres sont utilisés. Annulez un ordre pour en ajouter un.";
        refresh();
        return;
      }
      if (index < 0) orders.push(order);
      else orders[index] = order;
      message = "Ordre programmé. Vous pouvez encore le modifier.";
      specialOpen = false;
      charge = false;
      harassing = false;
      fanOpen = false;
      queueDraft();
      refresh();
    }
    async function lock(flee = false) {
      if (!editable()) return;
      if (!getSession().authoritative || !getSession().client) {
        message = "Le combat tactique nécessite la connexion au serveur.";
        refresh();
        return;
      }
      const choice = { orders: structuredClone(orders), flee };
      submitting = true;
      draftVersion++;
      message = "Envoi des ordres…";
      refresh();
      try {
        await draftQueue;
        if (!current()) return;
        const response = await getSession().client.sendBattleCommand(
          battle.id,
          "lockDuelChoice",
          [choice, state.round],
        );
        if (current() && response.game?.state)
          applyServerState(response.game.state, { renderNow: false });
        if (current()) message = "Ordres confirmés.";
      } catch (error) {
        if (current()) message = error.message;
      } finally {
        if (current()) {
          submitting = false;
          refresh();
          onChange();
        }
      }
    }
    const displayedBattle = replay
      ? {
          ...battle,
          duel: {
            ...state,
            troops: replay.snapshot.troops,
            players: replay.snapshot.players,
            tactics: {
              ...state.tactics,
              positions: replay.snapshot.positions,
              bonuses: replay.snapshot.bonuses ?? state.tactics.bonuses,
            },
          },
        }
      : battle;
    render({
      element,
      battle: displayedBattle,
      teamId,
      selected,
      orders: replay ? [] : orders,
      playback: replay
        ? {
            round: report.round,
            priority:
              replay.index < 0 ? null : report.steps[replay.index].priority,
            stage: replay.stage,
            events: replay.index < 0 ? [] : report.steps[replay.index].events,
          }
        : null,
      onSkipPlayback: () => {
        if (replayTimer !== null) cancel(replayTimer);
        replayTimer = null;
        replay = null;
        refresh();
      },
      fanOpen,
      specialOpen,
      charge,
      harassing,
      submitting,
      message,
      onFan: () => {
        if (!editable()) return;
        fanOpen = !fanOpen;
        specialOpen = false;
        if (fanOpen && (!selected || state.tactics.positions[selected]))
          selected =
            state.troops.find(
              (actor) =>
                actor.ownerId === teamId &&
                actor.count > 0 &&
                state.tactics.options[actor.id] &&
                !state.tactics.positions[actor.id],
            )?.id ?? `HERO:${teamId}`;
        refresh();
      },
      onSelect: (id) => {
        if (!editable()) return;
        selected = id;
        specialOpen = false;
        charge = false;
        harassing = false;
        refresh();
      },
      onCell: (p, occupant) => {
        if (!editable()) return;
        if (
          occupant?.ownerId === teamId &&
          occupant.id !== selected &&
          selected &&
          !harassing
        ) {
          const departing = orders.findIndex(
            (order) =>
              order.actorId === occupant.id &&
              ["MOVE", "CHARGE"].includes(order.type),
          );
          const ownIndex = orders.findIndex(
            (order) => order.actorId === selected,
          );
          const type = charge ? "CHARGE" : "MOVE";
          if (
            departing >= 0 &&
            (ownIndex < 0 || departing < ownIndex) &&
            state.tactics.options[selected]?.[charge ? "charge" : "move"].some(
              (target) => target.x === p.x && target.y === p.y,
            )
          ) {
            setOrder({ actorId: selected, type, to: p });
            return;
          }
        }
        if (occupant?.ownerId === teamId) {
          if (selected === occupant.id) specialOpen = !specialOpen;
          else {
            selected = occupant.id;
            specialOpen = false;
            charge = false;
            harassing = false;
          }
          refresh();
          return;
        }
        if (!selected) {
          message = "Sélectionnez une unité ou ouvrez vos cartes de réserve.";
          refresh();
          return;
        }
        const options = state.tactics.options[selected];
        if (!options) return;
        if (harassing) {
          if (occupant && options.harass?.includes(occupant.id))
            setOrder({
              actorId: selected,
              type: "HARASS",
              targetId: occupant.id,
            });
          else {
            message = "Choisissez une cible de harcèlement autorisée.";
            refresh();
          }
          return;
        }
        if (occupant && options.attack.includes(occupant.id) && !charge)
          setOrder({
            actorId: selected,
            type: "ATTACK",
            targetId: occupant.id,
          });
        else {
          const action = state.tactics.positions[selected]
            ? charge
              ? "CHARGE"
              : "MOVE"
            : "DEPLOY";
          const destinations =
            options[
              { CHARGE: "charge", MOVE: "move", DEPLOY: "deploy" }[action]
            ];
          if (
            destinations.some((target) => target.x === p.x && target.y === p.y)
          )
            setOrder({ actorId: selected, type: action, to: p });
          else {
            message = "Cette case n’est pas une destination autorisée.";
            refresh();
          }
        }
      },
      onSpecial: (type) => {
        if (!editable() || !selected) return;
        if (type === "HARASS") {
          harassing = true;
          charge = false;
          specialOpen = false;
          message =
            "Choisissez la cible à harceler. La troupe reviendra à son point de départ.";
          refresh();
        } else if (type === "CHARGE") {
          charge = true;
          specialOpen = false;
          message = "Choisissez une destination de charge.";
          refresh();
        } else setOrder({ actorId: selected, type });
      },
      onBase: () => {
        if (editable() && state.tactics.options[selected]?.base)
          setOrder({ actorId: selected, type: "ATTACK_BASE" });
      },
      onCancel: (id) => {
        if (!editable()) return;
        orders = orders.filter((order) => order.actorId !== id);
        queueDraft();
        refresh();
      },
      onPriority: (index, delta) => {
        if (!editable() || !orders[index + delta]) return;
        [orders[index], orders[index + delta]] = [
          orders[index + delta],
          orders[index],
        ];
        queueDraft();
        refresh();
      },
      onLock: () => lock(),
      onFlee: () => lock(true),
    });
  }
  function hasPlayback(battle) {
    const report = battle.duel.lastResult;
    return Boolean(
      replay ||
        (report?.initial &&
          report.steps.length &&
          `${battle.id}:${report.round}` !== seenReport),
    );
  }
  return { show, reset, hasPlayback };
}
