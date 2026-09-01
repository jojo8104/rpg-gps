import { AutonomousGroupTrace } from "./autonomous-group-trace.js";
import { distanceMeters } from "./geo.js";

const CLASS_WEIGHT = Object.freeze({ warrior: 2, mage: 1, ranger: 0 });

export class HeroTraceService {
  constructor({ idGenerator = defaultId, spacingMeters = 15 } = {}) {
    this.idGenerator = idGenerator;
    this.spacingMeters = spacingMeters;
    this.anchors = new WeakMap();
  }

  recordMovement({ hero, position, at, coordinateMode = "gps", occupiedCargoSlots = 0, concealmentMultiplier = 1 }) {
    const previous = this.anchors.get(hero);
    if (!previous) {
      this.anchors.set(hero, { position: { ...position }, at });
      return [];
    }
    const simulation = coordinateMode === "simulation";
    const distanceBetween = simulation
      ? (first, second) => Math.hypot(first.latitude - second.latitude, first.longitude - second.longitude)
      : distanceMeters;
    const spacing = simulation ? 3 : this.spacingMeters;
    const totalDistance = distanceBetween(previous.position, position);
    if (totalDistance < spacing) return [];
    const traces = [];
    const count = Math.floor(totalDistance / spacing);
    for (let index = 1; index <= count; index += 1) {
      const ratio = Math.min(1, (index * spacing) / totalDistance);
      const tracePosition = {
        latitude: previous.position.latitude + (position.latitude - previous.position.latitude) * ratio,
        longitude: previous.position.longitude + (position.longitude - previous.position.longitude) * ratio,
      };
      traces.push(new AutonomousGroupTrace({
        id: this.idGenerator("hero-trace"),
        groupId: `hero:${hero.id}`,
        groupType: "hero",
        owner: { kind: "player", id: hero.playerId },
        position: tracePosition,
        soldierCount: hero.army.units.reduce((sum, unit) => sum + unit.quantity, 0),
        occupiedCargoSlots,
        weightBonus: CLASS_WEIGHT[hero.classId] ?? 1,
        directionDegrees: bearingDegrees(previous.position, position),
        createdAt: previous.at + (at - previous.at) * ratio,
        concealmentMultiplier,
      }));
    }
    const traveledRatio = Math.min(1, (count * spacing) / totalDistance);
    this.anchors.set(hero, {
      position: {
        latitude: previous.position.latitude + (position.latitude - previous.position.latitude) * traveledRatio,
        longitude: previous.position.longitude + (position.longitude - previous.position.longitude) * traveledRatio,
      },
      at: previous.at + (at - previous.at) * traveledRatio,
    });
    return traces;
  }
}

function bearingDegrees(from, to) {
  const dy = to.latitude - from.latitude;
  const dx = to.longitude - from.longitude;
  return dx === 0 && dy === 0 ? null : ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

let sequence = 0;
function defaultId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}
