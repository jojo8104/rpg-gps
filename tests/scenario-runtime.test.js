import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { ScenarioRuntimeBuilder } from "../app/js/core/scenario-runtime-builder.js";
import { ScenarioEffectResolver } from "../app/js/core/scenario-effect-resolver.js";

const setup = {
  id: "setup-1", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 1,
  playArea: { id: "area-1", name: "Parc", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] },
  participants: [{ playerId: "player-1", name: "Ariane" }],
};
const scenario = {
  id: "chaos", name: "Chaos", intro: "Fuyez.", initialPhaseId: "escape",
  locationSlots: [{ id: "refuge", type: "fort" }],
  phases: [{ id: "escape", title: "Fuite", description: "Atteignez le fort.", objectives: [], eventIds: ["refuge-reached"], transitions: [] }],
  events: [{ id: "refuge-reached", effects: [{ type: "showNarration", text: "Le refuge est atteint." }, { type: "revealLocation", locationSlotId: "refuge" }, { type: "setLocationState", locationSlotId: "refuge", state: "secured" }] }],
};
const locations = [{ id: "fort-1", name: "Fort", type: "fort", source: "scenario", position: { latitude: 0, longitude: 0 }, visibility: "hidden" }];

test("un événement de scénario agit sur le lieu réellement associé", () => {
  const game = new Game({ setup, scenario, locations, scenarioLocationBindings: [{ locationSlotId: "refuge", locationId: "fort-1" }] });
  const result = game.triggerScenarioEvent("refuge-reached");
  assert.equal(result.appliedEffects.length, 3);
  assert.equal(game.getLocation("fort-1").visibility, "discovered");
  assert.equal(game.getPlayer("player-1").knowsLocation("fort-1"), true);
  assert.equal(game.getLocation("fort-1").state, "secured");
  assert.deepEqual(game.eventLog[0], { type: "narration", text: "Le refuge est atteint.", eventId: "refuge-reached" });
});

test("les indices à distance ne s'activent que pendant leur phase", () => {
  const builder = new ScenarioRuntimeBuilder();
  const runtime = builder.build({
    scenario: {
      locationSlots: [
        { id: "trace-1", defaultPlacement: { strategy: "distance", activationPhaseId: "first", minimumDistanceMeters: 100 } },
        { id: "trace-2", defaultPlacement: { strategy: "distance", activationPhaseId: "second", minimumDistanceMeters: 100 } },
      ],
    },
    setup: { locationSetup: { placements: {} } },
    bindings: [
      { locationSlotId: "trace-1", locationId: "trace-real-1" },
      { locationSlotId: "trace-2", locationId: "trace-real-2" },
    ],
    locations: [
      { id: "trace-real-1", position: { latitude: 0, longitude: 0 } },
      { id: "trace-real-2", position: { latitude: 0, longitude: 0 } },
    ],
  });

  assert.deepEqual(builder.start(runtime, { latitude: 0, longitude: 0 }, "first"), ["trace-1"]);
  assert.equal(runtime.placements["trace-1"].status, "walking");
  assert.equal(runtime.placements["trace-2"].status, "waiting");
  assert.deepEqual(builder.start(runtime, { latitude: 0, longitude: 0.001 }, "second"), ["trace-2"]);
  assert.deepEqual(runtime.placements["trace-2"].origin, { latitude: 0, longitude: 0.001 });
});

test("une récompense de quête attribue réellement XP, personnage et rapport", () => {
  const hero = { id: "hero-1", carriedLoot: [], addCarriedLoot(entries) { this.carriedLoot.push(...entries); }, addResource() {} };
  const game = { activeScenarioEventId: "geologist-rescued", eventLog: [], getPlayer: () => ({ heroIds: [hero.id] }), getHero: () => hero, gainHeroExperience: ({ amount }) => { hero.experience = (hero.experience ?? 0) + amount; } };
  const effects = new ScenarioEffectResolver().apply({ effects: [{ type: "grantCarriedItem", itemId: "royal_geologist" }, { type: "grantCarriedItem", itemId: "abandoned_mine_report" }, { type: "awardHeroExperience", amount: 100 }] }, game);
  assert.deepEqual(hero.carriedLoot.map((entry) => entry.itemId), ["royal_geologist", "abandoned_mine_report"]);
  assert.equal(hero.experience, 100);
  assert.deepEqual(effects.map((effect) => effect.type), ["quest_item_granted", "quest_item_granted", "hero_experience_awarded"]);
});
