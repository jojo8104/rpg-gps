import { HeroConcealmentService } from "../core/hero-concealment-service.js";
import { confirmedAction } from "./confirmed-action.js";
import { AmbushService } from "../core/ambush-service.js";
import { formatInteger } from "../ui/number-format.js";
import { formatCooldown } from "../ui/cooldown-format.js";
import {
  createHeroAbilityView,
  openWatchMessagesView,
} from "../ui/hero-ability-view.js";
// Possède la préparation des capacités et délègue leurs règles aux services du moteur.
export function createHeroAbilityController({
  getSession,
  powerNav,
  mapElement,
  targeting,
  asGps,
  distance,
  worldDistance,
  isLocationEnabled,
  positionFor,
  baseRangesFor,
  rebuildLocationEngine,
  persistFieldState,
  selectLocation,
  switchView,
  beginAutonomousBattle,
  onChange,
  logTest,
  deviceAlerts,
  focusAlert,
  now = () => Date.now(),
  schedule = setTimeout,
  cancel = clearTimeout,
  confirm = (text) => window.confirm(text),
  concealment = new HeroConcealmentService(),
  ambushService = new AmbushService({
    preparationDurationMs: concealment.stationaryDurationMs,
  }),
  views = {},
}) {
  let preparedHeroAmbush = null,
    dialog = null,
    epoch = 0;
  const unreadWatchMessages = [],
    timers = new Set();
  const view = (views.create ?? createHeroAbilityView)({
    powerNav,
    mapElement,
    actions: {
      launchPreparedAmbush,
      useDivination,
      useAstralTravel: confirmedAction(useAstralTravel, logTest),
      placeWatchBeacon: confirmedAction(placeWatchBeacon, logTest),
      openWatchMessages,
    },
  });
  const messagesView = views.messages ?? openWatchMessagesView;
  function usable(classId = null) {
    const { game, hero, battle } = getSession();
    return Boolean(
      game &&
        hero?.state === "active" &&
        (!classId || hero.classId === classId) &&
        (!battle || battle.status === "finished"),
    );
  }
  function scheduleExpiry(delay) {
    const revision = epoch;
    const timer = schedule(() => {
      timers.delete(timer);
      if (revision === epoch) onChange();
    }, delay);
    timers.add(timer);
  }
  function classPowerFailure(result) {
    return result.reason === "ability_on_cooldown"
      ? `recharge ${formatCooldown(result.cooldownRemainingMs)}`
      : result.reason;
  }
  function preparedAmbushTarget() {
    const { game, mode, localPlayerId, positioning, battle } = getSession();

    if (!preparedHeroAmbush || (battle && battle.status !== "finished"))
      return null;
    const maximumDistance = preparedHeroAmbush.maximumDistance;
    const candidate = game.autonomousGroups
      .filter(
        (group) =>
          group.owner.id !== localPlayerId &&
          !["destroyed", "mission_failed"].includes(group.status),
      )
      .map((group) => ({
        group,
        distance: distance(
          positioning.position,
          mode === "gps"
            ? group.position
            : [group.position.latitude, group.position.longitude],
        ),
      }))
      .filter((entry) => entry.distance <= maximumDistance)
      .sort((first, second) => first.distance - second.distance)[0];
    return candidate ? { ...candidate, maximumDistance } : null;
  }

  function launchPreparedAmbush() {
    if (!usable()) return false;
    const { game, hero, mode } = getSession();

    if (!preparedHeroAmbush) {
      if (!concealment.confirm(now())) return;
      const baseRange =
        mode === "gps" ? game.setup.rules.engagementRadiusMeters : 8;
      const maximumDistance = ambushService.engagementRange({
        baseRange,
        attackerUnits: hero.army.units,
        unitDefinitions: game.unitDefinitions,
      });
      preparedHeroAmbush = {
        preparedAt: now(),
        preparationMs: concealment.preparationMs(now()),
        maximumDistance,
      };
      hero.classFeatureState.gpsConcealmentMultiplier =
        concealment.signatureMultiplier;
      logTest(
        `Embuscade préparée : signature réduite et portée d’attaque portée à ${Math.round(maximumDistance)}${mode === "gps" ? " m" : " unités"}.`,
      );
      onChange();
      return;
    }
    triggerPreparedAmbush();
  }

  function triggerPreparedAmbush() {
    const { game, hero } = getSession();

    const target = preparedAmbushTarget();
    if (!target) return false;
    const bag = game.inventoryService.getHeroBagState(hero);
    const result = ambushService.resolve({
      attacker: {
        signatureMultiplier: concealment.signatureMultiplier,
        units: hero.army.units,
        unitDefinitions: game.unitDefinitions,
        passiveIds: hero.skillIds,
        trainLoad: bag.usedSlots,
        trainCapacity: bag.slotCapacity,
      },
      defender: {
        perception: 0,
        passiveIds: [],
        moving: target.group.status === "moving",
        trainLoad: target.group.cargo.length,
      },
      distance: target.distance,
      maximumDistance: target.maximumDistance,
      preparationMs: preparedHeroAmbush.preparationMs,
    });
    preparedHeroAmbush = null;
    const labels = {
      cancelled: "déjouée",
      light: "légère",
      success: "réussie",
      perfect: "parfaite",
    };
    logTest(
      `Embuscade ${labels[result.level]} · score ${formatInteger(result.attackScore)} contre ${formatInteger(result.defenseScore)}.`,
    );
    return beginAutonomousBattle(target.group, { ambushResult: result });
  }

  function useDivination() {
    if (!usable("mage")) return false;
    const { game, hero, mode } = getSession();

    const cooldown = game.heroClassFeatureService.cooldownRemaining(
      hero,
      "divination",
    );
    if (cooldown > 0) {
      logTest(`Divination : recharge ${formatCooldown(cooldown)}.`);
      return onChange();
    }
    targeting.mode =
      targeting.mode === "target-divination" ? null : "target-divination";
    if (targeting.mode) switchView("map");
    logTest(
      targeting.mode
        ? "Divination prête : touchez la zone à révéler sur la carte."
        : "Divination annulée.",
    );
    onChange();
  }

  async function activateDivinationAt(center) {
    if (!usable("mage")) return false;
    const { game, hero, mode, localPlayerId, playAreaGrid } = getSession();

    const result = await game.activateHeroDivination({
      playerId: localPlayerId,
      heroId: hero.id,
      center,
    });
    if (result == null) return;
    targeting.mode = null;
    if (result.success && playAreaGrid) {
      playAreaGrid.cells
        .filter(
          (cell) => worldDistance(center, cell.center) <= result.vision.radius,
        )
        .forEach((cell) => {
          if (cell.visits === 0)
            playAreaGrid.recordVisit(cell.center, { activity: 0 });
        });
      persistFieldState();
    }
    logTest(
      result.success
        ? `Divination : zone révélée pendant ${Math.round(result.durationMs / 1000)} secondes · ${result.revealedLocationIds.length} nouveau(x) lieu(x).`
        : `Divination impossible : ${classPowerFailure(result)}.`,
    );
    if (result.success) scheduleExpiry(result.durationMs + 50);
    onChange();
  }

  async function useAstralTravel() {
    if (!usable("mage")) return false;
    const { game, hero, localPlayerId, positioning } = getSession();

    const cooldownRemaining = game.heroClassFeatureService.cooldownRemaining(
      hero,
      "astralTravel",
    );
    if (cooldownRemaining > 0) {
      logTest(`Voyage astral : recharge ${formatCooldown(cooldownRemaining)}.`);
      return onChange();
    }
    const result = await game.activateHeroAstralTravel({
      playerId: localPlayerId,
      heroId: hero.id,
    });
    if (result == null) return;
    if (result.success) {
      logTest(
        "Voyage astral : glissez le fantôme vers une cible dans le cercle violet. Durée : 10 secondes, une interaction.",
      );
      scheduleExpiry((result.durationMs ?? 10000) + 50);
    } else logTest(`Voyage astral impossible : ${classPowerFailure(result)}.`);
    onChange();
  }

  function handleWatchBeaconEvents(events = []) {
    const { hero } = getSession();

    const unique = new Map(
      events
        .filter((event) => event.ownerPlayerId === hero?.playerId)
        .map((event) => [event.target.key, event]),
    );
    [...unique.values()].forEach((event) => {
      const target = event.target;
      const label =
        target.kind === "hero"
          ? (target.name ?? "Un joueur")
          : `Un groupe autonome${target.soldiers ? ` de ${target.soldiers} soldats` : ""}`;
      deviceAlerts.notify("notice");
      const message = `${label} entre dans la zone de surveillance.`;
      unreadWatchMessages.push({
        text: message,
        position: { ...target.position },
        detectedAt: event.at,
      });
      view.renderMessages(unreadWatchMessages.length);
      logTest(`Vigie : ${message}`);
    });
  }

  async function placeWatchBeacon() {
    if (!usable("ranger")) return false;
    const { game, hero, mode, positioning } = getSession();

    const owned = game
      .getWatchBeaconsForPlayer(hero.playerId)
      .filter((beacon) => beacon.sourceHeroId === hero.id);
    const replacing = owned.length >= 3;
    if (
      !confirm(
        `${replacing ? "La plus ancienne balise sera retirée. " : ""}Poser une balise de vigie à votre position ?`,
      )
    )
      return;
    const result = await game.placeScoutWatchBeacon({
      playerId: hero.playerId,
      heroId: hero.id,
      position: asGps(positioning.position),
      radius:
        mode === "gps"
          ? game.heroClassFeatureService.watchBeaconRadius(hero)
          : game.heroClassFeatureService.watchBeaconRadius(hero) * (8 / 75),
    });
    if (result == null) return;
    if (result.success)
      logTest(
        `Balise de vigie posée · ${result.count}/${formatInteger(result.maximum)}${result.removedBeaconId ? " · l’ancienne balise a été retirée" : ""}.`,
      );
    else logTest(`Pose impossible : ${result.reason}.`);
    onChange();
  }

  function render() {
    const { game, hero, battle } = getSession();
    if (!game || !hero) {
      view.render(null);
      return {};
    }
    const ambushTarget = preparedAmbushTarget();
    const ambushAvailable =
      usable() &&
      (preparedHeroAmbush !== null || concealment.canConceal(now()));
    const activeWatchBeacons = game
      .getWatchBeaconsForPlayer(hero.playerId)
      .filter((beacon) => beacon.sourceHeroId === hero.id).length;
    const divinationCooldown = game.heroClassFeatureService.cooldownRemaining(
      hero,
      "divination",
    );
    const astralCooldown = game.heroClassFeatureService.cooldownRemaining(
      hero,
      "astralTravel",
    );
    const classPowerUnavailable =
      hero.state !== "active" ||
      Boolean(battle && battle.status !== "finished");
    const model = {
      hero,
      battle,
      prepared: preparedHeroAmbush,
      ambushTarget,
      ambushAvailable,
      activeWatchBeacons,
      divinationCooldown,
      astralCooldown,
      classPowerUnavailable,
      targetingMode: targeting.mode,
    };
    view.render(model);
    return { divinationCooldown, astralCooldown, classPowerUnavailable };
  }
  function openWatchMessages() {
    if (!unreadWatchMessages.length) return;
    const messages = unreadWatchMessages.splice(0),
      revision = epoch;
    dialog?.close();
    dialog = messagesView({
      messages,
      onFocus: (position) => {
        if (revision !== epoch) return;
        switchView("map");
        focusAlert(position);
      },
    });
    view.renderMessages(0);
  }
  function reset() {
    epoch++;
    for (const timer of timers) cancel(timer);
    timers.clear();
    preparedHeroAmbush = null;
    unreadWatchMessages.length = 0;
    concealment.reset();
    dialog?.close();
    dialog = null;
    if (targeting.mode === "target-divination") targeting.mode = null;
    view.render(null);
    view.renderMessages(0);
  }
  return {
    render,
    reset,
    concealment,
    launchPreparedAmbush,
    useDivination,
    activateDivinationAt: confirmedAction(activateDivinationAt, logTest),
    useAstralTravel: confirmedAction(useAstralTravel, logTest),
    placeWatchBeacon: confirmedAction(placeWatchBeacon, logTest),
    handleWatchBeaconEvents,
    openWatchMessages,
    cancelAmbush() {
      preparedHeroAmbush = null;
    },
  };
}
