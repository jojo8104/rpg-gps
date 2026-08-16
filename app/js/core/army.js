import { Unit } from "./unit.js";

/** Collection d'unités appartenant à un héros. */
export class Army {
  constructor({ units = [] } = {}) {
    if (!Array.isArray(units)) {
      throw new TypeError("Les unités de l'armée doivent être une liste.");
    }

    this.units = [];
    units.forEach((unit) => this.addUnit(unit));
  }

  addUnit(unit) {
    const unitToAdd = unit instanceof Unit ? unit : new Unit(unit);

    if (this.hasUnit(unitToAdd.id)) {
      return false;
    }

    this.units.push(unitToAdd);
    return true;
  }

  hasUnit(unitId) {
    return this.units.some((unit) => unit.id === unitId);
  }

  getUnit(unitId) {
    return this.units.find((unit) => unit.id === unitId) ?? null;
  }

  removeUnit(unitId) {
    const index = this.units.findIndex((unit) => unit.id === unitId);

    if (index === -1) {
      return null;
    }

    return this.units.splice(index, 1)[0];
  }

  toJSON() {
    return { units: this.units.map((unit) => unit.toJSON()) };
  }
}
