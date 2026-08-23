import assert from "node:assert/strict";
import test from "node:test";
import { buildQuestHudModel } from "../app/js/ui/quest-hud.js";

const quest = { id: "walk", title: "Établir un camp", description: "Éloignez-vous du départ.", objectives: [{ id: "camp", text: "Marcher jusqu'au site", state: "active", trigger: { type: "locationPlaced", locationSlotId: "royal-camp" } }] };

test("la cartouche résume la quête et borne sa progression", () => {
  const model = buildQuestHudModel({ quest, placement: { status: "walking", distanceMeters: 124.6, minimumDistanceMeters: 300 } });
  assert.equal(model.objective, "Marcher jusqu'au site"); assert.equal(model.current, 125); assert.equal(Math.round(model.progressPercent), 42); assert.equal(model.ready, false);
  assert.deepEqual(model.objectives, [{ id: "camp", text: "Marcher jusqu'au site", state: "active" }]);
});

test("l'action contextuelle apparaît quand le placement est prêt", () => {
  const model = buildQuestHudModel({ quest, placement: { status: "ready", distanceMeters: 305, minimumDistanceMeters: 300 }, actionSlotId: "royal-camp" });
  assert.equal(model.ready, true); assert.equal(model.actionLabel, "Placer le camp"); assert.equal(model.progressPercent, 100);
});
