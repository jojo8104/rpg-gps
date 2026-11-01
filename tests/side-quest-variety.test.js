import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Game } from "../app/js/core/game.js";
import { Unit } from "../app/js/core/unit.js";
import { sideQuestTemplates } from "../app/js/core/side-quest-catalog.js";
import { SIDE_QUEST_RENEWAL_MS } from "../app/js/core/side-quest-service.js";

const definitions = JSON.parse(
  readFileSync(new URL("../data/units.json", import.meta.url)),
);
const option = (action, quest, unitId) =>
  `side:${encodeURIComponent(JSON.stringify([action, quest.id, unitId]))}`;
function fixture() {
  let now = 1000;
  const game = new Game({
    now: () => now,
    idGenerator: () => "h",
    unitDefinitions: definitions,
    setup: {
      id: "s",
      name: "Test",
      mode: "quick",
      scenarioId: "chaos",
      playerCount: 1,
      participants: [{ playerId: "p", name: "P" }],
      playArea: {
        id: "a",
        name: "Parc",
        polygon: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 1 },
          { latitude: 1, longitude: 0 },
        ],
      },
    },
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    locations: [
      {
        id: "v",
        name: "Village",
        type: "village",
        source: "test",
        position: { latitude: 0, longitude: 0 },
        population: 10,
        defenseSlots: 2,
        features: { garrison: true },
        infrastructure: { tavern: 1 },
      },
    ],
  });
  const hero = game.chooseHero("p", { name: "H", classId: "warrior" });
  const location = game.getLocation("v");
  location.heroIds.push(hero.id);
  const args = { playerId: "p", heroId: "h", locationId: "v", source: "chief" };
  const select = (action, quest, unitId) =>
    game.selectLocationChiefOption({
      ...args,
      optionId: option(action, quest, unitId),
    });
  function find(templateId) {
    for (let cycle = 0; cycle < 100; cycle++) {
      now = 1000 + cycle * SIDE_QUEST_RENEWAL_MS;
      const quest = game.sideQuestService.board(
        hero,
        location,
        "chief",
        game.locations,
      );
      if (quest.templateId === templateId) return quest;
    }
    throw new Error(`Mission absente : ${templateId}`);
  }
  return { game, hero, location, args, select, find };
}

test("les demandes simples, combinées, PNJ et garnisons sont proposées avec un barème lié au coût", () => {
  const templates = sideQuestTemplates({
    unitDefinitions: definitions,
    canGarrison: true,
  });
  assert.ok(templates.some((entry) => entry.type === "npc"));
  assert.ok(
    templates.some((entry) => Object.keys(entry.requirements ?? {}).length > 1),
  );
  const wood = templates.find((entry) => entry.templateId === "supplies-0");
  const mixed = templates.find((entry) => entry.templateId === "supplies-5");
  assert.ok(mixed.reward > wood.reward);
  assert.ok(mixed.experienceReward > wood.experienceReward);
  const militia = templates.find(
    (entry) => entry.templateId === "garrison-militia",
  );
  const archers = templates.find(
    (entry) => entry.templateId === "garrison-archer",
  );
  assert.ok(archers.experienceReward > militia.experienceReward);
  assert.equal(militia.reward, 0);
  assert.ok(!sideQuestTemplates().some((entry) => entry.type === "garrison"));
});

test("un lot incomplet ou un stockage plein ne prélève rien ; le lot complet rapporte une seule fois", () => {
  const f = fixture();
  const quest = f.find("supplies-5");
  f.select("accept", quest);
  f.hero.resources.wood = 10;
  const before = JSON.stringify([f.hero, f.location]);
  assert.match(f.select("complete", quest).lines[0], /lot complet/);
  assert.equal(JSON.stringify([f.hero, f.location]), before);
  f.hero.resources.stone = 5;
  f.location.resources.stock.gold = 500;
  const full = JSON.stringify([f.hero, f.location]);
  assert.match(f.select("complete", quest).lines[0], /manque de place/);
  assert.equal(JSON.stringify([f.hero, f.location]), full);
  f.location.resources.stock.gold = 0;
  assert.equal(f.select("complete", quest).success, true);
  assert.equal(f.hero.resources.wood, 0);
  assert.equal(f.hero.resources.stone, 0);
  assert.equal(f.location.resources.stock.wood, 10);
  assert.equal(f.location.resources.stock.stone, 5);
  assert.equal(f.hero.resources.gold, quest.reward);
  assert.equal(f.hero.experience, quest.experienceReward);
  assert.equal(f.select("complete", quest).success, false);
});

test("un PNJ transporté est installé et son bonus de production appliqué sans récompense en or", () => {
  const f = fixture();
  const quest = f.find("npc-master_farmer");
  f.select("accept", quest);
  assert.match(f.select("complete", quest).lines[0], /lot complet/);
  assert.equal(f.hero.experience, 0);
  f.hero.addResource("specialist_farmer", 1);
  assert.equal(f.select("complete", quest).success, true);
  assert.equal(f.hero.getResourceAmount("specialist_farmer"), 0);
  assert.equal(f.location.resources.stock.specialist_farmer, 1);
  assert.equal(f.location.resources.production.food, 1);
  assert.equal(f.hero.resources.gold ?? 0, 0);
  assert.equal(f.hero.experience, quest.experienceReward);
  const restored = Game.fromJSON(f.game.toJSON());
  assert.equal(
    restored.getHero("h").sideQuests[0].experienceReward,
    quest.experienceReward,
  );
  assert.equal(restored.getLocation("v").resources.stock.specialist_farmer, 1);
});

test("garnison : choix explicite, unité complète, place, permissions et transfert réel", () => {
  const f = fixture();
  const quest = f.find("garrison-militia");
  f.select("accept", quest);
  const unit = new Unit({
    id: "u",
    ownerPlayerId: "p",
    typeId: "militia",
    quantity: 6,
  });
  f.hero.army.addUnit(unit);
  unit.soldierHealth[0] = 1;
  assert.equal(f.select("complete", quest).options, undefined);
  assert.equal(
    f.select("complete", quest, "u").lines[0].startsWith("Dépôt impossible"),
    true,
  );
  unit.soldierHealth[0] = unit.healthPerSoldier;
  const choices = f.select("complete", quest);
  assert.equal(choices.options.length, 1);
  assert.equal(f.hero.army.hasUnit("u"), true);
  f.location.defenseSlots = 0;
  f.select("complete", quest, "u");
  assert.equal(f.hero.army.hasUnit("u"), true);
  assert.equal(f.hero.experience, 0);
  f.location.defenseSlots = 2;
  f.location.controllerId = "kingdom";
  f.select("complete", quest, "u");
  assert.equal(f.hero.army.hasUnit("u"), true);
  f.location.controllerId = null;
  assert.equal(f.select("complete", quest, "u").success, true);
  assert.equal(f.hero.army.hasUnit("u"), false);
  assert.equal(f.location.garrison.getUnit("u"), unit);
  assert.equal(f.hero.experience, quest.experienceReward);
  assert.equal(f.hero.resources.gold ?? 0, 0);
  assert.equal(f.select("complete", quest, "u").success, false);
  const restored = Game.fromJSON(f.game.toJSON());
  assert.equal(
    restored.getLocation("v").garrison.getUnit("u").garrisonQuestRewarded,
    true,
  );
  f.game.withdrawGarrisonUnit({ ...f.args, unitId: "u" });
  const nextQuest = { ...quest, id: `${quest.id}-next`, status: "active" };
  f.hero.sideQuests = [nextQuest];
  f.select("complete", nextQuest, "u");
  assert.equal(f.hero.army.hasUnit("u"), true);
  assert.equal(f.hero.experience, quest.experienceReward);
});
