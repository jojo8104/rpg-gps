import test from "node:test";
import assert from "node:assert/strict";
import {
  SideQuestService,
  SIDE_QUEST_RENEWAL_MS,
} from "../app/js/core/side-quest-service.js";
import { Hero } from "../app/js/core/hero.js";
import { Location } from "../app/js/core/location.js";
import { Game } from "../app/js/core/game.js";

const command = (action, quest) =>
  `side:${encodeURIComponent(JSON.stringify([action, quest.id]))}`;
const village = (id, infrastructure = {}) =>
  new Location({
    id,
    name: id,
    type: "village",
    source: "test",
    position: { latitude: 0, longitude: 0 },
    population: 10,
    infrastructure,
  });
function fixture() {
  let time = 1234;
  const service = new SideQuestService({ now: () => time, getTemplates: () => [] });
  const hero = new Hero({
    id: "h",
    playerId: "p",
    name: "Héros",
    resources: { food: 4 },
  });
  const location = village("a", { tavern: 1 });
  return {
    service,
    hero,
    location,
    setTime: (value) => {
      time = value;
    },
    select: (
      action,
      quest,
      source = "chief",
      at = location,
      locations = [location],
    ) => service.select(hero, at, source, locations, command(action, quest)),
  };
}

test("vivres : acceptation explicite, transfert unique et nouvelle offre exactement après cinq minutes", () => {
  const f = fixture();
  const quest = f.service.board(f.hero, f.location, "chief", [f.location]);
  assert.equal(f.select("complete", quest).success, false);
  assert.equal(f.select("view", quest).options.length, 2);
  assert.deepEqual(f.hero.sideQuests, []);
  assert.equal(f.select("accept", quest).success, true);
  assert.equal(f.hero.experience, 0);
  assert.equal(f.select("complete", quest).success, true);
  assert.equal(f.hero.resources.food, 2);
  assert.equal(f.location.resources.stock.food, 2);
  assert.equal(f.hero.resources.gold, 5);
  assert.equal(f.select("complete", quest).success, false);
  assert.equal(f.hero.resources.gold, 5);
  assert.equal(f.hero.experience, 15);
  assert.equal(f.hero.xpHistory.length, 1);
  f.setTime(1234 + SIDE_QUEST_RENEWAL_MS - 1);
  assert.equal(
    f.service.board(f.hero, f.location, "chief", [f.location]).status,
    "completed",
  );
  f.setTime(1234 + SIDE_QUEST_RENEWAL_MS);
  assert.equal(
    f.service.board(f.hero, f.location, "chief", [f.location]).status,
    "offered",
  );
});

test("consulter et refuser une offre ne sauvegarde aucune quête", () => {
  const f = fixture();
  const quest = f.service.board(f.hero, f.location, "chief", [f.location]);
  f.select("view", quest);
  f.select("back", quest);
  assert.deepEqual(JSON.parse(JSON.stringify(f.hero)).sideQuests, []);
  assert.equal(f.select("accept", quest).success, true);
  assert.equal(f.hero.sideQuests.length, 1);
  assert.equal(f.hero.sideQuests[0].status, "active");
  assert.equal(f.select("accept", quest).success, false);
});

test("missions acceptées persistantes et indépendance du chef et de la taverne", () => {
  const f = fixture();
  const chief = f.service.board(f.hero, f.location, "chief", [f.location]);
  const tavern = f.service.board(f.hero, f.location, "tavern", [f.location]);
  f.select("accept", chief);
  f.select("accept", tavern, "tavern");
  assert.equal(f.select("complete", chief, "tavern").success, false);
  f.setTime(10 * SIDE_QUEST_RENEWAL_MS);
  const restored = new Hero(f.hero.toJSON());
  assert.equal(
    f.service.board(restored, f.location, "chief", [f.location]).id,
    chief.id,
  );
  f.select("abandon", chief);
  assert.equal(
    f.service.board(f.hero, f.location, "tavern", [f.location]).status,
    "active",
  );
  assert.equal(f.hero.resources.gold ?? 0, 0);
  assert.equal(f.hero.experience, 0);
  f.setTime(11 * SIDE_QUEST_RENEWAL_MS - 1);
  assert.equal(
    f.service.board(f.hero, f.location, "chief", [f.location]).status,
    "abandoned",
  );
  f.setTime(11 * SIDE_QUEST_RENEWAL_MS);
  assert.equal(
    f.service.board(f.hero, f.location, "chief", [f.location]).status,
    "offered",
  );
});

test("les vivres insuffisants ne changent ni le stock ni les récompenses", () => {
  const f = fixture();
  f.hero.resources.food = 1;
  const quest = f.service.board(f.hero, f.location, "chief", [f.location]);
  f.select("accept", quest);
  const before = JSON.stringify([f.hero, f.location]);
  assert.match(f.select("complete", quest).lines[0], /2 vivres/);
  assert.equal(JSON.stringify([f.hero, f.location]), before);
});

test("un message se remet uniquement au chef destinataire, une seule fois", () => {
  const f = fixture();
  const target = village("b");
  const locations = [f.location, target];
  let quest = f.service.board(f.hero, f.location, "tavern", locations);
  if (quest.type !== "message") {
    f.setTime(SIDE_QUEST_RENEWAL_MS);
    quest = f.service.board(f.hero, f.location, "tavern", locations);
  }
  assert.equal(quest.type, "message");
  f.select("accept", quest, "tavern", f.location, locations);
  assert.equal(
    f.select("complete", quest, "tavern", f.location, locations).success,
    false,
  );
  assert.equal(
    f.select("complete", quest, "tavern", target, locations).success,
    false,
  );
  const options = f.service.options(f.hero, target, "chief", locations);
  assert.ok(options.some((option) => option.id === command("complete", quest)));
  assert.equal(
    f.select("complete", quest, "chief", target, locations).success,
    true,
  );
  assert.equal(
    f.select("complete", quest, "chief", target, locations).success,
    false,
  );
  assert.equal(f.hero.resources.gold, 3);
  assert.equal(f.hero.experience, 30);
  assert.equal(f.hero.xpHistory.length, 1);
});

test("Game vérifie présence, propriétaire du héros et accès à la taverne, puis restaure le délai", () => {
  const setup = {
    id: "s",
    name: "Test",
    mode: "quick",
    scenarioId: "chaos",
    playerCount: 1,
    playArea: {
      id: "area",
      name: "Parc",
      polygon: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
        { latitude: 1, longitude: 0 },
      ],
    },
    participants: [{ playerId: "p", name: "P" }],
  };
  const game = new Game({
    setup,
    locations: [village("a", { tavern: 1 }).toJSON()],
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    now: () => 1234,
    idGenerator: () => "h",
  });
  const hero = game.chooseHero("p", { name: "H", classId: "warrior" });
  const location = game.getLocation("a");
  const args = {
    playerId: "p",
    heroId: "h",
    locationId: "a",
    source: "tavern",
  };
  const conversation = game.getLocationChiefConversation(args);
  assert.equal(conversation.title, "Tavernier");
  const view = conversation.options[0].id;
  assert.equal(
    game.selectLocationChiefOption({ ...args, optionId: view }).success,
    false,
  );
  location.heroIds.push(hero.id);
  assert.equal(
    game.selectLocationChiefOption({
      ...args,
      playerId: "other",
      optionId: view,
    }).success,
    false,
  );
  const offered = game.selectLocationChiefOption({ ...args, optionId: view });
  game.selectLocationChiefOption({ ...args, optionId: offered.options[0].id });
  const quest = hero.sideQuests[0];
  game.selectLocationChiefOption({
    ...args,
    optionId: command("abandon", quest),
  });
  const restored = Game.fromJSON(game.toJSON(), {
    now: () => 1234 + SIDE_QUEST_RENEWAL_MS - 1,
  });
  assert.match(
    restored.getLocationChiefConversation(args).options[0].label,
    /dans 1 min/,
  );
  // Nouvelle mission issue d'une ancienne sauvegarde : gain via la progression de Game.
  const resumed = Game.fromJSON(game.toJSON(), {
    now: () => 1234 + SIDE_QUEST_RENEWAL_MS,
  });
  const resumedHero = resumed.getHero("h");
  resumed.sideQuestService.getTemplates = () => [];
  resumedHero.addResource("food", 2);
  const nextOffer = resumed.getLocationChiefConversation(args).options[0];
  const nextView = resumed.selectLocationChiefOption({
    ...args,
    optionId: nextOffer.id,
  });
  assert.match(nextView.lines.join(" "), /15 XP/);
  resumed.selectLocationChiefOption({
    ...args,
    optionId: nextView.options[0].id,
  });
  const nextQuest = resumedHero.sideQuests[0];
  delete nextQuest.experienceReward;
  const completed = resumed.selectLocationChiefOption({
    ...args,
    optionId: command("complete", nextQuest),
  });
  assert.match(completed.lines[0], /20 XP/);
  assert.equal(resumedHero.experience, 20);
  assert.deepEqual(resumedHero.xpHistory.at(-1), {
    type: "xp_gain",
    amount: 20,
    source: `side_quest:${nextQuest.id}`,
    timestamp: 1234 + SIDE_QUEST_RENEWAL_MS,
  });
  const savedReward = Game.fromJSON(resumed.toJSON());
  assert.equal(
    savedReward.selectLocationChiefOption({
      ...args,
      optionId: command("complete", nextQuest),
    }).success,
    false,
  );
  assert.equal(savedReward.getHero("h").experience, 20);
  location.infrastructure.tavern = 0;
  assert.equal(game.getLocationChiefConversation(args), null);
  assert.equal(
    game.selectLocationChiefOption({ ...args, optionId: view }).success,
    false,
  );
  location.controllerId = "enemy";
  assert.equal(
    game.getLocationChiefConversation({ ...args, source: "chief" }),
    null,
  );
});
