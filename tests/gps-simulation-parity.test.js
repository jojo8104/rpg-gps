import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Game } from "../app/js/core/game.js";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";
import { triggerAutonomousHeroAttacks } from "../app/js/core/autonomous-hero-attacks.js";
import { SERVER_GAME_COMMANDS } from "../app/js/controllers/server-game-commands.js";

const load = (name) =>
  JSON.parse(
    readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"),
  );
const classes = [
  {
    id: "warrior",
    name: "Guerrier",
    abilityIds: [],
    startingResources: {
      gold: 60,
      food: 10,
      wood: 10,
      stone: 10,
      iron: 10,
    },
    startingUnits: [],
  },
];
const definitions = load("units");

function fixture(mode) {
  let time = 1000,
    sequence = 0;
  const service = new LobbyService({
    now: () => time,
    idFactory: () => "player",
  });
  const solo = service.startSolo({
    playerName: "Testeur",
    heroClassId: "warrior",
    connectionId: "test",
    configuration: { positionMode: mode },
    playArea: {
      polygon: [
        { latitude: -1, longitude: -1 },
        { latitude: -1, longitude: 1 },
        { latitude: 1, longitude: 0 },
      ],
    },
  });
  const launch = createMultiplayerLaunch(solo.lobby);
  const game = new Game({
    setup: launch.setup,
    coordinateMode: mode,
    heroClasses: classes,
    unitDefinitions: definitions,
    now: () => time,
    idGenerator: (prefix) => `${prefix}-${++sequence}`,
    locations: [
      {
        id: "village",
        name: "Village",
        type: "village",
        source: "test",
        visibility: "visible",
        position: { latitude: 0, longitude: 0 },
        ownerId: "player",
        controllerId: "player",
        population: 30,
        features: {
          recruitment: true,
          resourceProduction: true,
          garrison: true,
        },
        resources: {
          stock: { gold: 5, food: 5 },
          production: { food: 1 },
          storageCapacity: 100,
        },
        recruitment: {
          availableUnitTypeIds: ["militia"],
          stock: { militia: 5 },
        },
      },
    ],
  });
  const hero = game.chooseHero("player", {
    name: "Testeur",
    classId: "warrior",
  });
  game.chooseHero("bandits", { name: "Brigand", classId: "warrior" });
  hero.updatePosition({ latitude: 0, longitude: 0 });
  hero.carriedLoot.push({ id: "sword", itemId: "iron_sword", quantity: 1 });
  game.getLocation("village").addHero(hero.id);
  game.start();
  game.gainHeroExperience({ heroId: hero.id, amount: 1000, source: "test" });
  const input = { playerId: "player", heroId: hero.id, locationId: "village" };
  return {
    game,
    hero,
    input,
    service,
    solo,
    bootstrap: () =>
      service.bootstrapGame({
        token: solo.session.token,
        snapshot: game.toJSON(),
      }),
    command: (command, args) =>
      service.executeGameCommand({ token: solo.session.token, command, args })
        .result,
    state: () => service.gameSnapshot(solo.lobby.code).state,
    advance: () => {
      time += 10000;
      service.advanceGames();
    },
  };
}

const heroState = (hero) => ({
  resources: hero.resources,
  equipment: hero.equipment,
  equipmentModifiers: hero.equipmentModifiers,
  experience: hero.experience,
  level: hero.level,
  pendingLevelUps: hero.pendingLevelUps,
  units: hero.army.units.map((unit) => ({
    typeId: unit.typeId,
    quantity: unit.quantity,
    rank: unit.rank,
  })),
});

for (const mode of ["gps", "simulation"]) {
  test(`la présence serveur autorise la capture à portée et la retire en sortant (${mode})`, () => {
    const f = fixture(mode);
    const location = f.game.getLocation("village");
    location.ownerId = null;
    location.controllerId = null;
    location.features.capturable = true;
    location.heroIds = [];
    const far = { latitude: mode === "gps" ? 0.5 : 50, longitude: 0 };
    f.hero.updatePosition(far);
    f.bootstrap();
    assert.equal(
      f.command("attemptLocationCapture", [f.input]).reason,
      "hero_not_at_location",
    );
    f.service.updatePlayerPosition({
      token: f.solo.session.token,
      position: { latitude: 0, longitude: 0 },
    });
    assert.ok(
      f
        .state()
        .locations.find((place) => place.id === "village")
        .heroIds.includes(f.hero.id),
    );
    assert.equal(f.command("attemptLocationCapture", [f.input]).success, true);
    assert.equal(
      f.state().locations.find((place) => place.id === "village").ownerId,
      "player",
    );
    f.advance();
    f.service.updatePlayerPosition({
      token: f.solo.session.token,
      position: far,
    });
    assert.equal(
      f
        .state()
        .locations.find((place) => place.id === "village")
        .heroIds.includes(f.hero.id),
      false,
    );
    assert.equal(
      f.command("attemptLocationCapture", [f.input]).reason,
      "hero_not_at_location",
    );
  });
}

test("le test de fort reste jouable dans une session solo pilotée par le serveur", () => {
  const f = fixture("simulation");
  f.bootstrap();
  const result = f.command("prepareTestQuest", [
    { ...f.input, questId: "team-fort-test", participantCount: 2 },
  ]);
  assert.equal(result.success, true);
  const state = f.state();
  assert.equal(state.teamFortQuestState[0].participantCount, 2);
  assert.equal(state.teamFortQuestState[0].localTest, true);
  assert.ok(
    state.locations.some((location) => location.source === "team-quest-test"),
  );
  assert.equal(
    f.command("prepareTestQuest", [
      { ...f.input, questId: "team-fort-test", participantCount: 2 },
    ]).reason,
    "team_fort_already_started",
  );
});

test("les mêmes commandes serveur gèrent ressources, recrutement et équipement en GPS et simulation", () => {
  const runs = ["gps", "simulation"].map((mode) => {
    const f = fixture(mode);
    f.bootstrap();
    assert.equal(
      f.command("collectLocationResources", [f.input]).success,
      true,
    );
    assert.equal(
      f.command("collectLocationResources", [f.input]).reason,
      "empty_stock",
    );
    assert.equal(
      f.command("recruitUnit", [{ ...f.input, unitTypeId: "militia" }]).success,
      true,
    );
    assert.equal(
      f.command("equipHeroItem", [{ ...f.input, packageId: "sword" }]).success,
      true,
    );
    assert.equal(
      f.command("unequipHeroItem", [{ ...f.input, slot: "mainHand" }]).success,
      true,
    );
    const state = f.state();
    return {
      hero: heroState(state.heroes.find((hero) => hero.playerId === "player")),
      resources: state.locations[0].resources,
      recruitment: state.locations[0].recruitment,
    };
  });
  assert.deepEqual(runs[0], runs[1]);
});

test("production et impôts avancent sur le serveur de la même façon dans les deux modes", () => {
  const runs = ["gps", "simulation"].map((mode) => {
    const f = fixture(mode);
    f.bootstrap();
    for (let cycle = 0; cycle < 10; cycle++) f.advance();
    const collected = f.command("collectLocationTaxes", [f.input]);
    assert.equal(collected.success, true);
    const state = f.state();
    return {
      collected,
      resources: state.locations[0].resources,
      taxes: state.locations[0].taxes,
      heroResources: state.heroes.find((hero) => hero.playerId === "player")
        .resources,
    };
  });
  assert.deepEqual(runs[0], runs[1]);
});

test("dialogues des lieux et progression du héros ne dépendent pas du mode", () => {
  const runs = ["gps", "simulation"].map((mode) => {
    const f = fixture(mode);
    const conversation = f.game.getLocationChiefConversation(f.input);
    const progress = f.game.getHeroProgress(f.hero.id);
    const result = f.game.levelUpHero({
      playerId: "player",
      heroId: f.hero.id,
    });
    assert.equal(result.success, true, `${mode}: ${result.reason ?? "level_up_failed"}`);
    return { conversation, progress, hero: heroState(f.hero) };
  });
  assert.deepEqual(runs[0], runs[1]);
});

test("les attaques agressives utilisent le même duel et respectent les portées de chaque mode", () => {
  const runs = ["gps", "simulation"].map((mode) => {
    const f = fixture(mode);
    f.game.addAutonomousGroup({
      id: "enemy",
      type: "army",
      factionId: "chaos",
      owner: { kind: "faction", id: "chaos" },
      position: { latitude: 0, longitude: 0 },
      behavior: "aggressive",
      mission: { kind: "guard", engagementRadiusMeters: 2 },
      army: {
        units: [
          {
            id: "troop",
            ownerPlayerId: "chaos",
            typeId: "militia",
            quantity: 5,
          },
        ],
      },
    });
    const group = f.game.getAutonomousGroup("enemy");
    const ids = new Set(["player"]);
    group.position = { latitude: mode === "gps" ? 0.001 : 3, longitude: 0 };
    assert.deepEqual(triggerAutonomousHeroAttacks(f.game, ids), []);
    group.position = { latitude: 0, longitude: 0 };
    const started = triggerAutonomousHeroAttacks(f.game, ids);
    assert.equal(started.length, 1);
    assert.deepEqual(triggerAutonomousHeroAttacks(f.game, ids), []);
    const battle = f.game.battles[0];
    battle.duel.players[0].hero.attack = 1000;
    battle.duel.encounter.twist = { id: "NO_TECHNIQUE" };
    battle.duel.encounter.terrain = { id: "PLAIN" };
    battle.duel.encounter.weather = { id: "DRY" };
    for (const team of battle.teams)
      battle.submitDuelChoice(team.id, { cards: ["HERO"] });
    for (const team of battle.teams) battle.lockDuelChoice(team.id);
    assert.equal(battle.status, "finished");
    f.game.resolveBattle(battle.id);
    return {
      duel: battle.duel,
      hero: heroState(f.hero),
      groupStatus: group.status,
    };
  });
  assert.deepEqual(runs[0], runs[1]);
});

test("une quête réelle conserve choix, effets et progression en GPS et simulation", () => {
  const runs = ["gps", "simulation"].map((mode) => {
    const f = fixture(mode);
    const game = new Game({
      setup: { ...f.game.setup.toJSON(), scenarioId: "granaries_of_the_king" },
      coordinateMode: mode,
      scenario: (() => {
        const moduleScenario = load("scenarios/granaries-of-the-king");
        return { ...moduleScenario, locationSlots: [...moduleScenario.locationSlots, { id: "capital-resource-gold-village", type: "village", defaultPlacement: { strategy: "fixed" } }] };
      })(),
      now: () => 1000,
      locations: [
        {
          id: "capital-real",
          name: "Capitale",
          type: "capital",
          source: "scenario",
          position: { latitude: 0, longitude: 0 },
        },
        {
          id: "capital-resource-gold-village",
          name: "Aurive",
          type: "village",
          source: "scenario",
          position: { latitude: 0, longitude: 0 },
          state: "supplied",
          ownerId: "kingdom",
          population: 32,
          resources: { stock: { food: 5 }, storageCapacity: 60 },
        },
        {
          id: "requisition-convoy",
          name: "Convoi",
          type: "event_location",
          source: "scenario",
          position: { latitude: 0, longitude: 0 },
        },
        {
          id: "counsellor-guard-depot",
          name: "Dépôt",
          type: "depot",
          source: "scenario",
          position: { latitude: 0, longitude: 0 },
          resources: { stock: { food: 0 }, storageCapacity: 100 },
        },
      ],
      scenarioLocationBindings: [
        { locationSlotId: "capital", locationId: "capital-real" },
        ...[
          "capital-resource-gold-village",
          "requisition-convoy",
          "counsellor-guard-depot",
        ].map((id) => ({ locationSlotId: id, locationId: id })),
      ],
    });
    game.dispatchQuestEvent({
      type: "LocationEntered",
      locationId: "capital-resource-gold-village",
    });
    const choices = game.getQuestChoices();
    game.selectQuestChoice("ENFORCE_REQUISITION");
    game.dispatchQuestEvent({
      type: "BattleWon",
      locationId: "capital-resource-gold-village",
    });
    assert.equal(
      game.getLocation("capital-resource-gold-village").resources.stock.food,
      0,
    );
    assert.equal(
      game.getLocation("counsellor-guard-depot").resources.stock.food,
      5,
    );
    return {
      choices,
      scenario: game.scenarioState.toJSON(),
      world: game.worldState.toJSON(),
    };
  });
  assert.deepEqual(runs[0], runs[1]);
});

test("le serveur prépare les quêtes du catalogue pour le test solo sans accepter un catalogue client", () => {
  const f = fixture("simulation");
  const scenario = {
    id: "chaos",
    name: "Test",
    intro: "Test",
    initialPhaseId: "start",
    phases: [
      { id: "start", title: "Test", description: "Test", objectives: [] },
    ],
  };
  const game = new Game({
    setup: f.game.setup,
    coordinateMode: "simulation",
    scenario,
    heroClasses: classes,
    unitDefinitions: definitions,
    locations: load("locations"),
    scenarioStartsActive: false,
  });
  const hero = game.chooseHero("player", {
    name: "Testeur",
    classId: "warrior",
  });
  hero.updatePosition({ latitude: 0, longitude: 0 });
  game.chooseHero("bandits", { name: "Brigand", classId: "warrior" });
  game.configureQuestSequence([
    {
      id: "test-quest",
      title: "Test",
      description: "Test",
      startPhaseId: scenario.initialPhaseId,
      phaseIds: [scenario.initialPhaseId],
    },
  ]);
  game.start();
  f.service.bootstrapGame({
    token: f.solo.session.token,
    snapshot: game.toJSON(),
  });
  const result = f.command("prepareTestQuest", [
    { playerId: "player", heroId: hero.id, questId: "test-quest" },
  ]);
  assert.equal(result.success, true);
  assert.equal(f.state().availableQuests[0].id, "test-quest");
  assert.equal(
    f.command("prepareTestQuest", [
      { playerId: "player", heroId: hero.id, questId: "invented" },
    ]).reason,
    "quest_not_found",
  );
  assert.throws(
    () =>
      f.command("prepareTestQuest", [
        { playerId: "other", heroId: hero.id, questId: "test-quest" },
      ]),
    (error) => error.code === "command_forbidden",
  );
  const gps = fixture("gps");
  gps.bootstrap();
  assert.throws(
    () =>
      gps.command("prepareTestQuest", [{ ...gps.input, questId: "invented" }]),
    (error) => error.code === "command_forbidden",
  );
  assert.equal(SERVER_GAME_COMMANDS.has("prepareTestQuest"), true);
});
