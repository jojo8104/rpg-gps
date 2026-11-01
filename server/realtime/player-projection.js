import { watchedPosition } from "../../app/js/core/location-watch-service.js";
import { distanceMeters } from "../../app/js/core/geo.js";
import { playerMapVisibility } from "../../app/js/core/player-map-visibility.js";
import { duelPlayerView } from "../../app/js/core/battle-duel/state.js";
import { ravitaillementView } from "../quests/ravitaillement-integration.js";
import { createExplorationProjection } from "./exploration-projection.js";

/** Projection appliquée à chaque envoi réseau, y compris les accusés de réception. */
export function projectPlayerPayload(
  payload,
  { playerId, lobby, gameSnapshot, positions, now = Date.now() },
) {
  const state = gameSnapshot?.state;
  const mapVisibility = state
    ? playerMapVisibility(state, playerId, now)
    : null;
  const exploration = createExplorationProjection(state, playerId, {
    now,
    visibleLocationIds: mapVisibility?.locations,
  });
  const phaseId = state?.scenarioState?.currentPhaseId;
  const activePhase =
    state?.scenarioState?.phaseStates?.[phaseId]?.status === "active"
      ? state.scenario?.phases.find((phase) => phase.id === phaseId)
      : null;
  const activePlacementSlots = new Set(
    (activePhase?.objectives ?? [])
      .map((objective) => objective.trigger?.locationSlotId)
      .filter(Boolean),
  );
  const players = lobby.launch?.players ?? lobby.players;
  const humans = new Set(players.map((p) => p.id));
  const participants =
    state?.setup.participants ??
    players.map((p) => ({
      playerId: p.id,
      teamId: lobby.configuration.gameType === "cooperation" ? "green" : p.id,
    }));
  const team = participants.find((p) => p.playerId === playerId)?.teamId;
  const allied = (id) =>
    id === playerId ||
    Boolean(
      team && participants.some((p) => p.playerId === id && p.teamId === team),
    );
  const observer = positions.positions.find((p) => p.playerId === playerId);
  const observerHero = state?.heroes.find((h) => h.playerId === playerId);
  const visionFeatures =
    state?.heroClasses.find((c) => c.id === observerHero?.classId)?.features ??
    {};
  const initialVision =
    visionFeatures.visionRadius ??
    (observer?.heroClassId === "ranger" ? 45 : 30);
  const maximumVision = visionFeatures.maximumVisionRadius ?? initialVision;
  const maximumVisionLevel = visionFeatures.maximumVisionLevel ?? 20;
  const observerLevel = Math.max(
    1,
    Math.min(maximumVisionLevel, observerHero?.level ?? 1),
  );
  const vision =
    maximumVisionLevel <= 1
      ? initialVision
      : Math.min(
          maximumVision,
          initialVision +
            ((maximumVision - initialVision) * (observerLevel - 1)) /
              (maximumVisionLevel - 1),
        );
  const range = state?.setup.rules.engagementRadiusMeters ?? 8;
  const distance = (target) =>
    observer?.position && target?.position
      ? distanceMeters(observer.position, target.position)
      : Infinity;
  const level = (target) =>
    allied(target.playerId)
      ? 3
      : distance(target) <= range
        ? 3
        : distance(target) <= vision / 2
          ? 2
          : 1;
  const visible = (target) =>
    target.playerId === playerId ||
    (target.connected &&
      (allied(target.playerId) ||
        distance(target) <= vision ||
        (state && watchedPosition(state, playerId, target.position))));
  const visibleIds = new Set(
    positions.positions.filter(visible).map((p) => p.playerId),
  );
  const hiddenHeroIds = new Set(
    (state?.heroes ?? [])
      .filter((h) => humans.has(h.playerId) && !visibleIds.has(h.playerId))
      .map((h) => h.id),
  );
  const ownBattle = (battle) =>
    battle.teams?.some((t) => t.heroes?.some((h) => h.playerId === playerId));
  const battleIds = new Set(
    (state?.battles ?? []).filter(ownBattle).map((b) => b.id),
  );
  const positionProjection = (list) =>
    list.filter(visible).map((target) => {
      const copy = structuredClone(target);
      if (level(target) === 1) {
        copy.heroState = null;
        copy.heroClassId = null;
        copy.heroGender = null;
      }
      if (level(target) === 2 && copy.heroState)
        copy.heroState = { level: copy.heroState.level };
      return copy;
    });
  function battleProjection(battle) {
    if (!battle.duel || !ownBattle(battle)) return battle;
    const ownTeam = battle.teams.find((entry) =>
      entry.heroes.some((hero) => hero.playerId === playerId),
    );
    battle.duel = duelPlayerView(battle.duel, ownTeam.id);
    for (const entry of battle.teams)
      if (entry.id !== ownTeam.id) entry.units = [];
    return battle;
  }
  function worldProjection(source) {
    const {
      explorationState: _privateExploration,
      explorationView: _untrustedView,
      ...publicSource
    } = source;
    const copy = structuredClone(publicSource);
    if (state) copy.explorationView = exploration.view;
    if (copy.worldState?.flags) delete copy.worldState.flags.playerPlacement;
    if (copy.territoryState) {
      copy.territoryState = { view: structuredClone(copy.territoryState.view) };
      if (copy.territoryState.view)
        copy.territoryState.view.progress = copy.territoryState.view.progress?.[
          playerId
        ]
          ? { [playerId]: copy.territoryState.view.progress[playerId] }
          : {};
    }
    if (copy.questEngineState) {
      copy.questEngineState = { view: ravitaillementView(source, playerId) };
    }
    if (Array.isArray(copy.teamFortQuestState))
      copy.teamFortQuestState = copy.teamFortQuestState.filter((quest) =>
        quest.playerIds.includes(playerId),
      );
    if (copy.itemAcquisitionState) {
      const items = copy.itemAcquisitionState;
      const ownHeroIds = new Set(
        (state?.heroes ?? [])
          .filter((hero) => hero.playerId === playerId)
          .map((hero) => hero.id),
      );
      items.visits = Object.fromEntries(
        Object.entries(items.visits ?? {}).filter(([heroId]) =>
          ownHeroIds.has(heroId),
        ),
      );
      items.rewards = (items.rewards ?? []).filter(
        (reward) =>
          (!reward.heroId || ownHeroIds.has(reward.heroId)) &&
          (!reward.playerId || reward.playerId === playerId) &&
          (!reward.locationId ||
            !mapVisibility ||
            mapVisibility.locations.has(reward.locationId)),
      );
      const rewardIds = new Set(items.rewards.map((reward) => reward.id));
      const visibleLocationIds = (source.locations ?? [])
        .map((location) => location.id)
        .filter((id) => !mapVisibility || mapVisibility.locations.has(id));
      items.forgeUses = Object.fromEntries(
        Object.entries(items.forgeUses ?? {}).filter(([id]) =>
          visibleLocationIds.includes(id),
        ),
      );
      items.taken = (items.taken ?? []).filter(
        (id) =>
          rewardIds.has(id) ||
          [...ownHeroIds].some((heroId) =>
            id.startsWith(`treasure:${heroId}:`),
          ) ||
          visibleLocationIds.some(
            (locationId) =>
              id === `contract:${locationId}` ||
              ["merchant", "forge", "fence", "ruin"].some((source) =>
                id.startsWith(`${source}:${locationId}:`),
              ),
          ),
      );
    }
    if (mapVisibility) {
      for (const [collection, visibleIds] of Object.entries(mapVisibility))
        if (Array.isArray(copy[collection]))
          copy[collection] = copy[collection].filter((entry) =>
            visibleIds.has(entry.id),
          );
      // Keep references consistent with the projected location collection. The
      // authoritative world keeps all bindings and placements for hidden places.
      const locationIds = new Set(
        (copy.locations ?? []).map((location) => location.id),
      );
      // Le contrat de génération exige le monde complet, pas une vue sous brouillard.
      // Il reste présent dans l’état officiel et validé par le serveur.
      if (copy.scenario) copy.scenario.mapDefinition = null;
      if (Array.isArray(copy.scenarioLocationBindings))
        copy.scenarioLocationBindings = copy.scenarioLocationBindings.filter(
          (binding) => locationIds.has(binding.locationId),
        );
      if (copy.setup?.locationSetup?.placements) {
        const slots = new Set(
          (copy.scenarioLocationBindings ?? []).map((b) => b.locationSlotId),
        );
        copy.setup.locationSetup.placements = Object.fromEntries(
          Object.entries(copy.setup.locationSetup.placements).filter(([id]) =>
            slots.has(id),
          ),
        );
      }
      if (copy.scenarioRuntime || copy.scenario) {
        copy.scenarioRuntime = {
          ...(copy.scenarioRuntime ?? {}),
          placements: Object.fromEntries(
            Object.entries(copy.scenarioRuntime?.placements ?? {}).flatMap(
              ([slotId, placement]) => {
                if (locationIds.has(placement.locationId))
                  return [[slotId, placement]];
                if (
                  !activePlacementSlots.has(slotId) ||
                  placement.strategy !== "distance" ||
                  !["walking", "ready"].includes(placement.status)
                )
                  return [];
                // Progrès public de l'objectif, sans identité ni géographie du futur lieu.
                return [
                  [
                    slotId,
                    {
                      strategy: placement.strategy,
                      status: placement.status,
                      distanceMeters: placement.distanceMeters,
                      minimumDistanceMeters: placement.minimumDistanceMeters,
                      distanceFromOriginMeters:
                        placement.distanceFromOriginMeters,
                      minimumDistanceFromOriginMeters:
                        placement.minimumDistanceFromOriginMeters,
                      confirmationCount: placement.confirmationCount,
                      confirmations: placement.confirmations,
                    },
                  ],
                ];
              },
            ),
          ),
        };
      }
    }
    if (copy.battles) {
      copy.battles = copy.battles.filter(ownBattle);
      copy.battles.forEach(battleProjection);
    }
    if (copy.battleReports)
      copy.battleReports = copy.battleReports.filter((r) =>
        battleIds.has(r.battleId),
      );
    if (copy.battleSites)
      copy.battleSites = copy.battleSites.filter(
        (site) =>
          !site.participantPlayerIds?.some(
            (id) => humans.has(id) && !allied(id),
          ) || site.participantPlayerIds.includes(playerId),
      );
    if (copy.battleLoot)
      copy.battleLoot = copy.battleLoot.filter(
        (loot) => !loot.battleId || battleIds.has(loot.battleId),
      );
    if (copy.autonomousGroupTraces)
      copy.autonomousGroupTraces = copy.autonomousGroupTraces.filter(
        (trace) =>
          !(
            trace.owner?.kind === "player" &&
            humans.has(trace.owner.id) &&
            !allied(trace.owner.id)
          ),
      );
    if (copy.autonomousGroups)
      copy.autonomousGroups.forEach((group) => {
        if (
          group.mission?.managedBy === "messenger_relay" &&
          group.owner.id !== playerId
        ) {
          group.message = null;
          group.mission = {
            kind: "deliver_message",
            managedBy: "messenger_relay",
            coordinateMode: group.mission.coordinateMode,
          };
          group.movement = null;
        }
      });
    if (copy.watchBeacons)
      copy.watchBeacons = copy.watchBeacons.filter(
        (b) => !humans.has(b.ownerPlayerId) || allied(b.ownerPlayerId),
      );
    if (copy.locations)
      copy.locations.forEach((location) => {
        if (location.heroIds)
          location.heroIds = location.heroIds.filter(
            (id) => !hiddenHeroIds.has(id),
          );
      });
    return copy;
  }
  function stateProjection(source) {
    const copy = worldProjection(source);
    copy.heroes = copy.heroes
      .filter((h) => !humans.has(h.playerId) || visibleIds.has(h.playerId))
      .map((h) => {
        if (!humans.has(h.playerId) || allied(h.playerId)) return h;
        const target = positions.positions.find(
          (p) => p.playerId === h.playerId,
        );
        // Les détails tactiques restent dans les batailles auxquelles le destinataire participe.
        return {
          id: h.id,
          playerId: h.playerId,
          name: h.name,
          position: h.position,
          ...(level(target) >= 2
            ? { classId: h.classId, gender: h.gender, level: h.level }
            : {}),
          ...(level(target) === 3
            ? { health: h.health, maxHealth: h.maxHealth, army: h.army }
            : {}),
        };
      });
    copy.players = copy.players.map((p) =>
      p.id === playerId
        ? p
        : {
            id: p.id,
            name: p.name,
            heroIds: p.heroIds.filter((id) => !hiddenHeroIds.has(id)),
          },
    );
    copy.playerSessions = (copy.playerSessions ?? [])
      .filter((s) => s.playerIds.includes(playerId))
      .map((s) => {
        delete s.inventoryFingerprint;
        return s;
      });
    copy.eventLog = (copy.eventLog ?? []).filter(
      (event) =>
        (!mapVisibility ||
          ((!event.groupId ||
            mapVisibility.autonomousGroups.has(event.groupId)) &&
            (!event.locationId ||
              mapVisibility.locations.has(event.locationId)))) &&
        (!JSON.stringify(event).match(/player|hero|battle/i) ||
          event.playerId === playerId ||
          event.heroId === observerHero?.id),
    );
    return copy;
  }
  function walk(value) {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(walk);
    if (value.duel && Array.isArray(value.teams))
      return battleProjection(structuredClone(value));
    if (
      value.setup &&
      Array.isArray(value.heroes) &&
      Array.isArray(value.players)
    )
      return stateProjection(value);
    if (Array.isArray(value.positions)) {
      const copy = { ...value, positions: positionProjection(value.positions) };
      delete copy.explorationState;
      return copy;
    }
    if (Array.isArray(value.locations)) return worldProjection(value);
    const copy = Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "explorationState")
        .map(([key, child]) => [key, walk(child)]),
    );
    if (playerId !== lobby.hostPlayerId && copy.configuration?.preparation) {
      copy.configuration.preparation = {
        ...copy.configuration.preparation,
        hasQr: Object.values(
          copy.configuration.preparation.locations ?? {},
        ).some((entry) => entry.placement === "qr"),
        hasDeferred: Object.values(
          copy.configuration.preparation.locations ?? {},
        ).some((entry) =>
          ["player-walk", "validated-cell"].includes(entry.placement),
        ),
        locations: {},
      };
      delete copy.preparationCatalog;
      delete copy.preparationProblems;
    }
    return copy;
  }
  return exploration.sanitize(walk(payload));
}
