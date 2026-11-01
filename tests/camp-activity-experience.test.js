import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../app/js/core/game.js";
import { campProductionExperience } from "../app/js/core/camp-activity-experience.js";

function fixture() {
  const setup = { id: "s", name: "Test", mode: "quick", scenarioId: "s", playerCount: 1, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p", name: "P" }] };
  const game = new Game({ setup, now: () => 1234,
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    unitDefinitions: [{ id: "archer", name: "Archers", faction: "kingdom", maxQuantity: 10, stats: { attack: 4, defense: 2, speed: 3, range: 3, morale: 5 }, costs: { gold: 1 }, abilities: [], tags: [] }],
    locations: [{ id: "camp", name: "Camp", type: "camp", level: 2, source: "test", ownerId: "p", population: 12, position: { latitude: 0, longitude: 0 }, infrastructure: { trading_post: 1, healing_tent: 1, hunting_lodge: 1 }, resources: { stock: { gold: 20, wood: 20 }, production: { wood: 4 } }, recruitment: { availableUnitTypeIds: ["archer"], stock: { archer: 6 }, capacity: 20 }, features: { trade: true, healing: true, recruitment: true, resourceProduction: true } }],
  });
  const hero = game.chooseHero("p", { name: "H", classId: "warrior" });
  game.status = "started";
  Object.assign(hero.resources, { gold: 20, food: 4 });
  const camp = game.getLocation("camp");
  camp.addHero(hero.id);
  const args = { playerId: "p", heroId: hero.id, locationId: camp.id };
  return { game, hero, camp, args };
}

test("chaque lot commercial réussi donne de l'XP au camp, jamais un refus", () => {
  const { game, hero, camp, args } = fixture();
  const before = camp.progression.experience;
  const result = game.tradeAtLocation({ ...args, itemId: "wood", direction: "buy", lots: 2 });
  assert.equal(result.success, true);
  assert.equal(camp.progression.experience - before, 10);
  hero.resources.gold = 0;
  assert.equal(game.tradeAtLocation({ ...args, itemId: "wood", direction: "buy" }).success, false);
  assert.equal(camp.progression.experience - before, 10);
  assert.equal(Game.fromJSON(game.toJSON()).getLocation(camp.id).progression.experience, camp.progression.experience);
});

test("recruter et soigner donne de l'XP uniquement lorsqu'une action a lieu", () => {
  const { game, camp, args } = fixture();
  const before = camp.progression.experience;
  const recruited = game.recruitUnit({ ...args, unitTypeId: "archer" });
  assert.equal(recruited.success, true);
  assert.equal(camp.progression.experience - before, 10);
  assert.equal(game.recruitUnit({ ...args, unitTypeId: "archer" }).success, false);
  assert.equal(game.healHeroUnits(args).success, false);
  assert.equal(camp.progression.experience - before, 10);
  recruited.unit.soldierHealth[0] = 1;
  assert.equal(game.healHeroUnits(args).success, true);
  assert.equal(camp.progression.experience - before, 20);
});

test("les productions autres que les vivres donnent aussi de l'XP, un stock plein n'en crée pas", () => {
  const { game, camp } = fixture();
  camp.resources.production = { wood: 4 };
  camp.recruitment.production = {};
  camp.features.trade = false;
  const before = camp.progression.experience;
  game.produceLocationResources(1, () => 0.5);
  assert.equal(camp.progression.experience - before, 4);
  camp.resources.productionStock.wood = 10000;
  game.produceLocationResources(1, () => 0.5);
  assert.equal(camp.progression.experience - before, 4);
  assert.equal(campProductionExperience({ wood: 500 }, {}, 1), 10);
  assert.equal(campProductionExperience({}, { archer: 3 }), 3);
});

test("les mini-quêtes du chef sont ouvertes au camp et récompensent une seule fois le lieu", () => {
  const { game, hero, camp, args } = fixture();
  game.sideQuestService.getTemplates = () => [];
  const before = camp.progression.experience;
  const conversation = game.getLocationChiefConversation(args);
  const view = conversation.options.find((option) => option.id.startsWith("side:"));
  assert.ok(view);
  const offered = game.selectLocationChiefOption({ ...args, optionId: view.id });
  assert.ok(offered.lines.some((line) => line.includes("40 XP pour le camp")));
  game.selectLocationChiefOption({ ...args, optionId: offered.options[0].id });
  assert.equal(camp.progression.experience, before);
  const quest = hero.sideQuests[0];
  const optionId = `side:${encodeURIComponent(JSON.stringify(["complete", quest.id]))}`;
  assert.equal(game.selectLocationChiefOption({ ...args, optionId }).success, true);
  assert.equal(camp.progression.experience - before, 40);
  assert.equal(game.selectLocationChiefOption({ ...args, optionId }).success, false);
  assert.equal(camp.progression.experience - before, 40);
});


test("la production débloque le niveau 3 dès que le camp atteint 255 XP", () => {
  const { game, camp } = fixture();
  camp.infrastructure.housing = 2;
  camp.infrastructure.barricades = 2;
  camp.resources.stock = { wood: 100, stone: 30, gold: 40 };
  camp.progression.experience = 245;
  camp.resources.production = { wood: 10 };
  camp.recruitment.production = {};
  assert.equal(game.getCampDevelopment(camp.id).levelUp.eligible, false);
  game.produceLocationResources(1, () => 0.5);
  assert.equal(camp.progression.experience, 255);
  assert.equal(game.getCampDevelopment(camp.id).levelUp.eligible, true);
});
