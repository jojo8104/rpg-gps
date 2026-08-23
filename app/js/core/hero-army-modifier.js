const CASUAL_MORALE_SOURCES = new Set([
  "battle", "quest", "item", "ability", "power", "location", "battle_trigger",
]);

const EXPERT_MORALE_SOURCES = new Set([
  ...CASUAL_MORALE_SOURCES,
  "carried_gold", "known_loot", "loot_share", "location_contentment",
  "location_ownership", "location_improvement",
]);

/** Calcule les effets d'un héros et de son train d'armée sans dépendre du DOM. */
export class HeroArmyModifier {
  static calculate({ hero, units = [], unitDefinitions, moraleMode = "casual", context = {} }) {
    if (!hero || !Array.isArray(units) || !(unitDefinitions instanceof Map)) {
      throw new TypeError("Le héros, ses unités et leurs définitions sont requis.");
    }
    if (!new Set(["casual", "expert"]).has(moraleMode)) throw new RangeError("Le mode de moral est invalide.");

    const speed = HeroArmyModifier.#speed(hero, units, unitDefinitions);
    const morale = HeroArmyModifier.#morale(hero, moraleMode, context);
    return {
      attackBonus: hero.finalStats?.attack ?? hero.commandStats?.attackBonus ?? 0,
      defenseBonus: hero.finalStats?.defense ?? hero.commandStats?.defenseBonus ?? 0,
      moraleBonus: (hero.finalStats?.morale ?? hero.commandStats?.moraleBonus ?? 0) + morale.total,
      speedMultiplier: speed.multiplier * ((hero.finalStats?.mobility ?? 3) / 3),
      details: { speed: speed.details, morale: morale.details },
    };
  }

  static #speed(hero, units, definitions) {
    let mobility = 0;
    let soldiers = 0;
    for (const unit of units) {
      const definition = definitions.get(unit.typeId);
      if (!definition) throw new RangeError(`La définition de l'unité ${unit.typeId} n'existe pas.`);
      const quantity = unit.quantity ?? 0;
      soldiers += quantity;
      const tags = definition.tags ?? [];
      if (tags.includes("cavalry")) mobility += quantity * 0.012;
      if (tags.includes("heavy_armor")) mobility -= quantity * 0.015;
    }
    const bag = new InventoryService().getHeroBagState(hero);
    const loadRatio = bag.slotCapacity === 0 ? 0 : bag.usedSlots / bag.slotCapacity;
    const loadPenalty = Math.min(0.45, loadRatio * 0.35);
    const sizePenalty = Math.max(0, soldiers - 20) * 0.003;
    const multiplier = clamp(1 + mobility - loadPenalty - sizePenalty, 0.4, 1.35);
    return { multiplier, details: { mobility, usedSlots: bag.usedSlots, slotCapacity: bag.slotCapacity, loadRatio, loadPenalty, sizePenalty } };
  }

  static #morale(hero, mode, context) {
    const allowed = mode === "expert" ? EXPERT_MORALE_SOURCES : CASUAL_MORALE_SOURCES;
    const factors = [...(hero.moraleHistory ?? []), ...(context.moraleFactors ?? [])]
      .filter((factor) => allowed.has(factor.source));
    const details = factors.map((factor) => ({ source: factor.source, value: factor.value, reason: factor.reason ?? null }));
    return { total: details.reduce((sum, factor) => sum + factor.value, 0), details };
  }
}

function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
import { InventoryService } from "./inventory-service.js";
