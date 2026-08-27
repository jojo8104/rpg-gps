import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Game } from "../app/js/core/game.js";
import { Hero } from "../app/js/core/hero.js";
import { Scenario } from "../app/js/core/scenario.js";
import { distanceMeters } from "../app/js/core/geo.js";

const playArea = { id: "area", name: "Zone", polygon: [
  { latitude: 48.85, longitude: 2.34 },
  { latitude: 48.85, longitude: 2.37 },
  { latitude: 48.87, longitude: 2.37 },
  { latitude: 48.87, longitude: 2.34 },
] };

test("le fortin est placé depuis la capitale selon le rayon de la PlayArea", () => {
  const scenario = { id: "placement", name: "Placement", intro: "Test", initialPhaseId: "phase", locationSlots: [{ id: "capital", type: "capital", defaultPlacement: { strategy: "fixed" } }, { id: "fort", type: "fort", defaultPlacement: { strategy: "area-relative", originLocationSlotId: "capital", areaRadiusRatio: 0.25, minimumDistanceMeters: 200, maximumDistanceMeters: 1500 } }], phases: [{ id: "phase", title: "Test", description: "Test", objectives: [], transitions: [] }] };
  const setup = { id: "setup", name: "Test", mode: "quick", scenarioId: "placement", playerCount: 1, playArea, participants: [{ playerId: "local", name: "Joueur" }] };
  const locations = [{ id: "capital-real", name: "Capitale", type: "capital", source: "test", position: { latitude: 48.86, longitude: 2.355 } }, { id: "fort-real", name: "Fort", type: "fort", source: "test", position: { latitude: 48.861, longitude: 2.356 } }];
  const game = new Game({ setup, scenario, locations, scenarioLocationBindings: [{ locationSlotId: "capital", locationId: "capital-real" }, { locationSlotId: "fort", locationId: "fort-real" }] });
  const placement = game.scenarioRuntime.placements.fort;
  assert.equal(placement.strategy, "area-relative");
  assert.ok(placement.preferredDistanceMeters >= 200 && placement.preferredDistanceMeters <= 1500);
  assert.ok(game.setup.playArea.contains(game.getLocation("fort-real").position));
  assert.ok(distanceMeters(game.getLocation("capital-real").position, game.getLocation("fort-real").position) > 0);
});

test("la définition de Rochegarde reste royale et prépare un futur verrou militaire", () => {
  const locations = JSON.parse(readFileSync(new URL("../data/locations.json", import.meta.url), "utf8"));
  const fort = locations.find((location) => location.id === "supply-fort");
  assert.equal(fort.ownerId, "kingdom");
  assert.equal(fort.controllerId, "kingdom");
  assert.equal(fort.features.capturable, true);
  assert.equal(fort.chief.isHero, true);
  assert.match(fort.chief.name, /Géraud/);
  assert.deepEqual(fort.garrison.units.map(({ typeId, rank }) => [typeId, rank]), [["militia", "warrant-officer"], ["militia", "soldier"], ["archer", "soldier"]]);
});

test("la quatrième quête exige et transfère réellement vingt rations", () => {
  const definition = JSON.parse(readFileSync(new URL("../data/scenarios/chaos.json", import.meta.url), "utf8"));
  const scenario = new Scenario(definition);
  const delivery = scenario.getPhase("deliver-fort-rations").objectives[0];
  assert.equal(delivery.trigger.type, "resourceDelivery");
  assert.equal(delivery.trigger.amount, 20);
  assert.ok(scenario.getEvent("fort-rations-delivered").effects.some((effect) => effect.type === "depositHeroResource" && effect.destinationLocationSlotId === "supply-fort"));
  assert.equal(scenario.getEvent("fort-supply-ordered").effects.some((effect) => effect.type === "grantHeroResource"), false);
  assert.equal(scenario.getPhase("collect-village-rations").objectives.length, 4);
  assert.doesNotMatch(scenario.getEvent("fort-rations-delivered").effects.find((effect) => effect.type === "showNarration").text, /futur|chaos|continuera|capitale/i);
});

test("les quatre villages fournisseurs sont royaux, producteurs et placés dans les 25 %", () => {
  const locations = JSON.parse(readFileSync(new URL("../data/locations.json", import.meta.url), "utf8"));
  const definition = JSON.parse(readFileSync(new URL("../data/scenarios/chaos.json", import.meta.url), "utf8"));
  for (const direction of ["north", "east", "south", "west"]) {
    const id = `supply-village-${direction}`; const village = locations.find((location) => location.id === id); const slot = definition.locationSlots.find((entry) => entry.id === id);
    assert.equal(village.ownerId, "kingdom"); assert.ok(village.resources.production.food > 0); assert.ok(["field", "farm", "hunting_lodge"].some((improvement) => village.infrastructure[improvement] > 0)); assert.ok(slot.defaultPlacement.areaRadiusRatio <= 0.25);
  }
});

test("le moteur refuse une livraison insuffisante puis dépose exactement les rations transportées", () => {
  const scenario = { id: "delivery", name: "Livraison", intro: "Test", initialPhaseId: "deliver", locationSlots: [{ id: "fort", type: "fort", defaultPlacement: { strategy: "fixed" } }], phases: [{ id: "deliver", title: "Livrer", description: "Livrer", objectives: [{ id: "deliver", text: "Livrer", trigger: { type: "resourceDelivery", interactionId: "deliver", locationSlotId: "fort", resource: "food", amount: 20 }, eventId: "delivered" }], eventIds: ["delivered"], transitions: [] }], events: [{ id: "delivered", effects: [{ type: "depositHeroResource", playerId: "local", destinationLocationSlotId: "fort", resource: "food", amount: 20 }] }] };
  const setup = { id: "setup", name: "Test", mode: "quick", scenarioId: "delivery", playerCount: 1, playArea, participants: [{ playerId: "local", name: "Joueur" }] };
  const game = new Game({ setup, scenario, locations: [{ id: "fort-real", name: "Fort", type: "fort", source: "test", position: { latitude: 48.86, longitude: 2.355 }, population: 20, resources: { stock: {} } }], scenarioLocationBindings: [{ locationSlotId: "fort", locationId: "fort-real" }] });
  const hero = new Hero({ id: "hero", playerId: "local", name: "Officier", classId: "warrior" }); game.heroes.push(hero); game.getPlayer("local").addHero(hero.id);
  const event = { type: "InteractionCompleted", interactionId: "deliver", locationId: "fort-real" };
  hero.addResource("food", 19); assert.equal(game.dispatchQuestEvent(event), null);
  hero.addResource("food", 1); assert.equal(game.dispatchQuestEvent(event).completedObjectiveIds[0], "deliver");
  assert.equal(hero.getResourceAmount("food"), 0); assert.equal(game.getLocation("fort-real").resources.stock.food, 20);
});
