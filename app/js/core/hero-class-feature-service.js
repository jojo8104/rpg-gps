/** Règles des avantages propres aux classes, sans dépendance au DOM. */
export class HeroClassFeatureService {
  constructor({ classDefinitions = [], now = () => Date.now() } = {}) {
    this.classes =
      classDefinitions instanceof Map
        ? classDefinitions
        : new Map(
            classDefinitions.map((definition) => [definition.id, definition]),
          );
    this.now = now;
  }

  featuresFor(hero) {
    return structuredClone(this.classes.get(hero?.classId)?.features ?? {});
  }
  detectionMultiplier(hero) {
    return this.featuresFor(hero).detectionMultiplier ?? 1;
  }
  signatureMultiplier(hero) {
    return (
      (this.featuresFor(hero).concealmentMultiplier ?? 1) *
      (hero?.classFeatureState?.gpsConcealmentMultiplier ?? 1) *
      ((hero?.classFeatureState?.exteriorSearch?.discretionPenaltyUntil ?? 0) >
      this.now()
        ? 2
        : 1)
    );
  }
  detectionRadius(hero, baseRadius) {
    return baseRadius * (this.featuresFor(hero).detectionMultiplier ?? 1);
  }
  visionRadius(hero, fallback = 45) {
    const features = this.featuresFor(hero);
    const initialRadius = features.visionRadius ?? fallback;
    const maximumRadius = features.maximumVisionRadius ?? initialRadius;
    const maximumLevel = features.maximumVisionLevel ?? 20;
    const level = Math.max(1, Math.min(maximumLevel, hero?.level ?? 1));
    if (maximumLevel <= 1 || maximumRadius <= initialRadius)
      return initialRadius;
    return Math.min(
      maximumRadius,
      initialRadius +
        ((maximumRadius - initialRadius) * (level - 1)) / (maximumLevel - 1),
    );
  }
  watchBeaconRadius(hero) {
    const features = this.featuresFor(hero);
    const rank = hero?.aptitudeRanks?.ranger_watch_beacon ?? "novice";
    return (
      features.watchBeaconRadiusByRank?.[rank] ??
      features.watchBeaconRadius ??
      30
    );
  }
  informationLevel(hero, knownLevel) {
    return Math.min(
      3,
      Math.max(
        0,
        knownLevel + (this.featuresFor(hero).informationLevelBonus ?? 0),
      ),
    );
  }
  ambushRevealDelay(hero, baseDelay) {
    return this.featuresFor(hero).ignoresAmbushPenalty === true ? 0 : baseDelay;
  }

  interactionRadius(hero, baseRadius, locationId, at = this.now()) {
    const travel = hero?.classFeatureState?.astralTravel;
    if (!travel || travel.locationId !== locationId || at >= travel.expiresAt)
      return baseRadius;
    return travel.targetKind === "location"
      ? travel.reachBonus
      : baseRadius + (travel.reachBonus ?? this.astralReachBonus(hero));
  }

  divinationRadius(hero) {
    const features = this.featuresFor(hero);
    const diameter = this.#valueForGrade(
      hero,
      features.divinationDiameterByGrade,
      null,
    );
    return diameter === null ? (features.divinationRadius ?? 0) : diameter / 2;
  }

  astralReachBonus(hero) {
    const features = this.featuresFor(hero);
    return this.#valueForGrade(
      hero,
      features.astralReachBonusByGrade,
      features.astralReachBonus ?? 0,
    );
  }

  cooldownRemaining(hero, abilityId, at = this.now()) {
    const availableAt =
      hero?.classFeatureState?.cooldowns?.[abilityId]?.availableAt ?? 0;
    return Math.max(0, availableAt - at);
  }

  activeDivination(hero, at = this.now()) {
    const vision = hero?.classFeatureState?.divinationVision;
    return vision && at < vision.expiresAt ? structuredClone(vision) : null;
  }

  activeAstralTravel(hero, at = this.now()) {
    const travel = hero?.classFeatureState?.astralTravel;
    return travel && at < travel.expiresAt ? structuredClone(travel) : null;
  }

  beginAstralTravel(hero, at = this.now()) {
    const reachBonus = this.astralReachBonus(hero);
    if (hero?.classId !== "mage" || reachBonus <= 0)
      return { success: false, reason: "ability_unavailable" };
    const cooldownRemainingMs = this.cooldownRemaining(
      hero,
      "astralTravel",
      at,
    );
    if (cooldownRemainingMs > 0)
      return {
        success: false,
        reason: "ability_on_cooldown",
        cooldownRemainingMs,
      };
    const durationMs = this.featuresFor(hero).astralDurationMs ?? 10000;
    const cooldownMs = this.featuresFor(hero).astralCooldownMs ?? 600000;
    hero.classFeatureState.astralTravel = {
      reachBonus,
      activatedAt: at,
      expiresAt: at + durationMs,
    };
    this.#startCooldown(hero, "astralTravel", cooldownMs, at);
    return { success: true, durationMs, expiresAt: at + durationMs };
  }

  consumeAstralTravel(hero) {
    if (hero?.classFeatureState) delete hero.classFeatureState.astralTravel;
  }

  activateAstralTravel(
    hero,
    { locationId, distance, baseRadius, reachBonus = null, at = this.now() },
  ) {
    const features = this.featuresFor(hero);
    const bonus = reachBonus ?? this.astralReachBonus(hero);
    if (bonus <= 0) return { success: false, reason: "ability_unavailable" };
    const cooldownRemainingMs = this.cooldownRemaining(
      hero,
      "astralTravel",
      at,
    );
    if (cooldownRemainingMs > 0)
      return {
        success: false,
        reason: "ability_on_cooldown",
        cooldownRemainingMs,
      };
    if (
      !Number.isFinite(distance) ||
      !Number.isFinite(baseRadius) ||
      distance <= baseRadius ||
      distance > baseRadius + bonus
    )
      return { success: false, reason: "target_out_of_astral_reach" };
    const durationMs = features.astralDurationMs ?? 0;
    hero.classFeatureState.astralTravel = {
      locationId,
      reachBonus: bonus,
      activatedAt: at,
      expiresAt: at + durationMs,
    };
    const cooldownMs = features.astralCooldownMs ?? 0;
    this.#startCooldown(hero, "astralTravel", cooldownMs, at);
    return {
      success: true,
      locationId,
      expiresAt: at + durationMs,
      interactionRadius: baseRadius + bonus,
      cooldownMs,
    };
  }

  divine(
    hero,
    {
      player,
      locations,
      distanceFn,
      center = null,
      radius = null,
      at = this.now(),
    },
  ) {
    const features = this.featuresFor(hero);
    const configuredRadius = this.divinationRadius(hero);
    const effectiveRadius = radius ?? configuredRadius;
    if (configuredRadius <= 0)
      return {
        success: false,
        reason: "ability_unavailable",
        revealedLocationIds: [],
      };
    const cooldownRemainingMs = this.cooldownRemaining(hero, "divination", at);
    if (cooldownRemainingMs > 0)
      return {
        success: false,
        reason: "ability_on_cooldown",
        cooldownRemainingMs,
        revealedLocationIds: [],
      };
    const targetCenter = center ?? hero.position;
    if (!targetCenter)
      return {
        success: false,
        reason: "hero_position_unknown",
        revealedLocationIds: [],
      };
    const revealedLocationIds = locations
      .filter(
        (location) =>
          location.position &&
          distanceFn(targetCenter, location.position) <= effectiveRadius,
      )
      .filter((location) => player.discoverLocation(location.id, 1))
      .map((location) => location.id);
    const cooldownMs = features.divinationCooldownMs ?? 0;
    const durationMs = features.divinationDurationMs ?? 60000;
    hero.classFeatureState.divinationVision = {
      center: structuredClone(targetCenter),
      radius: effectiveRadius,
      activatedAt: at,
      expiresAt: at + durationMs,
    };
    this.#startCooldown(hero, "divination", cooldownMs, at);
    return {
      success: true,
      radius: effectiveRadius,
      revealedLocationIds,
      cooldownMs,
      durationMs,
      vision: structuredClone(hero.classFeatureState.divinationVision),
    };
  }

  healingAura(hero) {
    const features = this.featuresFor(hero);
    return {
      radius: this.#valueForGrade(
        hero,
        features.healingAuraRadiusByGrade,
        features.healingAuraRadius ?? 0,
      ),
      healthPerCycle: features.healingAuraPerCycle ?? 0,
    };
  }

  #valueForGrade(hero, values, fallback) {
    if (!values || typeof values !== "object" || Array.isArray(values))
      return fallback;
    return values[hero?.commandRank] ?? fallback;
  }

  #startCooldown(hero, abilityId, cooldownMs, at) {
    if (cooldownMs <= 0) return;
    hero.classFeatureState.cooldowns ??= {};
    hero.classFeatureState.cooldowns[abilityId] = {
      activatedAt: at,
      availableAt: at + cooldownMs,
    };
  }
}
