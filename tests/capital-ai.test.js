import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Game } from "../app/js/core/game.js";
import { Location } from "../app/js/core/location.js";
import { CAPITAL_BOSS_ID, CapitalAiService } from "../app/js/core/capital-ai-service.js";
import { PlayArea } from "../app/js/core/play-area.js";
import { HERO_EQUIPMENT_SLOTS } from "../app/js/core/equipment-service.js";
import { getItemDefinition } from "../app/js/core/item-catalog.js";
import {
  maximumAuthority,
  usedAuthority,
} from "../app/js/core/authority-system.js";

const read = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

test("le placement simulé réduit le rayon si les candidats dépassent les limites de coordonnées", () => {
  const playArea = new PlayArea({
    id: "simulation", name: "Simulation",
    polygon: [
      { latitude: -89, longitude: -179 },
      { latitude: -89, longitude: 179 },
      { latitude: 89, longitude: 179 },
      { latitude: 89, longitude: -179 },
    ],
  });
  const service = new CapitalAiService();
  const game = { coordinateMode: "simulation", setup: { playArea } };
  const origin = { latitude: 80, longitude: 170 };
  const position = service.nearPosition(game, origin, 300, 45, [origin]);
  assert.equal(playArea.allowsPlacement(position), true);
  assert.ok(service.distance(game, origin, position) > 0);
});
function fixture() {
  const scenario = read("../data/scenarios/chaos.json");
  const aliases = {
    capital: "royal-capital",
    refuge: "fort-nord",
    "royal-camp": "village-vert",
    "prospectors-battlefield": "prospector-battlefield",
  };
  const locations = read("../data/locations.json");
  locations.forEach((location, index) => {
    location.position = {
      latitude: 48.8566 + index * 0.0001,
      longitude: 2.3522,
    };
  });
  aliases.refuge =
    locations.find((location) => location.roles?.includes("spawn"))?.id ??
    locations.find((location) => location.type === "fort").id;
  let serial = 0;
  const game = new Game({
    setup: {
      id: "capital-test",
      name: "Test",
      mode: "quick",
      scenarioId: "chaos",
      playerCount: 1,
      participants: [{ playerId: "player", name: "Joueur" }],
      playArea: {
        id: "area",
        name: "Paris",
        polygon: [
          { latitude: 48.8, longitude: 2.2 },
          { latitude: 48.8, longitude: 2.5 },
          { latitude: 48.95, longitude: 2.5 },
          { latitude: 48.95, longitude: 2.2 },
        ],
      },
      rules: {},
    },
    scenario,
    locations,
    heroClasses: read("../data/hero-classes.json"),
    heroAptitudes: read("../data/hero-aptitudes.json"),
    unitDefinitions: read("../data/units.json"),
    scenarioLocationBindings: scenario.locationSlots.map((slot) => ({
      locationSlotId: slot.id,
      locationId: aliases[slot.id] ?? slot.id,
    })),
    now: () => 1000,
    idGenerator: (prefix) => `${prefix}-${serial++}`,
  });
  const hero = game.chooseHero("player", {
    name: "Joueur",
    classId: "warrior",
  });
  hero.position = { latitude: 48.88, longitude: 2.38 };
  game.start();
  return { game, hero, capital: game.getLocationForScenarioSlot("capital") };
}

test("la capitale alliée possède sa garnison adjudant et un boss équipé de niveau 15", () => {
  const { game, capital } = fixture();
  assert.equal(
    game.locationAccessPolicy.getRelation("player", capital),
    "allied",
  );
  assert.deepEqual(
    capital.garrison.units.map((unit) => [
      unit.typeId,
      unit.rank,
      unit.quantity,
    ]),
    [
      ["heavy-cavalry", "warrant-officer", 18],
      ["heavy-infantry", "warrant-officer", 18],
      ["heavy-infantry", "warrant-officer", 18],
    ],
  );
  const boss = game.getHero(CAPITAL_BOSS_ID);
  assert.equal(boss.level, 15);
  assert.equal(boss.commandRank, "lord");
  assert.equal(boss.maxUnitStacks, 6);
  assert.deepEqual(
    boss.army.units.map((unit) => [unit.typeId, unit.quantity]),
    [
      ["heavy-cavalry", 24],
      ["heavy-infantry", 24],
    ],
  );
  assert.ok(
    usedAuthority(boss, game.unitDefinitions) <=
      maximumAuthority(boss, game.heroClasses.get(boss.classId)),
  );
  for (const slot of HERO_EQUIPMENT_SLOTS)
    assert.ok(
      game.equipmentService.isCompatible(
        getItemDefinition(boss.equipment[slot.id]),
        slot.id,
      ),
    );
  assert.equal(
    game.autonomousGroups.filter((group) => group.type === "convoy").length,
    4,
  );
  game.capitalAiService.initialize(game);
  assert.equal(
    game.heroes.filter((hero) => hero.id === CAPITAL_BOSS_ID).length,
    1,
  );
});

test("la capitale dessert deux mines du même minerai sans doublon et ignore les sites hors rayon ou ennemis", () => {
  const { game, capital } = fixture();
  const template = game.getLocation("capital-resource-gold").toJSON();
  const add = (id, offset, ownerId = capital.ownerId, state = "active") => {
    const location = new Location({
      ...template,
      id,
      ownerId,
      controllerId: ownerId,
      state,
      position: {
        latitude: capital.position.latitude + offset,
        longitude: capital.position.longitude,
      },
      roles: [],
      heroIds: [],
      garrison: { units: [] },
    });
    game.locations.push(location);
    return location;
  };
  add("nearby-gold-a", 0.001);
  add("nearby-gold-b", 0.002);
  add("far-gold", 0.04);
  add("enemy-gold", 0.001, "bandits");
  for (const resource of ["wood", "iron", "horse", "gold"])
    capital.resources.stock[resource] = 10000;
  game.capitalAiService.ensureConvoys(game, capital);
  game.capitalAiService.ensureConvoys(game, capital);
  const routes = game.autonomousGroups.filter(
    (group) => group.type === "convoy",
  );
  for (const id of ["nearby-gold-a", "nearby-gold-b"])
    assert.equal(
      routes.filter(
        (group) =>
          group.mission.destinationLocationId === id &&
          group.mission.resourceId === "gold",
      ).length,
      1,
    );
  assert.ok(
    !routes.some((group) =>
      ["far-gold", "enemy-gold"].includes(group.mission.destinationLocationId),
    ),
  );
  const count = routes.length;
  add("unfunded-gold", 0.003);
  capital.resources.stock = {};
  game.capitalAiService.ensureConvoys(game, capital);
  assert.equal(
    game.autonomousGroups.filter((group) => group.type === "convoy").length,
    count,
  );
});

test("les quatre exploitations ont un village proche et leurs convois livrent la production", () => {
  const { game, capital } = fixture();
  for (const resource of ["gold", "iron", "wood", "stone"]) {
    const mine = game.getLocation(`capital-resource-${resource}`);
    const village = game.getLocation(`${mine.id}-village`);
    assert.ok(
      game.capitalAiService.distance(game, capital.position, mine.position) >
        500,
    );
    assert.ok(
      game.capitalAiService.distance(game, mine.position, village.position) >
        150,
    );
    assert.ok(
      game.capitalAiService.distance(game, mine.position, village.position) <=
        181,
    );
    assert.ok(
      game.capitalAiService.distance(game, mine.position, village.position) > 1,
    );
    const convoy = game.autonomousGroups.find(
      (group) => group.mission.resourceId === resource,
    );
    const stockBefore = capital.resources.stock[resource];
    assert.equal(
      game.tradingConvoyService.arrive(convoy, game.locations, 1000).quantity,
      10,
    );
    assert.equal(
      game.tradingConvoyService.arrive(convoy, game.locations, 2000).quantity,
      10,
    );
    assert.equal(capital.resources.stock[resource], stockBefore + 10);
  }
});

test("la trahison est idempotente, bascule le réseau et les pertes de mines coupent les convois", () => {
  const { game, capital } = fixture();
  assert.equal(game.capitalAiService.turnHostile(game), true);
  assert.equal(game.capitalAiService.turnHostile(game), false);
  assert.equal(
    game.locationAccessPolicy.getRelation("player", capital),
    "enemy",
  );
  assert.equal(game.getHero(CAPITAL_BOSS_ID).playerId, "chaos");
  const convoy = game.autonomousGroups[0];
  const mine = game.getLocation(convoy.mission.destinationLocationId);
  mine.ownerId = mine.controllerId = "player";
  assert.equal(
    game.tradingConvoyService.validate(convoy, game.locations).success,
    false,
  );
  game.advanceAutonomousGroups(2000);
  assert.equal(convoy.status, "suspended");
});

test("l’IA paie ses défenses et ses GA, varie leurs classes et respecte le niveau des joueurs", () => {
  const { game, hero, capital } = fixture();
  hero.level = 9;
  game.capitalAiService.turnHostile(game);
  capital.resources.stock = {
    gold: 100000,
    wood: 100000,
    iron: 100000,
    stone: 100000,
    horse: 10000,
  };
  const initial = capital.resources.stock.gold;
  for (let step = 0; step < 8; step++)
    game.capitalAiService.update(game, 1000 + step * 30000);
  const groups = game.autonomousGroups.filter((group) => group.type === "army");
  assert.equal(groups.length, 4);
  assert.deepEqual(
    groups.slice(0, 3).map((group) => group.commander.classId),
    ["warrior", "ranger", "mage"],
  );
  assert.ok(groups.every((group) => group.commander.level === 9));
  assert.ok(groups.every((group) => group.mission.kind === "pursue"));
  assert.ok(capital.resources.stock.gold < initial);
  assert.ok(
    game.locations.some((location) => location.improvements.length > 0),
  );
  const before = groups.length;
  capital.resources.stock = {};
  game.capitalAiService.update(game, 900000);
  assert.equal(
    game.autonomousGroups.filter((group) => group.type === "army").length,
    before,
  );
});

test("le boss participe à la défense et les commandants persistent avec leurs combats", () => {
  const { game, hero, capital } = fixture();
  game.capitalAiService.turnHostile(game);
  const battle = game.createBattle({
    teamParticipants: [
      { id: "player", heroIds: [hero.id] },
      { id: "capital", locationId: capital.id },
    ],
    position: capital.position,
    sourceLocationId: capital.id,
    sourceEnemyTeamId: "capital",
  });
  const defenders = battle.teams.find((team) => team.id === "capital");
  assert.ok(
    defenders.heroes.some((snapshot) => snapshot.sourceId === CAPITAL_BOSS_ID),
  );
  assert.equal(defenders.units.length, 5);
  const restored = Game.fromJSON(game.toJSON());
  restored.capitalAiService.initialize(restored);
  assert.equal(restored.getHero(CAPITAL_BOSS_ID).level, 15);
  assert.equal(
    restored.getHero(CAPITAL_BOSS_ID).equipment.mainHand,
    "royal_boss_mainHand",
  );
  assert.equal(restored.worldState.get("capitalAi.hostile"), true);
  assert.equal(restored.autonomousGroups.length, game.autonomousGroups.length);
});

test("la fin des missions royales active la trahison et la reconquête sans dialogue à la capitale", () => {
  const { game, capital } = fixture();
  game.configureQuestSequence([
    {
      id: "granaries-of-the-king",
      title: "Dernière mission royale",
      description: "Test",
      startPhaseId: "reach-royal-camp",
      phaseIds: ["reach-royal-camp"],
    },
    {
      id: "capital-reconquest",
      title: "Reconquête",
      description: "Test",
      startPhaseId: "capital-reconquest",
      phaseIds: ["capital-reconquest"],
    },
  ]);
  game.completeScenarioObjective("reach-royal-camp");
  game.completeCurrentScenarioPhase();
  game.advanceQuestSequence();
  assert.equal(game.worldState.get("capitalAi.hostile"), true);
  assert.equal(game.scenarioState.currentPhaseId, "capital-reconquest");
  assert.equal(game.scenarioState.getCurrentPhaseState().status, "active");
  assert.equal(
    game.locationAccessPolicy.can("player", capital, "talkChief"),
    false,
  );
});

test("un GA capture un lieu sans défense puis y dépose une garnison", () => {
  const { game, hero, capital } = fixture();
  hero.position = { latitude: 48.9, longitude: 2.4 };
  const target = game.getLocation("supply-fort");
  target.ownerId = target.controllerId = "player";
  target.features.capturable = true;
  target.heroIds = [];
  target.garrison.units = [];
  target.position = {
    latitude: capital.position.latitude + 0.0001,
    longitude: capital.position.longitude,
  };
  game.capitalAiService.turnHostile(game);
  capital.resources.stock = {
    gold: 10000,
    wood: 10000,
    iron: 10000,
    stone: 10000,
    horse: 1000,
  };
  game.worldState.set("capitalAi.defenseTurn", false);
  game.advanceAutonomousGroups(1000);
  const group = game.autonomousGroups.find((entry) => entry.type === "army");
  assert.equal(group.mission.targetId, target.id);
  game.advanceAutonomousGroups(15000);
  assert.equal(target.ownerId, "chaos");
  game.capitalAiService.update(game, 31000);
  assert.equal(target.garrison.units.length, 1);
  assert.equal(target.garrison.units[0].ownerPlayerId, "chaos");
});

test("les commandants de GA conservent niveau, aptitudes et PV après sauvegarde", () => {
  const { game, hero, capital } = fixture();
  game.capitalAiService.turnHostile(game);
  capital.resources.stock = {
    gold: 10000,
    wood: 10000,
    iron: 10000,
    stone: 10000,
    horse: 1000,
  };
  game.worldState.set("capitalAi.defenseTurn", false);
  game.capitalAiService.update(game, 1000);
  const group = game.autonomousGroups.find((entry) => entry.type === "army");
  group.commander.health -= 3;
  const restored = Game.fromJSON(game.toJSON());
  const copy = restored.getAutonomousGroup(group.id);
  assert.deepEqual(copy.commander.toJSON(), group.commander.toJSON());
  const battle = restored.createBattle({
    teamParticipants: [
      { id: "player", heroIds: [hero.id] },
      { id: "enemy", autonomousGroupId: group.id },
    ],
  });
  const snapshot = battle.teams.find((team) => team.id === "enemy").heroes[0];
  assert.equal(snapshot.health, group.commander.health);
  assert.equal(snapshot.name, group.commander.name);
});

test("la défaite finale termine la campagne et arrête le recrutement", () => {
  const { game, hero, capital } = fixture();
  game.capitalAiService.turnHostile(game);
  game.scenarioState.currentPhaseId = "capital-reconquest";
  const state = game.scenarioState.getCurrentPhaseState();
  state.status = "active";
  state.objectives.forEach((objective) => {
    objective.state = "active";
  });
  game.dispatchQuestEvent({ type: "BattleWon", locationId: capital.id });
  assert.notEqual(game.worldState.get("capitalAi.defeated"), true);
  const battle = game.createBattle({
    teamParticipants: [
      { id: "player", heroIds: [hero.id] },
      { id: "capital", locationId: capital.id },
    ],
    sourceLocationId: capital.id,
    sourceEnemyTeamId: "capital",
    position: capital.position,
  });
  const defenders = battle.teams.find((team) => team.id === "capital");
  defenders.heroes.forEach((snapshot) => {
    snapshot.health = 0;
    snapshot.state = "ghost";
  });
  defenders.units.forEach((snapshot) => {
    snapshot.soldierHealth = [];
    snapshot.quantity = 0;
    snapshot.state = "defeated";
  });
  battle.status = "finished";
  battle.winnerTeamId = "player";
  const report = game.resolveBattle(battle.id);
  assert.equal(report.capturedLocationId, capital.id);
  game.dispatchQuestEvent({ type: "BattleWon", locationId: capital.id });
  game.update();
  assert.equal(game.worldState.get("capitalAi.defeated"), true);
  assert.equal(game.status, "finished");
  assert.equal(game.finishReason, "capital_liberated");
});

test("le réseau reste distinct et proche de la capitale dans une zone de simulation", () => {
  const { game, capital } = fixture();
  game.coordinateMode = "simulation";
  game.setup.playArea = new game.setup.playArea.constructor({ id: "simulation", name: "Carte fictive", polygon: [
    { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 160 },
    { latitude: 80, longitude: 160 }, { latitude: 80, longitude: 0 },
  ] });
  capital.position = { latitude: 40, longitude: 80 };
  game.locations.filter((location) => !location.roles.includes("capital-economy") && location.id !== capital.id)
    .forEach((location) => { location.position = { latitude: 1, longitude: 1 }; });
  game.capitalAiService.placeEconomy(game, capital);
  const places = game.locations.filter((location) =>
    location.roles.includes("capital-economy"),
  );
  assert.equal(
    new Set(places.map((location) => JSON.stringify(location.position))).size,
    8,
  );
  for (const location of places)
    assert.ok(game.setup.playArea.contains(location.position));
  for (const resource of ["gold", "iron", "wood", "stone"]) {
    const mine = game.getLocation(`capital-resource-${resource}`);
    const village = game.getLocation(`${mine.id}-village`);
    assert.ok(
      game.capitalAiService.distance(game, mine.position, village.position) <
        game.capitalAiService.distance(game, mine.position, capital.position),
    );
  }
});

test("la présence du boss interdit la capture directe même si la garnison est vide", () => {
  const { game, hero, capital } = fixture();
  game.capitalAiService.turnHostile(game);
  capital.garrison.units = [];
  capital.addHero(hero.id);
  assert.equal(
    game.getLocationCaptureRequirement({
      playerId: hero.playerId,
      locationId: capital.id,
    }).state,
    "battle_required",
  );
  assert.equal(
    game.attemptLocationCapture({
      playerId: hero.playerId,
      heroId: hero.id,
      locationId: capital.id,
    }).reason,
    "battle_required",
  );
});

test("la bataille du boss avance par duels", () => {
  const { game, hero, capital } = fixture();
  game.capitalAiService.turnHostile(game);
  const battle = game.createBattle({
    teamParticipants: [
      { id: "heroes", heroIds: [hero.id] },
      { id: "boss", locationId: capital.id },
    ],
    position: capital.position,
    sourceLocationId: capital.id,
    sourceEnemyTeamId: "boss",
  });
  const initial = structuredClone(battle.duel);
  assert.deepEqual(battle.duel, initial);
  battle.advanceDuel({ now: game.now(), humanTeamIds: [] });
  assert.ok(battle.duel.round >= 1);
  assert.equal(battle.duel.lastResult.round, 1);
  assert.equal(battle.duel.troops.length, initial.troops.length);
});

