import { AutonomousGroupTrace } from "./autonomous-group-trace.js";
import { AutonomousInterceptionService } from "./autonomous-interception-service.js";
import { AutonomousMovementService } from "./autonomous-movement-service.js";
import { distanceMeters } from "./geo.js";

/** Orchestre missions, mouvement, interceptions et traces sans dépendre du DOM. */
export class AutonomousGroupService {
  constructor({ movementService = new AutonomousMovementService(), interceptionService = new AutonomousInterceptionService(), idGenerator = (prefix) => `${prefix}-${Date.now()}`, random = Math.random, traceSpacingMeters = 15 } = {}) {
    this.movementService = movementService;
    this.interceptionService = interceptionService;
    this.idGenerator = idGenerator;
    this.random = random;
    this.traceSpacingMeters = traceSpacingMeters;
  }

  advance({ groups, locations = [], targets = [], playArea, now, speedFor = defaultSpeed }) {
    const events = []; const traces = [];
    for (const group of groups) {
      if (group.movement?.destination && playArea && !playArea.contains(group.movement.destination)) {
        group.movement = null; group.status = "mission_failed";
        events.push({ type: "autonomous_group_mission_failed", groupId: group.id, reason: "destination_outside_play_area", at: now });
        continue;
      }
      if (group.status === "ambushing") {
        const target = targets.filter((candidate) => candidate.position && isHostile(group, candidate) && distanceMeters(group.position, candidate.position) <= group.ambush.radiusMeters * group.detectionMultiplier * (candidate.concealmentMultiplier ?? 1)).sort((first, second) => distanceMeters(group.position, first.position) - distanceMeters(group.position, second.position))[0];
        if (target) {
          const ambush = group.ambush; group.ambush = null; group.status = "interrupted";
          group.interruption = { id: this.idGenerator("interception"), reason: "ambush", target: { kind: target.kind ?? "hero", id: target.id }, position: { ...group.position }, startedAt: now, reactionDeadlineAt: now, mode: "immediate_attack", status: "attacking", resume: null };
          traces.push(this.#trace(group, "ambush", group.position, now));
          events.push({ type: "autonomous_group_ambush_attack_requested", groupId: group.id, target: structuredClone(group.interruption.target), interruptionId: group.interruption.id, ambushStartedAt: ambush.startedAt, at: now });
        } else if (now >= group.ambush.expiresAt) {
          group.ambush = null; group.status = "idle";
          events.push({ type: "autonomous_group_ambush_expired", groupId: group.id, at: now });
        }
        continue;
      }
      if (group.status === "interrupted") {
        if (this.interceptionService.letEscape(group, { now, movementService: this.movementService })) events.push({ type: "autonomous_group_resumed", groupId: group.id, at: now });
        continue;
      }
      if (group.mission?.kind === "guard" && ["idle", "arrived"].includes(group.status)) {
        const distanceTo = group.mission.coordinateMode === "simulation"
          ? (position) => Math.hypot(group.position.latitude - position.latitude, group.position.longitude - position.longitude)
          : (position) => distanceMeters(group.position, position);
        const target = targets.filter((candidate) => candidate.position && isHostile(group, candidate) && distanceTo(candidate.position) <= group.mission.engagementRadiusMeters * group.detectionMultiplier * (candidate.concealmentMultiplier ?? 1))
          .sort((first, second) => distanceTo(first.position) - distanceTo(second.position))[0];
        if (target) {
          group.status = "interrupted";
          group.interruption = { id: this.idGenerator("interception"), reason: "guard_proximity", target: { kind: target.kind ?? "hero", id: target.id }, position: { ...group.position }, startedAt: now, reactionDeadlineAt: now, mode: "immediate_attack", status: "attacking", resume: null };
          events.push({ type: "autonomous_group_attack_requested", groupId: group.id, target: structuredClone(group.interruption.target), interruptionId: group.interruption.id, reactionDeadlineAt: now, at: now });
        }
        continue;
      }
      if (["idle", "arrived"].includes(group.status)) this.#prepareMission(group, { locations, targets, playArea, now, speedFor, events });
      const result = this.movementService.advance(group, now);
      if (!result.changed) continue;
      traces.push(...this.#spacedTraces(group, result.segment));
      const hostileTargets = targets.filter((target) => target.id !== group.id && isHostile(group, target));
      const detection = this.interceptionService.detect(result.segment, hostileTargets, { observerDetectionMultiplier: group.detectionMultiplier });
      if (detection) {
        const interruption = this.interceptionService.create(group, detection, { id: this.idGenerator("interception"), movementService: this.movementService });
        traces.push(this.#trace(group, "interception", detection.position, detection.occurredAt));
        events.push({ type: interruption.mode === "immediate_attack" ? "autonomous_group_attack_requested" : "autonomous_group_interception_window", groupId: group.id, target: interruption.target, interruptionId: interruption.id, reactionDeadlineAt: interruption.reactionDeadlineAt, at: detection.occurredAt });
        continue;
      }
      if (result.arrived) {
        this.#resolveArrival(group, { locations, now: result.segment.toAt, events });
      }
    }
    return { events, traces };
  }

  startAmbush(group, { now, durationMs, radiusMeters = 50 }) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError("La durée de l'embuscade doit être strictement positive.");
    group.movement = null; group.status = "ambushing";
    group.ambush = { startedAt: now, expiresAt: now + durationMs, radiusMeters };
    return structuredClone(group.ambush);
  }

  resolveInterception(group, options) {
    const result = this.interceptionService.resolve(group, options);
    if (!result.success) return result;
    const traceKind = result.outcome === "plundered" ? "plunder" : result.outcome === "destroyed" ? "destroyed_group" : null;
    return { ...result, trace: traceKind === null ? null : this.#trace(group, traceKind, group.position, result.at, { occupiedCargoSlots: result.cargo.length }) };
  }

  #prepareMission(group, { locations, targets, playArea, now, speedFor, events }) {
    if (group.mission?.kind === "pursue") {
      const target = targets.find((candidate) => candidate.id === group.mission.targetId);
      if (!target?.position) { group.status = "mission_failed"; events.push({ type: "autonomous_group_mission_failed", groupId: group.id, reason: "target_not_found", at: now }); return; }
      this.movementService.start(group, { destination: target.position, speedMetersPerSecond: speedFor(group), now });
      return;
    }
    if (group.mission?.kind === "attack_location") {
      const location = locations.find((item) => item.id === group.mission.targetId);
      if (!location) { group.status = "mission_failed"; events.push({ type: "autonomous_group_mission_failed", groupId: group.id, reason: "target_not_found", at: now }); return; }
      if (playArea && !playArea.contains(location.position)) { group.status = "mission_failed"; events.push({ type: "autonomous_group_mission_failed", groupId: group.id, reason: "destination_outside_play_area", at: now }); return; }
      this.movementService.start(group, { destination: location.position, speedMetersPerSecond: speedFor(group), now });
      return;
    }
    if (group.mission?.kind === "roam") {
      const destination = roamingDestination(group, playArea, this.random);
      this.movementService.start(group, { destination, speedMetersPerSecond: speedFor(group), now });
    }
  }

  #resolveArrival(group, { locations, now, events }) {
    if (group.mission?.kind === "attack_location") {
      const location = locations.find((item) => item.id === group.mission.targetId);
      if (!location) { group.status = "mission_failed"; events.push({ type: "autonomous_group_mission_failed", groupId: group.id, reason: "target_not_found", at: now }); return; }
      group.status = "interrupted";
      events.push({ type: "autonomous_group_location_attack_requested", groupId: group.id, locationId: location.id, at: now });
    }
  }

  #trace(group, kind, position, createdAt, { occupiedCargoSlots = group.cargo.length, directionDegrees = null } = {}) {
    return new AutonomousGroupTrace({
      id: this.idGenerator("group-trace"), groupId: group.id, groupType: group.type, owner: group.owner,
      kind, position, soldierCount: group.army.units.reduce((sum, unit) => sum + unit.quantity, 0),
      occupiedCargoSlots, directionDegrees, createdAt, concealmentMultiplier: group.concealmentMultiplier,
    });
  }

  #spacedTraces(group, segment) {
    const traces = []; let anchor = group.traceAnchor ?? segment.from;
    const simulation = group.mission?.coordinateMode === "simulation"; const spacing = simulation ? 3 : this.traceSpacingMeters;
    const distanceBetween = simulation ? (first, second) => Math.hypot(first.latitude - second.latitude, first.longitude - second.longitude) : distanceMeters;
    let remaining = distanceBetween(anchor, segment.to);
    while (remaining >= spacing) {
      const ratio = spacing / remaining;
      const position = { latitude: anchor.latitude + (segment.to.latitude - anchor.latitude) * ratio, longitude: anchor.longitude + (segment.to.longitude - anchor.longitude) * ratio };
      const segmentLength = Math.max(.001, distanceBetween(segment.from, segment.to));
      const traveled = distanceBetween(segment.from, position);
      const createdAt = segment.fromAt + Math.max(0, Math.min(1, traveled / segmentLength)) * (segment.toAt - segment.fromAt);
      traces.push(this.#trace(group, "passage", position, createdAt, { directionDegrees: bearingDegrees(anchor, segment.to) }));
      anchor = position; remaining = distanceBetween(anchor, segment.to);
    }
    group.traceAnchor = { ...anchor };
    return traces;
  }
}

function bearingDegrees(from, to) {
  const dy = to.latitude - from.latitude; const dx = to.longitude - from.longitude;
  if (dx === 0 && dy === 0) return null;
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
}

function defaultSpeed(group) {
  if (group.type === "messenger") return 5;
  if (group.type === "prospecting") return 1.4;
  if (group.type === "convoy") return Math.max(.8, 2 - group.cargo.length * .1);
  return 1.2;
}
function isHostile(group, target) {
  if (target.owner?.kind === group.owner.kind && target.owner?.id === group.owner.id) return false;
  if (target.playerId && group.owner.kind === "player" && target.playerId === group.owner.id) return false;
  return group.behavior === "aggressive" || target.hostile === true;
}
function roamingDestination(group, playArea, random) {
  if (!playArea) throw new Error("Une mission roam exige une PlayArea.");
  const center = group.mission.center ?? group.position;
  const radiusMeters = group.mission.radiusMeters ?? 500;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const angle = random() * Math.PI * 2; const radius = Math.sqrt(random()) * radiusMeters;
    const latitude = center.latitude + Math.cos(angle) * radius / 111_320;
    const longitude = center.longitude + Math.sin(angle) * radius / (111_320 * Math.max(.01, Math.cos(center.latitude * Math.PI / 180)));
    const destination = { latitude, longitude };
    if (playArea.contains(destination)) return destination;
  }
  return { ...center };
}
