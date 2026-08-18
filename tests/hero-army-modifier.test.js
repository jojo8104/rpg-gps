import assert from "node:assert/strict";
import test from "node:test";

import { Hero } from "../app/js/core/hero.js";
import { HeroArmyModifier } from "../app/js/core/hero-army-modifier.js";

const definitions = new Map([
  ["cavalry", { tags: ["cavalry"] }],
  ["heavy", { tags: ["infantry", "heavy_armor"] }],
]);

test("les bonus du héros et le train modifient les statistiques de l'armée", () => {
  const hero = new Hero({ id: "h", playerId: "p", name: "A", commandStats: { attackBonus: 2, defenseBonus: 1, moraleBonus: 1 }, carryCapacity: 20, carriedLoot: [{ itemId: "ore", quantity: 10, weightPerUnit: 1 }] });
  const result = HeroArmyModifier.calculate({ hero, units: [{ typeId: "cavalry", quantity: 5 }, { typeId: "heavy", quantity: 5 }], unitDefinitions: definitions });
  assert.equal(result.attackBonus, 2);
  assert.equal(result.defenseBonus, 1);
  assert.ok(result.speedMultiplier < 1);
});

test("le mode casual ignore les facteurs de moral experts", () => {
  const hero = new Hero({ id: "h", playerId: "p", name: "A", moraleHistory: [
    { source: "battle", value: 2, reason: "victory" },
    { source: "carried_gold", value: 3 },
    { source: "battle_trigger", value: -1, reason: "ambush" },
  ] });
  const casual = HeroArmyModifier.calculate({ hero, unitDefinitions: definitions, moraleMode: "casual" });
  const expert = HeroArmyModifier.calculate({ hero, unitDefinitions: definitions, moraleMode: "expert" });
  assert.equal(casual.moraleBonus, 1);
  assert.equal(expert.moraleBonus, 4);
});
