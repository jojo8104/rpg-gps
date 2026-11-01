import { AutonomousGroupTrace } from "./autonomous-group-trace.js";
import { AutonomousInterceptionService } from "./autonomous-interception-service.js";
import { AutonomousMovementService } from "./autonomous-movement-service.js";
import { distanceMeters } from "./geo.js";
import {
  TradingConvoyService,
  isManagedConvoy,
} from "./trading-convoy-service.js";
import {
  ProspectingService,
  isManagedProspecting,
} from "./prospecting-service.js";

/** Orchestre missions, mouvement, interceptions et traces sans dépendre du DOM. */
export class AutonomousGroupService {
  constructor({
    movementService = new AutonomousMovementService(),
    interceptionService = new AutonomousInterceptionService(),
    idGenerator = (prefix) => `${prefix}-${Date.now()}`,
    random = Math.random,
    traceSpacingMeters = 15,
    convoyService = new TradingConvoyService({ idGenerator }),
    prospectingService = new ProspectingService({ idGenerator }),
  } = {}) {
    this.movementService = movementService;
    this.interceptionService = interceptionService;
    this.idGenerator = idGenerator;
    this.random = random;
    this.traceSpacingMeters = traceSpacingMeters;
    this.convoyService = convoyService;
    this.prospectingService = prospectingService;
  }

  advance({
    groups,
    locations = [],
    resourceZones = [],
    inspectExplorationSegment = () => {},
    targets = [],
    playArea,
    now,
    speedFor = defaultSpeed,
  }) {
    const events = [];
    const traces = [];
    for (const group of groups) {
      if (
        group.mission?.questId === "repression" &&
        group.mission.kind === "guard"
      )
        continue;
      if (
        isManagedProspecting(group) &&
        !["destroyed", "completed", "suspended"].includes(group.status)
      ) {
        const validity = this.prospectingService.validate(group, locations);
        if (!validity.success) {
          group.movement = null;
          group.status = "suspended";
          group.mission.suspensionReason = validity.reason;
          events.push({
            type: "prospecting_expedition_suspended",
            groupId: group.id,
            reason: validity.reason,
            at: now,
          });
          continue;
        }
      }
      if (
        isManagedConvoy(group) &&
        !["destroyed", "stopped", "suspended"].includes(group.status)
      ) {
        const validity = this.convoyService.validate(group, locations);
        if (!validity.success) {
          group.movement = null;
          group.status =
            validity.reason === "route_stopped" ? "stopped" : "suspended";
          group.mission.suspensionReason = validity.reason;
          events.push({
            type: "autonomous_convoy_suspended",
            groupId: group.id,
            reason: validity.reason,
            at: now,
          });
          continue;
        }
      }
      if (
        group.movement?.destination &&
        playArea &&
        !playArea.contains(group.movement.destination)
      ) {
        group.movement = null;
        group.status = "mission_failed";
        events.push({
          type: "autonomous_group_mission_failed",
          groupId: group.id,
          reason: "destination_outside_play_area",
          at: now,
        });
        continue;
      }
      if (group.status === "ambushing") {
        const target = targets
          .filter(
            (candidate) =>
              candidate.position &&
              isHostile(group, candidate) &&
              distanceMeters(group.position, candidate.position) <=
                group.ambush.radiusMeters *
                  group.detectionMultiplier *
                  (candidate.concealmentMultiplier ?? 1),
          )
          .sort(
            (first, second) =>
              distanceMeters(group.position, first.position) -
              distanceMeters(group.position, second.position),
          )[0];
        if (target) {
          const ambush = group.ambush;
          group.ambush = null;
          group.status = "interrupted";
          group.interruption = {
            id: this.idGenerator("interception"),
            reason: "ambush",
            target: { kind: target.kind ?? "hero", id: target.id },
            position: { ...group.position },
            startedAt: now,
            reactionDeadlineAt: now,
            mode: "immediate_attack",
            status: "attacking",
            resume: null,
          };
          traces.push(this.#trace(group, "ambush", group.position, now));
          events.push({
            type: "autonomous_group_ambush_attack_requested",
            groupId: group.id,
            target: structuredClone(group.interruption.target),
            interruptionId: group.interruption.id,
            ambushStartedAt: ambush.startedAt,
            at: now,
          });
        } else if (now >= group.ambush.expiresAt) {
          group.ambush = null;
          group.status = "idle";
          events.push({
            type: "autonomous_group_ambush_expired",
            groupId: group.id,
            at: now,
          });
        }
        continue;
      }
      if (group.status === "interrupted") {
        if (
          this.interceptionService.letEscape(group, {
            now,
            movementService: this.movementService,
          })
        )
          events.push({
            type: "autonomous_group_resumed",
            groupId: group.id,
            at: now,
          });
        continue;
      }
      if (
        group.mission?.kind === "guard" &&
        ["idle", "arrived"].includes(group.status)
      ) {
        const distanceTo =
          group.mission.coordinateMode === "simulation"
            ? (position) =>
                Math.hypot(
                  group.position.latitude - position.latitude,
                  group.position.longitude - position.longitude,
                )
            : (position) => distanceMeters(group.position, position);
        const target = targets
          .filter(
            (candidate) =>
              candidate.position &&
              isHostile(group, candidate) &&
              distanceTo(candidate.position) <=
                group.mission.engagementRadiusMeters *
                  group.detectionMultiplier *
                  (candidate.concealmentMultiplier ?? 1),
          )
          .sort(
            (first, second) =>
              distanceTo(first.position) - distanceTo(second.position),
          )[0];
        if (target) {
          group.status = "interrupted";
          group.interruption = {
            id: this.idGenerator("interception"),
            reason: "guard_proximity",
            target: { kind: target.kind ?? "hero", id: target.id },
            position: { ...group.position },
            startedAt: now,
            reactionDeadlineAt: now,
            mode: "immediate_attack",
            status: "attacking",
            resume: null,
          };
          events.push({
            type: "autonomous_group_attack_requested",
            groupId: group.id,
            target: structuredClone(group.interruption.target),
            interruptionId: group.interruption.id,
            reactionDeadlineAt: now,
            at: now,
          });
        }
        continue;
      }
      if (["idle", "arrived"].includes(group.status))
        this.#prepareMission(group, {
          locations,
          targets,
          playArea,
          now,
          speedFor,
          events,
        });
      const result = this.movementService.advance(group, now);
      if (!result.changed) {
        if (group.status === "arrived" && group.movement?.distanceMeters === 0)
          this.#resolveArrival(group, { locations, now, events });
        continue;
      }
      traces.push(...this.#spacedTraces(group, result.segment));
      const hostileTargets = targets.filter(
        (target) =>
          target.id !== group.id &&
          !(
            group.mission?.managedBy === "messenger_relay" &&
            target.id === group.mission.targetId
          ) &&
          isHostile(group, target),
      );
      const detection = this.interceptionService.detect(
        result.segment,
        hostileTargets,
        { observerDetectionMultiplier: group.detectionMultiplier },
      );
      if (detection) {
        const interruption = this.interceptionService.create(group, detection, {
          id: this.idGenerator("interception"),
          movementService: this.movementService,
        });
        traces.push(
          this.#trace(
            group,
            "interception",
            detection.position,
            detection.occurredAt,
          ),
        );
        events.push({
          type:
            interruption.mode === "immediate_attack"
              ? "autonomous_group_attack_requested"
              : "autonomous_group_interception_window",
          groupId: group.id,
          target: interruption.target,
          interruptionId: interruption.id,
          reactionDeadlineAt: interruption.reactionDeadlineAt,
          at: detection.occurredAt,
        });
        continue;
      }
      events.push(
        ...this.prospectingService.inspectSegment(
          group,
          result.segment,
          resourceZones,
        ),
      );
      if (isManagedProspecting(group) && group.mission.phase === "exploring")
        inspectExplorationSegment(group, result.segment);
      if (result.arrived) {
        this.#resolveArrival(group, {
          locations,
          now: result.segment.toAt,
          events,
        });
      }
    }
    return { events, traces };
  }

  startAmbush(group, { now, durationMs, radiusMeters = 50 }) {
    if (!Number.isFinite(durationMs) || durationMs <= 0)
      throw new RangeError(
        "La durée de l'embuscade doit être strictement positive.",
      );
    group.movement = null;
    group.status = "ambushing";
    group.ambush = {
      startedAt: now,
      expiresAt: now + durationMs,
      radiusMeters,
    };
    return structuredClone(group.ambush);
  }

  resolveInterception(group, options) {
    const result = this.interceptionService.resolve(group, options);
    if (!result.success) return result;
    const traceKind =
      result.outcome === "plundered"
        ? "plunder"
        : result.outcome === "destroyed"
          ? "destroyed_group"
          : null;
    return {
      ...result,
      trace:
        traceKind === null
          ? null
          : this.#trace(group, traceKind, group.position, result.at, {
              occupiedCargoSlots: result.cargo.length,
            }),
    };
  }

  #prepareMission(
    group,
    { locations, targets, playArea, now, speedFor, events },
  ) {
    if (["exceptional_expedition","camp_installation"].includes(group.mission?.managedBy)) {
      if (!["waiting", "completed"].includes(group.mission.phase)) this.movementService.start(group, {
        destination: group.mission.destination, speedMetersPerSecond: speedFor(group), now,
      });
      return;
    }
    if (group.mission?.managedBy === "watch_post") {
      const destination = group.mission.waypoints[group.mission.waypointIndex];
      if (destination)
        this.movementService.start(group, {
          destination,
          speedMetersPerSecond: speedFor(group),
          now,
        });
      return;
    }
    if (group.mission?.managedBy === "messenger_relay") {
      const target = targets.find(
        (entry) => entry.id === group.mission.targetId,
      );
      if (target?.position)
        this.movementService.start(group, {
          destination: target.position,
          speedMetersPerSecond: speedFor(group),
          now,
        });
      return;
    }
    if (isManagedConvoy(group)) {
      const route = this.convoyService.destinationFor(group, locations);
      if (!route.success) {
        group.status =
          route.reason === "route_stopped" ? "stopped" : "suspended";
        group.mission.suspensionReason = route.reason;
        events.push({
          type: "autonomous_convoy_suspended",
          groupId: group.id,
          reason: route.reason,
          at: now,
        });
        return;
      }
      delete group.mission.suspensionReason;
      this.movementService.start(group, {
        destination: route.destination.position,
        speedMetersPerSecond: speedFor(group),
        now,
      });
      events.push({
        type: "autonomous_convoy_departed",
        groupId: group.id,
        phase: group.mission.phase,
        destinationLocationId: route.destination.id,
        at: now,
      });
      return;
    }
    if (isManagedProspecting(group)) {
      const route = this.prospectingService.destinationFor(group, locations);
      if (!route.success) {
        group.status = "suspended";
        group.mission.suspensionReason = route.reason;
        events.push({
          type: "prospecting_expedition_suspended",
          groupId: group.id,
          reason: route.reason,
          at: now,
        });
        return;
      }
      if (route.returning) group.mission.phase = "returning";
      this.movementService.start(group, {
        destination: route.destination,
        speedMetersPerSecond: speedFor(group),
        now,
      });
      return;
    }
    if (group.mission?.kind === "pursue") {
      const target = targets.find(
        (candidate) => candidate.id === group.mission.targetId,
      );
      if (!target?.position) {
        group.status = "mission_failed";
        events.push({
          type: "autonomous_group_mission_failed",
          groupId: group.id,
          reason: "target_not_found",
          at: now,
        });
        return;
      }
      this.movementService.start(group, {
        destination: target.position,
        speedMetersPerSecond: speedFor(group),
        now,
      });
      return;
    }
    if (group.mission?.kind === "attack_location") {
      const location = locations.find(
        (item) => item.id === group.mission.targetId,
      );
      if (!location) {
        group.status = "mission_failed";
        events.push({
          type: "autonomous_group_mission_failed",
          groupId: group.id,
          reason: "target_not_found",
          at: now,
        });
        return;
      }
      if (playArea && !playArea.contains(location.position)) {
        group.status = "mission_failed";
        events.push({
          type: "autonomous_group_mission_failed",
          groupId: group.id,
          reason: "destination_outside_play_area",
          at: now,
        });
        return;
      }
      this.movementService.start(group, {
        destination: location.position,
        speedMetersPerSecond: speedFor(group),
        now,
      });
      return;
    }
    if (group.mission?.kind === "roam") {
      const destination = roamingDestination(group, playArea, this.random);
      this.movementService.start(group, {
        destination,
        speedMetersPerSecond: speedFor(group),
        now,
      });
    }
  }

  #resolveArrival(group, { locations, now, events }) {
    if (["exceptional_expedition","camp_installation"].includes(group.mission?.managedBy)) {
      group.mission.phase = group.mission.phase === "returning" ? "returned" : "waiting";
      group.movement = null;
      group.status = "arrived";
      return;
    }
    if (group.mission?.managedBy === "watch_post") {
      group.mission.waypointIndex =
        (group.mission.waypointIndex + 1) % group.mission.waypoints.length;
      group.movement = null;
      group.status = "idle";
      return;
    }
    if (group.mission?.managedBy === "messenger_relay") {
      // Game checks that the moving recipient is actually reached before delivering.
      group.status = "arrived";
      group.movement = null;
      events.push({
        type: "relay_messenger_arrived",
        groupId: group.id,
        at: now,
      });
      return;
    }
    if (isManagedConvoy(group)) {
      const result = this.convoyService.arrive(group, locations, now);
      if (!result.success) {
        group.status = "suspended";
        group.mission.suspensionReason = result.reason;
        events.push({
          type: "autonomous_convoy_suspended",
          groupId: group.id,
          reason: result.reason,
          at: now,
        });
      } else events.push({ ...result, groupId: group.id, at: now });
      return;
    }
    if (isManagedProspecting(group)) {
      const result = this.prospectingService.arrive(group, locations, now);
      if (!result.success) {
        group.status = "suspended";
        group.mission.suspensionReason = result.reason;
        events.push({
          type: "prospecting_expedition_suspended",
          groupId: group.id,
          reason: result.reason,
          at: now,
        });
      } else events.push({ ...result, groupId: group.id, at: now });
      return;
    }
    if (group.mission?.kind === "attack_location") {
      const location = locations.find(
        (item) => item.id === group.mission.targetId,
      );
      if (!location) {
        group.status = "mission_failed";
        events.push({
          type: "autonomous_group_mission_failed",
          groupId: group.id,
          reason: "target_not_found",
          at: now,
        });
        return;
      }
      group.status = "interrupted";
      events.push({
        type: "autonomous_group_location_attack_requested",
        groupId: group.id,
        locationId: location.id,
        at: now,
      });
    }
  }

  #trace(
    group,
    kind,
    position,
    createdAt,
    {
      occupiedCargoSlots = group.occupiedCargoSlots,
      directionDegrees = null,
    } = {},
  ) {
    return new AutonomousGroupTrace({
      id: this.idGenerator("group-trace"),
      groupId: group.id,
      groupType: group.type,
      owner: group.owner,
      kind,
      position,
      soldierCount: group.army.units.reduce(
        (sum, unit) => sum + unit.quantity,
        0,
      ),
      occupiedCargoSlots,
      directionDegrees,
      createdAt,
      concealmentMultiplier: group.concealmentMultiplier,
    });
  }

  #spacedTraces(group, segment) {
    const traces = [];
    let anchor = group.traceAnchor ?? segment.from;
    const simulation = group.mission?.coordinateMode === "simulation";
    const spacing = simulation ? 3 : this.traceSpacingMeters;
    const distanceBetween = simulation
      ? (first, second) =>
          Math.hypot(
            first.latitude - second.latitude,
            first.longitude - second.longitude,
          )
      : distanceMeters;
    let remaining = distanceBetween(anchor, segment.to);
    while (remaining >= spacing) {
      const ratio = spacing / remaining;
      const position = {
        latitude:
          anchor.latitude + (segment.to.latitude - anchor.latitude) * ratio,
        longitude:
          anchor.longitude + (segment.to.longitude - anchor.longitude) * ratio,
      };
      const segmentLength = Math.max(
        0.001,
        distanceBetween(segment.from, segment.to),
      );
      const traveled = distanceBetween(segment.from, position);
      const createdAt =
        segment.fromAt +
        Math.max(0, Math.min(1, traveled / segmentLength)) *
          (segment.toAt - segment.fromAt);
      traces.push(
        this.#trace(group, "passage", position, createdAt, {
          directionDegrees: bearingDegrees(anchor, segment.to),
        }),
      );
      anchor = position;
      remaining = distanceBetween(anchor, segment.to);
    }
    group.traceAnchor = { ...anchor };
    return traces;
  }
}

function bearingDegrees(from, to) {
  const dy = to.latitude - from.latitude;
  const dx = to.longitude - from.longitude;
  if (dx === 0 && dy === 0) return null;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

function defaultSpeed(group) {
  if (group.type === "messenger") return 5;
  if (group.type === "prospecting") return 1.4;
  if (group.type === "convoy")
    return Math.max(0.8, 2 - group.occupiedCargoSlots * 0.1);
  return 1.2;
}
function isHostile(group, target) {
  // Un alignement explicite neutre/allié ne déclenche pas d’hostilité envers les héros.
  if (group.alignment && group.alignment !== "enemy" && target.kind === "hero")
    return false;
  if (
    group.originLocationId &&
    group.owner.id === "kingdom" &&
    target.playerId !== "chaos" &&
    target.playerId !== "bandits"
  )
    return false;
  if (
    group.factionId === "chaos" &&
    ["chaos", "bandits"].includes(target.playerId)
  )
    return false;
  if (
    target.owner?.kind === group.owner.kind &&
    target.owner?.id === group.owner.id
  )
    return false;
  if (
    target.playerId &&
    group.owner.kind === "player" &&
    target.playerId === group.owner.id
  )
    return false;
  return group.behavior === "aggressive" || target.hostile === true;
}
function roamingDestination(group, playArea, random) {
  if (!playArea) throw new Error("Une mission roam exige une PlayArea.");
  const center = group.mission.center ?? group.position;
  const radiusMeters = group.mission.radiusMeters ?? 500;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * radiusMeters;
    const latitude = center.latitude + (Math.cos(angle) * radius) / 111_320;
    const longitude =
      center.longitude +
      (Math.sin(angle) * radius) /
        (111_320 * Math.max(0.01, Math.cos((center.latitude * Math.PI) / 180)));
    const destination = { latitude, longitude };
    if (playArea.contains(destination)) return destination;
  }
  return { ...center };
}
