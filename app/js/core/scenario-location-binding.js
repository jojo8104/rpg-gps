/** Associe les emplacements logiques d'un scénario aux lieux réels d'une partie. */
export class ScenarioLocationBinding {
  constructor({ locationSlotId, locationId }) {
    this.locationSlotId = ScenarioLocationBinding.#requireText(locationSlotId, "L'identifiant d'emplacement");
    this.locationId = ScenarioLocationBinding.#requireText(locationId, "L'identifiant de lieu");
  }

  toJSON() {
    return { locationSlotId: this.locationSlotId, locationId: this.locationId };
  }

  static validateAll(bindings, scenario, locations) {
    if (!Array.isArray(bindings)) throw new TypeError("Les associations de lieux doivent être une liste.");
    const slotIds = new Set(scenario.locationSlots.map((slot) => slot.id));
    const locationIds = new Set(locations.map((location) => location.id));
    const boundSlots = new Set();

    return bindings.map((binding) => {
      const normalized = binding instanceof ScenarioLocationBinding ? binding : new ScenarioLocationBinding(binding);
      if (!slotIds.has(normalized.locationSlotId)) throw new RangeError("L'emplacement de scénario n'existe pas.");
      if (!locationIds.has(normalized.locationId)) throw new RangeError("Le lieu associé n'existe pas.");
      if (boundSlots.has(normalized.locationSlotId)) throw new RangeError("Un emplacement de scénario ne peut être associé qu'une fois.");
      boundSlots.add(normalized.locationSlotId);
      return normalized;
    });
  }

  static #requireText(value, label) {
    if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`);
    return value.trim();
  }
}
