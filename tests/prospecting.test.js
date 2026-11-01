import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

function createGame() {
  let now = 1_000;
  let id = 0;
  const setup = {
    id: "prospecting",
    name: "Prospection",
    mode: "quick",
    scenarioId: "none",
    playerCount: 1,
    playArea: {
      id: "area",
      name: "Zone",
      polygon: [
        { latitude: -50, longitude: -50 },
        { latitude: -50, longitude: 50 },
        { latitude: 50, longitude: 50 },
        { latitude: 50, longitude: -50 },
      ],
    },
    participants: [{ playerId: "p1", name: "Joueur" }],
  };
  const locations = [
    {
      id: "camp",
      name: "Camp",
      type: "camp",
      source: "test",
      position: { latitude: 0, longitude: 0 },
      ownerId: "p1",
      controllerId: "p1",
      population: 20,
      infrastructure: { prospecting_post: 1 },
      resources: {
        storageCapacity: 50,
        stock: {
          specialist_geologist: 1,
          food: 12,
          beer: 4,
          horse: 2,
          exploration_tools: 2,
        },
      },
    },
  ];
  const resourceZones = [
    {
      id: "iron-zone",
      resourceId: "iron",
      locationType: "mine",
      position: { latitude: 0.2, longitude: 0.1 },
      discoveryRadius: 1,
      productionRate: 2,
    },
  ];
  const game = new Game({
    setup,
    heroClasses: [{ id: "scout", name: "Éclaireur", abilityIds: [] }],
    locations,
    resourceZones,
    coordinateMode: "simulation",
    now: () => now,
    idGenerator: (prefix) => `${prefix}-${++id}`,
    prospectingConfig: {
      minimumFood: 5,
      fixedCost: { beer: 2, horse: 1, exploration_tools: 1 },
      metersPerFood: 45,
      simulationUnitsPerFood: 1,
      spiralTurnsPerFood: 0.22,
      speedMetersPerSecond: 10,
    },
  });
  const hero = game.chooseHero("p1", { name: "A", classId: "scout" });
  game.start();
  hero.updatePosition({ latitude: 0, longitude: 0 });
  game.getLocation("camp").addHero(hero.id);
  return {
    game,
    hero,
    setNow: (value) => {
      now = value;
    },
    now: () => now,
  };
}

test("le poste paie et crée un groupe de prospection en spirale", () => {
  const { game, hero } = createGame();
  const result = game.createProspectingExpedition({
    playerId: "p1",
    heroId: hero.id,
    originLocationId: "camp",
    specialistId: "specialist_geologist",
    food: 5,
  });
  assert.equal(result.success, true);
  assert.equal(result.maximumRadius, 5);
  assert.deepEqual(game.getLocation("camp").resources.stock, {
    specialist_geologist: 0,
    food: 7,
    beer: 4,
    horse: 2,
    exploration_tools: 1,
  });
  const group = game.getAutonomousGroup(result.groupId);
  assert.equal(group.type, "prospecting");
  assert.equal(group.owner.id, "p1");
  assert.ok(group.mission.waypoints.length >= 6);
});

test("l’expédition révèle un gisement sans créer d’exploitation ni de récompense", () => {
  const { game, hero, setNow, now } = createGame();
  const { groupId } = game.createProspectingExpedition({
    playerId: "p1",
    heroId: hero.id,
    originLocationId: "camp",
    specialistId: "specialist_geologist",
    food: 5,
  });
  const group = game.getAutonomousGroup(groupId);
  game.advanceAutonomousGroups(now());
  setNow(group.movement.arrivesAt);
  game.advanceAutonomousGroups(now());
  const zone = game.resourceZones[0];
  assert.equal(zone.isDiscoveredBy("p1"), true);
  assert.equal(zone.locationId, null);
  assert.deepEqual(
    game.locations.map((location) => location.id),
    ["camp"],
  );
  assert.deepEqual(game.itemAcquisitionService.state.rewards, []);
  assert.deepEqual(
    game.getPlayer("p1").informationRecords.at(-1).locationIds,
    [],
  );
  assert.equal(
    game.getPlayer("p1").informationRecords.at(-1).kind,
    "prospecting_report",
  );
});

test("la mission boucle sur ses étapes, revient avec le spécialiste et survit à une sauvegarde", () => {
  const { game, hero, setNow, now } = createGame();
  const { groupId } = game.createProspectingExpedition({
    playerId: "p1",
    heroId: hero.id,
    originLocationId: "camp",
    specialistId: "specialist_geologist",
    food: 5,
  });
  let group = game.getAutonomousGroup(groupId);
  const restored = Game.fromJSON(game.toJSON(), { now: () => now() });
  assert.equal(restored.resourceZones.length, 1);
  group = restored.getAutonomousGroup(groupId);
  for (let guard = 0; guard < 100 && group.status !== "completed"; guard += 1) {
    restored.advanceAutonomousGroups(now());
    if (group.movement) setNow(Math.max(now() + 1, group.movement.arrivesAt));
  }
  assert.equal(group.status, "completed");
  assert.equal(group.mission.phase, "completed");
  assert.equal(
    restored.getLocation("camp").resources.stock.specialist_geologist,
    1,
  );
});
