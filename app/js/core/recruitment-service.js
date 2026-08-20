import { Unit } from "./unit.js";
import { UNIT_RANKS } from "./rank-system.js";

/** Règles de création d'unités initiales et de recrutement dans les lieux. */
export class RecruitmentService {
  constructor(unitDefinitions) {
    this.unitDefinitions = unitDefinitions;
  }

  createUnit({ ownerPlayerId, typeId, quantity, idGenerator, number = 1, name = null }) {
    const definition = this.unitDefinitions.get(typeId);
    if (definition === undefined) throw new RangeError("Le type d'unité n'existe pas.");
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > UNIT_RANKS[0].capacity) throw new RangeError("L'effectif ne respecte pas le grade initial de l'unité.");
    const ordinal = number === 1 ? "1re" : `${number}e`;
    const typeName = definition.name ?? `${typeId.slice(0, 1).toUpperCase()}${typeId.slice(1).replaceAll("-", " ")}`;
    return new Unit({ id: idGenerator("unit"), ownerPlayerId, typeId, quantity, number, name: name ?? `${ordinal} ${typeName}`, rank: "soldier", healthPerSoldier: definition.stats.healthPerSoldier, combatHealthThreshold: definition.stats.combatHealthThreshold });
  }

  recruit({ player, hero, location, typeId, idGenerator, number = 1 }) {
    if (!location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (location.features.recruitment !== true) return { success: false, reason: "recruitment_not_available" };
    if (!location.recruitment.availableUnitTypeIds.includes(typeId)) return { success: false, reason: "unit_not_available" };
    if (hero.army.units.length >= hero.maxUnitStacks) return { success: false, reason: "army_full" };
    const definition = this.unitDefinitions.get(typeId);
    if (definition === undefined) return { success: false, reason: "unknown_unit_type" };
    const recruitQuantity = UNIT_RANKS[0].capacity;
    if ((location.recruitment.stock[typeId] ?? 0) < recruitQuantity) return { success: false, reason: "insufficient_recruits" };
    if (!Object.entries(definition.costs).every(([resource, amount]) => hero.getResourceAmount(resource) >= amount)) return { success: false, reason: "insufficient_resources" };
    Object.entries(definition.costs).forEach(([resource, amount]) => { if (amount > 0) hero.spendResource(resource, amount); });
    location.recruitment.stock[typeId] -= recruitQuantity;
    const unit = this.createUnit({ ownerPlayerId: player.id, typeId, quantity: recruitQuantity, idGenerator, number });
    hero.addUnit(unit);
    return { success: true, unit };
  }

  completeUnits({ hero, location }) {
    if (!location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location", reinforced: [] };
    if (location.features.recruitment !== true) return { success: false, reason: "recruitment_not_available", reinforced: [] };
    const reinforced = [];
    for (const unit of hero.army.units) {
      const available = Math.floor(location.recruitment.stock[unit.typeId] ?? 0);
      if (unit.missingQuantity <= 0 || available <= 0 || !location.recruitment.availableUnitTypeIds.includes(unit.typeId)) continue;
      const added = unit.reinforce(Math.min(unit.missingQuantity, available));
      location.recruitment.stock[unit.typeId] -= added;
      reinforced.push({ unitId: unit.id, typeId: unit.typeId, added, quantity: unit.quantity, maxQuantity: unit.maxQuantity });
    }
    return reinforced.length > 0 ? { success: true, reinforced } : { success: false, reason: "no_compatible_recruits", reinforced };
  }
}
