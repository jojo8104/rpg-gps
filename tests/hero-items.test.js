import test from "node:test";
import assert from "node:assert/strict";
import { Hero } from "../app/js/core/hero.js";
import { Game } from "../app/js/core/game.js";
import { EquipmentService } from "../app/js/core/equipment-service.js";
import { ItemAcquisitionService } from "../app/js/core/item-acquisition-service.js";
import { HERO_ITEM_DEFINITIONS } from "../app/js/core/hero-item-catalog.js";
import { getItemDefinition } from "../app/js/core/item-catalog.js";
import { QuestRuntime } from "../app/js/core/quest-runtime.js";
import { Scenario, ScenarioState } from "../app/js/core/scenario.js";

const makeHero = (classId = "warrior") =>
  new Hero({
    id: "h",
    playerId: "p",
    name: "Ada",
    classId,
    resources: { gold: 100, iron: 6, wood: 3 },
  });
const location = {
  id: "town",
  type: "town",
  infrastructure: { forge: 2, tavern: 1 },
};
const context = (hero = makeHero()) => ({
  hero,
  location,
  canTrade: true,
  canTavern: true,
});
const carry = (hero, itemId, id = itemId) =>
  hero.addCarriedLoot([{ id, itemId, quantity: 1 }]);

test("outils disponibles dès la forge 1, même après trois commandes et sauvegarde", () => {
  let service = new ItemAcquisitionService({ forgeUses: { town: 3 } });
  const hero = makeHero();
  hero.resources = { gold: 100 };
  const ctx = { ...context(hero), location: { ...location, infrastructure: { forge: 1 } } };
  const offer = service.offers(ctx).find((entry) => entry.itemId === "exploration_tools");
  assert.ok(offer);
  for (let i = 0; i < 4; i++) {
    assert.equal(service.acquire(ctx, offer.id).success, true);
    service = new ItemAcquisitionService(service.toJSON());
  }
  assert.equal(hero.resources.gold, 92);
  assert.equal(hero.resources.exploration_tools, 4);
  assert.equal(service.state.forgeUses.town, 3);
  assert.equal(service.acquire({ ...ctx, canTrade: false }, offer.id).success, false);
  assert.equal(service.acquire({ ...ctx, location: { ...location, infrastructure: {} } }, offer.id).success, false);
});

test("achat des outils refusé sans or ou sans place, sans effet", () => {
  const service = new ItemAcquisitionService();
  const hero = makeHero();
  const ctx = context(hero);
  const offer = service.offers(ctx).find((entry) => entry.itemId === "exploration_tools");
  hero.resources = { gold: 1 };
  assert.equal(service.acquire(ctx, offer.id).reason, "insufficient_resources");
  assert.deepEqual(hero.resources, { gold: 1 });
  hero.resources = { gold: 10, exploration_tools: hero.bagSlotCount };
  assert.equal(service.acquire(ctx, offer.id).reason, "hero_bag_full");
  assert.deepEqual(hero.resources, { gold: 10, exploration_tools: hero.bagSlotCount });
});

test("75 objets, cinq par famille, bonus et images historiques préservés", () => {
  const counts = {};
  for (const item of Object.values(HERO_ITEM_DEFINITIONS)) {
    counts[item.family] = (counts[item.family] ?? 0) + 1;
    assert.ok(item.allowedClasses.length);
    assert.deepEqual(getItemDefinition(item.id).modifiers, item.modifiers);
  }
  assert.equal(Object.keys(HERO_ITEM_DEFINITIONS).length, 75);
  assert.equal(Object.keys(counts).length, 15);
  assert.ok(Object.values(counts).every((count) => count === 5));
  assert.equal(
    getItemDefinition("iron_sword").image,
    "assets/equipment/iron-sword.png",
  );
  assert.equal(getItemDefinition("royal_boss_mainHand").modifiers.attack, 6);
});

test("refus de classe et deux mains atomiques dans les deux sens", () => {
  const hero = makeHero("mage"),
    service = new EquipmentService();
  carry(hero, "iron_sword");
  carry(hero, "apprentice_staff");
  carry(hero, "protection_orb");
  const before = hero.toJSON();
  assert.equal(service.equip(hero, "iron_sword").reason, "class_restricted");
  assert.deepEqual(hero.toJSON(), before);
  assert.equal(service.equip(hero, "protection_orb").success, true);
  assert.equal(
    service.equip(hero, "apprentice_staff").reason,
    "requires_both_hands",
  );
  service.unequip(hero, "offHand", { id: "orb" });
  assert.equal(service.equip(hero, "apprentice_staff").success, true);
  assert.equal(service.equip(hero, "orb").reason, "requires_both_hands");
});

test("un manteau et deux anneaux différents au maximum", () => {
  const hero = makeHero(),
    service = new EquipmentService();
  carry(hero, "travel_coat");
  carry(hero, "messenger_cape");
  carry(hero, "iron_ring", "r1");
  carry(hero, "iron_ring", "r2");
  service.equip(hero, "travel_coat", "accessory1");
  assert.equal(
    service.equip(hero, "messenger_cape", "accessory2").reason,
    "one_cloak_only",
  );
  service.equip(hero, "r1", "accessory1");
  assert.equal(
    service.equip(hero, "r2", "accessory2").reason,
    "duplicate_ring",
  );
});

test("santé maximale et malus persistent sans soigner par rééquipement", () => {
  const hero = makeHero(),
    service = new EquipmentService();
  const initial = hero.maxHealth;
  hero.health = 10;
  carry(hero, "citadel_armor");
  service.equip(hero, "citadel_armor");
  assert.equal(hero.maxHealth, initial + 10);
  assert.equal(hero.health, 10);
  assert.equal(hero.equipmentModifiers.mobility, -2);
  const restored = new Hero(hero.toJSON());
  service.unequip(restored, "torso");
  assert.equal(restored.maxHealth, initial);
  assert.equal(restored.health, 10);
});

test("achat unique, déterminisme et sauvegarde des stocks", () => {
  const service = new ItemAcquisitionService(),
    ctx = context();
  const offer = service.offers(ctx).find((o) => o.source === "merchant");
  assert.ok(offer);
  const gold = ctx.hero.resources.gold;
  assert.equal(service.acquire(ctx, offer.id).success, true);
  assert.equal(ctx.hero.resources.gold, gold - offer.costs.gold);
  assert.equal(ctx.hero.carriedLoot.at(-1).itemId, offer.itemId);
  const restored = new ItemAcquisitionService(service.toJSON());
  assert.equal(
    restored.acquire(ctx, offer.id).reason,
    "item_offer_unavailable",
  );
  assert.deepEqual(service.offers(ctx), restored.offers(ctx));
});

test("sac plein et ressources insuffisantes ne consomment ni or ni stock", () => {
  const service = new ItemAcquisitionService(),
    ctx = context();
  const offer = service.offers(ctx).find((o) => o.source === "merchant");
  for (let i = 0; i < 8; i++) carry(ctx.hero, "iron_sword", `s${i}`);
  const before = ctx.hero.toJSON(),
    state = service.toJSON();
  assert.equal(service.acquire(ctx, offer.id).reason, "hero_bag_full");
  assert.deepEqual(ctx.hero.toJSON(), before);
  assert.deepEqual(service.toJSON(), state);
  ctx.hero.carriedLoot = [];
  ctx.hero.resources.gold = 0;
  assert.equal(service.acquire(ctx, offer.id).reason, "insufficient_resources");
  assert.deepEqual(service.toJSON(), state);
});

test("forge absente, niveau, coûts et trois commandes persistantes", () => {
  const service = new ItemAcquisitionService(),
    ctx = context();
  assert.ok(
    !service
      .offers({ ...ctx, location: { ...location, infrastructure: {} } })
      .some((o) => o.source === "forge"),
  );
  const levelOne = service.offers({
    ...ctx,
    location: { ...location, infrastructure: { forge: 1 } },
  });
  assert.ok(
    levelOne
      .filter((o) => o.source === "forge")
      .every((o) => o.rarity !== "rare"),
  );
  for (let i = 0; i < 3; i++) {
    ctx.hero.resources = { gold: 100, iron: 6, wood: 3 };
    ctx.hero.carriedLoot = [];
    const offer = service
      .offers(ctx)
      .find((o) => o.source === "forge" && o.rarity === "common");
    assert.equal(service.acquire(ctx, offer.id).success, true);
    assert.equal(ctx.hero.resources.iron, 6 - offer.costs.iron);
  }
  assert.ok(
    !new ItemAcquisitionService(service.toJSON())
      .offers(ctx)
      .some((o) => o.source === "forge"),
  );
});

test("un objet rare ne peut être créé qu’une fois par le système mondial", () => {
  const service = new ItemAcquisitionService(),
    first = context(),
    second = context(makeHero());
  second.hero.id = "other";
  for (const ctx of [first, second])
    service.unlock({
      source: "mainQuest",
      key: ctx.hero.id,
      heroId: ctx.hero.id,
      itemId: "archmage_staff",
    });
  assert.equal(service.acquire(first, "mainQuest:h").success, true);
  assert.equal(
    service.acquire(second, "mainQuest:other").reason,
    "item_offer_unavailable",
  );
});

test("ruines uniques et trois lieux distincts pour un trésor", () => {
  const service = new ItemAcquisitionService(),
    ctx = {
      ...context(),
      location: { id: "ruin", type: "ruin" },
      canTrade: false,
      canTavern: false,
    };
  const ruin = service.offers(ctx).find((o) => o.source === "ruin");
  assert.equal(service.acquire(ctx, ruin.id).success, true);
  assert.equal(service.acquire(ctx, ruin.id).success, false);
  service.recordVisit(ctx.hero, { id: "a" });
  service.recordVisit(ctx.hero, { id: "a" });
  service.recordVisit(ctx.hero, { id: "b" });
  assert.ok(!service.offers(ctx).some((o) => o.source === "treasure"));
  service.recordVisit(ctx.hero, { id: "c" });
  ctx.location = { id: "c", type: "village" };
  const treasure = service.offers(ctx).find((o) => o.source === "treasure");
  assert.ok(treasure);
  assert.equal(service.acquire(ctx, treasure.id).success, true);
});

test("les récompenses appartiennent au héros ou au prospecteur et attendent au bon lieu", () => {
  const service = new ItemAcquisitionService(),
    ctx = context();
  service.unlock({
    source: "prospecting",
    key: "zone",
    playerId: "p",
    locationId: "mine",
  });
  assert.ok(!service.offers(ctx).some((o) => o.source === "prospecting"));
  const mine = { ...ctx, location: { id: "mine", type: "mine" } };
  assert.ok(service.offers(mine).some((o) => o.source === "prospecting"));
  mine.hero.playerId = "enemy";
  assert.ok(!service.offers(mine).some((o) => o.source === "prospecting"));
  assert.equal(service.unlock({ source: "prospecting", key: "zone" }), false);
});

test("mission d’objet : exige le bagage, le consomme une fois, remet la récompense", () => {
  const service = new ItemAcquisitionService(),
    ctx = context();
  const offer = service.offers(ctx).find((o) => o.source === "contract");
  assert.equal(service.acquire(ctx, offer.id).reason, "quest_item_required");
  carry(ctx.hero, offer.requiredItemId);
  assert.equal(service.acquire(ctx, offer.id).success, true);
  assert.ok(
    !ctx.hero.carriedLoot.some((o) => o.itemId === offer.requiredItemId),
  );
  assert.ok(ctx.hero.carriedLoot.some((o) => o.itemId === offer.itemId));
  assert.equal(service.acquire(ctx, offer.id).success, false);
});

function gameFixture() {
  const setup = {
    id: "s",
    name: "Items",
    mode: "quick",
    scenarioId: "test",
    playerCount: 1,
    playArea: {
      id: "a",
      name: "A",
      polygon: [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 1 },
        { latitude: 1, longitude: 0 },
      ],
    },
    participants: [{ playerId: "p", name: "A" }],
  };
  const game = new Game({
    setup,
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    locations: [
      {
        id: "town",
        name: "Ville",
        type: "town",
        source: "scenario",
        position: { latitude: 0, longitude: 0 },
        population: 20,
        features: { trade: true },
        infrastructure: { forge: 2, tavern: 1 },
      },
    ],
  });
  const hero = game.chooseHero("p", { name: "A", classId: "warrior" });
  game.start();
  hero.resources = { gold: 100 };
  game.getLocation("town").addHero(hero.id);
  return {
    game,
    hero,
    args: {
      playerId: "p",
      heroId: hero.id,
      locationId: "town",
      source: "equipment",
    },
  };
}

test("menu Forge dédié : fabrication payée, outils disponibles et offres étrangères refusées", () => {
  const { game, hero, args } = gameFixture();
  const forgeArgs = { ...args, source: "forge" };
  hero.resources = { gold: 100, iron: 10, wood: 5 };
  const conversation = game.getLocationChiefConversation(forgeArgs);
  assert.equal(conversation.title, "Forge");
  assert.ok(conversation.name.startsWith("Forgeron"));
  assert.ok(conversation.options.every((entry) => /^item:(forge|supply):/.test(entry.id)));
  const forged = conversation.options.find((entry) => entry.id.startsWith("item:forge:") &&
    HERO_ITEM_DEFINITIONS[entry.itemId].rarity === "common");
  const before = { ...hero.resources };
  assert.equal(game.selectLocationChiefOption({ ...forgeArgs, optionId: forged.id }).success, true);
  for (const [id, amount] of Object.entries(HERO_ITEM_DEFINITIONS[forged.itemId].recipe))
    assert.equal(hero.resources[id], before[id] - amount);
  assert.ok(hero.carriedLoot.some((entry) => entry.itemId === forged.itemId));
  const tools = conversation.options.find((entry) => entry.itemId === "exploration_tools");
  assert.equal(game.selectLocationChiefOption({ ...forgeArgs, optionId: tools.id }).success, true);
  const merchant = game.getLocationChiefConversation(args).options.find((entry) => entry.id.startsWith("item:merchant:"));
  assert.equal(game.selectLocationChiefOption({ ...forgeArgs, optionId: merchant.id }).success, false);
  const location = game.getLocation(args.locationId);
  location.infrastructure.forge = 0;
  assert.equal(game.getLocationChiefConversation(forgeArgs), null);
  assert.equal(game.selectLocationChiefOption({ ...forgeArgs, optionId: tools.id }).success, false);
  location.infrastructure.forge = 1;
  location.removeHero(hero.id);
  assert.equal(game.getLocationChiefConversation(forgeArgs), null);
});

test("Game expose les offres et refuse l’usurpation, la distance et le rejeu après sauvegarde", () => {
  const { game, hero, args } = gameFixture();
  const conversation = game.getLocationChiefConversation(args);
  const optionId = conversation.options.find((o) =>
    o.id.startsWith("item:merchant:"),
  ).id;
  assert.equal(
    game.selectLocationChiefOption({ ...args, optionId, playerId: "other" })
      .success,
    false,
  );
  assert.equal(
    game.selectLocationChiefOption({ ...args, optionId }).success,
    true,
  );
  const restored = Game.fromJSON(game.toJSON());
  assert.equal(
    restored.selectLocationChiefOption({ ...args, optionId }).success,
    false,
  );
  restored.getLocation("town").removeHero(hero.id);
  assert.equal(restored.getLocationChiefConversation(args), null);
});

test("le recéleur est accessible dans la taverne et exige le bâtiment", () => {
  const { game, args } = gameFixture();
  const conversation = game.getLocationChiefConversation({
    ...args,
    source: "tavern",
  });
  const optionId = conversation.options.find((o) =>
    o.id.startsWith("item:fence:"),
  ).id;
  game.getLocation("town").infrastructure.tavern = 0;
  assert.equal(
    game.selectLocationChiefOption({ ...args, source: "tavern", optionId })
      .success,
    false,
  );
});

test("objectif de scénario : la remise consomme l’objet après validation et jamais deux fois", () => {
  const hero = makeHero();
  carry(hero, "iron_sword");
  const objective = {
    id: "deliver",
    trigger: {
      type: "itemDelivery",
      itemId: "iron_sword",
      interactionId: "give",
    },
  };
  const phase = {
    id: "phase",
    objectives: [objective],
    listeners: [],
    transitions: [],
    choices: [],
  };
  const state = { objectives: [{ id: "deliver", state: "active" }] };
  const game = {
    scenario: { getPhase: () => phase },
    scenarioState: {
      currentPhaseId: "phase",
      getCurrentPhaseState: () => state,
    },
    getHero: () => hero,
    getLocation: () => ({ heroIds: [hero.id] }),
    completeScenarioObjective: () => {
      state.objectives[0].state = "completed";
      return true;
    },
    completeCurrentScenarioPhase: () => true,
    advanceQuestSequence: () => null,
    eventLog: [],
    now: () => 0,
  };
  const runtime = new QuestRuntime();
  assert.ok(
    runtime.dispatch(
      { type: "InteractionCompleted", interactionId: "give", actorId: hero.id },
      game,
    ),
  );
  assert.equal(hero.carriedLoot.length, 0);
  assert.equal(
    runtime.dispatch(
      { type: "InteractionCompleted", interactionId: "give", actorId: hero.id },
      game,
    ),
    null,
  );
});

test("construire un rayon magique ajoute des objets sans relancer le stock général", () => {
  const service = new ItemAcquisitionService(),
    ctx = context();
  const before = service
    .offers(ctx)
    .filter((o) => o.id.startsWith("merchant:town:general:"));
  const after = service.offers({
    ...ctx,
    location: {
      ...location,
      infrastructure: { ...location.infrastructure, magic_academy: 1 },
    },
  });
  assert.deepEqual(
    after.filter((o) => o.id.startsWith("merchant:town:general:")),
    before,
  );
  const magic = after.filter((o) =>
    o.id.startsWith("merchant:town:magic_academy:"),
  );
  assert.equal(magic.length, 2);
  assert.ok(
    magic.every((o) =>
      ["staff", "focus", "robe"].includes(getItemDefinition(o.itemId).family),
    ),
  );
});

test("une quête principale terminée ouvre sa récompense une seule fois", () => {
  const { game, hero, args } = gameFixture();
  game.scenario = new Scenario({
    id: "test",
    name: "Quête",
    intro: "Terminer",
    initialPhaseId: "finish",
    locationSlots: [],
    phases: [
      {
        id: "finish",
        title: "Rapport",
        description: "Remettre le rapport",
        objectives: [
          {
            id: "report",
            text: "Rapporter",
            trigger: { type: "interactionCompleted", interactionId: "report" },
          },
        ],
        transitions: [],
        eventIds: [],
      },
    ],
    events: [],
  });
  game.scenarioState = new ScenarioState(game.scenario);
  const event = {
    type: "InteractionCompleted",
    interactionId: "report",
    actorId: hero.id,
    locationId: "town",
  };
  game.dispatchQuestEvent(event);
  assert.equal(
    game.itemAcquisitionService.state.rewards.filter(
      (r) => r.source === "mainQuest",
    ).length,
    1,
  );
  game.dispatchQuestEvent(event);
  assert.equal(game.itemAcquisitionService.state.rewards.length, 1);
  assert.ok(
    game
      .getLocationChiefConversation(args)
      .options.some((o) => o.id.startsWith("item:mainQuest:")),
  );
});

test("terminer une mission secondaire avec le moteur ouvre un équipement", () => {
  const { game, hero } = gameFixture();
  const at = game.getLocation("town");
  at.type = "village";
  hero.resources.food = 4;
  game.sideQuestService.getTemplates = () => [];
  const quest = game.sideQuestService.board(hero, at, "chief", [at]);
  const select = (action) =>
    game.selectLocationChiefOption({
      playerId: "p",
      heroId: hero.id,
      locationId: at.id,
      source: "chief",
      optionId: `side:${encodeURIComponent(JSON.stringify([action, quest.id]))}`,
    });
  assert.equal(select("accept").success, true);
  assert.equal(select("complete").success, true);
  assert.equal(
    game.itemAcquisitionService.state.rewards.filter(
      (r) => r.source === "sideQuest",
    ).length,
    1,
  );
  assert.equal(select("complete").success, false);
  assert.equal(game.itemAcquisitionService.state.rewards.length, 1);
});
