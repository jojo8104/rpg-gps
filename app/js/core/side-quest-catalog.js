import { MarketService } from "./market-service.js";
import { TAVERN_NPC_CATALOG } from "./tavern-npc-service.js";
import { getItemDefinition } from "./item-catalog.js";
import { UNIT_RANKS } from "./rank-system.js";

const prices = Object.fromEntries(
  new MarketService()
    .getOffers()
    .map((offer) => [offer.itemId, offer.buy / offer.quantity]),
);
prices.gold = 1;
export function sideQuestInvestment(resources) {
  return Object.entries(resources).reduce(
    (total, [id, amount]) => total + amount * (prices[id] ?? 0),
    0,
  );
}
export function sideQuestSupplyLabel(requirements) {
  return Object.entries(requirements)
    .map(([id, amount]) => `${amount} ${getItemDefinition(id)?.name ?? id}`)
    .join(" + ");
}
export function sideQuestTemplates({
  unitDefinitions = [],
  canGarrison = false,
} = {}) {
  const deliveries = [
    { wood: 10 },
    { stone: 5 },
    { iron: 5 },
    { beer: 3 },
    { horse: 2 },
    { wood: 10, stone: 5 },
    { food: 5, beer: 3 },
    { iron: 5, horse: 2 },
  ].map((requirements, index) => {
    const value = sideQuestInvestment(requirements);
    return {
      templateId: `supplies-${index}`,
      type: "supplies",
      requirements,
      title: `Livraison : ${sideQuestSupplyLabel(requirements)}`,
      reward: Math.ceil(value * 1.2) + 2,
      experienceReward: Math.ceil(10 + value * 3),
    };
  });
  const specialists = TAVERN_NPC_CATALOG.filter(
    (npc) =>
      npc.effect.itemId &&
      !npc.questId &&
      ["specialist", "worker"].includes(npc.kind),
  ).map((npc) => ({
    templateId: `npc-${npc.id}`,
    type: "npc",
    requirements: { [npc.effect.itemId]: 1 },
    title: `Installer un ${npc.name}`,
    reward: 0,
    experienceReward: Math.ceil(25 + sideQuestInvestment(npc.costs) * 4),
  }));
  const units = canGarrison
    ? unitDefinitions
        .filter((unit) => ["militia", "archer", "spearman"].includes(unit.id))
        .map((unit) => ({
          templateId: `garrison-${unit.id}`,
          type: "garrison",
          unitTypeId: unit.id,
          requiredQuantity: UNIT_RANKS[0].capacity,
          title: `Renforcer la garnison : ${unit.name}`,
          reward: 0,
          experienceReward: Math.ceil(25 + sideQuestInvestment(unit.costs) * 4),
        }))
    : [];
  return [...deliveries, ...specialists, ...units];
}
