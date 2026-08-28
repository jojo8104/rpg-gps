import { distanceMeters } from "./geo.js";

/** Détermine les groupes visibles par un héros sans dépendre de la carte. */
export class AutonomousGroupDetectionService {
  constructor({ distanceFn = distanceMeters } = {}) {
    this.distanceFn = distanceFn;
  }

  detect({ observer, groups, baseRadius = 15 }) {
    if (!observer?.position) return [];
    const observerMultiplier = positiveMultiplier(observer.detectionMultiplier);
    return groups
      .filter(
        (group) => !["destroyed", "mission_failed"].includes(group.status),
      )
      .flatMap((group) => {
        const soldiers = group.army.units.reduce(
          (sum, unit) => sum + unit.combatantCount,
          0,
        );
        const signature = Math.min(
          29,
          15 + Math.ceil(soldiers / 2) + group.cargo.length * 2,
        );
        const concealmentMultiplier =
          positiveMultiplier(group.concealmentMultiplier) *
          (group.status === "ambushing" ? 0.5 : 1);
        const detectionRadius =
          signature *
          (baseRadius / 15) *
          observerMultiplier *
          concealmentMultiplier;
        const distance = this.distanceFn(observer.position, group.position);
        return distance <= detectionRadius
          ? [
              {
                id: group.id,
                type: group.type,
                owner: { ...group.owner },
                factionId: group.factionId,
                behavior: group.behavior,
                status: group.status,
                position: { ...group.position },
                soldiers,
                occupiedCargoSlots: group.cargo.length,
                distance,
                detectionRadius,
                signature,
              },
            ]
          : [];
      });
  }
}

function positiveMultiplier(value) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
