import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Hero } from "../app/js/core/hero.js";
import { RepressionQuest } from "../app/js/core/repression-quest.js";
import { Army } from "../app/js/core/army.js";
import { Game } from "../app/js/core/game.js";

const scenario = JSON.parse(
  readFileSync(
    new URL("../data/scenarios/repression.json", import.meta.url),
    "utf8",
  ),
);
const playArea = {
  id: "repression-area",
  name: "Zone",
  polygon: [
    { latitude: 0, longitude: 0 },
    { latitude: 0, longitude: 1 },
    { latitude: 1, longitude: 0 },
  ],
};
const setup = {
  id: "repression-setup",
  name: "Répression",
  mode: "quick",
  scenarioId: "repression",
  playerCount: 1,
  playArea,
  participants: [{ playerId: "local", name: "Joueur" }],
};
const locations = [
  {
    id: "capital-real",
    name: "Capitale",
    type: "capital",
    source: "scenario",
    position: { latitude: 0.01, longitude: 0.01 },
    visibility: "discovered",
  },
  {
    id: "village-real",
    name: "Village séditieux",
    type: "village",
    source: "scenario",
    position: { latitude: 0.02, longitude: 0.02 },
    state: "besieged",
    ownerId: "ruined_knight",
    population: null,
    features: { battle: true, recruitment: true },
    recruitment: {
      availableUnitTypeIds: ["militia"],
      capacity: 8,
      stock: { militia: 8 },
    },
    improvements: [
      {
        id: "manor",
        type: "defensive",
        defenseBonus: 2,
        militiaCapacityBonus: 4,
        destroyed: false,
      },
    ],
    garrison: { units: [] },
  },
  {
    id: "convoy-real",
    name: "Vestiges du convoi",
    type: "event_location",
    source: "scenario",
    position: { latitude: 0.03, longitude: 0.03 },
    visibility: "hidden",
  },
  {
    id: "brigands-real",
    name: "Camp des brigands",
    type: "brigand_camp",
    source: "scenario",
    position: { latitude: 0.04, longitude: 0.04 },
    visibility: "hidden",
  },
];
const bindings = [
  { locationSlotId: "capital", locationId: "capital-real" },
  { locationSlotId: "seditious-village", locationId: "village-real" },
  { locationSlotId: "attacked-convoy", locationId: "convoy-real" },
  { locationSlotId: "brigand-camp-convoy", locationId: "brigands-real" },
];

function createRawGame() {
  const game = new Game({
    setup,
    scenario,
    locations,
    scenarioLocationBindings: bindings,
    coordinateMode: "gps",
  });
  const hero = new Hero({
    id: "test-hero",
    playerId: "local",
    name: "Joueur",
    position: locations[1].position,
  });
  game.heroes.push(hero);
  game.getPlayer("local").addHero(hero.id);
  return game;
}
function createGame() {
  const game = createRawGame();
  game.dispatchQuestEvent({
    type: "LocationPlaced",
    locationSlotId: "seditious-village",
    locationId: "village-real",
  });
  game.selectQuestChoice("TALK_PROVOST");
  return game;
}
function win(game, locationId = "village-real") {
  return game.dispatchQuestEvent({ type: "BattleWon", locationId });
}
function discoverConvoy(game) {
  game.dispatchQuestEvent({
    type: "LocationPlaced",
    locationSlotId: "attacked-convoy",
    locationId: "convoy-real",
  });
}

test("le placement réserve 50 m aux autres lieux et 30 m entre prévôt et village", () => {
  const game = createRawGame();
  const origin = { latitude: 0.015, longitude: 0.015 };
  const placement = game.scenarioRuntime.placements["seditious-village"];
  placement.status = "ready";
  assert.equal(
    game.placeScenarioLocation({
      locationSlotId: "seditious-village",
      position: locations[0].position,
    }).success,
    false,
  );
  const result = game.placeScenarioLocation({
    locationSlotId: "seditious-village",
    position: origin,
  });
  assert.equal(result.success, true);
  const group = game.getAutonomousGroup("repression-provost");
  assert.ok(
    Math.abs(
      RepressionQuest.distance(game, group.position, result.position) - 30,
    ) < 0.1,
  );
  assert.equal(group.owner.id, "kingdom");
  assert.equal(group.army.units[0].rank, "sergeant");
  assert.equal(group.army.units[0].typeId, "heavy-infantry");
  assert.ok(group.commander.maxCommandPoints >= 3);
  assert.equal(game.getLocation("village-real").ownerId, null);
});

test("parler au prévôt exige sa proximité et le village ne propose aucune action avant", () => {
  const game = createRawGame();
  game.dispatchQuestEvent({
    type: "LocationPlaced",
    locationSlotId: "seditious-village",
    locationId: "village-real",
  });
  const hero = game.heroes[0];
  hero.updatePosition(locations[0].position);
  assert.equal(game.selectQuestChoice("TALK_PROVOST").success, false);
  for (const action of ["attack", "talkChief", "recruit"])
    assert.equal(
      game.canPerformLocationAction({
        playerId: "local",
        locationId: "village-real",
        action,
      }),
      false,
    );
  hero.updatePosition(locations[1].position);
  assert.equal(game.selectQuestChoice("TALK_PROVOST").success, true);
  assert.deepEqual(
    game.getQuestChoices().map((c) => c.label),
    ["Capturer au nom du prévôt", "Négocier avec le chef"],
  );
});

test("le repli au Manoir retire un soldat et blesse 25 % avant le combat", () => {
  const game = createGame(),
    hero = game.heroes[0];
  hero.army.addUnit({
    id: "troop",
    ownerPlayerId: "local",
    typeId: "militia",
    quantity: 10,
    rank: "corporal",
  });
  game.selectQuestChoice("NEGOTIATE");
  game.selectQuestChoice("INVESTIGATE");
  assert.equal(game.worldState.getNpc("royal_provost").relation, -1);
  game.selectQuestChoice("DEFEND_VILLAGE");
  assert.equal(hero.army.units[0].quantity, 9);
  assert.equal(hero.army.units[0].woundedCount, 3);
  assert.equal(game.selectQuestChoice("DEFEND_VILLAGE").success, false);
  assert.equal(hero.army.units[0].quantity, 9);
});

for (const defense of [false, true])
  test(`défaite contre ${defense ? "le prévôt" : "le village"} : retour sans convoi, prison et libération solo`, () => {
    const game = createGame(),
      hero = game.heroes[0];
    if (defense) {
      game.selectQuestChoice("NEGOTIATE");
      game.selectQuestChoice("INVESTIGATE");
      game.selectQuestChoice("DEFEND_VILLAGE");
    } else game.selectQuestChoice("ASSAULT_VILLAGE");
    const failure = game.dispatchQuestEvent({
      type: "BattleLost",
      locationId: "village-real",
      actorId: hero.id,
    });
    assert.equal(failure.nextPhaseId, "repression-failed-return");
    assert.equal(hero.state, defense ? "ghost" : "active");
    discoverConvoy(game);
    assert.equal(game.worldState.get("repression.convoyDiscovered"), null);
    assert.deepEqual(game.getQuestChoices(), []);
    hero.resources.gold = 30;
    const result = game.dispatchQuestEvent({
      type: "LocationEntered",
      locationId: "capital-real",
      actorId: hero.id,
    });
    assert.equal(game.worldState.get("repression.released"), true);
    assert.equal(
      game.worldState.get("repression.escapeCapitalAvailable"),
      true,
    );
    assert.deepEqual(hero.resources, {});
    assert.equal(hero.state, "active");
    assert.equal(hero.army.units.length, 1);
    assert.equal(hero.army.units[0].typeId, "militia");
    assert.ok(
      result.appliedEvents
        .flatMap((e) => e.appliedEffects)
        .some((e) => e.scene === "prison"),
    );
    game.dispatchQuestEvent({
      type: "LocationEntered",
      locationId: "capital-real",
      actorId: hero.id,
    });
    assert.equal(hero.army.units.length, 1);
  });

test("le convoi se déclenche automatiquement à un quart du trajet, sans objectif supplémentaire", () => {
  const game = createGame();
  game.selectQuestChoice("ASSAULT_VILLAGE");
  win(game);
  const origin = locations[1].position;
  const placement = game.scenarioRuntime.placements["attacked-convoy"];
  assert.ok(
    Math.abs(
      placement.minimumDistanceMeters -
        RepressionQuest.distance(game, origin, locations[0].position) * 0.25,
    ) < 0.01,
  );
  game.startCurrentScenarioPlacements(origin);
  game.updateScenarioPosition({
    position: { latitude: 0.019, longitude: 0.019 },
    accuracy: 3,
  });
  assert.equal(game.worldState.get("repression.convoyDiscovered"), null);
  const updates = game.updateScenarioPosition({
    position: { latitude: 0.0174, longitude: 0.0174 },
    accuracy: 3,
  });
  assert.ok(updates.some((u) => u.quest));
  assert.equal(game.worldState.get("repression.convoyDiscovered"), true);
  assert.equal(game.getActiveQuest().objectives.length, 1);
  game.selectQuestChoice("IGNORE_CONVOY");
  assert.equal(game.getLocation("convoy-real").state, "dismissed");
  assert.equal(game.getLocation("convoy-real").visibility, "hidden");
});

test("la prison attend tous les participants, bloque la résurrection et survit au rechargement", () => {
  const multiSetup = {
    ...setup,
    playerCount: 2,
    participants: [...setup.participants, { playerId: "p2", name: "Second" }],
  };
  let game = new Game({
    setup: multiSetup,
    scenario,
    locations,
    scenarioLocationBindings: bindings,
  });
  for (const id of ["local", "p2"]) {
    const h = new Hero({
      id: `hero-${id}`,
      playerId: id,
      name: id,
      position: locations[1].position,
    });
    game.heroes.push(h);
    game.getPlayer(id).addHero(h.id);
  }
  game.activeQuestActorId = "hero-local";
  game.dispatchQuestEvent({
    type: "LocationPlaced",
    locationSlotId: "seditious-village",
    locationId: "village-real",
  });
  game.selectQuestChoice("TALK_PROVOST");
  game.selectQuestChoice("NEGOTIATE");
  game.selectQuestChoice("INVESTIGATE");
  game.selectQuestChoice("DEFEND_VILLAGE");
  win(game);
  assert.equal(game.getLocation("village-real").ownerId, null);
  game.dispatchQuestEvent({
    type: "LocationEntered",
    locationId: "capital-real",
    actorId: "hero-local",
  });
  assert.equal(game.scenarioState.currentPhaseId, "repression-prison");
  assert.equal(game.getHero("hero-local").state, "ghost");
  assert.equal(
    game.reviveHeroAtBase({ heroId: "hero-local", locationId: "capital-real" })
      .reason,
    "repression_prisoner",
  );
  const snapshot = game.toJSON();
  game = new Game({
    setup: snapshot.setup,
    scenario: snapshot.scenario,
    locations: snapshot.locations,
    scenarioLocationBindings: snapshot.scenarioLocationBindings,
    scenarioStateSnapshot: snapshot.scenarioState,
    worldStateSnapshot: snapshot.worldState,
    scenarioRuntimeSnapshot: snapshot.scenarioRuntime,
  });
  game.heroes = snapshot.heroes.map((h) => new Hero(h));
  game.dispatchQuestEvent({
    type: "LocationEntered",
    locationId: "capital-real",
    actorId: "hero-p2",
  });
  assert.equal(game.worldState.get("repression.released"), true);
  for (const h of game.heroes) {
    assert.equal(h.state, "active");
    assert.equal(h.army.units.length, 1);
  }
});

for (const defense of [false, true])
  test(`les armées et leurs héros sont dans les bons camps : ${defense ? "défense" : "assaut"}`, () => {
    const unitDefinitions = JSON.parse(
      readFileSync(new URL("../data/units.json", import.meta.url), "utf8"),
    );
    const game = new Game({
      setup,
      scenario,
      locations,
      scenarioLocationBindings: bindings,
      unitDefinitions,
    });
    const hero = new Hero({
      id: "hero-local",
      playerId: "local",
      name: "Joueur",
      position: locations[1].position,
    });
    game.heroes.push(hero);
    game.getPlayer("local").addHero(hero.id);
    game.getLocation("village-real").garrison = new Army({
      units: [
        {
          id: "militia-knight",
          ownerPlayerId: "ruined_knight",
          typeId: "militia",
          rank: "corporal",
          quantity: 8,
        },
      ],
    });
    game.dispatchQuestEvent({
      type: "LocationPlaced",
      locationSlotId: "seditious-village",
      locationId: "village-real",
    });
    game.selectQuestChoice("TALK_PROVOST");
    if (defense) {
      game.selectQuestChoice("NEGOTIATE");
      game.selectQuestChoice("INVESTIGATE");
      game.selectQuestChoice("DEFEND_VILLAGE");
    } else game.selectQuestChoice("ASSAULT_VILLAGE");
    game.status = "started";
    const battle = game.createBattle({
      sourceLocationId: "village-real",
      teamParticipants: [
        { id: "heroes", heroIds: [hero.id] },
        { id: "bandits", locationId: "village-real" },
      ],
    });
    const ours = battle.teams.find((t) => t.id === "heroes"),
      enemy = battle.teams.find((t) => t.id === "bandits");
    assert.equal(ours.heroes.length, 2);
    assert.equal(enemy.heroes.length, 1);
    assert.ok(
      ours.heroes.some(
        (h) =>
          h.sourceId ===
          `autonomous-group-repression-${defense ? "knight" : "provost"}`,
      ),
    );
    assert.equal(ours.units[0].typeId, defense ? "militia" : "heavy-infantry");
    assert.equal(enemy.units[0].typeId, defense ? "heavy-infantry" : "militia");
    assert.equal(
      battle.teams
        .flatMap((t) => t.units)
        .filter((u) => u.sourceId === "militia-knight").length,
      1,
    );
  });

test("le village est généré puis son entrée présente la situation avant les choix", () => {
  const game = createRawGame();
  assert.equal(game.scenarioState.currentPhaseId, "locate-village");
  assert.deepEqual(game.getQuestChoices(), []);
  const located = game.dispatchQuestEvent({
    type: "LocationPlaced",
    locationSlotId: "seditious-village",
    locationId: "village-real",
  });
  assert.equal(located.nextPhaseId, "village-arrival");
  assert.match(
    located.appliedEvents[0].appliedEffects.find(
      ({ type }) => type === "narration",
    ).text,
    /palissades de Montfaucon/i,
  );
  assert.deepEqual(
    game.getQuestChoices().map((c) => c.id),
    ["TALK_PROVOST"],
  );
  assert.equal(
    game.dispatchQuestEvent({
      type: "LocationEntered",
      locationId: "village-real",
    }),
    null,
  );
  const entered = game.selectQuestChoice("TALK_PROVOST");
  assert.equal(entered.nextPhaseId, "arrival");
  assert.match(
    entered.appliedEvent.appliedEffects.find(({ type }) => type === "narration")
      .text,
    /agir au nom de la Couronne/i,
  );
  assert.deepEqual(
    game.getQuestChoices().map(({ id }) => id),
    ["ASSAULT_VILLAGE", "NEGOTIATE"],
  );
});

test("l'assaut immédiat détruit réellement le Manoir et permet un retour direct", () => {
  const game = createGame();
  const village = game.getLocation("village-real");
  assert.equal(village.defenseBonus, 2);
  assert.equal(village.militiaCapacity, 12);
  const defendedBattle = game.battleService.createBattle({
    id: "manor-before",
    game,
    teamParticipants: [
      { id: "attackers", locationId: "capital-real" },
      { id: "defenders", locationId: "village-real" },
    ],
    now: 0,
  });
  assert.equal(
    defendedBattle.teams.find(({ id }) => id === "defenders").heroes[0].defense,
    8,
  );
  const assault = game.selectQuestChoice("ASSAULT_VILLAGE");
  assert.equal(assault.nextPhaseId, "royal-assault");
  assert.match(
    assault.appliedEvent.appliedEffects.find(({ type }) => type === "narration")
      .text,
    /trompes royales/i,
  );
  const victory = win(game);
  assert.match(
    victory.appliedEvents[0].appliedEffects.find(
      ({ type }) => type === "narration",
    ).text,
    /goût de cendre/i,
  );
  assert.equal(game.worldState.getNpc("ruined_knight").status, "dead");
  assert.equal(village.state, "royal_control");
  assert.equal(village.getImprovement("manor").destroyed, true);
  assert.equal(village.defenseBonus, 0);
  assert.equal(village.militiaCapacity, 8);
  const ruinedBattle = game.battleService.createBattle({
    id: "manor-after",
    game,
    teamParticipants: [
      { id: "attackers", locationId: "capital-real" },
      { id: "defenders", locationId: "village-real" },
    ],
    now: 0,
  });
  assert.equal(
    ruinedBattle.teams.find(({ id }) => id === "defenders").heroes[0].defense,
    6,
  );
  const result = game.dispatchQuestEvent({
    type: "LocationEntered",
    locationId: "capital-real",
  });
  assert.equal(result.completedObjectiveIds[0], "return-capital");
  assert.equal(game.worldState.get("repression.questCompleted"), true);
  const report = game.eventLog.find(
    (entry) => entry.type === "scenario_report",
  );
  assert.match(report.text, /chevalier est mort/i);
  assert.doesNotMatch(report.text, /inconnu/i);
  assert.equal(game.worldState.get("repression.knightStatus"), "dead");
  assert.equal(game.worldState.get("repression.knightGrade"), 1);
});

test("la défense conserve le Manoir et donner le trésor augmente le grade du chevalier", () => {
  const game = createGame();
  game.selectQuestChoice("NEGOTIATE");
  game.selectQuestChoice("INVESTIGATE");
  game.selectQuestChoice("DEFEND_VILLAGE");
  win(game);
  assert.equal(game.worldState.getNpc("ruined_knight").status, "ally");
  assert.equal(
    game.getLocation("village-real").getImprovement("manor").destroyed,
    false,
  );
  discoverConvoy(game);
  game.selectQuestChoice("INSPECT_CONVOY");
  game.dispatchQuestEvent({
    type: "TraceInspected",
    traceId: "convoy-trace-1",
  });
  game.dispatchQuestEvent({
    type: "TraceInspected",
    traceId: "convoy-trace-2",
  });
  game.selectQuestChoice("ATTACK_CAMP");
  win(game, "brigands-real");
  assert.equal(
    game.getQuestChoices().some(({ id }) => id === "GIVE_TREASURE_TO_KNIGHT"),
    true,
  );
  game.selectQuestChoice("GIVE_TREASURE_TO_KNIGHT");
  assert.equal(game.worldState.getNpc("ruined_knight").grade, 2);
  assert.equal(game.worldState.get("repression.treasureChoice"), "knight");
  assert.equal(
    game.toJSON().worldState.npcs.find(({ id }) => id === "ruined_knight")
      .grade,
    2,
  );
});

test("laisser faire rend le chevalier fugitif et l'enquête reste facultative", () => {
  const game = createGame();
  game.selectQuestChoice("NEGOTIATE");
  game.selectQuestChoice("INVESTIGATE");
  game.selectQuestChoice("STAND_ASIDE");
  game.selectQuestChoice("CONTINUE");
  assert.equal(game.worldState.getNpc("ruined_knight").status, "fugitive");
  game.dispatchQuestEvent({
    type: "LocationEntered",
    locationId: "capital-real",
  });
  assert.equal(game.worldState.get("repression.questCompleted"), true);
  assert.equal(
    game.getTrailState("convoy-raiders-trail").status,
    "not_started",
  );
});

test("la piste impose l'ordre de ses points et révèle le camp à son terme", () => {
  const game = createGame();
  game.selectQuestChoice("ASSAULT_VILLAGE");
  win(game);
  assert.equal(game.getQuestChoices().length, 0);
  discoverConvoy(game);
  const inspection = game.selectQuestChoice("INSPECT_CONVOY");
  assert.match(
    inspection.appliedEvent.appliedEffects.find(
      ({ type }) => type === "narration",
    ).text,
    /piste fraîche/i,
  );
  assert.equal(
    game.dispatchQuestEvent({
      type: "TraceInspected",
      traceId: "convoy-trace-2",
    }),
    null,
  );
  const firstTrace = game.dispatchQuestEvent({
    type: "TraceInspected",
    traceId: "convoy-trace-1",
  });
  assert.match(
    firstTrace.appliedEvents[0].appliedEffects.find(
      ({ type }) => type === "narration",
    ).text,
    /fibres de toile royale/i,
  );
  const secondTrace = game.dispatchQuestEvent({
    type: "TraceInspected",
    traceId: "convoy-trace-2",
  });
  assert.match(
    secondTrace.appliedEvents[0].appliedEffects.find(
      ({ type }) => type === "narration",
    ).text,
    /fumée basse/i,
  );
  assert.equal(game.getTrailState("convoy-raiders-trail").status, "completed");
  assert.equal(game.getLocation("brigands-real").visibility, "discovered");
});

test("une défaite au camp ne bloque pas le retour à la capitale", () => {
  const game = createGame();
  game.selectQuestChoice("ASSAULT_VILLAGE");
  win(game);
  discoverConvoy(game);
  game.selectQuestChoice("INSPECT_CONVOY");
  game.dispatchQuestEvent({
    type: "TraceInspected",
    traceId: "convoy-trace-1",
  });
  game.dispatchQuestEvent({
    type: "TraceInspected",
    traceId: "convoy-trace-2",
  });
  game.selectQuestChoice("ATTACK_CAMP");
  const result = game.dispatchQuestEvent({
    type: "BattleLost",
    locationId: "brigands-real",
  });
  assert.equal(result.nextPhaseId, "return-after-investigation");
  assert.equal(game.worldState.get("repression.brigandTruthKnown"), false);
  assert.match(
    result.appliedEvent.appliedEffects.find(({ type }) => type === "narration")
      .text,
    /repoussent hors du vallon/i,
  );
});

test("l'état critique de la quête, des PNJ, du Manoir et de la piste se recharge", () => {
  const game = createGame();
  game.selectQuestChoice("NEGOTIATE");
  game.selectQuestChoice("INVESTIGATE");
  game.selectQuestChoice("DEFEND_VILLAGE");
  win(game);
  discoverConvoy(game);
  game.selectQuestChoice("INSPECT_CONVOY");
  game.dispatchQuestEvent({
    type: "TraceInspected",
    traceId: "convoy-trace-1",
  });
  const snapshot = game.toJSON();
  const restored = new Game({
    setup: snapshot.setup,
    scenario: snapshot.scenario,
    locations: snapshot.locations,
    scenarioLocationBindings: snapshot.scenarioLocationBindings,
    coordinateMode: "gps",
    scenarioStateSnapshot: snapshot.scenarioState,
    worldStateSnapshot: snapshot.worldState,
    trailStateSnapshots: snapshot.trailStates,
    scenarioRuntimeSnapshot: snapshot.scenarioRuntime,
  });
  assert.equal(restored.scenarioState.currentPhaseId, "convoy-trace-two");
  assert.equal(restored.worldState.getNpc("ruined_knight").status, "ally");
  assert.deepEqual(
    restored.getTrailState("convoy-raiders-trail").inspectedTraceIds,
    ["convoy-trace-1"],
  );
  assert.equal(
    restored.getLocation("village-real").getImprovement("manor").destroyed,
    false,
  );
  restored.dispatchQuestEvent({
    type: "TraceInspected",
    traceId: "convoy-trace-2",
  });
  assert.equal(
    restored.getTrailState("convoy-raiders-trail").status,
    "completed",
  );
});
