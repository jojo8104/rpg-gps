/** Règles des avantages propres aux classes, sans dépendance au DOM. */
export class HeroClassFeatureService {
  constructor({ classDefinitions = [], now = () => Date.now() } = {}) {
    this.classes = classDefinitions instanceof Map ? classDefinitions : new Map(classDefinitions.map((definition) => [definition.id, definition]));
    this.now = now;
  }

  featuresFor(hero) { return structuredClone(this.classes.get(hero?.classId)?.features ?? {}); }
  detectionRadius(hero, baseRadius) { return baseRadius * (this.featuresFor(hero).detectionMultiplier ?? 1); }
  informationLevel(hero, knownLevel) { return Math.min(3, Math.max(0, knownLevel + (this.featuresFor(hero).informationLevelBonus ?? 0))); }
  ambushRevealDelay(hero, baseDelay) { return this.featuresFor(hero).ignoresAmbushPenalty === true ? 0 : baseDelay; }

  interactionRadius(hero, baseRadius, locationId, at = this.now()) {
    const travel = hero?.classFeatureState?.astralTravel;
    if (!travel || travel.locationId !== locationId || at >= travel.expiresAt) return baseRadius;
    return baseRadius + (travel.reachBonus ?? this.featuresFor(hero).astralReachBonus ?? 0);
  }

  activateAstralTravel(hero, { locationId, distance, baseRadius, reachBonus = null, at = this.now() }) {
    const features = this.featuresFor(hero); const bonus = reachBonus ?? features.astralReachBonus ?? 0;
    if (bonus <= 0) return { success: false, reason: "ability_unavailable" };
    if (!Number.isFinite(distance) || !Number.isFinite(baseRadius) || distance <= baseRadius || distance > baseRadius + bonus) return { success: false, reason: "target_out_of_astral_reach" };
    const durationMs = features.astralDurationMs ?? 0;
    hero.classFeatureState.astralTravel = { locationId, reachBonus: bonus, activatedAt: at, expiresAt: at + durationMs };
    return { success: true, locationId, expiresAt: at + durationMs, interactionRadius: baseRadius + bonus };
  }

  divine(hero, { player, locations, distanceFn, radius = null }) {
    const configuredRadius = this.featuresFor(hero).divinationRadius ?? 0; const effectiveRadius = radius ?? configuredRadius;
    if (configuredRadius <= 0) return { success: false, reason: "ability_unavailable", revealedLocationIds: [] };
    if (!hero.position) return { success: false, reason: "hero_position_unknown", revealedLocationIds: [] };
    const revealedLocationIds = locations.filter((location) => location.position && distanceFn(hero.position, location.position) <= effectiveRadius).filter((location) => player.discoverLocation(location.id, 1)).map((location) => location.id);
    return { success: true, radius: effectiveRadius, revealedLocationIds };
  }

  healingAura(hero) {
    const features = this.featuresFor(hero);
    return { radius: features.healingAuraRadius ?? 0, healthPerCycle: features.healingAuraPerCycle ?? 0 };
  }
}
