import { watchedPosition } from "./location-watch-service.js";
import { distanceMeters } from "./geo.js";
import { AutonomousGroup } from "./autonomous-group.js";
import { AutonomousGroupDetectionService } from "./autonomous-group-detection-service.js";
import { AutonomousGroupTrace } from "./autonomous-group-trace.js";
import { HeroClassFeatureService } from "./hero-class-feature-service.js";
import { LocationRangePolicy } from "./location-range-policy.js";
import { createLocationInteractionPolicy } from "./location-interaction-policy.js";
import { scenarioLocationHasAppeared } from "./scenario-location-appearance.js";
import { locationWorldContext } from "./scenario-location-world-policy.js";

export function mapDistance(mode, a, b) {
  if (!a || !b) return Infinity;
  return mode === "simulation"
    ? Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude)
    : distanceMeters(a, b);
}

/** Un lieu existe sur la carte dès son placement, indépendamment des quêtes. */
export function mapLocationEnabled(location, state, playerId = null) {
  if (["dismissed", "destroyed"].includes(location.state)) return false;
  const binding = state.scenarioLocationBindings?.find(
    (entry) => entry.locationId === location.id,
  );
  const placement =
    binding && state.scenarioRuntime?.placements?.[binding.locationSlotId];
  return (
    (!placement || placement.status === "placed") &&
    scenarioLocationHasAppeared(location, state, playerId)
  );
}

/** Un lieu inconnu peut être détecté sans être déjà affiché. */
export function mapLocationDiscoverable(location, state, playerId) {
  const { world, placement } = locationWorldContext(location, state);
  return mapLocationEnabled(location, state, playerId) || Boolean(
    world?.visibility === "discoverable" &&
    (!placement || placement.status === "placed") &&
    !placement?.retiredForPlayerIds?.includes(playerId) &&
    !["dismissed", "destroyed"].includes(location.state));
}

/** Découverte et présence officielles, avant la projection de l'état du joueur. */
export function discoverNearbyLocations(game) {
  const policy = new LocationRangePolicy(game.setup.locationSetup.rangePolicy);
  for (const location of game.locations) {
    for (const player of game.players)
      if (mapLocationEnabled(location, game, player.id))
        player.discoverLocation(location.id, 1);
  }
  for (const hero of game.heroes) {
    const player = game.getPlayer(hero.playerId);
    if (!player || !hero.position) continue;
    const interactionPolicy = createLocationInteractionPolicy({
      game,
      hero,
      mode: game.coordinateMode,
      rangePolicy: policy,
    });
    for (const location of game.locations) {
      if (!mapLocationDiscoverable(location, game, player.id)) {
        location.removeHero(hero.id);
        continue;
      }
      const ranges = interactionPolicy.rangesFor(location);
      const distance = mapDistance(
        game.coordinateMode,
        hero.position,
        location.position,
      );
      const nearby = distance <= ranges.interactionRadius;
      if (nearby) location.addHero(hero.id);
      else location.removeHero(hero.id);
      if (distance <= ranges.detectionRadius)
        player.discoverLocation(location.id, nearby ? 3 : 1);
    }
  }
}

/** Visibility uses the same domain services as the map, with authoritative time. */
export function playerMapVisibility(state, playerId, now = Date.now()) {
  const hero = state.heroes.find((entry) => entry.playerId === playerId);
  const distance = (a, b) => mapDistance(state.coordinateMode, a, b);
  const features = new HeroClassFeatureService({
    classDefinitions: state.heroClasses,
    now: () => now,
  });
  const multiplier = features.detectionMultiplier(hero);
  const vision = features.activeDivination(hero);
  const divined = (position) =>
    Boolean(vision && distance(vision.center, position) <= vision.radius);
  const locations = new Set(
    (state.locations ?? [])
      .filter((location) => mapLocationEnabled(location, state, playerId))
      .map((location) => location.id),
  );
  const groups = (state.autonomousGroups ?? []).map(
    (group) => new AutonomousGroup(group),
  );
  const detected = new AutonomousGroupDetectionService({
    distanceFn: distance,
  }).detect({
    observer: { position: hero?.position, detectionMultiplier: multiplier },
    groups: groups.filter(
      (group) =>
        !["garrisoned", "resolved", "confiscated"].includes(group.status),
    ),
    baseRadius: state.coordinateMode === "simulation" ? 22 : 15,
  });
  const autonomousGroups = new Set(detected.map((group) => group.id));
  for (const group of groups)
    if (
      (divined(group.position) ||
        watchedPosition(state, playerId, group.position) ||
        (group.owner.kind === "player" && group.owner.id === playerId)) &&
      ![
        "destroyed",
        "mission_failed",
        "completed",
        "garrisoned",
        "resolved",
        "confiscated",
      ].includes(group.status)
    )
      autonomousGroups.add(group.id);
  const autonomousGroupTraces = new Set(
    (state.autonomousGroupTraces ?? [])
      .filter((value) => {
        const trace = new AutonomousGroupTrace(value);
        if (trace.owner?.kind === "player" && trace.owner.id === playerId)
          return trace.getScore(now) > 0;
        const d = distance(hero?.position, trace.position);
        return (
          Number.isFinite(d) &&
          trace.isDetectable({
            at: now,
            minimumScore: 1,
            distance: d,
            distancePerPoint: state.coordinateMode === "simulation" ? 5 : 50,
            detectionMultiplier: multiplier,
          })
        );
      })
      .map((trace) => trace.id),
  );
  const battleSites = new Set(
    (state.battleSites ?? [])
      .filter(
        (site) =>
          (site.expiresAt == null || now < site.expiresAt) &&
          (site.participantPlayerIds.includes(playerId) ||
            distance(hero?.position, site.position) <= site.visibilityRadius),
      )
      .map((site) => site.id),
  );
  const resourceZones = new Set(
    (state.resourceZones ?? [])
      .filter((zone) => zone.discoveredByPlayerIds.includes(playerId))
      .map((zone) => zone.id),
  );
  return {
    locations,
    autonomousGroups,
    autonomousGroupTraces,
    battleSites,
    resourceZones,
  };
}
