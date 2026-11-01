import { watchedPosition } from "../core/location-watch-service.js";
import { distanceMeters } from "../core/geo.js";
import { setupMapVisibility } from "../map/SetupMapVisibility.js";

// Prépare les couches visibles à partir du moteur, sans modifier son état.
export function createMapLayerModel({
  getSession,
  autonomousGroupDetectionService,
  asGps,
  mappedLocations,
  visibleQuestTraces,
}) {
  function visibleAutonomousGroups() {
    const {
      game,
      hero,
      playerId: localPlayerId,
      mode,
      position: heroPosition,
      traceVisibility,
    } = getSession();
    const detected = autonomousGroupDetectionService.detect({
      observer: {
        position: asGps(heroPosition),
        detectionMultiplier:
          game.heroClassFeatureService.detectionMultiplier(hero),
      },
      groups: game.autonomousGroups.filter(
        (group) =>
          !["garrisoned", "resolved", "confiscated"].includes(group.status),
      ),
      baseRadius: mode === "gps" ? 15 : 22,
    });
    const divination = game.heroClassFeatureService.activeDivination(hero);
    if (divination || game.getLocationWatchZones(localPlayerId).length)
      game.autonomousGroups
        .filter(
          (group) =>
            !["destroyed", "mission_failed", "completed"].includes(
              group.status,
            ) &&
            (watchedPosition(game, localPlayerId, group.position) ||
              (divination &&
                worldDistance(divination.center, group.position) <=
                  divination.radius)),
        )
        .forEach((group) => {
          if (detected.some((entry) => entry.id === group.id)) return;
          detected.push({
            id: group.id,
            archetypeId: group.archetypeId,
            alignment: group.alignment,
            type: group.type,
            owner: { ...group.owner },
            factionId: group.factionId,
            behavior: group.behavior,
            status: group.status,
            position: { ...group.position },
            soldiers: group.army.units.reduce(
              (sum, unit) => sum + unit.combatantCount,
              0,
            ),
            occupiedCargoSlots: group.cargo.length,
            revealedByDivination: true,
          });
        });
    return detected.map((group) => ({
      ...group,
      ...(game.getAutonomousGroup(group.id)?.visual
        ? { visual: { ...game.getAutonomousGroup(group.id).visual } }
        : {}),
      movement: game.getAutonomousGroup(group.id)?.movement ?? null,
      relation: autonomousGroupRelation(group),
      position:
        mode === "simulation"
          ? [group.position.latitude, group.position.longitude]
          : group.position,
    }));
  }
  function autonomousGroupRelation(group) {
    const {
      game,
      hero,
      playerId: localPlayerId,
      mode,
      position: heroPosition,
      traceVisibility,
    } = getSession();
    if (group.owner?.kind === "player" && group.owner.id === localPlayerId)
      return "own";
    if (group.alignment) return group.alignment;
    if (group.owner?.relation === "ally" || group.owner?.id === "kingdom")
      return "ally";
    if (
      group.owner?.relation === "enemy" ||
      group.owner?.id === "chaos" ||
      group.behavior === "aggressive"
    )
      return "enemy";
    return "neutral";
  }
  function worldDistance(first, second) {
    const {
      game,
      hero,
      playerId: localPlayerId,
      mode,
      position: heroPosition,
      traceVisibility,
    } = getSession();
    return mode === "gps"
      ? distanceMeters(first, second)
      : Math.hypot(
          first.latitude - second.latitude,
          first.longitude - second.longitude,
        );
  }
  function visibleDivinationTargets() {
    const {
      game,
      hero,
      playerId: localPlayerId,
      mode,
      position: heroPosition,
      traceVisibility,
    } = getSession();
    const divination = game.heroClassFeatureService.activeDivination(hero);
    if (!divination) return [];
    return game.heroes
      .filter(
        (candidate) =>
          candidate.id !== hero.id &&
          candidate.state === "active" &&
          candidate.position &&
          worldDistance(divination.center, candidate.position) <=
            divination.radius,
      )
      .map((candidate) => ({
        key: `hero:${candidate.id}`,
        kind: "hero",
        id: candidate.id,
        name: candidate.name,
        position: { ...candidate.position },
      }));
  }
  function visibleAutonomousTraces() {
    const {
      game,
      hero,
      playerId: localPlayerId,
      mode,
      position: heroPosition,
      traceVisibility,
    } = getSession();
    const questIds = new Set([
      "prospectors-trace-1",
      "prospectors-trace-2",
      "convoy-trace-1",
      "convoy-trace-2",
    ]);
    const now = Date.now();
    const detectedGroups = new Map(
      visibleAutonomousGroups().map((group) => [group.id, group]),
    );
    const observer = asGps(heroPosition);
    const detectionMultiplier =
      game.heroClassFeatureService.detectionMultiplier(hero);
    return game.autonomousGroupTraces
      .filter((trace) => {
        if (questIds.has(trace.id)) return false;
        const ownTrace =
          trace.owner.kind === "player" && trace.owner.id === hero.playerId;
        if (ownTrace) return trace.getScore(now) > 0;
        const traceDistance =
          mode === "gps"
            ? distanceMeters(observer, trace.position)
            : Math.hypot(
                observer.latitude - trace.position.latitude,
                observer.longitude - trace.position.longitude,
              );
        return trace.isDetectable({
          at: now,
          minimumScore: 1,
          distance: traceDistance,
          distancePerPoint: mode === "gps" ? 50 : 5,
          detectionMultiplier,
        });
      })
      .map((trace) => ({
        id: trace.id,
        position:
          mode === "simulation"
            ? [trace.position.latitude, trace.position.longitude]
            : trace.position,
        groupId: trace.groupId,
        createdAt: trace.createdAt,
        directionDegrees: trace.directionDegrees,
        color: traceColor(trace, detectedGroups),
      }))
      .filter((trace) => traceVisibility.has(trace.color));
  }
  function traceColor(trace, detectedGroups) {
    const {
      game,
      hero,
      playerId: localPlayerId,
      mode,
      position: heroPosition,
      traceVisibility,
    } = getSession();
    if (trace.owner.kind === "player" && trace.owner.id === hero.playerId)
      return "blue";
    if (!detectedGroups.has(trace.groupId) && trace.groupType !== "hero")
      return "gray";
    if (trace.owner.relation === "ally" || trace.owner.id === "kingdom")
      return "green";
    if (trace.owner.relation === "enemy" || trace.owner.id === "chaos")
      return "red";
    return "gray";
  }
  function visibleSites() {
    const {
      game,
      hero,
      playerId: localPlayerId,
      mode,
      position: heroPosition,
      traceVisibility,
    } = getSession();
    if (!game || !heroPosition) return [];
    return game
      .getVisibleDynamicSites({
        playerId: localPlayerId,
        position: asGps(heroPosition),
      })
      .map((site) =>
        mode === "simulation"
          ? { ...site, interactionRadius: site.kind === "battlefield" ? 8 : 6 }
          : site,
      );
  }
  function frame({
    heading,
    accuracy,
    setupActive,
    fogEnabled,
    field,
    grid,
    heatmapVisible,
  }) {
    const { game, hero, playerId, position } = getSession();
    const divination = game.heroClassFeatureService.activeDivination(hero);
    const visibility = setupMapVisibility({ setupActive, fogEnabled });
    return {
      setupActive,
      geographyPolygon: game.setup?.playArea?.polygon ?? [],
      heroPosition: position,
      heroClassId: hero.classId,
      heroGender: hero.gender,
      heroArmyUnits: hero.army?.units,
      astralTravel: game.heroClassFeatureService.activeAstralTravel(hero),
      heroHeading: heading,
      accuracy,
      visionRadius: game.heroClassFeatureService.visionRadius(hero),
      fogEnabled: visibility.fogEnabled,
      locations: mappedLocations(visibility),
      autonomousGroups: visibleAutonomousGroups(),
      divinationTargets: visibleDivinationTargets(),
      revealedZones: [
        ...game.getLocationWatchZones(playerId),
        ...(divination ? [divination] : []),
      ],
      watchBeacons: game.getWatchBeaconsForPlayer(hero.playerId),
      autonomousTraces: visibleAutonomousTraces(),
      playAreaPoints: field.playAreaPoints,
      excludedPolygons: field.excludedPolygons,
      exclusionDraftPoints: field.exclusionDraftPoints,
      dynamicSites: visibleSites(),
      questTraces: visibleQuestTraces(),
      gridCells: grid?.cells ?? [],
      territory: setupActive ? null : game.territoryState?.view,
      heatmapVisible,
    };
  }
  return {
    frame,
    groups: visibleAutonomousGroups,
    targets: visibleDivinationTargets,
    traces: visibleAutonomousTraces,
    sites: visibleSites,
    distance: worldDistance,
  };
}
