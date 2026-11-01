import { validateQuestModification } from "../../app/js/core/quest-modification.js";
import { getItemDefinition } from "../../app/js/core/item-catalog.js";
import { normalizeVisual } from "../../app/js/core/visual-definition.js";
export function applyQuestModification(
  game,
  actor,
  instance,
  v,
  actionId = "modify",
) {
  validateQuestModification(v);
  const hero = game.getHero(actor.heroId),
    scoped = `${instance.id}:${v.targetId}`;
  const target =
    v.target === "hero"
      ? hero
      : v.target === "location"
        ? (game.getLocation(scoped) ??
          game.getLocation(v.targetId) ??
          game.getLocationForScenarioSlot(v.targetId))
        : (game.getAutonomousGroup(scoped) ??
          game.getAutonomousGroup(v.targetId));
  if (!target) throw new Error("Cible absente.");
  if (v.property === "appearance") {
    if (v.target === "hero") hero.gender = v.key;
    else target.visual = normalizeVisual(v.visual);
    return;
  }
  if (v.property === "existence") {
    game.removeAutonomousGroup(target.id);
    return;
  }
  if (v.property === "resource") {
    if (v.operation === "add") hero.addResource(v.key, v.amount);
    else {
      const amount = Math.min(hero.getResourceAmount(v.key), v.amount);
      if (amount > 0) hero.spendResource(v.key, amount);
    }
  } else if (v.property === "xp")
    game.gainHeroExperience({
      heroId: hero.id,
      amount: v.amount,
      source: "quest",
    });
  else if (v.property === "stat") {
    const next = hero.baseStats[v.key] + v.amount;
    const final = hero.finalStats[v.key] + v.amount;
    if (
      next < 0 ||
      final < 0 ||
      (["health", "mobility"].includes(v.key) && final <= 0) ||
      (v.key === "command" && hero.maxCommandPoints + v.amount < 1)
    )
      throw new Error("Statistique résultante invalide.");
    hero.baseStats[v.key] = next;
    if (v.key === "command") {
      hero.maxCommandPoints += v.amount;
      hero.commandPoints = Math.min(hero.commandPoints, hero.maxCommandPoints);
    }
    if (v.key === "health") {
      hero.maxHealth = hero.finalStats.health;
      hero.health = Math.min(hero.health, hero.maxHealth);
    }
  } else if (v.property === "item") {
    if (!getItemDefinition(v.key))
      throw new Error("Objet absent du catalogue actif.");
    if (v.operation === "add")
      hero.carriedLoot.push({
        id: `${instance.id}:modify:${actionId}:${hero.id}`,
        itemId: v.key,
        quantity: v.amount,
      });
    else {
      const entries = hero.carriedLoot.filter((e) => e.itemId === v.key);
      let remaining = v.amount;
      if (entries.reduce((sum, e) => sum + e.quantity, 0) < remaining)
        throw new Error("Pas assez d’objets non équipés.");
      for (const e of entries) {
        const n = Math.min(e.quantity, remaining);
        e.quantity -= n;
        remaining -= n;
      }
      hero.carriedLoot = hero.carriedLoot.filter((e) => e.quantity > 0);
    }
  }
  if (
    game.inventoryService.getHeroBagState(hero).usedSlots >
    game.inventoryService.getHeroBagSlotCount(hero)
  )
    throw new Error("Bagages pleins.");
}
