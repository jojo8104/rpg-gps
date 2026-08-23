import { Location } from "./location.js";

const HERO_STATS = ["attack", "defense", "morale", "mobility", "command", "health"];

/** Outils de mutation explicites, réservés au banc d'essai. */
export class CheatService {
  applyHeroChanges(hero, { level, health, stats = {}, resources = {} }) {
    if (!hero) throw new TypeError("Le héros de test est requis.");
    if (level !== undefined) hero.setLevel(CheatService.#integer(level, 1, 20, "Le niveau"));
    for (const stat of HERO_STATS) if (stats[stat] !== undefined) hero.temporaryModifiers[stat] = CheatService.#number(stats[stat], -999, 999, `Le modificateur ${stat}`);
    hero.maxHealth = Math.max(1, hero.finalStats.health);
    hero.health = Math.min(hero.maxHealth, CheatService.#number(health ?? hero.health, 0, hero.maxHealth, "Les PV"));
    for (const [resource, amount] of Object.entries(resources)) hero.resources[resource] = CheatService.#number(amount, 0, 999999, `La ressource ${resource}`);
    return hero.toJSON();
  }

  createLocation(values, position) {
    const level = CheatService.#integer(values.level ?? 1, 0, 20, "Le niveau du lieu");
    const population = CheatService.#integer(values.population ?? 0, 0, 999999, "La population");
    const defenseSlots = CheatService.#integer(values.defenseSlots ?? 0, 0, 20, "Les slots de défense");
    const productionResource = String(values.productionResource ?? "").trim();
    const productionAmount = CheatService.#number(values.productionAmount ?? 0, 0, 999999, "La production");
    const ownerId = values.ownerId === "neutral" || !values.ownerId ? null : String(values.ownerId);
    const features = { capturable: true, battle: true, garrison: defenseSlots > 0, resourceProduction: productionResource !== "" && productionAmount > 0 };
    return new Location({ id: String(values.id).trim(), name: String(values.name).trim(), type: String(values.type).trim(), roles: productionResource ? ["resource"] : [], source: "test-cheat", position, interactionRadius: 20, detectionRadius: 80, visibility: "discovered", ownerId, controllerId: ownerId, level, population, populationCapacity: values.type === "camp" ? Math.max(population, level === 1 ? 8 : level === 2 ? 15 : 25) : null, defenseSlots, features, resources: { production: productionResource ? { [productionResource]: productionAmount } : {}, stock: {}, storageCapacity: Math.max(40, population * 4) }, qr: { enabled: false } });
  }

  static #number(value, minimum, maximum, label) { const number = Number(value); if (!Number.isFinite(number) || number < minimum || number > maximum) throw new RangeError(`${label} doit être compris entre ${minimum} et ${maximum}.`); return number; }
  static #integer(value, minimum, maximum, label) { const number = Number(value); if (!Number.isInteger(number) || number < minimum || number > maximum) throw new RangeError(`${label} doit être un entier compris entre ${minimum} et ${maximum}.`); return number; }
}
