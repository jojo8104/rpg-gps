import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Scenario } from "../app/js/core/scenario.js";

const scenarioDefinition = JSON.parse(readFileSync(new URL("../data/scenarios/chaos.json", import.meta.url), "utf8"));
const locations = JSON.parse(readFileSync(new URL("../data/locations.json", import.meta.url), "utf8"));

test("la mine du convoi est royale, productive et placée dans les 25 % autour de la capitale", () => {
  const mine = locations.find((location) => location.id === "royal-gold-mine");
  const slot = scenarioDefinition.locationSlots.find((entry) => entry.id === "royal-gold-mine");
  assert.equal(mine.ownerId, "kingdom");
  assert.equal(mine.controllerId, "kingdom");
  assert.ok(mine.resources.production.gold > 0);
  assert.ok(mine.resources.stock.gold >= 30);
  assert.equal(slot.defaultPlacement.strategy, "area-relative");
  assert.equal(slot.defaultPlacement.originLocationSlotId, "capital");
  assert.ok(slot.defaultPlacement.areaRadiusRatio <= 0.25);
});

test("le retour du convoi place des ralentisseurs sur la route et un chef rapide plus loin", () => {
  const scenario = new Scenario(scenarioDefinition);
  const collection = scenario.getEvent("royal-gold-collected");
  const spawns = collection.effects.filter((effect) => effect.type === "spawnPursuitGroup");
  const harriers = spawns.filter((effect) => effect.role === "harrier");
  const boss = spawns.find((effect) => effect.role === "boss");
  assert.equal(harriers.length, 3);
  assert.ok(harriers.every((effect) => effect.corridorRatio > 0 && effect.corridorRatio < 1));
  assert.ok(boss.corridorRatio < Math.min(...harriers.map((effect) => effect.corridorRatio)));
  assert.ok(boss.speedMetersPerSecond > Math.max(...harriers.map((effect) => effect.speedMetersPerSecond)));
  assert.ok(boss.quantity > Math.max(...harriers.map((effect) => effect.quantity)));
});

test("la quête charge puis livre réellement trente unités d'or", () => {
  const scenario = new Scenario(scenarioDefinition);
  const collection = scenario.getPhase("collect-royal-gold").objectives[0];
  const delivery = scenario.getPhase("escape-gold-thieves").objectives[0];
  assert.equal(collection.trigger.type, "resourceCollection");
  assert.equal(collection.trigger.amount, 30);
  assert.equal(delivery.trigger.type, "resourceDelivery");
  assert.equal(delivery.trigger.amount, 30);
  assert.ok(scenario.getEvent("royal-gold-collected").effects.some((effect) => effect.type === "collectLocationResource" && effect.amount === 30));
  assert.ok(scenario.getEvent("royal-gold-delivered").effects.some((effect) => effect.type === "depositHeroResource" && effect.amount === 30));
});
