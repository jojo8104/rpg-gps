import { HERO_GRADES } from "./hero-progression-config.js";
import { SlotContainer, createStacksForQuantity } from "./slot-container.js";
import { getItemDefinition } from "./item-catalog.js";

const HERO_BAG_SLOTS = Object.freeze([8, 10, 12, 14, 16]);

export class InventoryService {
  constructor({
    idGenerator = (prefix) =>
      `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  } = {}) {
    this.idGenerator = idGenerator;
  }

  getHeroBagSlotCount(hero) {
    if (Number.isInteger(hero.bagSlotCount) && hero.bagSlotCount > 0)
      return hero.bagSlotCount;
    const index = Math.max(
      0,
      HERO_GRADES.findIndex((grade) => grade.id === hero.commandRank),
    );
    return HERO_BAG_SLOTS[index] ?? HERO_BAG_SLOTS[0];
  }

  getLocationSlotCount(location) {
    return Math.min(
      40,
      Math.max(
        4,
        Math.floor((location.population ?? 0) / 2) +
          Math.floor(location.resources?.infrastructureStorage ?? 0),
      ),
    );
  }

  getUsedHeroBagSlots(hero) {
    return this.getHeroBagState(hero).usedSlots;
  }

  getHeroBagState(hero) {
    const quantitiesByItem = {};
    const slotsByItem = {};
    Object.entries(hero.resources ?? {}).forEach(([itemId, quantity]) => {
      const bundleSize = getItemDefinition(itemId)?.bundleSize;
      if (!bundleSize || !Number.isFinite(quantity) || quantity <= 0) return;
      quantitiesByItem[itemId] = (quantitiesByItem[itemId] ?? 0) + quantity;
      slotsByItem[itemId] =
        (slotsByItem[itemId] ?? 0) + Math.ceil(quantity / bundleSize);
    });
    (hero.carriedLoot ?? []).forEach((entry) => {
      quantitiesByItem[entry.itemId] =
        (quantitiesByItem[entry.itemId] ?? 0) + entry.quantity;
      slotsByItem[entry.itemId] = (slotsByItem[entry.itemId] ?? 0) + 1;
    });
    const slotCapacity = this.getHeroBagSlotCount(hero);
    const usedSlots = Object.values(slotsByItem).reduce(
      (sum, count) => sum + count,
      0,
    );
    return {
      slotCapacity,
      usedSlots,
      freeSlots: Math.max(0, slotCapacity - usedSlots),
      quantitiesByItem,
      slotsByItem,
    };
  }

  createPopulationPackages({ location, container, people }) {
    if (!(container instanceof SlotContainer))
      throw new TypeError("La destination doit être un conteneur à slots.");
    if (
      !Number.isInteger(people) ||
      people <= 0 ||
      people > (location.population ?? 0)
    )
      return { success: false, reason: "invalid_population_amount" };
    const stacks = createStacksForQuantity({
      itemId: "population",
      quantity: people,
      idPrefix: this.idGenerator("population"),
    });
    if (stacks.length > container.freeSlots)
      return {
        success: false,
        reason: "insufficient_slots",
        requiredSlots: stacks.length,
      };
    location.population -= people;
    stacks.forEach((stack) => container.add(stack));
    return {
      success: true,
      people,
      createdStacks: stacks.map((stack) => stack.toJSON()),
      locationCapacity: this.getLocationSlotCount(location),
    };
  }

  settlePopulation({ location, container, slotIndex }) {
    const stack = container.slots[slotIndex];
    if (!stack || stack.itemId !== "population")
      return { success: false, reason: "not_population" };
    container.remove(slotIndex);
    location.population = (location.population ?? 0) + stack.quantity;
    return {
      success: true,
      people: stack.quantity,
      locationCapacity: this.getLocationSlotCount(location),
    };
  }

  getArmyConsumption(units) {
    return units.reduce((sum, unit) => sum + rankConsumption(unit.rank), 0);
  }
}

function rankConsumption(rank) {
  return Math.max(
    1,
    ["soldier", "veteran", "elite", "champion"].indexOf(rank) + 1,
  );
}
