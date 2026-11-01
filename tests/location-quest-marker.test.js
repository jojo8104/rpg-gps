import test from "node:test";
import assert from "node:assert/strict";
import { locationQuestMarker } from "../app/js/controllers/location-quest-marker.js";
test("seuls les objectifs de quête actifs marquent leurs lieux", () => {
  const game = {
    getActiveQuest: () => ({
      objectives: [
        { trigger: { locationSlotId: "fort", event: "capture_location" } },
        { completed: true, trigger: { locationId: "done" } },
      ],
    }),
    scenarioLocationBindings: [{ locationSlotId: "fort", locationId: "a" }],
  };
  assert.equal(locationQuestMarker(game, "a"), "combat");
  assert.equal(locationQuestMarker(game, "mine"), null);
  assert.equal(locationQuestMarker(game, "done"), null);
});
test("les actions d'une instance active donnent un point de quête", () => {
  const game = {
    getQuestEngineView: () => ({
      enabled: true,
      instances: [
        {
          status: "active",
          actions: [{ locationId: "village", type: "dialogue" }],
        },
        { status: "completed", actions: [{ locationId: "old" }] },
      ],
    }),
  };
  assert.equal(locationQuestMarker(game, "village"), "objective");
  assert.equal(locationQuestMarker(game, "old"), null);
});
