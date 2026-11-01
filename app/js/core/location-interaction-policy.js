import {
  simulationRadii,
  simulationDetectionRadii,
} from "./simulation-config.js";
/** Portées et ennemis projetés depuis la session, sans dépendance au navigateur. */
export const AUTONOMOUS_ATTACK_RANGE = 8;
export function autonomousAttackPolicy(snapshot) {
  return {
    ownGroup: snapshot.relation === "own",
    attackRange: AUTONOMOUS_ATTACK_RANGE,
    canAttack:
      snapshot.relation !== "own" &&
      snapshot.distance <= AUTONOMOUS_ATTACK_RANGE,
  };
}
export function createLocationInteractionPolicy(session) {
  function baseRangesFor(location) {
    return session.mode === "gps"
      ? session.rangePolicy.resolve(location, session.game.setup.playArea)
      : {
          interactionRadius: simulationRadii[location.id] ?? 8,
          detectionRadius: simulationDetectionRadii[location.id] ?? 16,
        };
  }

  function rangesFor(location) {
    const base = baseRangesFor(location);
    return {
      interactionRadius: session.game.heroClassFeatureService.interactionRadius(
        session.hero,
        base.interactionRadius,
        location.id,
      ),
      detectionRadius: session.game.heroClassFeatureService.detectionRadius(
        session.hero,
        base.detectionRadius,
      ),
    };
  }

  function resolveLocationEnemy({ location }) {
    return location.features.battle &&
      session.game.getLocationRelation(session.localPlayerId, location.id) ===
        "enemy"
      ? {
          name:
            location.ownerId === "chaos" ? "Créatures du Chaos" : "Brigands",
          danger: 2,
          aggressive: false,
        }
      : null;
  }
  return { baseRangesFor, rangesFor, resolveLocationEnemy };
}
