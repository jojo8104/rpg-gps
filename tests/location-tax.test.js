import assert from "node:assert/strict";
import test from "node:test";
import { Location } from "../app/js/core/location.js";
import { Game } from "../app/js/core/game.js";
import { locationTaxState, accrueLocationTaxes } from "../app/js/core/location-tax-service.js";

const makeLocation = (options = {}) => new Location({ id: "v", name: "Village", type: "village", source: "test", position: { latitude: 0, longitude: 0 }, population: 10, ownerId: "p", ...options });

test("les impôts commencent au village et cessent dans un lieu inactif ou vide", () => {
  for (const type of ["camp", "fort", "mine"]) assert.equal(accrueLocationTaxes(makeLocation({ type }), 10), 0);
  for (const type of ["village", "town", "capital"]) assert.equal(accrueLocationTaxes(makeLocation({ type }), 10), 1);
  assert.equal(accrueLocationTaxes(makeLocation({ state: "destroyed" }), 10), 0);
  assert.equal(accrueLocationTaxes(makeLocation({ population: 0 }), 10), 0);
});

test("la population et les niveaux économiques déterminent le plafond et le rendement", () => {
  assert.equal(locationTaxState(makeLocation()).perCycle, 0.1);
  assert.equal(locationTaxState(makeLocation({ population: 20 })).perCycle, 0.2);
  assert.equal(locationTaxState(makeLocation({ level: 3, infrastructure: { trading_post: 2, farm: 2, houses: 2 } })).perCycle, 0.18);
});

test("les fractions sont conservées et les améliorations ne modifient pas le revenu passé", () => {
  const location = makeLocation({ population: 1 });
  for (let i = 0; i < 99; i++) accrueLocationTaxes(location);
  assert.equal(locationTaxState(location).available, 0);
  const restored = new Location(location.toJSON());
  accrueLocationTaxes(restored);
  assert.equal(restored.taxes.accrued, 1);
  restored.infrastructure.farm = 2;
  accrueLocationTaxes(restored);
  assert.equal(restored.taxes.accrued, 1.05);
});

function fixture(rules = {}) {
  const game = new Game({
    setup: { id: "s", name: "Test", mode: "quick", scenarioId: "s", playerCount: 1,
      playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] },
      participants: [{ playerId: "p", name: "Joueur" }], rules },
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [], startingResources: {}, startingUnits: [] }],
    locations: [makeLocation({ population: 11 }).toJSON()],
  });
  const hero = game.chooseHero("p", { name: "Héros", classId: "warrior" });
  const location = game.getLocation("v");
  location.addHero(hero.id);
  return { game, hero, location, input: { playerId: "p", heroId: hero.id, locationId: "v" } };
}

test("un cycle accumule des impôts sauvegardés ; la collecte conserve les fractions et ne se répète pas", () => {
  const { game, hero, location, input } = fixture();
  assert.equal(game.advanceCycle(10).locations[0].taxes, 1.1);
  assert.equal(Game.fromJSON(game.toJSON()).getLocation("v").taxes.accrued, 1.1);
  const before = hero.getResourceAmount("gold");
  assert.deepEqual(game.collectLocationTaxes(input), { success: true, collected: { gold: 1 } });
  assert.equal(hero.getResourceAmount("gold"), before + 1);
  assert.equal(location.taxes.accrued, 0.1);
  assert.equal(game.collectLocationTaxes(input).reason, "empty_taxes");
});

test("le plafond arrête la production, puis la collecte la relance", () => {
  const { game, location, input } = fixture();
  assert.equal(accrueLocationTaxes(location, 10000), 11);
  assert.equal(accrueLocationTaxes(location, 10000), 0);
  assert.equal(game.collectLocationTaxes(input).collected.gold, 11);
  assert.equal(accrueLocationTaxes(location), 0.11);
});

test("seuls les bâtiments économiques comptent à raison de deux ors par niveau", () => {
  const location = makeLocation({ level: 5, infrastructure: { farm: 3, trading_post: 2, hunting_lodge: 1, brewery: 2, houses: 3, barracks: 2 } });
  assert.equal(locationTaxState(location).capacity, 26);
  assert.equal(locationTaxState(location).perCycle, 0.26);
});

test("les anciennes réserves et les plafonds réduits respectent la limite", () => {
  const { game, location, input } = fixture();
  location.taxes.accrued = 1000;
  assert.equal(game.collectLocationTaxes(input).collected.gold, 11);
  assert.equal(location.taxes.accrued, 0);
  accrueLocationTaxes(location, 100);
  location.population = 5;
  assert.equal(accrueLocationTaxes(location), 0);
  assert.equal(location.taxes.accrued, 5);
});

test("la collecte exige le contrôle du lieu et la présence du héros", () => {
  const { game, hero, location, input } = fixture();
  accrueLocationTaxes(location, 10);
  location.removeHero(hero.id);
  assert.equal(game.collectLocationTaxes(input).reason, "hero_not_at_location");
  location.addHero(hero.id);
  location.controllerId = "enemy";
  assert.equal(game.collectLocationTaxes(input).reason, "location_access_denied");
  assert.equal(location.taxes.accrued, 1.1);
});

test("la collecte diminue le moral uniquement en mode expert", () => {
  for (const locationMode of ["casual", "expert"]) {
    const { game, location, input } = fixture({ locationMode });
    location.contentment = 50;
    accrueLocationTaxes(location, 100);
    const result = game.collectLocationTaxes(input);
    assert.equal(result.success, true);
    assert.equal(location.contentment, locationMode === "expert" ? 48 : 50);
    assert.equal(result.contentmentDelta ?? 0, locationMode === "expert" ? -2 : 0);
    assert.equal(game.collectLocationTaxes(input).reason, "empty_taxes");
    assert.equal(location.contentment, locationMode === "expert" ? 48 : 50);
  }
});

test("le moral expert est initialisé, borné à zéro et la pénalité plafonnée à cinq", () => {
  const { game, location, input } = fixture({ locationMode: "expert" });
  location.population = 100;
  accrueLocationTaxes(location, 100);
  assert.equal(game.collectLocationTaxes(input).contentment, 45);
  location.contentment = 2;
  accrueLocationTaxes(location, 100);
  const result = game.collectLocationTaxes(input);
  assert.equal(result.contentment, 0);
  assert.equal(result.contentmentDelta, -2);
});

test("une collecte refusée ne modifie pas le moral expert", () => {
  const { game, location, input, hero } = fixture({ locationMode: "expert" });
  location.contentment = 50;
  accrueLocationTaxes(location, 100);
  location.removeHero(hero.id);
  assert.equal(game.collectLocationTaxes(input).success, false);
  assert.equal(location.contentment, 50);
});
