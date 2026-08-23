import { AutonomousGroupTrace } from "./autonomous-group-trace.js";
import { AutonomousInterceptionService } from "./autonomous-interception-service.js";
import { AutonomousMovementService } from "./autonomous-movement-service.js";
import { distanceMeters } from "./geo.js";

/** Orchestre missions, mouvement, interceptions et traces sans dépendre du DOM. */
export class AutonomousGroupService {
  constructor({ movementService = new AutonomousMovementService(), interceptionService = new AutonomousInterceptionService(), idGenerator = (prefix) => `${prefix}-${Date.now()}`, random = Math.random } = {}) {
    this.movementService = movementService;
    this.interceptionService = interceptionService;
    this.idGenerator = idGenerator;
    this.random = random;
  }

  advance({ groups, locations = [], targets = [], playArea, now, speedFor = defaultSpeed }) {
    const events = []; const traces = [];
    for (const group of groups) {
      if (group.status === "ambushing") {
        const target = targets.filter((candidate) => candidate.position && isHostile(group, candidate) && distanceMeters(group.position, candidate.position) <= group.ambush.radiusMeters).sort((first, second) => distanceMeters(group.position, first.position) - distanceMeters(group.position, second.position))[0];
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
      if (["idle", "arrived"].includes(group.status)) this.#prepareMission(group, { locations, playArea, now, speedFor, events });
      const result = this.movementService.advance(group, now);
      if (!result.changed) continue;
      const hostileTargets = targets.filter((target) => target.id !== group.id && isHostile(group, target));
      const detection = this.interceptionService.detect(result.segment, hostileTargets);
      if (detection) {
        const interruption = this.interceptionService.create(group, detection, { id: this.idGenerator("interception"), movementService: this.movementService });
        traces.push(this.#trace(group, "interception", detection.position, detection.occurredAt));
        events.push({ type: interruption.mode === "immediate_attack" ? "autonomous_group_attack_requested" : "autonomous_group_interception_window", groupId: group.id, target: interruption.target, interruptionId: interruption.id, reactionDeadlineAt: interruption.reactionDeadlineAt, at: detection.occurredAt });
        continue;
      }
      if (result.arrived) {
        traces.push(this.#trace(group, "passage", group.position, result.segment.toAt));
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

  #prepareMission(group, { locations, playArea, now, speedFor, events }) {
    if (group.mission?.kind === "attack_location") {
      const location = locations.find((item) => item.id === group.mission.targetId);
      if (!location) { group.status = "mission_failed"; events.push({ type: "autonomous_group_mission_failed", groupId: group.id, reason: "target_not_found", at: now }); return; }
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

  #trace(group, kind, position, createdAt, { occupiedCargoSlots = group.cargo.length } = {}) {
    return new AutonomousGroupTrace({
      id: this.idGenerator("group-trace"), groupId: group.id, groupType: group.type, owner: group.owner,
      kind, position, soldierCount: group.army.units.reduce((sum, unit) => sum + unit.quantity, 0),
      occupiedCargoSlots, createdAt,
    });
  }
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
