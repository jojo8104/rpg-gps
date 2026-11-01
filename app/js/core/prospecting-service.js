import { AutonomousGroup } from "./autonomous-group.js";

export const PROSPECTING_SPECIALISTS = Object.freeze([
  "specialist_geologist",
  "specialist_cartographer",
  "specialist_adventurer",
]);

export const DEFAULT_PROSPECTING_CONFIG = Object.freeze({
  minimumFood: 5,
  fixedCost: Object.freeze({ exploration_tools: 1 }),
  metersPerFood: 45,
  simulationUnitsPerFood: 1,
  spiralTurnsPerFood: 0.22,
  speedMetersPerSecond: 1.5,
});

/** Règles d'une expédition lancée par un poste de prospection. */
export class ProspectingService {
  constructor({
    config = DEFAULT_PROSPECTING_CONFIG,
    idGenerator = (prefix) => `${prefix}-${Date.now()}`,
  } = {}) {
    this.config = normalizeConfig(config);
    this.idGenerator = idGenerator;
  }

  getOptions({ locations, groups = [], playerId, originLocationId }) {
    const origin = locations.find(
      (location) => location.id === originLocationId,
    );
    if (!origin || origin.ownerId !== playerId || !hasProspectingPost(origin))
      return {
        success: false,
        reason: "prospecting_post_unavailable",
        specialists: [],
        expeditions: [],
      };
    return {
      success: true,
      minimumFood: 5,
      fixedCost: { exploration_tools: 1 },
      populationRequired: 5,
      maximumBeer: 2,
      maximumHorses: 10,
      specialists: PROSPECTING_SPECIALISTS.map((id) => ({
        id,
        quantity: origin.resources.stock[id] ?? 0,
      })),
      expeditions: groups
        .filter(
          (group) =>
            isManagedProspecting(group) &&
            group.mission.originLocationId === origin.id,
        )
        .map((group) => ({
          id: group.id,
          status: group.status,
          phase: group.mission.phase,
          specialistId: group.mission.specialistId,
          discoveries: [...group.mission.discoveries],
        })),
    };
  }

  create({
    locations,
    playerId,
    originLocationId,
    specialistId,
    food = 5,
    beer = 0,
    horses = 0,
    coordinateMode = "gps",
    playArea = null,
    now = Date.now(),
  }) {
    const origin = locations.find(
      (location) => location.id === originLocationId,
    );
    if (!origin || origin.ownerId !== playerId || !hasProspectingPost(origin))
      return { success: false, reason: "prospecting_post_unavailable" };
    if (!PROSPECTING_SPECIALISTS.includes(specialistId))
      return { success: false, reason: "invalid_specialist" };
    if (food !== 5)
      return {
        success: false,
        reason: "insufficient_food",
        minimumFood: this.config.minimumFood,
      };
    if (
      !Number.isInteger(beer) ||
      beer < 0 ||
      beer > 2 ||
      !Number.isInteger(horses) ||
      horses < 0 ||
      horses > 10
    )
      return { success: false, reason: "invalid_expedition_supplies" };
    if ((origin.population ?? 0) < 5)
      return { success: false, reason: "insufficient_population" };
    const cost = {
      exploration_tools: 1,
      food: 5,
      ...(beer ? { beer } : {}),
      ...(horses ? { horse: horses } : {}),
    };
    const missingResources = [specialistId, ...Object.keys(cost)].filter(
      (id) =>
        (origin.resources.stock[id] ?? 0) <
        (id === specialistId ? 1 : cost[id]),
    );
    if (missingResources.length)
      return {
        success: false,
        reason: "insufficient_resources",
        missingResources,
        cost,
      };
    origin.population -= 5;
    origin.recalculateStorageCapacity?.();
    origin.statistics.prospectingPopulationAway =
      (origin.statistics.prospectingPopulationAway ?? 0) + 5;
    origin.resources.stock[specialistId] -= 1;
    Object.entries(cost).forEach(([id, amount]) => {
      origin.resources.stock[id] -= amount;
    });
    const waypoints = spiralWaypoints(
      origin.position,
      food * 2 ** beer,
      coordinateMode,
      playArea,
      this.config,
    );
    const group = new AutonomousGroup({
      id: this.idGenerator("prospecting"),
      type: "prospecting",
      owner: { kind: "player", id: playerId },
      factionId: playerId,
      originLocationId: origin.id,
      position: origin.position,
      status: "idle",
      behavior: "passive",
      cargo: [{ itemId: specialistId, quantity: 1, occupiedSlots: 1 }],
      mission: {
        kind: "prospecting",
        managedBy: "prospecting_post",
        originLocationId: origin.id,
        specialistId,
        active: true,
        phase: "exploring",
        foodAllocated: food,
        beer,
        horses,
        populationAway: 5,
        rangeMultiplier: 2 ** beer,
        waypointIndex: 0,
        waypoints,
        discoveries: [],
        coordinateMode,
        speedMetersPerSecond:
          this.config.speedMetersPerSecond * (1 + horses / 5),
      },
      history: [
        {
          type: "prospecting_expedition_created",
          originLocationId: origin.id,
          specialistId,
          cost,
          at: now,
        },
      ],
    });
    return {
      success: true,
      group,
      cost,
      maximumRadius:
        food *
        2 ** beer *
        (coordinateMode === "simulation"
          ? this.config.simulationUnitsPerFood
          : this.config.metersPerFood),
    };
  }

  validate(group, locations) {
    if (!isManagedProspecting(group)) return { success: true };
    if (group.mission.active !== true)
      return { success: false, reason: "expedition_stopped" };
    const origin = locations.find(
      (location) => location.id === group.mission.originLocationId,
    );
    if (!origin || origin.state === "destroyed")
      return { success: false, reason: "origin_not_found" };
    if (origin.ownerId !== group.owner.id)
      return { success: false, reason: "origin_not_owned" };
    if (!hasProspectingPost(origin))
      return { success: false, reason: "prospecting_post_unavailable" };
    return { success: true, origin };
  }

  destinationFor(group, locations) {
    const validity = this.validate(group, locations);
    if (!validity.success) return validity;
    if (group.mission.phase === "returning")
      return { ...validity, destination: validity.origin.position };
    const destination = group.mission.waypoints[group.mission.waypointIndex];
    return destination
      ? { ...validity, destination }
      : { ...validity, destination: validity.origin.position, returning: true };
  }

  inspectSegment(group, segment, zones) {
    if (!isManagedProspecting(group) || group.mission.phase !== "exploring")
      return [];
    return zones
      .filter(
        (zone) =>
          !zone.isDiscoveredBy(group.owner.id) &&
          segmentDistance(
            zone.position,
            segment.from,
            segment.to,
            group.mission.coordinateMode,
          ) <= zone.discoveryRadius,
      )
      .map((zone) => {
        zone.discover(group.owner.id);
        if (!group.mission.discoveries.includes(zone.id))
          group.mission.discoveries.push(zone.id);
        return {
          type: "resource_zone_discovered",
          groupId: group.id,
          playerId: group.owner.id,
          zoneId: zone.id,
          locationId: zone.locationId,
          resourceId: zone.resourceId,
          locationType: zone.locationType,
          position: { ...zone.position },
          productionRate: zone.productionRate,
          at: segment.toAt,
        };
      });
  }

  arrive(group, locations, now) {
    const validity = this.validate(group, locations);
    if (!validity.success) return validity;
    if (group.mission.phase === "exploring") {
      group.mission.waypointIndex += 1;
      if (group.mission.waypointIndex >= group.mission.waypoints.length)
        group.mission.phase = "returning";
      group.status = "idle";
      return {
        success: true,
        type: "prospecting_waypoint_reached",
        waypointIndex: group.mission.waypointIndex,
      };
    }
    const specialist = group.cargo.find(
      (entry) => entry.itemId === group.mission.specialistId,
    );
    if (specialist)
      validity.origin.resources.stock[specialist.itemId] =
        (validity.origin.resources.stock[specialist.itemId] ?? 0) +
        specialist.quantity;
    group.cargo = group.cargo.filter((entry) => entry !== specialist);
    const returned = group.mission.populationAway ?? 0;
    validity.origin.population += returned;
    validity.origin.recalculateStorageCapacity?.();
    validity.origin.statistics.prospectingPopulationAway = Math.max(
      0,
      (validity.origin.statistics.prospectingPopulationAway ?? 0) - returned,
    );
    group.mission.populationAway = 0;
    group.mission.active = false;
    group.mission.phase = "completed";
    group.status = "completed";
    group.history.push({
      type: "prospecting_expedition_completed",
      discoveries: [...group.mission.discoveries],
      at: now,
    });
    return {
      success: true,
      type: "prospecting_expedition_completed",
      discoveries: [...group.mission.discoveries],
      specialistId: group.mission.specialistId,
    };
  }
}

export function isManagedProspecting(group) {
  return (
    group?.type === "prospecting" &&
    group.mission?.kind === "prospecting" &&
    group.mission.managedBy === "prospecting_post"
  );
}

export function spiralWaypoints(
  center,
  food,
  coordinateMode,
  playArea,
  config = DEFAULT_PROSPECTING_CONFIG,
) {
  const count = Math.max(6, Math.ceil(food * config.spiralTurnsPerFood * 8));
  const maxRadius =
    food *
    (coordinateMode === "simulation"
      ? config.simulationUnitsPerFood
      : config.metersPerFood);
  const points = [];
  for (let index = 1; index <= count; index += 1) {
    const ratio = index / count;
    const angle =
      ratio * Math.PI * 2 * Math.max(1, food * config.spiralTurnsPerFood);
    const radius = maxRadius * ratio;
    const candidate =
      coordinateMode === "simulation"
        ? {
            latitude: center.latitude + Math.cos(angle) * radius,
            longitude: center.longitude + Math.sin(angle) * radius,
          }
        : {
            latitude: center.latitude + (Math.cos(angle) * radius) / 111_320,
            longitude:
              center.longitude +
              (Math.sin(angle) * radius) /
                (111_320 *
                  Math.max(0.01, Math.cos((center.latitude * Math.PI) / 180))),
          };
    if (!playArea || playArea.contains(candidate)) points.push(candidate);
  }
  return points;
}

function segmentDistance(point, from, to, coordinateMode) {
  const scaleY = coordinateMode === "simulation" ? 1 : 111_320;
  const scaleX =
    coordinateMode === "simulation"
      ? 1
      : 111_320 * Math.max(0.01, Math.cos((point.latitude * Math.PI) / 180));
  const ax = (from.longitude - point.longitude) * scaleX;
  const ay = (from.latitude - point.latitude) * scaleY;
  const bx = (to.longitude - point.longitude) * scaleX;
  const by = (to.latitude - point.latitude) * scaleY;
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const t =
    denominator === 0
      ? 0
      : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denominator));
  return Math.hypot(ax + dx * t, ay + dy * t);
}
function hasProspectingPost(location) {
  return (
    (location?.infrastructure?.prospecting_post ?? 0) > 0 &&
    location.state !== "destroyed"
  );
}
function normalizeConfig(config) {
  const normalized = {
    ...DEFAULT_PROSPECTING_CONFIG,
    ...config,
    fixedCost: {
      ...DEFAULT_PROSPECTING_CONFIG.fixedCost,
      ...(config.fixedCost ?? {}),
    },
  };
  if (!Number.isInteger(normalized.minimumFood) || normalized.minimumFood <= 0)
    throw new RangeError("Le minimum de vivres doit être positif.");
  for (const value of Object.values(normalized.fixedCost))
    if (!Number.isFinite(value) || value <= 0)
      throw new RangeError("Chaque coût de prospection doit être positif.");
  return normalized;
}
