import assert from "node:assert/strict";
import test from "node:test";
import { DeadlineService } from "../app/js/core/deadline-service.js";
import { Hero } from "../app/js/core/hero.js";
import { InventoryService } from "../app/js/core/inventory-service.js";
import { Location } from "../app/js/core/location.js";
import { LocationDismantlingService } from "../app/js/core/location-dismantling-service.js";
import { ResultEvaluationService } from "../app/js/core/result-evaluation-service.js";
import { readFileSync } from "node:fs";
import { Scenario } from "../app/js/core/scenario.js";
import { QuestDeadlineService } from "../app/js/core/quest-deadline-service.js";
import { Game } from "../app/js/core/game.js";
import { ScenarioEffectResolver } from "../app/js/core/scenario-effect-resolver.js";

test("les chariots ajoutent uniquement des slots sérialisables au héros", () => {
  const hero = new Hero({ id: "h", playerId: "p", name: "Officier", commandRank: "captain", wagons: [{ id: "w1", name: "Chariot royal", slotBonus: 4 }] });
  assert.equal(hero.bagSlotCount, hero.baseBagSlotCount + 4);
  assert.equal(new InventoryService().getHeroBagState(hero).slotCapacity, hero.bagSlotCount);
  assert.deepEqual(new Hero(hero.toJSON()).wagons, hero.wagons);
});

test("une échéance absolue continue même sans mises à jour intermédiaires", () => {
  const service = new DeadlineService(); const deadline = service.create({ id: "evacuation", durationMs: 60_000, startedAt: 1_000 });
  assert.equal(service.evaluate(deadline, 30_000).expired, false); assert.equal(service.evaluate(deadline, 61_000).expired, true);
});

test("le démantèlement retire le bâtiment après le délai et dépose les matériaux dans le lieu", () => {
  const location = new Location({ id: "camp", name: "Camp", type: "camp", source: "test", position: { latitude: 0, longitude: 0 }, population: 8, infrastructure: { palisade: 1 }, resources: { stock: {}, infrastructureStorage: 4 } });
  const service = new LocationDismantlingService({ durationMs: 1_000 }); const started = service.start(location, "palisade", 0);
  assert.equal(started.success, true); assert.equal(service.completeReady(location, 999).length, 0);
  const [result] = service.completeReady(location, 1_000); assert.equal(location.infrastructure.palisade, undefined); assert.deepEqual(result.recovered, { wood: 5, stone: 2 });
});

test("l'évaluation générique produit un score pondéré lisible par le scénario", () => {
  const result = new ResultEvaluationService().evaluate({ metrics: [{ id: "population", value: 10, target: 10, weight: 2 }, { id: "resources", value: 5, target: 10, weight: 1 }] });
  assert.equal(result.score, 83); assert.equal(result.grade, "silver");
});

test("la deuxième quête du prologue déclare toute la chaîne d'évacuation", () => {
  const definition = JSON.parse(readFileSync(new URL("../data/scenarios/chaos.json", import.meta.url), "utf8")); const scenario = new Scenario(definition);
  assert.deepEqual(["reach-evacuation-camp", "defend-evacuation-camp", "prepare-evacuation", "return-evacuees-to-capital"].map((id) => scenario.getPhase(id)?.id), ["reach-evacuation-camp", "defend-evacuation-camp", "prepare-evacuation", "return-evacuees-to-capital"]);
  const briefing = scenario.getPhase("prologue-complete").objectives[0].trigger;
  assert.ok(briefing.responseLines.length >= 4);
  assert.match(briefing.responseLines.join(" "), /invasion.*rejoindre.*évacuation/i);
  assert.match(scenario.getPhase("reach-evacuation-camp").objectives[0].text, /signalé sur la carte/i);
  const order = scenario.getEvent("evacuation-ordered"); const attackGroups = order.effects.filter((effect) => effect.type === "spawnAttackGroup");
  assert.ok(order.effects.some((effect) => effect.type === "assignWagons")); assert.ok(order.effects.some((effect) => effect.type === "revealLocation" && effect.locationSlotId === "evacuation-camp")); assert.equal(order.effects.find((effect) => effect.type === "startEvacuation")?.timing.maximumMinutes, 3);
  assert.equal(attackGroups.filter((effect) => effect.stationary).length, 5); assert.deepEqual(attackGroups.filter((effect) => !effect.stationary).map((effect) => effect.quantity), [4, 10]);
  assert.equal(scenario.getEvent("evacuation-camp-located").effects.filter((effect) => effect.type === "spawnAttackGroup").length, 0);
  assert.ok(scenario.getEvent("mine-report-delivered").effects.some((effect) => effect.type === "depositCarriedItem" && effect.itemId === "royal_geologist" && effect.destinationLocationSlotId === "capital"));
  assert.equal(scenario.getPhase("return-to-capital").transitions.length, 0);
  const secondQuestOffer = scenario.getEvent("mine-report-delivered").effects.find((effect) => effect.type === "offerQuest");
  assert.equal(secondQuestOffer?.startPhaseId, "prologue-complete");
  assert.ok(secondQuestOffer?.briefingLines.length >= 4);
});

test("le délai sportif est plus court que le délai calme et reste d'au moins une minute", () => {
  const service = new QuestDeadlineService(); const input = { origin: { latitude: 48.85, longitude: 2.35 }, destination: { latitude: 48.855, longitude: 2.35 }, baseMinutes: 1, minimumMinutes: 1 };
  const calm = service.calculateMinutes({ ...input, paceMode: "calm" }); const sport = service.calculateMinutes({ ...input, paceMode: "sport" });
  assert.ok(calm.minutes > sport.minutes); assert.ok(sport.minutes >= 1);
});

test("le délai d'évacuation reste jouable lorsque les coordonnées sont très éloignées", () => {
  const result = new QuestDeadlineService().calculateMinutes({ origin: { latitude: 50, longitude: 30 }, destination: { latitude: 48.86, longitude: 2.36 } });
  assert.ok(result.distanceMeters > 1_000_000);
  assert.equal(result.minutes, 30);
});

test("l'ordre royal déploie réellement le cordon et les deux colonnes en simulation", () => {
  const definition = JSON.parse(readFileSync(new URL("../data/scenarios/chaos.json", import.meta.url), "utf8"));
  const locations = JSON.parse(readFileSync(new URL("../data/locations.json", import.meta.url), "utf8"));
  const heroClasses = JSON.parse(readFileSync(new URL("../data/hero-classes.json", import.meta.url), "utf8"));
  const unitDefinitions = JSON.parse(readFileSync(new URL("../data/units.json", import.meta.url), "utf8"));
  const bindings = [{ locationSlotId: "refuge", locationId: "fort-nord" }, { locationSlotId: "capital", locationId: "royal-capital" }, { locationSlotId: "royal-camp", locationId: "village-vert" }, { locationSlotId: "prospectors-battlefield", locationId: "prospector-battlefield" }, { locationSlotId: "gold-mine", locationId: "gold-mine" }, { locationSlotId: "bandit-camp", locationId: "bandit-camp" }, { locationSlotId: "evacuation-camp", locationId: "evacuation-camp" }];
  const game = new Game({ setup: { id: "evacuation-sim", name: "Simulation", mode: "quick", scenarioId: "chaos", playerCount: 1, playArea: { id: "sim", name: "Maison", polygon: [{ latitude: -89, longitude: -179 }, { latitude: -89, longitude: 179 }, { latitude: 89, longitude: 179 }, { latitude: 89, longitude: -179 }] }, participants: [{ playerId: "local", name: "Joueur" }] }, scenario: definition, locations, heroClasses, unitDefinitions, scenarioLocationBindings: bindings, coordinateMode: "simulation", now: () => 1_000 });
  game.chooseHero("local", { name: "Officier", classId: "warrior" }); game.updateLocationPosition({ locationId: "royal-capital", position: { latitude: 50, longitude: 30 } }); game.updateLocationPosition({ locationId: "evacuation-camp", position: { latitude: 68, longitude: 42 } });
  game.activeScenarioEventId = "evacuation-ordered"; new ScenarioEffectResolver().apply(game.scenario.getEvent("evacuation-ordered"), game); game.activeScenarioEventId = null;
  assert.equal(game.evacuationStates["royal-camp-evacuation"].expiresAt, 181_000);
  assert.equal(game.autonomousGroups.filter((group) => group.mission.kind === "guard").length, 5);
  assert.deepEqual(game.autonomousGroups.filter((group) => group.mission.kind === "attack_location").map((group) => group.army.units[0].quantity), [4, 10]);
});

test("la capitale et les camps du prologue restent la propriété du royaume", () => {
  const locations = JSON.parse(readFileSync(new URL("../data/locations.json", import.meta.url), "utf8"));
  for (const id of ["royal-capital", "village-vert", "evacuation-camp"]) {
    const location = locations.find((entry) => entry.id === id);
    assert.equal(location?.ownerId, "kingdom");
    assert.notEqual(location?.features?.capturable, true);
  }
  assert.equal(locations.find((entry) => entry.id === "camp-local")?.ownerId, "local");
});
