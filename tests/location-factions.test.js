import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { Location } from "../app/js/core/location.js";
import { LocationAccessPolicy } from "../app/js/core/location-access-policy.js";
import { createSimulationLocations } from "../app/js/core/simulation-locations.js";

const participants = [
  { playerId: "p1", teamId: "blue" },
  { playerId: "p2", teamId: "blue" },
  { playerId: "p3", teamId: "red" },
];
const place = (ownerId) => ({
  id: "site",
  name: "Site",
  type: "village",
  source: "scenario",
  position: { latitude: 0.1, longitude: 0.102 },
  ownerId,
  features: { capturable: true, garrison: true },
});

test("matrice de capture des factions et des équipes", () => {
  for (const allowPvP of [false, true]) {
    const policy = new LocationAccessPolicy({
      participants,
      rules: { allowPvP },
    });
    for (const [actor, owner, expected] of [
      ["p1", null, true],
      ["p1", "neutral", true],
      ["p1", "chaos", true],
      ["p1", "kingdom", false],
      ["p1", "p1", false],
      ["p1", "p2", false],
      ["p1", "p3", allowPvP],
      ["chaos", null, true],
      ["chaos", "kingdom", true],
      ["chaos", "p1", true],
      ["chaos", "bandits", false],
      ["chaos", "chaos", false],
    ])
      assert.equal(
        policy.canCapture(actor, new Location(place(owner))),
        expected,
        `${actor} -> ${owner}, PvP=${allowPvP}`,
      );
  }
});

test("la simulation propose sept lieux neutres distincts et productifs", () => {
  const locations = createSimulationLocations().map(
    (entry) => new Location(entry),
  );
  assert.equal(
    new Set(locations.map((l) => JSON.stringify(l.position))).size,
    7,
  );
  assert.deepEqual(
    locations.flatMap((l) => Object.keys(l.resources.production)).sort(),
    ["gold", "iron", "stone", "wood"],
  );
  for (const type of ["camp", "village", "town"])
    assert.ok(locations.some((l) => l.type === type));
  for (const l of locations) {
    assert.equal(l.ownerId, null);
    assert.equal(l.features.capturable, true);
  }
});

function createGame(ownerId, guarded = false, allowPvP = false) {
  const location = place(ownerId);
  if (guarded)
    location.garrison = {
      units: [
        {
          id: "guard",
          ownerPlayerId: ownerId ?? "neutral",
          typeId: "militia",
          quantity: 2,
          healthPerSoldier: 8,
        },
      ],
    };
  const game = new Game({
    setup: {
      id: "s",
      name: "Test",
      mode: "quick",
      scenarioId: "test",
      playerCount: 3,
      participants,
      teams: [
        { id: "blue", name: "Bleus", factionId: "players-blue" },
        { id: "red", name: "Rouges", factionId: "players-red" },
      ],
      rules: { allowPvP },
      playArea: {
        id: "a",
        name: "Zone",
        polygon: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 1 },
          { latitude: 1, longitude: 0 },
        ],
      },
    },
    heroClasses: [{ id: "fighter", name: "Combattant", abilityIds: [] }],
    unitDefinitions: [
      {
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
      },
    ],
    locations: [location],
    autonomousGroups: [
      {
        id: "column",
        type: "army",
        owner: { kind: "faction", id: "chaos" },
        position: { latitude: 0.1, longitude: 0.1 },
        mission: {
          kind: "attack_location",
          targetId: "site",
          speedMetersPerSecond: 10,
        },
        army: {
          units: [
            {
              id: "raiders",
              ownerPlayerId: "chaos",
              typeId: "militia",
              quantity: 5,
              healthPerSoldier: 8,
            },
          ],
        },
      },
    ],
  });
  for (const p of participants)
    game.chooseHero(p.playerId, { name: p.playerId, classId: "fighter" });
  game.start();
  return game;
}

for (const owner of [null, "kingdom", "p1"])
  for (const guarded of [false, true]) {
    test(`capture PNJ et sérialisation : ${owner}, garnison=${guarded}`, () => {
      const game = createGame(owner, guarded);
      game.advanceAutonomousGroups(0);
      game.advanceAutonomousGroups(
        game.getAutonomousGroup("column").movement.arrivesAt,
      );
      if (guarded) {
        const battle = game.battles[0];
        assert.ok(battle);
        battle.status = "finished";
        battle.winnerTeamId = "autonomous-column";
        game.resolveBattle(battle.id);
      } else assert.equal(game.battles.length, 0);
      const site = game.getLocation("site");
      assert.equal(site.ownerId, "chaos");
      assert.equal(site.controllerId, "chaos");
      assert.equal(new Location(site.toJSON()).ownerId, "chaos");
      assert.equal(game.getLocationRelation("p1", "site"), "enemy");
    });
  }

test("un joueur ne capture un adversaire que si le PvP est actif", () => {
  for (const allowPvP of [false, true]) {
    const game = createGame("p3", false, allowPvP);
    const hero = game.heroes.find((h) => h.playerId === "p1");
    game.getLocation("site").addHero(hero.id);
    assert.equal(
      game.attemptLocationCapture({
        playerId: "p1",
        heroId: hero.id,
        locationId: "site",
      }).success,
      allowPvP,
    );
    assert.equal(game.getLocation("site").ownerId, allowPvP ? "p1" : "p3");
  }
});

test("la victoire d'un joueur capture le lieu et libère la garnison", () => {
  const game = createGame("chaos", true);
  const hero = game.heroes.find((h) => h.playerId === "p1");
  const battle = game.createBattle({
    teamParticipants: [
      { id: "attackers", heroIds: [hero.id] },
      { id: "defenders", locationId: "site" },
    ],
    sourceLocationId: "site",
    sourceEnemyTeamId: "defenders",
  });
  battle.status = "finished";
  battle.winnerTeamId = "attackers";
  game.resolveBattle(battle.id);
  const site = game.getLocation("site");
  assert.equal(site.ownerId, "p1");
  assert.equal(site.controllerId, "p1");
  assert.equal(site.garrison.units.length, 0);
  assert.equal(game.getLocationRelation("p2", "site"), "allied");
});

test("repousser une armée PNJ ne transfère pas le lieu royal au défenseur", () => {
  const game = createGame("kingdom", true);
  game.getLocation("site").features.battle = true;
  game
    .getLocation("site")
    .addHero(game.heroes.find((h) => h.playerId === "p1").id);
  game.advanceAutonomousGroups(0);
  game.advanceAutonomousGroups(
    game.getAutonomousGroup("column").movement.arrivesAt,
  );
  const battle = game.battles[0];
  battle.status = "finished";
  battle.winnerTeamId = "heroes";
  game.resolveBattle(battle.id);
  assert.equal(game.getLocation("site").ownerId, "kingdom");
  assert.equal(
    game.eventLog.filter((event) =>
      [
        "location_captured",
        "enemy_location_destroyed",
        "enemy_location_damaged",
      ].includes(event.type),
    ).length,
    0,
  );
});

test("les sites neutres de simulation laissent au moins 30 unités entre eux", () => {
  const sites = createSimulationLocations();
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) {
    assert.ok(Math.hypot(sites[i].position.latitude - sites[j].position.latitude, sites[i].position.longitude - sites[j].position.longitude) >= 30);
  }
});
