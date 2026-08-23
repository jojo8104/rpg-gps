import { distanceMeters } from "./geo.js";

/** Détecte une cible sur un segment et crée une interruption sérialisable. */
export class AutonomousInterceptionService {
  constructor({ engagementRadiusMeters = 8, minimumReactionMs = 15_000 } = {}) {
    if (!Number.isFinite(engagementRadiusMeters) || engagementRadiusMeters <= 0) throw new RangeError("Le rayon d'interception doit être strictement positif.");
    if (!Number.isFinite(minimumReactionMs) || minimumReactionMs <= 0) throw new RangeError("Le délai de réaction doit être strictement positif.");
    this.engagementRadiusMeters = engagementRadiusMeters;
    this.minimumReactionMs = minimumReactionMs;
  }

  detect(segment, targets) {
    if (segment === null || !Array.isArray(targets)) return null;
    const candidates = targets.filter((target) => target?.position).map((target) => {
      const closest = closestPoint(segment.from, segment.to, target.position);
      return { target, ...closest, distance: distanceMeters(closest.position, target.position) };
    }).filter((candidate) => candidate.distance <= this.engagementRadiusMeters * (candidate.target.concealmentMultiplier ?? 1))
      .sort((first, second) => first.fraction - second.fraction || String(first.target.id).localeCompare(String(second.target.id)));
    const match = candidates[0];
    if (!match) return null;
    return {
      target: match.target, position: match.position,
      occurredAt: segment.fromAt + (segment.toAt - segment.fromAt) * match.fraction,
      distanceMeters: match.distance,
    };
  }

  create(group, detection, { id, movementService }) {
    const remaining = movementService.interrupt(group, { position: detection.position, occurredAt: detection.occurredAt });
    const aggressive = group.behavior === "aggressive";
    const reactionDurationMs = aggressive ? 0 : Math.max(this.minimumReactionMs, Math.ceil(this.engagementRadiusMeters / Math.max(.1, remaining.speedMetersPerSecond) * 1000));
    group.interruption = {
      id, reason: "hostile_encounter", target: { kind: detection.target.kind ?? "hero", id: detection.target.id },
      position: { ...detection.position }, startedAt: detection.occurredAt,
      reactionDeadlineAt: detection.occurredAt + reactionDurationMs,
      mode: aggressive ? "immediate_attack" : "reaction_window", status: aggressive ? "attacking" : "pending",
      resume: { destination: remaining.destination, speedMetersPerSecond: remaining.speedMetersPerSecond },
    };
    return structuredClone(group.interruption);
  }

  letEscape(group, { now, movementService }) {
    if (group.interruption?.status !== "pending" || now < group.interruption.reactionDeadlineAt) return false;
    const resume = structuredClone(group.interruption.resume);
    movementService.resume(group, { ...resume, now });
    return true;
  }

  resolve(group, { now, action = "intercept" } = {}) {
    const interruption = group.interruption;
    if (!interruption || !["pending", "attacking"].includes(interruption.status)) return { success: false, reason: "no_active_interception" };
    if (interruption.status === "pending" && now > interruption.reactionDeadlineAt) return { success: false, reason: "reaction_expired" };
    if (action !== "intercept" && action !== "attack") return { success: false, reason: "invalid_action" };
    const information = group.type === "messenger" ? structuredClone(group.message) : group.type === "prospecting" ? structuredClone(group.mission?.report ?? null) : null;
    let outcome;
    if (["army", "rogue"].includes(group.type)) {
      outcome = "battle_requested";
      interruption.status = "attacking";
    } else if (group.type === "convoy") {
      outcome = "plundered";
      group.status = "destroyed";
      interruption.status = "resolved";
    } else {
      outcome = "destroyed";
      group.status = "destroyed";
      interruption.status = "resolved";
    }
    const cargo = outcome === "plundered" ? group.cargo.map((entry) => structuredClone(entry)) : [];
    if (group.status === "destroyed") { group.message = null; group.cargo = []; }
    return { success: true, outcome, groupId: group.id, target: structuredClone(interruption.target), information, cargo, at: now };
  }
}

function closestPoint(start, end, point) {
  const latitudeScale = 111_320;
  const longitudeScale = latitudeScale * Math.cos(((start.latitude + end.latitude + point.latitude) / 3) * Math.PI / 180);
  const x2 = (end.longitude - start.longitude) * longitudeScale;
  const y2 = (end.latitude - start.latitude) * latitudeScale;
  const px = (point.longitude - start.longitude) * longitudeScale;
  const py = (point.latitude - start.latitude) * latitudeScale;
  const lengthSquared = x2 * x2 + y2 * y2;
  const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (px * x2 + py * y2) / lengthSquared));
  return { fraction, position: { latitude: start.latitude + (end.latitude - start.latitude) * fraction, longitude: start.longitude + (end.longitude - start.longitude) * fraction } };
}
