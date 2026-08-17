import { Unit } from "./unit.js";
import { UNIT_RANKS } from "./rank-system.js";

/** Règles de création d'unités initiales et de recrutement dans les lieux. */
export class RecruitmentService {
  constructor(unitDefinitions) {
    this.unitDefinitions = unitDefinitions;
  }

  createUnit({ ownerPlayerId, typeId, quantity, idGenerator }) {
    const definition = this.unitDefinitions.get(typeId);
    if (definition === undefined) throw new RangeError("Le type d'unité n'existe pas.");
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > UNIT_RANKS[0].capacity) throw new RangeError("L'effectif ne respecte pas le grade initial de l'unité.");
    return new Unit({ id: idGenerator("unit"), ownerPlayerId, typeId, quantity, rank: "soldier" });
  }

  recruit({ player, hero, location, typeId, idGenerator }) {
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
    const unit = this.createUnit({ ownerPlayerId: player.id, typeId, quantity: recruitQuantity, idGenerator });
    hero.addUnit(unit);
    return { success: true, unit };
  }
}
