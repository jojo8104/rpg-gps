/** Troc local limité, indépendant de l'interface. */
export class ChiefTradeService {
  execute({ hero, location, offerId }) {
    const offer = location.chief?.tradeOffers.find(
      (entry) => entry.id === offerId,
    );
    if (!offer) return { success: false, reason: "trade_offer_unavailable" };
    const remaining = location.statistics.chiefTradeRemaining ?? 0;
    if (remaining <= 0)
      return { success: false, reason: "chief_trade_quota_exhausted" };
    if (hero.getResourceAmount(offer.give.resource) < offer.give.amount)
      return { success: false, reason: "insufficient_resources" };
    if (
      (location.resources.stock[offer.receive.resource] ?? 0) <
      offer.receive.amount
    )
      return { success: false, reason: "location_stock_insufficient" };
    hero.spendResource(offer.give.resource, offer.give.amount);
    hero.addResource(offer.receive.resource, offer.receive.amount);
    location.resources.stock[offer.give.resource] =
      (location.resources.stock[offer.give.resource] ?? 0) + offer.give.amount;
    location.resources.stock[offer.receive.resource] -= offer.receive.amount;
    location.statistics.chiefTradeRemaining = remaining - 1;
    return {
      success: true,
      offer: structuredClone(offer),
      remaining: location.statistics.chiefTradeRemaining,
    };
  }

  refresh(location) {
    if (!location.chief || location.chief.tradeOffers.length === 0) return 0;
    location.statistics.chiefTradeRemaining = location.chief.tradeLimitPerCycle;
    return location.statistics.chiefTradeRemaining;
  }
}
