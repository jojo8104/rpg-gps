import { getItemDefinition } from "./item-catalog.js";
import { InventoryService } from "./inventory-service.js";

// Prix par lot : la revente reste inférieure au prix d'achat.
const OFFERS = Object.freeze([
  { itemId: "wood", quantity: 5, buy: 2, sell: 1 },
  { itemId: "stone", quantity: 5, buy: 3, sell: 1 },
  { itemId: "iron", quantity: 5, buy: 5, sell: 2 },
  { itemId: "food", quantity: 5, buy: 3, sell: 1 },
  { itemId: "beer", quantity: 3, buy: 3, sell: 1 },
  { itemId: "horse", quantity: 5, buy: 12, sell: 6 },
]);

const RESOURCE_PER_GOLD = 5;
const PRODUCTION_SLOTS_PER_RESOURCE = 4;

/** Écoule au marché la production bloquée par des slots pleins. */
export class MarketService {
  constructor({ now = Date.now } = {}) {
    this.now = now;
  }

  imports(location) {
    if ((location?.infrastructure.trading_post ?? 0) < 2) return [];
    const period = Math.floor(this.now() / 600_000);
    const pool = OFFERS.filter(
      (offer) => !(location.resources.production[offer.itemId] > 0),
    );
    const offset = [...location.id].reduce(
      (sum, c) => sum + c.charCodeAt(0),
      period,
    );
    return Array.from({ length: Math.min(3, pool.length) }, (_, i) => {
      const offer = pool[(offset + i) % pool.length];
      const purchased =
        location.statistics.importPeriod === period
          ? (location.statistics[`importBought_${offer.itemId}`] ?? 0)
          : 0;
      return {
        ...offer,
        remaining: Math.max(0, offer.quantity * 2 - purchased),
        period,
        renewsAt: (period + 1) * 600_000,
      };
    });
  }

  getOffers(location = null, hero = null) {
    const offers = new Map(OFFERS.map((offer) => [offer.itemId, offer]));
    const ids = new Set([
      ...Object.keys(location?.resources.stock ?? {}),
      ...Object.keys(hero?.resources ?? {}),
      ...(location?.storedItems ?? []).map((entry) => entry.itemId),
      ...(hero?.carriedLoot ?? []).map((entry) => entry.itemId),
    ]);
    for (const itemId of ids) {
      if (
        itemId === "gold" ||
        offers.has(itemId) ||
        ["specialist", "character", "population"].includes(
          getItemDefinition(itemId)?.category,
        )
      ) continue;
      const price = Math.max(2, getItemDefinition(itemId)?.price ?? 2);
      offers.set(itemId, {
        itemId,
        quantity: 1,
        buy: price,
        sell: Math.max(1, Math.floor(price / 2)),
      });
    }
    return [...offers.values()].map((offer) => {
      if (!location) return { ...offer };
      const stock = availableQuantity(
        location.resources.stock,
        location.storedItems,
        offer.itemId,
      );
      const target = offer.quantity * 4;
      // Les achats raréfient le stock, les ventes le reconstituent.
      // Un lieu producteur propose cette ressource à meilleur prix.
      const scarcity = Math.max(
        0.6,
        Math.min(1.8, 1 + (target - stock) / (target * 2)),
      );
      const production =
        (location.resources.production?.[offer.itemId] ?? 0) > 0 ? 0.8 : 1;
      const buy = Math.max(2, Math.round(offer.buy * scarcity * production));
      const sell = Math.max(
        1,
        Math.min(buy - 1, Math.round(offer.sell * scarcity * production)),
      );
      const imported =
        stock === 0
          ? this.imports(location).find(
              (entry) => entry.itemId === offer.itemId,
            )
          : null;
      return {
        ...offer,
        buy: imported ? buy * 2 : buy,
        sell,
        imported: Boolean(imported),
        importRemaining: imported?.remaining ?? 0,
        renewsAt: imported?.renewsAt,
      };
    });
  }

  getAvailableOffers(location, hero) {
    return this.getOffers(location, hero)
      .filter(
        ({ itemId, importRemaining }) =>
          importRemaining > 0 ||
          availableQuantity(
            location.resources.stock,
            location.storedItems,
            itemId,
          ) > 0 ||
          availableQuantity(hero.resources, hero.carriedLoot, itemId) > 0,
      )
      .map((offer) => {
        const buyQuantity = Math.min(
          offer.quantity,
          availableQuantity(
            location.resources.stock,
            location.storedItems,
            offer.itemId,
          ) || offer.importRemaining,
        );
        const sellQuantity = Math.min(
          offer.quantity,
          availableQuantity(hero.resources, hero.carriedLoot, offer.itemId),
        );
        return {
          ...offer,
          buyQuantity,
          sellQuantity,
          buy: partialPrice(
            offer.buy,
            buyQuantity || offer.quantity,
            offer.quantity,
          ),
          sell: partialPrice(
            offer.sell,
            sellQuantity || offer.quantity,
            offer.quantity,
          ),
        };
      });
  }

  execute({ hero, location, itemId, direction, lots = 1, preview = false }) {
    const offer = this.getOffers(location, hero).find(
      (entry) => entry.itemId === itemId,
    );
    if (
      !offer ||
      !["buy", "sell"].includes(direction) ||
      !Number.isSafeInteger(lots) ||
      lots < 1 ||
      lots > 100
    )
      return { success: false, reason: "invalid_trade" };
    if (location.features.trade !== true)
      return { success: false, reason: "market_unavailable" };
    const available =
      direction === "buy"
        ? availableQuantity(
            location.resources.stock,
            location.storedItems,
            itemId,
          ) || offer.importRemaining
        : availableQuantity(hero.resources, hero.carriedLoot, itemId);
    const quantity =
      lots === 1 && available > 0
        ? Math.min(offer.quantity, available)
        : offer.quantity * lots;
    const gold = partialPrice(offer[direction], quantity, offer.quantity);
    const paid = direction === "buy" ? gold : quantity;
    const received = direction === "buy" ? quantity : gold;
    if ((direction === "buy" ? (hero.resources.gold ?? 0) : available) < paid)
      return { success: false, reason: "insufficient_resources" };
    if (
      (direction === "buy" ? available : (location.resources.stock.gold ?? 0)) <
      received
    )
      return { success: false, reason: "location_stock_insufficient" };
    const resources = { ...hero.resources };
    const stock = { ...location.resources.stock };
    const carriedLoot = (hero.carriedLoot ?? []).map((entry) => ({ ...entry }));
    const storedItems = (location.storedItems ?? []).map((entry) => ({
      ...entry,
    }));
    if (direction === "buy") {
      resources.gold = (resources.gold ?? 0) - gold;
      stock.gold = (stock.gold ?? 0) + gold;
      if (offer.imported)
        resources[itemId] = (resources[itemId] ?? 0) + quantity;
      else
        transferGoods(
          stock,
          storedItems,
          resources,
          carriedLoot,
          itemId,
          quantity,
        );
    } else {
      resources.gold = (resources.gold ?? 0) + gold;
      stock.gold = (stock.gold ?? 0) - gold;
      transferGoods(
        resources,
        carriedLoot,
        stock,
        storedItems,
        itemId,
        quantity,
      );
    }
    const bag = new InventoryService().getHeroBagState({
      ...hero,
      bagSlotCount: hero.bagSlotCount,
      resources,
      carriedLoot,
    });
    if (bag.usedSlots > bag.slotCapacity)
      return { success: false, reason: "hero_bag_full" };
    const usedSlots =
      Object.entries(stock).reduce(
        (sum, [id, amount]) =>
          sum + Math.ceil(amount / (getItemDefinition(id)?.bundleSize ?? 1)),
        0,
      ) +
      storedItems.reduce(
        (sum, entry) =>
          sum +
          Math.ceil(
            entry.quantity / (getItemDefinition(entry.itemId)?.bundleSize ?? 1),
          ),
        0,
      );
    if (usedSlots > location.storageSlotCapacity)
      return { success: false, reason: "location_storage_full" };
    if (!preview) {
      if (direction === "buy" && offer.imported) {
        const period = Math.floor(this.now() / 600_000);
        if (location.statistics.importPeriod !== period) {
          for (const entry of OFFERS)
            delete location.statistics[`importBought_${entry.itemId}`];
          location.statistics.importPeriod = period;
        }
        location.statistics[`importBought_${itemId}`] =
          (location.statistics[`importBought_${itemId}`] ?? 0) + quantity;
      }
      Object.assign(hero.resources, resources);
      Object.assign(location.resources.stock, stock);
      hero.carriedLoot = carriedLoot;
      location.storedItems = storedItems;
    }
    return {
      success: true,
      itemId,
      direction,
      lots,
      quantity,
      gold,
    };
  }

  sellBlockedProduction(location, cycles = 1, modifier = 1) {
    if (
      location.features.trade !== true ||
      location.features.resourceProduction !== true
    )
      return { surplus: 0, gold: 0 };
    let blocked = 0;
    for (const [resource, rate] of Object.entries(
      location.resources.production,
    )) {
      if (resource === "gold") continue;
      const capacity =
        (getItemDefinition(resource)?.bundleSize ?? 1) *
        PRODUCTION_SLOTS_PER_RESOURCE;
      const room = Math.max(
        0,
        capacity - (location.resources.productionStock[resource] ?? 0),
      );
      blocked += Math.max(0, rate * cycles * modifier - room);
    }
    const available = (location.statistics.marketSurplusUnits ?? 0) + blocked;
    const requestedGold = Math.floor(available / RESOURCE_PER_GOLD);
    const gold =
      requestedGold > 0 ? location.depositResource("gold", requestedGold) : 0;
    location.statistics.marketSurplusUnits =
      available - gold * RESOURCE_PER_GOLD;
    return { surplus: gold * RESOURCE_PER_GOLD, gold };
  }
}

function availableQuantity(resources, packages = [], itemId) {
  return (
    (resources[itemId] ?? 0) +
    packages.reduce(
      (sum, entry) =>
        sum +
        (entry.itemId === itemId && entry.portable !== false
          ? entry.quantity
          : 0),
      0,
    )
  );
}

function partialPrice(price, quantity, lotSize) {
  return Math.max(1, Math.ceil((price * quantity) / lotSize));
}

// Travaille exclusivement sur des copies : aperçu et refus restent sans effet.
function transferGoods(
  source,
  sourcePackages,
  target,
  targetPackages,
  itemId,
  quantity,
) {
  const loose = Math.min(source[itemId] ?? 0, quantity);
  if (loose > 0) {
    source[itemId] -= loose;
    if (
      !getItemDefinition(itemId) ||
      getItemDefinition(itemId)?.category === "equipment"
    ) {
      for (let i = 0; i < loose; i++)
        targetPackages.push({
          id: `trade-${itemId}-${crypto.randomUUID()}`,
          itemId,
          quantity: 1,
          valuePerUnit: getItemDefinition(itemId)?.price ?? 2,
        });
    } else target[itemId] = (target[itemId] ?? 0) + loose;
  }
  let remaining = quantity - loose;
  for (let i = 0; i < sourcePackages.length && remaining > 0; ) {
    const entry = sourcePackages[i];
    if (entry.itemId !== itemId || entry.portable === false) {
      i++;
      continue;
    }
    const moved = Math.min(entry.quantity, remaining);
    const bundleSize = getItemDefinition(itemId)?.bundleSize ?? 1;
    for (let amount = moved; amount > 0; amount -= bundleSize) {
      targetPackages.push({
        ...entry,
        id: `trade-${itemId}-${crypto.randomUUID()}`,
        quantity: Math.min(amount, bundleSize),
        valuePerUnit: Math.max(1, entry.valuePerUnit ?? 1),
      });
    }
    entry.quantity -= moved;
    remaining -= moved;
    if (entry.quantity === 0) sourcePackages.splice(i, 1);
    else i++;
  }
}
