import { getItemDefinition } from "./item-catalog.js";

const RESOURCE_PER_GOLD = 5;
const PRODUCTION_SLOTS_PER_RESOURCE = 4;

/** Écoule au marché la production bloquée par des slots pleins. */
export class MarketService {
  sellBlockedProduction(location, cycles = 1, modifier = 1) {
    if (location.features.trade !== true || location.features.resourceProduction !== true) return { surplus: 0, gold: 0 };
    let blocked = 0;
    for (const [resource, rate] of Object.entries(location.resources.production)) {
      if (resource === "gold") continue;
      const capacity = (getItemDefinition(resource)?.bundleSize ?? 1) * PRODUCTION_SLOTS_PER_RESOURCE;
      const room = Math.max(0, capacity - (location.resources.productionStock[resource] ?? 0));
      blocked += Math.max(0, rate * cycles * modifier - room);
    }
    const available = (location.statistics.marketSurplusUnits ?? 0) + blocked;
    const requestedGold = Math.floor(available / RESOURCE_PER_GOLD);
    const gold = requestedGold > 0 ? location.depositResource("gold", requestedGold) : 0;
    location.statistics.marketSurplusUnits = available - gold * RESOURCE_PER_GOLD;
    return { surplus: gold * RESOURCE_PER_GOLD, gold };
  }
}
