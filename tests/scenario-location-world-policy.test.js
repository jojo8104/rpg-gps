import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLocationWorld } from "../app/js/core/scenario-location-world-policy.js";
import { syncScenarioLocationAppearances } from "../app/js/core/scenario-location-appearance.js";
import { discoverNearbyLocations, playerMapVisibility } from "../app/js/core/player-map-visibility.js";
import { ScenarioLocationBinding } from "../app/js/core/scenario-location-binding.js";
import { socialGame } from "./fixtures/player-social-game.js";
import { Location } from "../app/js/core/location.js";

function fixture(world, appearance) {
  const { game, heroes } = socialGame();
  game.locations = [new Location({ id: "site", name: "Site", type: "mine", source: "scenario", position: { latitude: 0.02, longitude: 0 } })];
  game.scenario = { locationSlots: [{ id: "site-slot", world, appearance }] };
  game.scenarioLocationBindings = [new ScenarioLocationBinding({ locationSlotId: "site-slot", locationId: "site" })];
  game.scenarioRuntime = { placements: { "site-slot": { status: "placed", locationId: "site" } } };
  // La projection pure accepte un instantané minimal, sans reconstruire un scénario.
  const state = () => ({ players: game.players.map(p => p.toJSON()), heroes: game.heroes.map(h => h.toJSON()),
    heroClasses: game.heroClasses, coordinateMode: game.coordinateMode, locations: game.locations,
    scenario: game.scenario, scenarioLocationBindings: game.scenarioLocationBindings, scenarioRuntime: game.scenarioRuntime });
  return { game, heroes, visible: id => playerMapVisibility(state(), id).locations.has("site") };
}

test("un état d’apparition fourni par le monde ne court-circuite pas la quête", () => {
  const f = fixture({ role: "quest", visibility: "quest", lifetime: "ephemeral", removal: { questId: "q" } },
    { on: "ActionCompleted", questId: "q", actionId: "first" });
  const placement = f.game.scenarioRuntime.placements["site-slot"];
  placement.appearedForPlayerIds = ["a", "b"];
  placement.retiredForPlayerIds = ["a"];
  syncScenarioLocationAppearances(f.game, { instances: [] });
  assert.deepEqual(placement.appearedForPlayerIds, []);
  assert.deepEqual(placement.retiredForPlayerIds, []);
  assert.equal(f.visible("a"), false);
  const instance = { questId: "q", playerIds: ["a"], status: "active", actions: { first: { status: "available" } } };
  syncScenarioLocationAppearances(f.game, { instances: [instance] });
  assert.equal(f.visible("a"), false);
  instance.actions.first.status = "completed";
  syncScenarioLocationAppearances(f.game, { instances: [instance] });
  assert.equal(f.visible("a"), true);
  assert.equal(f.visible("b"), false);
});

test("la capitale connue est indépendante de la quête et de la proximité", () => {
  const f = fixture({ role: "starting-point", visibility: "known", lifetime: "persistent" }, { on: "QuestAccepted", questId: "q" });
  assert.equal(f.visible("a"), true);
  assert.equal(f.visible("b"), true);
});

test("un lieu durable inconnu se découvre individuellement et reste sur la carte", () => {
  const f = fixture({ role: "world", visibility: "discoverable", lifetime: "persistent" });
  discoverNearbyLocations(f.game);
  assert.equal(f.visible("a"), false);
  f.heroes[0].updatePosition(f.game.locations[0].position);
  discoverNearbyLocations(f.game);
  assert.equal(f.visible("a"), true);
  assert.equal(f.visible("b"), false);
  f.heroes[0].updatePosition({ latitude: 1, longitude: 0 });
  discoverNearbyLocations(f.game);
  assert.equal(f.visible("a"), true);
});

test("un élément de quête apparaît puis disparaît pour le joueur concerné", () => {
  const world = { role: "quest", visibility: "quest", lifetime: "ephemeral", removal: { questId: "q", actionId: "inspect" } };
  const f = fixture(world, { on: "QuestAccepted", questId: "q" });
  assert.equal(f.visible("a"), false);
  const instance = { questId: "q", playerIds: ["a"], status: "active", actions: { inspect: { status: "available" } } };
  syncScenarioLocationAppearances(f.game, { instances: [instance] });
  assert.equal(f.visible("a"), true);
  assert.equal(f.visible("b"), false);
  instance.actions.inspect.status = "completed";
  syncScenarioLocationAppearances(f.game, { instances: [instance] });
  assert.equal(f.visible("a"), false);
  // La reprise ne réactive pas un élément consommé.
  syncScenarioLocationAppearances(f.game, { instances: [instance] });
  assert.equal(f.visible("a"), false);
});

test("le contrat distingue un point de départ durable d’un élément éphémère", () => {
  assert.throws(() => normalizeLocationWorld({ role: "starting-point", visibility: "discoverable", lifetime: "persistent" }), /point de départ/);
  assert.throws(() => normalizeLocationWorld({ role: "quest", visibility: "quest", lifetime: "ephemeral" }), /quête de disparition/);
});

test("les éléments éphémères sont retirés après réussite, échec ou abandon", () => {
  for (const status of ["completed", "failed", "abandoned"]) {
    const f = fixture({ role: "quest", visibility: "quest", lifetime: "ephemeral", removal: { questId: "q" } }, { on: "QuestAccepted", questId: "q" });
    const instance = { questId: "q", playerIds: ["a"], status: "active", actions: {} };
    syncScenarioLocationAppearances(f.game, { instances: [instance] });
    assert.equal(f.visible("a"), true);
    instance.status = status;
    syncScenarioLocationAppearances(f.game, { instances: [instance] });
    assert.equal(f.visible("a"), false, status);
  }
});
