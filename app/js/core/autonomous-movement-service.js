import { distanceMeters, validatePosition } from "./geo.js";

/** Déplacement temporel direct, conçu pour être exécuté plus tard par un serveur autoritaire. */
export class AutonomousMovementService {
  start(group, { destination, speedMetersPerSecond, now }) {
    validatePosition(destination);
    if (!Number.isFinite(speedMetersPerSecond) || speedMetersPerSecond <= 0) throw new RangeError("La vitesse du groupe doit être strictement positive.");
    if (!Number.isFinite(now)) throw new TypeError("L'heure de départ est invalide.");
    const origin = { ...group.position };
    const coordinateMode = group.mission?.coordinateMode ?? "gps";
    const distance = coordinateMode === "simulation" ? Math.hypot(destination.latitude - origin.latitude, destination.longitude - origin.longitude) : distanceMeters(origin, destination);
    const durationMs = distance === 0 ? 0 : Math.ceil(distance / speedMetersPerSecond * 1000);
    group.movement = {
      origin, destination: { ...destination }, speedMetersPerSecond, distanceMeters: distance, coordinateMode,
      startedAt: now, arrivesAt: now + durationMs, lastProcessedAt: now,
    };
    group.status = distance === 0 ? "arrived" : "traveling";
    return structuredClone(group.movement);
  }

  positionAt(movement, at) {
    if (movement === null) return null;
    const duration = movement.arrivesAt - movement.startedAt;
    const progress = duration <= 0 ? 1 : Math.max(0, Math.min(1, (at - movement.startedAt) / duration));
    return {
      latitude: movement.origin.latitude + (movement.destination.latitude - movement.origin.latitude) * progress,
      longitude: movement.origin.longitude + (movement.destination.longitude - movement.origin.longitude) * progress,
    };
  }

  advance(group, now) {
    if (group.status !== "traveling" || group.movement === null) return { changed: false, arrived: false, segment: null };
    if (!Number.isFinite(now)) throw new TypeError("L'heure de mise à jour est invalide.");
    const fromAt = group.movement.lastProcessedAt;
    const toAt = Math.min(now, group.movement.arrivesAt);
    if (toAt <= fromAt) return { changed: false, arrived: false, segment: null };
    const from = this.positionAt(group.movement, fromAt);
    const to = this.positionAt(group.movement, toAt);
    group.position = to;
    group.movement.lastProcessedAt = toAt;
    const arrived = toAt >= group.movement.arrivesAt;
    if (arrived) group.status = "arrived";
    return { changed: true, arrived, segment: { from, to, fromAt, toAt } };
  }

  interrupt(group, { position, occurredAt }) {
    validatePosition(position);
    if (group.movement === null) throw new Error("Le groupe ne possède aucun trajet à interrompre.");
    const destination = { ...group.movement.destination };
    const speedMetersPerSecond = group.movement.speedMetersPerSecond;
    group.position = { ...position };
    group.movement = null;
    group.status = "interrupted";
    return { destination, speedMetersPerSecond, interruptedAt: occurredAt };
  }

  resume(group, { destination, speedMetersPerSecond, now }) {
    group.interruption = null;
    return this.start(group, { destination, speedMetersPerSecond, now });
  }
}
