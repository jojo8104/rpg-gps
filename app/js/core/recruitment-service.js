import { Unit } from "./unit.js";

/** Règles de création d'unités initiales et de recrutement dans les lieux. */
export class RecruitmentService {
  constructor(unitDefinitions) {
    this.unitDefinitions = unitDefinitions;
  }

  createUnit({ ownerPlayerId, typeId, quantity, idGenerator }) {
    const definition = this.unitDefinitions.get(typeId);
    if (definition === undefined) throw new RangeError("Le type d'unité n'existe pas.");
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > definition.maxQuantity) throw new RangeError("L'effectif ne respecte pas la définition de l'unité.");
    return new Unit({ id: idGenerator("unit"), ownerPlayerId, typeId, quantity, maxQuantity: definition.maxQuantity });
  }

  recruit({ player, hero, location, typeId, maxUnitsPerHero, idGenerator }) {
    if (!location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (location.features.recruitment !== true) return { success: false, reason: "recruitment_not_available" };
    if (!location.recruitment.availableUnitTypeIds.includes(typeId)) return { success: false, reason: "unit_not_available" };
    if (hero.army.units.length >= maxUnitsPerHero) return { success: false, reason: "army_full" };
    const definition = this.unitDefinitions.get(typeId);
    if (definition === undefined) return { success: false, reason: "unknown_unit_type" };
    if (!Object.entries(definition.costs).every(([resource, amount]) => player.getResourceAmount(resource) >= amount)) return { success: false, reason: "insufficient_resources" };
    Object.entries(definition.costs).forEach(([resource, amount]) => { if (amount > 0) player.spendResource(resource, amount); });
    const unit = this.createUnit({ ownerPlayerId: player.id, typeId, quantity: definition.maxQuantity, idGenerator });
    hero.addUnit(unit);
    return { success: true, unit };
  }
}
