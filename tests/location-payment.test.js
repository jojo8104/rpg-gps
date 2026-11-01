import assert from "node:assert/strict";
import test from "node:test";
import { planLocationPayment } from "../app/js/core/location-payment.js";
import { CampImprovementService } from "../app/js/core/camp-improvement-service.js";
import { LocationProgressionService } from "../app/js/core/location-progression-service.js";
import { Location } from "../app/js/core/location.js";
import { Game } from "../app/js/core/game.js";
import { improvementCard } from "../app/js/ui/world-view.js";

function fixture() {
  const progression = new LocationProgressionService({ mode: "expert" });
  const service = new CampImprovementService({ progressionService: progression });
  const location = new Location({ id: "camp", name: "Camp", type: "camp", source: "generated", ownerId: "p1", population: 8, position: { latitude: 0, longitude: 0 }, resources: { stock: { wood: 3 } }, qr: { enabled: false } });
  const hero = { id: "h1", playerId: "p1", resources: { wood: 4 }, carriedLoot: [{ id: "wood-stack", itemId: "wood", quantity: 5 }] };
  return { location, hero, service, progression };
}

test("construction : priorité au lieu, complément dans les ressources et le butin", () => {
  const { location, hero, service } = fixture();
  const payment = service.getState(location, hero).improvements.find(e => e.id === "depot").payment;
  assert.equal(payment.fromLocation.wood, 3);
  assert.equal(payment.fromBag.wood, 7);
  assert.equal(service.build(location, "depot", hero).success, true);
  assert.equal(location.resources.stock.wood, 0);
  assert.equal(hero.resources.wood, 0);
  assert.equal(hero.carriedLoot[0].quantity, 2);
});

test("stock suffisant : le bagage reste intact", () => {
  const { location, hero, service } = fixture();
  location.resources.stock.wood = 20;
  const before = structuredClone(hero);
  assert.equal(service.build(location, "depot", hero).success, true);
  assert.deepEqual(hero, before);
  assert.equal(location.resources.stock.wood, 10);
});

test("ressources insuffisantes : aucune perte, même avec plusieurs ressources", () => {
  const { location, hero, service } = fixture();
  const before = JSON.stringify({ location, hero });
  assert.equal(service.build(location, "trading_post", hero).reason, "insufficient_resources");
  assert.equal(JSON.stringify({ location, hero }), before);
  assert.deepEqual(planLocationPayment(location, { wood: 8, gold: 5 }, hero).missingResources,
    [{ id: "gold", required: 5, available: 0, missing: 5 }]);
});

test("niveau et évolution utilisent le même financement combiné", () => {
  const { location, hero, service } = fixture();
  location.infrastructure = { housing: 2, barricades: 2, depot: 1, trading_post: 1, healing_tent: 1 };
  location.progression.experience = 10000;
  hero.resources = { wood: 1000, stone: 1000, iron: 1000, gold: 1000 };
  assert.equal(service.getLevelUpStatus(location, hero).eligible, true);
  assert.equal(service.levelUp(location, hero).success, true);
  location.level = 3;
  location.population = 20;
  assert.equal(service.getEvolutionStatus(location, "village", hero).eligible, true);
  assert.equal(service.evolve(location, "village", hero).success, true);
  assert.equal(location.type, "village");
  assert.ok(hero.resources.wood < 1000);
});

test("Game exige présence et propriété pour le paiement et son aperçu", () => {
  const { location, hero, service } = fixture();
  let relation = "owned";
  const game = Object.create(Game.prototype);
  Object.assign(game, { getHero: id => id === hero.id ? hero : null, getLocation: () => location,
    getPlayer: () => ({ id: "p1" }), getLocationRelation: () => relation,
    locationAccessPolicy: { can: () => relation === "owned" },
    campImprovementService: service, locationProgressionService: service.progressionService,
    eventLog: [], now: () => 0 });
  const args = { playerId: "p1", heroId: hero.id, locationId: location.id, improvementId: "depot" };
  const preview = () => game.getCampDevelopment(location.id, hero.id).improvements.find(e => e.id === "depot").payment;
  assert.equal(preview().fromBag.wood, 0);
  assert.equal(game.buildCampImprovement(args).reason, "hero_not_at_location");
  location.heroIds.push(hero.id);
  relation = "neutral";
  assert.equal(preview().fromBag.wood, 0);
  assert.equal(game.buildCampImprovement(args).reason, "location_not_owned");
  relation = "owned";
  assert.equal(preview().fromBag.wood, 7);
  assert.equal(game.buildCampImprovement(args).success, true);
});

test("la carte affiche les deux sources avant de construire", () => {
  const { location, hero } = fixture();
  const payment = planLocationPayment(location, { wood: 10 }, hero);
  const html = improvementCard({ id: "build-improvement:depot", label: "Dépôt", details: {
    costs: { wood: 10 }, payment, availableResources: payment.availableResources, missingResources: payment.missingResources,
  } });
  assert.match(html, /3 du lieu \+ 7 du bagage/);
  assert.doesNotMatch(html, /disabled/);
});

