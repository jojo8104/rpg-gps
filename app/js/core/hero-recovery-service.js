export const HERO_NATURAL_HEAL_PER_CYCLE = 1;
export const HERO_REVIVE_HEALTH_RATIO = 0.5;

/** Règles de récupération du héros, indépendantes de la carte et du DOM. */
export class HeroRecoveryService {
  constructor({
    naturalHealPerCycle = HERO_NATURAL_HEAL_PER_CYCLE,
    reviveHealthRatio = HERO_REVIVE_HEALTH_RATIO,
  } = {}) {
    if (!Number.isFinite(naturalHealPerCycle) || naturalHealPerCycle <= 0)
      throw new RangeError("Le soin naturel par cycle doit être positif.");
    if (
      !Number.isFinite(reviveHealthRatio) ||
      reviveHealthRatio <= 0 ||
      reviveHealthRatio > 1
    )
      throw new RangeError(
        "Le ratio de résurrection doit être compris entre zéro et un.",
      );
    this.naturalHealPerCycle = naturalHealPerCycle;
    this.reviveHealthRatio = reviveHealthRatio;
  }

  recover(hero, { cycles = 1, healingLocation = null } = {}) {
    if (!Number.isInteger(cycles) || cycles <= 0)
      throw new RangeError(
        "Le nombre de cycles de récupération doit être un entier positif.",
      );
    if (hero.health === 0 || hero.state === "ghost")
      return {
        heroId: hero.id,
        restoredHealth: 0,
        naturalHealing: 0,
        locationHealing: 0,
        reason: "hero_is_ghost",
      };
    if (hero.state !== "active")
      return {
        heroId: hero.id,
        restoredHealth: 0,
        naturalHealing: 0,
        locationHealing: 0,
        reason: "hero_inactive",
      };
    const naturalHealing = this.naturalHealPerCycle * cycles;
    const healingLevel =
      healingLocation === null
        ? 0
        : Math.max(1, healingLocation.infrastructure?.healing_tent ?? 0);
    const locationHealing = healingLevel * cycles;
    const restoredHealth = hero.recoverHealth(naturalHealing + locationHealing);
    return {
      heroId: hero.id,
      restoredHealth,
      naturalHealing: Math.min(restoredHealth, naturalHealing),
      locationHealing: Math.max(0, restoredHealth - naturalHealing),
      locationId: healingLocation?.id ?? null,
    };
  }

  reviveAtBase(hero) {
    if (hero.state !== "ghost" || hero.health !== 0)
      return { success: false, reason: "hero_not_ghost", heroId: hero.id };
    const health = hero.revive(this.reviveHealthRatio);
    return {
      success: true,
      heroId: hero.id,
      health,
      maximumHealth: hero.maxHealth,
    };
  }
}
