import assert from "node:assert/strict";
import test from "node:test";
import { buildQuestHudModel } from "../app/js/ui/quest-hud.js";

const quest = { id: "walk", title: "Établir un camp", description: "Éloignez-vous du départ.", objectives: [{ id: "camp", text: "Marcher jusqu'au site", state: "active", trigger: { type: "locationPlaced", locationSlotId: "royal-camp" } }] };

test("la cartouche résume la quête et borne sa progression", () => {
  const model = buildQuestHudModel({ quest, placement: { status: "walking", distanceMeters: 124.6, minimumDistanceMeters: 300, distanceFromOriginMeters: 80, minimumDistanceFromOriginMeters: 100 } });
  assert.equal(model.objective, "Marcher jusqu'au site"); assert.equal(model.current, 125); assert.equal(Math.round(model.progressPercent), 42); assert.equal(model.ready, false);
  assert.equal(model.distanceFromOrigin, 80); assert.equal(model.minimumDistanceFromOrigin, 100);
  assert.deepEqual(model.objectives, [{ id: "camp", text: "Marcher jusqu'au site", state: "active" }]);
});

test("l'action contextuelle apparaît quand le placement est prêt", () => {
  const model = buildQuestHudModel({ quest, placement: { status: "ready", distanceMeters: 305, minimumDistanceMeters: 300 }, actionSlotId: "royal-camp" });
  assert.equal(model.ready, true); assert.equal(model.actionLabel, "Placer le camp"); assert.equal(model.progressPercent, 100);
});

test("la cartouche expose toutes les échéances actives avec leur temps restant", () => {
  const model = buildQuestHudModel({ quest, now: 10_000, deadlines: [
    { id: "delivery", label: "Livraison", expiresAt: 100_000 },
    { id: "reinforcements", label: "Renforts", expiresAt: 40_000 },
    { id: "finished", label: "Terminée", expiresAt: 20_000, completedAt: 9_000 },
  ] });
  assert.deepEqual(model.deadlines, [
    { id: "delivery", label: "Livraison", remainingMs: 90_000, expired: false },
    { id: "reinforcements", label: "Renforts", remainingMs: 30_000, expired: false },
  ]);
});
