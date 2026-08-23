import assert from "node:assert/strict";
import test from "node:test";
import { AmbushService } from "../app/js/core/ambush-service.js";

const definitions = new Map([
  ["light", { tags: ["cavalry"] }], ["heavy", { tags: ["cavalry", "heavy_armor"] }], ["archer", { tags: ["ranged"] }],
]);
const unit = (typeId, quantity = 6) => ({ typeId, quantity, combatantCount: quantity });

test("les unités légères et à distance augmentent la portée, pas la cavalerie lourde", () => {
  const service = new AmbushService();
  assert.equal(service.engagementRange({ baseRange: 100, attackerUnits: [unit("light")], unitDefinitions: definitions }), 150);
  assert.equal(service.engagementRange({ baseRange: 100, attackerUnits: [unit("archer")], unitDefinitions: definitions }), 150);
  assert.equal(service.engagementRange({ baseRange: 100, attackerUnits: [unit("heavy")], unitDefinitions: definitions }), 100);
});

test("le train renforce aussi la défense contre l'embuscade", () => {
  const service = new AmbushService();
  const input = { attacker: { signatureMultiplier: .6, units: [unit("light")], unitDefinitions: definitions, trainLoad: 0, trainCapacity: 10 }, defender: { perception: 0, passiveIds: [], moving: false, trainLoad: 0, trainCapacity: 10 }, distance: 20, maximumDistance: 100 };
  const lightTrain = service.resolve(input); const heavyTrain = service.resolve({ ...input, defender: { ...input.defender, trainLoad: 10 } });
  assert.equal(heavyTrain.details.defenderTrain, 10); assert.equal(heavyTrain.margin, lightTrain.margin - 10);
});

test("l'éclaireur peut annuler une embuscade ordinaire", () => {
  const service = new AmbushService();
  const result = service.resolve({ attacker: { signatureMultiplier: .6, units: [], unitDefinitions: definitions }, defender: { perception: 2, classId: "ranger" }, distance: 20, maximumDistance: 100 });
  assert.equal(result.level, "cancelled"); assert.equal(result.effects.durationMs, 0);
});
