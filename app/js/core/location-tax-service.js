import { CAMP_IMPROVEMENTS } from "./camp-improvement-service.js";

const TAXABLE_TYPES = new Set(["village", "town", "capital"]);
export const TAX_RATE_PER_CYCLE = 0.01;
const round = (value) => Math.round(value * 1000) / 1000;

/** Fiscalité par cycle de production, indépendante de l'interface. */
export function locationTaxState(location) {
  const eligible = TAXABLE_TYPES.has(location.type);
  const population = location.population ?? 0;
  const active = eligible && location.state === "active" && population > 0;
  const economicLevels = Object.entries(location.infrastructure).reduce(
    (total, [id, level]) => total + (CAMP_IMPROVEMENTS[id]?.category === "economy" ? level : 0), 0,
  );
  const capacity = eligible ? Math.floor(population + economicLevels * 2) : 0;
  const accrued = Math.min(location.taxes.accrued, capacity);
  const perCycle = active ? round(capacity * TAX_RATE_PER_CYCLE) : 0;
  return { eligible, capacity, accrued, perCycle, available: Math.floor(accrued) };
}

export function accrueLocationTaxes(location, cycles = 1) {
  if (!Number.isFinite(cycles) || cycles < 0)
    throw new RangeError("La durée fiscale doit être positive ou nulle.");
  const tax = locationTaxState(location);
  location.taxes.accrued = Math.min(tax.capacity, round(tax.accrued + tax.perCycle * cycles));
  return round(location.taxes.accrued - tax.accrued);
}
