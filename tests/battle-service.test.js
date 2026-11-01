import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { AutonomousGroup } from "../app/js/core/autonomous-group.js";

test("les récompenses tactiques différées sont attribuées une seule fois avec le butin de victoire", () => {
  let nextId = 1;
  const game = new Game({
    setup,
    heroClasses,
    unitDefinitions: [definition],
    tacticalBattles: true,
    idGenerator: (prefix) => `${prefix}-${nextId++}`,
  });
  const first = game.chooseHero("p1", { name: "A", classId: "fighter" });
  const second = game.chooseHero("p2", { name: "B", classId: "fighter" });
  game.start();
  const battle = game.createBattle({
    teamParticipants: [
      { id: "red", heroIds: [first.id] },
      { id: "blue", heroIds: [second.id] },
    ],
  });
  battle.duel.tactics.bonuses.claims = [
    { id: "test", ownerId: "red", itemId: "iron_sword" },
  ];
  battle.duel.players[0].spoils.xp = 10;
  battle.duel.players[0].hero.attack = 10000;
  battle.duel.tactics.positions["HERO:red"] = { x: 0, y: 0 };
  battle.duel.tactics.options["HERO:red"].base = true;
  battle.submitDuelChoice("red", {
    orders: [{ actorId: "HERO:red", type: "ATTACK_BASE" }],
  });
  battle.submitDuelChoice("blue", { orders: [] });
  battle.lockDuelChoice("red");
  battle.lockDuelChoice("blue");
  assert.equal(battle.status, "finished");
  const report = game.resolveBattle(battle.id);
  assert.ok(
    report.battleLoot.entries.some((entry) => entry.itemId === "iron_sword"),
  );
  assert.equal(
    report.duelSpoils.find((entry) => entry.heroId === first.id).xp,
    10,
  );
  const experience = first.experience;
  assert.deepEqual(game.resolveBattle(battle.id), report);
  assert.equal(first.experience, experience);
  assert.equal(
    game.battleReports.filter(
      (entry) =>
        entry.battleId === battle.id && Array.isArray(entry.heroProgression),
    ).length,
    1,
  );
});

const definition = {
  id: "militia",
  maxQuantity: 10,
  stats: {
    attack: 4,
    defense: 2,
    range: 1,
    speed: 2,
    healthPerSoldier: 8,
    combatHealthThreshold: 3,
  },
};
const setup = {
  id: "s",
  name: "Partie",
  mode: "quick",
  scenarioId: "chaos",
  playerCount: 2,
  playArea: {
    id: "a",
    name: "A",
    polygon: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
      { latitude: 1, longitude: 0 },
    ],
  },
  participants: [
    { playerId: "p1", name: "A" },
    { playerId: "p2", name: "B" },
  ],
};
const heroClasses = [{ id: "fighter", name: "Combattant", abilityIds: [] }];

test("une bataille applique les survivants et l'état ghost au monde", () => {
  let nextId = 1;
  const game = new Game({
    setup,
    heroClasses,
    unitDefinitions: [definition],
    idGenerator: (prefix) => `${prefix}-${nextId++}`,
  });
  const first = game.chooseHero("p1", { name: "A", classId: "fighter" });
  const second = game.chooseHero("p2", { name: "B", classId: "fighter" });
  game.start();
  const battle = game.createBattle({
    config: { ambushTeamId: "red" },
    teamParticipants: [
      {
        id: "red",
        heroIds: [first.id],
        positions: { [first.id]: { x: 1, y: 1 } },
      },
      {
        id: "blue",
        heroIds: [second.id],
        positions: { [second.id]: { x: 2, y: 1 } },
      },
    ],
  });
  assert.equal(battle.duel.ambush.attackerTeamId, "red");
  assert.equal(battle.duel.ambush.expiresAfterRound, 1);
  const restored = Game.fromJSON(game.toJSON());
  assert.deepEqual(restored.battles[0].duel.ambush, battle.duel.ambush);
  battle.duel.players[0].hero.attack = 1000;
  battle.duel.encounter.twist = { id: "NO_TECHNIQUE" };
  battle.duel.encounter.terrain = { id: "PLAIN" };
  battle.duel.encounter.weather = { id: "DRY" };
  battle.submitDuelChoice("red", { cards: ["HERO"] });
  battle.submitDuelChoice("blue", { cards: ["HERO"] });
  battle.lockDuelChoice("red");
  battle.lockDuelChoice("blue");
  assert.equal(battle.status, "finished");
  game.resolveBattle(battle.id);
  assert.equal(game.getHero(second.id).state, "ghost");
  assert.equal(game.getHero(second.id).health, 0);
});

test("la défaite du héros en duel termine la bataille malgré ses troupes", () => {
  let nextId = 1;
  const game = new Game({
    setup,
    heroClasses: heroClasses.map((heroClass) => ({
      ...heroClass,
      startingUnits: [{ typeId: "militia", quantity: 5 }],
    })),
    unitDefinitions: [definition],
    idGenerator: (prefix) => `${prefix}-${nextId++}`,
  });
  const first = game.chooseHero("p1", { name: "A", classId: "fighter" });
  const second = game.chooseHero("p2", { name: "B", classId: "fighter" });
  game.start();
  const battle = game.createBattle({
    teamParticipants: [
      { id: "red", heroIds: [first.id] },
      { id: "blue", heroIds: [second.id] },
    ],
  });
  battle.duel.players[0].hero.health = 1;
  battle.duel.encounter.twist = { id: "NO_TECHNIQUE" };
  const troopsBefore = structuredClone(battle.duel.troops);
  battle.submitDuelChoice("red", { cards: [] });
  battle.lockDuelChoice("red");
  battle.submitDuelChoice("blue", { cards: ["HERO"] });
  battle.lockDuelChoice("blue");
  assert.equal(battle.duel.phase, "FINISHED");
  assert.equal(battle.status, "finished");
  assert.equal(battle.winnerTeamId, "blue");
  assert.equal(battle.teams[0].heroes[0].state, "ghost");
  assert.ok(
    troopsBefore.some((troop) => troop.ownerId === "red" && troop.count > 0),
  );
  assert.deepEqual(battle.duel.troops, troopsBefore);
  const finished = battle.toJSON();
  battle.advanceDuel({ now: Date.now() + 60_000 });
  assert.deepEqual(battle.toJSON(), finished);
  game.resolveBattle(battle.id);
  assert.equal(game.getHero(first.id).state, "ghost");
});

test("les unités de garnison sont les défenseurs persistants de la bataille", () => {
  let nextId = 1;
  const game = new Game({
    setup,
    heroClasses,
    unitDefinitions: [definition],
    locations: [
      {
        id: "fort",
        name: "Fort",
        type: "fort",
        source: "scenario",
        position: { latitude: 0, longitude: 0 },
        ownerId: "p2",
        features: { capturable: true, garrison: true },
        garrison: {
          units: [
            {
              id: "fort-guard",
              ownerPlayerId: "p2",
              typeId: "militia",
              quantity: 6,
              rank: "soldier",
            },
          ],
        },
      },
    ],
    idGenerator: (prefix) => `${prefix}-${nextId++}`,
  });
  const attacker = game.chooseHero("p1", { name: "A", classId: "fighter" });
  game.chooseHero("p2", { name: "B", classId: "fighter" });
  game.start();
  const battle = game.createBattle({
    teamParticipants: [
      { id: "attackers", heroIds: [attacker.id] },
      { id: "defenders", heroIds: [], locationId: "fort" },
    ],
    sourceLocationId: "fort",
    sourceEnemyTeamId: "defenders",
  });
  assert.equal(battle.teams[1].units[0].sourceId, "fort-guard");
  assert.equal(battle.teams[1].units[0].typeId, "militia");
  assert.deepEqual(battle.teams[1].units[0].tags, []);
  assert.equal(battle.teams[1].units[0].quantity, 6);
  assert.deepEqual(battle.teams[1].units[0].soldierHealth, [8, 8, 8, 8, 8, 8]);
  assert.equal(battle.teams[1].heroes[0].sourceId, "location-fort");
});

test("les fortifications et la tour renforcent les défenseurs du lieu", () => {
  let nextId = 1;
  const game = new Game({
    setup,
    heroClasses,
    unitDefinitions: [definition],
    locations: [
      {
        id: "fortified",
        name: "Place",
        type: "town",
        source: "scenario",
        position: { latitude: 0, longitude: 0 },
        ownerId: "p2",
        infrastructure: { walls: 1, defense_tower: 2 },
        features: { garrison: true },
        garrison: {
          units: [
            {
              id: "guard",
              ownerPlayerId: "p2",
              typeId: "militia",
              quantity: 2,
              rank: "soldier",
            },
          ],
        },
      },
    ],
    idGenerator: (prefix) => `${prefix}-${nextId++}`,
  });
  const attacker = game.chooseHero("p1", { name: "A", classId: "fighter" });
  game.chooseHero("p2", { name: "B", classId: "fighter" });
  game.start();
  const battle = game.createBattle({
    teamParticipants: [
      { id: "a", heroIds: [attacker.id] },
      { id: "d", heroIds: [], locationId: "fortified" },
    ],
  });
  assert.equal(battle.teams[1].units[0].attack, definition.stats.attack + 5);
  assert.equal(battle.teams[1].units[0].defense, definition.stats.defense + 5);
});

test("une armée autonome reçoit un commandant tactique et ses unités persistantes", () => {
  let nextId = 1;
  const game = new Game({
    setup,
    heroClasses,
    unitDefinitions: [definition],
    idGenerator: (prefix) => `${prefix}-${nextId++}`,
  });
  const hero = game.chooseHero("p1", { name: "A", classId: "fighter" });
  game.chooseHero("p2", { name: "B", classId: "fighter" });
  const group = new AutonomousGroup({
    id: "chaos-army",
    type: "army",
    owner: { kind: "faction", id: "chaos" },
    position: { latitude: 0.1, longitude: 0.1 },
    behavior: "aggressive",
    mission: { kind: "roam" },
    army: {
      units: [
        {
          id: "chaos-unit",
          ownerPlayerId: "chaos",
          typeId: "militia",
          quantity: 5,
          healthPerSoldier: 8,
          combatHealthThreshold: 3,
        },
      ],
    },
  });
  game.addAutonomousGroup(group);
  game.start();
  const battle = game.createBattle({
    teamParticipants: [
      { id: "heroes", heroIds: [hero.id] },
      { id: "chaos", heroIds: [], autonomousGroupId: group.id },
    ],
    position: group.position,
  });
  assert.equal(
    battle.teams[1].heroes[0].sourceId,
    "autonomous-group-chaos-army",
  );
  assert.equal(battle.teams[1].units[0].sourceId, "chaos-unit");
  assert.equal(
    battle.teams[1].units[0].heroSourceId,
    "autonomous-group-chaos-army",
  );
});

test("une interception agressive crée automatiquement Battle", () => {
  let nextId = 1;
  const game = new Game({
    setup,
    heroClasses,
    unitDefinitions: [definition],
    idGenerator: (prefix) => `${prefix}-${nextId++}`,
  });
  const hero = game.chooseHero("p1", { name: "A", classId: "fighter" });
  game.chooseHero("p2", { name: "B", classId: "fighter" });
  hero.updatePosition({ latitude: 0.1, longitude: 0.101 });
  const group = new AutonomousGroup({
    id: "chaos-moving",
    type: "army",
    owner: { kind: "faction", id: "chaos" },
    position: { latitude: 0.1, longitude: 0.1 },
    behavior: "aggressive",
    mission: { kind: "roam" },
    army: {
      units: [
        {
          id: "chaos-moving-unit",
          ownerPlayerId: "chaos",
          typeId: "militia",
          quantity: 5,
          healthPerSoldier: 8,
          combatHealthThreshold: 3,
        },
      ],
    },
  });
  game.addAutonomousGroup(group);
  game.start();
  game.autonomousGroupService.movementService.start(group, {
    destination: { latitude: 0.1, longitude: 0.102 },
    speedMetersPerSecond: 2,
    now: 0,
  });
  const result = game.advanceAutonomousGroups(group.movement.arrivesAt);
  const event = result.events.find(
    (entry) => entry.type === "autonomous_group_attack_requested",
  );
  assert.ok(event.battleId);
  assert.equal(game.battles.length, 1);
  assert.equal(game.battles[0].teams[1].units[0].sourceId, "chaos-moving-unit");
});

test("une armée attaquant un camp engage les héros alliés présents", () => {
  let nextId = 1;
  const game = new Game({
    setup,
    heroClasses,
    unitDefinitions: [definition],
    locations: [
      {
        id: "royal-camp",
        name: "Camp royal",
        type: "camp",
        source: "scenario",
        position: { latitude: 0.1, longitude: 0.102 },
        ownerId: "kingdom",
        features: { garrison: true },
      },
    ],
    idGenerator: (prefix) => `${prefix}-${nextId++}`,
  });
  const hero = game.chooseHero("p1", { name: "A", classId: "fighter" });
  game.chooseHero("p2", { name: "B", classId: "fighter" });
  game.getLocation("royal-camp").addHero(hero.id);
  const group = new AutonomousGroup({
    id: "chaos-column",
    type: "army",
    owner: { kind: "faction", id: "chaos" },
    position: { latitude: 0.1, longitude: 0.1 },
    behavior: "aggressive",
    mission: {
      kind: "attack_location",
      targetId: "royal-camp",
      speedMetersPerSecond: 10,
    },
    army: {
      units: [
        {
          id: "chaos-column-unit",
          ownerPlayerId: "chaos",
          typeId: "militia",
          quantity: 5,
          healthPerSoldier: 8,
          combatHealthThreshold: 3,
        },
      ],
    },
  });
  game.addAutonomousGroup(group);
  game.start();
  game.advanceAutonomousGroups(0);
  const result = game.advanceAutonomousGroups(group.movement.arrivesAt);
  const event = result.events.find(
    (entry) => entry.type === "autonomous_group_location_attack_requested",
  );
  const battle = game.battles.find(
    (candidate) => candidate.id === event?.battleId,
  );
  assert.ok(battle);
  assert.equal(battle.teams[0].heroes[0].sourceId, hero.id);
  assert.equal(battle.teams[1].units[0].sourceId, "chaos-column-unit");
});
