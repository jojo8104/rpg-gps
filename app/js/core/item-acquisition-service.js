import {
  HERO_ITEM_DEFINITIONS,
  itemModifierLabel,
} from "./hero-item-catalog.js";
import { InventoryService } from "./inventory-service.js";
import { getItemDefinition } from "./item-catalog.js";

const ITEMS = Object.values(HERO_ITEM_DEFINITIONS);
const SOURCE_LABELS = {
  merchant: "Acheter",
  forge: "Forger",
  fence: "Recéleur",
  ruin: "Fouiller les ruines",
  treasure: "Déterrer le trésor",
  prospecting: "Cache des prospecteurs",
  battle: "Trophée de combat",
  mainQuest: "Récompense de quête",
  sideQuest: "Récompense de mission",
};
const METAL = [
  "melee",
  "throwing",
  "shield",
  "helmet",
  "heavyArmor",
  "ring",
  "necklace",
  "boots",
];

// Tirages reproductibles : ni une réouverture de panneau ni une recharge ne relance le stock.
function hash(text) {
  return [...text].reduce(
    (n, c) => (Math.imul(n, 31) + c.codePointAt(0)) >>> 0,
    17,
  );
}
function pick(pool, key, count) {
  if (!pool.length) return [];
  const start = hash(key) % pool.length;
  return Array.from(
    { length: Math.min(count, pool.length) },
    (_, i) => pool[(start + i) % pool.length],
  );
}

/** Stocks mondiaux finis et droits à récompense sérialisables, sans DOM ni GPS. */
export class ItemAcquisitionService {
  constructor(snapshot = null) {
    this.state = {
      issued: {},
      taken: [],
      rewards: [],
      visits: {},
      forgeUses: {},
      ...structuredClone(snapshot ?? {}),
    };
  }

  toJSON() {
    return structuredClone(this.state);
  }

  recordVisit(hero, location) {
    const visited = (this.state.visits[hero.id] ??= []);
    if (!visited.includes(location.id)) visited.push(location.id);
  }

  // Appelé uniquement par les résolutions du moteur, jamais avec une récompense choisie par le client.
  unlock({
    source,
    key,
    heroId = null,
    playerId = null,
    locationId = null,
    classId = null,
    itemId = null,
  }) {
    if (!["mainQuest", "sideQuest", "battle", "prospecting"].includes(source))
      return false;
    const id = `${source}:${key}`;
    if (this.state.rewards.some((entry) => entry.id === id)) return false;
    const resolvedClass =
      { fighter: "warrior", scout: "ranger" }[classId] ?? classId;
    const pool = ITEMS.filter(
      (item) =>
        (!resolvedClass || item.allowedClasses.includes(resolvedClass)) &&
        (source !== "sideQuest" || item.rarity !== "rare"),
    );
    const item = itemId ? HERO_ITEM_DEFINITIONS[itemId] : pick(pool, id, 1)[0];
    if (!item) return false;
    this.state.rewards.push({
      id,
      source,
      itemId: item.id,
      heroId,
      playerId,
      locationId,
    });
    return true;
  }

  offers({ hero, location, canTrade = false, canTavern = false }) {
    const offers = [];
    const add = (source, key, pool, count, costsFor = () => ({})) => {
      for (const item of pick(pool, key, count))
        offers.push({
          id: `${source}:${key}:${item.id}`,
          source,
          itemId: item.id,
          costs: costsFor(item),
        });
    };
    const infra = location.infrastructure ?? {};
    if (canTrade) {
      const departments = [
        [
          "general",
          ["hood", "lightArmor", "cloak", "boots", "ring", "necklace"],
          true,
          3,
        ],
        ["forge", ["melee"], (infra.forge ?? 0) > 0, 2],
        [
          "armorers",
          ["shield", "helmet", "heavyArmor"],
          (infra.armorers ?? 0) > 0,
          2,
        ],
        [
          "magic_academy",
          ["staff", "focus", "robe"],
          (infra.magic_academy ?? 0) > 0,
          2,
        ],
        [
          "archery_range",
          ["bow", "throwing"],
          (infra.archery_range ?? 0) > 0,
          2,
        ],
      ];
      for (const [department, families, enabled, count] of departments) {
        if (!enabled) continue;
        const pool = ITEMS.filter(
          (item) => item.rarity !== "rare" && families.includes(item.family),
        );
        add(
          "merchant",
          `${location.id}:${department}`,
          pool,
          count,
          (item) => ({ gold: item.price }),
        );
      }
    }
    if (
      (infra.forge ?? 0) > 0 &&
      canTrade &&
      (this.state.forgeUses[location.id] ?? 0) < 3
    ) {
      // Trois commandes au maximum par forge : les matériaux ordinaires ne permettent pas une fabrication infinie.
      const pool = ITEMS.filter(
        (item) =>
          METAL.includes(item.family) &&
          (item.rarity !== "rare" || infra.forge >= 2),
      );
      for (const item of pool)
        offers.push({
          id: `forge:${location.id}:${item.id}`,
          source: "forge",
          itemId: item.id,
          costs: { ...item.recipe },
        });
    }
    if (canTavern)
      add(
        "fence",
        location.id,
        ITEMS.filter((item) => item.rarity !== "common"),
        2,
        (item) => ({ gold: Math.ceil(item.price * 1.5) }),
      );
    if (canTrade && ["town", "capital", "village"].includes(location.type)) {
      const requested = pick(
        ITEMS.filter((item) => item.rarity === "common"),
        `request:${location.id}`,
        1,
      )[0];
      const reward = pick(
        ITEMS.filter((item) => item.rarity === "uncommon"),
        `contract:${location.id}`,
        1,
      )[0];
      offers.push({
        id: `contract:${location.id}`,
        source: "contract",
        itemId: reward.id,
        requiredItemId: requested.id,
        costs: {},
      });
    }
    if (location.type === "ruin") add("ruin", location.id, ITEMS, 1);
    if (this.state.visits[hero.id]?.[2] === location.id)
      add(
        "treasure",
        hero.id,
        ITEMS.filter((item) => item.rarity === "rare"),
        1,
      );
    for (const reward of this.state.rewards) {
      if (reward.heroId && reward.heroId !== hero.id) continue;
      if (reward.playerId && reward.playerId !== hero.playerId) continue;
      if (reward.locationId && reward.locationId !== location.id) continue;
      offers.push({ ...reward, costs: {} });
    }
    const supplies =
      canTrade && (infra.forge ?? 0) >= 1
        ? [
            {
              id: `supply:${location.id}:exploration_tools`,
              source: "supply",
              itemId: "exploration_tools",
              costs: { gold: 2 },
              label:
                "Acheter à la forge : Outils d’exploration · 2 or · toujours disponible",
              rarity: "common",
            },
          ]
        : [];
    return supplies.concat(
      offers
        .filter(
          (offer) =>
            !this.state.taken.includes(offer.id) &&
            (this.state.issued[offer.itemId] ?? 0) <
              HERO_ITEM_DEFINITIONS[offer.itemId].worldLimit,
        )
        .map((offer) => {
          const baseItemId = offer.itemId;
          if (
            offer.source === "merchant" &&
            offer.id.includes(":armorers:") &&
            (infra.armorers ?? 0) >= 2
          )
            offer = {
              ...offer,
              baseItemId,
              itemId: `reinforced:${baseItemId}`,
            };
          const item = getItemDefinition(offer.itemId);
          const costs = Object.entries(offer.costs)
            .map(
              ([id, amount]) =>
                `${amount} ${{ gold: "or", iron: "fer", wood: "bois" }[id] ?? id}`,
            )
            .join(", ");
          const action =
            offer.source === "contract"
              ? `Mission : remettre ${HERO_ITEM_DEFINITIONS[offer.requiredItemId].name} (dans les bagages) contre`
              : SOURCE_LABELS[offer.source];
          const classes =
            item.allowedClasses.length === 3
              ? "Toutes classes"
              : item.allowedClasses
                  .map(
                    (id) =>
                      ({
                        warrior: "Guerrier",
                        ranger: "Éclaireur",
                        mage: "Mage",
                      })[id],
                  )
                  .join(" / ");
          return {
            ...offer,
            label: `${action} : ${item.name} · ${classes}${item.hands === 2 ? " · deux mains" : ""} · ${itemModifierLabel(item.modifiers)}${costs ? ` · ${costs}` : offer.requiredItemId ? "" : " · gratuit"}`,
            rarity: item.rarity,
          };
        }),
    );
  }

  acquire(context, offerId) {
    const offer = this.offers(context).find((entry) => entry.id === offerId);
    if (!offer) return { success: false, reason: "item_offer_unavailable" };
    const { hero, location } = context;
    if (offer.source === "supply") {
      if (hero.getResourceAmount("gold") < offer.costs.gold)
        return { success: false, reason: "insufficient_resources" };
      const resources = {
        ...hero.resources,
        gold: hero.getResourceAmount("gold") - offer.costs.gold,
        [offer.itemId]: hero.getResourceAmount(offer.itemId) + 1,
      };
      const bag = new InventoryService().getHeroBagState({
        ...hero,
        bagSlotCount: hero.bagSlotCount,
        resources,
      });
      if (bag.usedSlots > bag.slotCapacity)
        return { success: false, reason: "hero_bag_full" };
      Object.assign(hero.resources, resources);
      return {
        success: true,
        itemId: offer.itemId,
        source: offer.source,
        message: `${getItemDefinition(offer.itemId).name} rejoint vos bagages.`,
      };
    }
    const delivery = offer.requiredItemId
      ? hero.carriedLoot.find(
          (entry) =>
            entry.itemId === offer.requiredItemId && entry.quantity === 1,
        )
      : null;
    if (offer.requiredItemId && !delivery)
      return { success: false, reason: "quest_item_required" };
    if (
      Object.entries(offer.costs).some(
        ([id, amount]) => hero.getResourceAmount(id) < amount,
      )
    )
      return { success: false, reason: "insufficient_resources" };
    const resources = { ...hero.resources };
    for (const [id, amount] of Object.entries(offer.costs))
      resources[id] -= amount;
    const inventory = new InventoryService();
    const projected = inventory.getHeroBagState({
      ...hero,
      bagSlotCount: hero.bagSlotCount,
      resources,
      carriedLoot: hero.carriedLoot.filter((entry) => entry !== delivery),
    });
    if (projected.usedSlots + 1 > projected.slotCapacity)
      return { success: false, reason: "hero_bag_full" };
    Object.assign(hero.resources, resources);
    if (delivery)
      hero.carriedLoot.splice(hero.carriedLoot.indexOf(delivery), 1);
    hero.addCarriedLoot([
      {
        id: `found:${offer.id}`,
        itemId: offer.itemId,
        quantity: 1,
        valuePerUnit: getItemDefinition(offer.itemId).price,
      },
    ]);
    this.state.taken.push(offer.id);
    const issuedId = offer.baseItemId ?? offer.itemId;
    this.state.issued[issuedId] = (this.state.issued[issuedId] ?? 0) + 1;
    if (offer.source === "forge")
      this.state.forgeUses[location.id] =
        (this.state.forgeUses[location.id] ?? 0) + 1;
    return {
      success: true,
      itemId: offer.itemId,
      source: offer.source,
      message: `${getItemDefinition(offer.itemId).name} rejoint vos bagages.`,
    };
  }
}
