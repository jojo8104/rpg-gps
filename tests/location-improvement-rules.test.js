import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../app/js/core/game.js";
import { Location } from "../app/js/core/location.js";
import { Hero } from "../app/js/core/hero.js";
import { HeroRecoveryService } from "../app/js/core/hero-recovery-service.js";
import { MarketService } from "../app/js/core/market-service.js";
import { ItemAcquisitionService } from "../app/js/core/item-acquisition-service.js";
import { EquipmentService } from "../app/js/core/equipment-service.js";
import { getItemDefinition } from "../app/js/core/item-catalog.js";
import { CAMP_IMPROVEMENTS } from "../app/js/core/camp-improvement-service.js";
import { playerMapVisibility } from "../app/js/core/player-map-visibility.js";
import {
  fogMaskGeometry,
  fogOverlayMarkup,
} from "../app/js/map/FogRenderer.js";
import { projectPlayerPayload } from "../server/realtime/player-projection.js";

function fixture(infrastructure = {}, type = "town") {
  let now = 1000,
    id = 0;
  const game = new Game({
    coordinateMode: "simulation",
    now: () => now,
    idGenerator: (prefix) => `${prefix}-${++id}`,
    setup: {
      id: "rules",
      name: "Règles",
      mode: "quick",
      scenarioId: "none",
      playerCount: 2,
      participants: [
        { playerId: "p1", name: "A" },
        { playerId: "p2", name: "B" },
      ],
      playArea: {
        id: "area",
        name: "Zone",
        polygon: [
          { latitude: -85, longitude: -100 },
          { latitude: -85, longitude: 100 },
          { latitude: 85, longitude: 100 },
          { latitude: 85, longitude: -100 },
        ],
      },
    },
    heroClasses: [
      { id: "warrior", name: "Guerrier" },
      { id: "mage", name: "Mage" },
    ],
    locations: [
      {
        id: "site",
        name: "Lieu",
        type,
        source: "test",
        ownerId: "p1",
        population: 30,
        populationCapacity: 100,
        defenseSlots: 2,
        position: { latitude: 0, longitude: 0 },
        infrastructure,
        resources: {
          stock: {
            gold: 100,
            food: 20,
            beer: 4,
            horse: 10,
            exploration_tools: 2,
            specialist_geologist: 2,
          },
        },
      },
    ],
  });
  const hero = game.chooseHero("p1", { name: "A", classId: "warrior" });
  const other = game.chooseHero("p2", { name: "B", classId: "mage" });
  game.start();
  hero.updatePosition({ latitude: 0, longitude: 0 });
  other.updatePosition({ latitude: 80, longitude: 0 });
  const location = game.getLocation("site");
  location.addHero(hero.id);
  return {
    game,
    hero,
    other,
    location,
    advance: (time) => {
      now = time;
      return game.advanceAutonomousGroups(now);
    },
    setNow: (time) => {
      now = time;
    },
  };
}

test("growth bonuses apply outside camps and workshop is removed", () => {
  for (const type of ["village", "town", "capital", "fort", "mine"]) {
    const { game, location } = fixture({ tavern: 2, workshop: 2 }, type);
    assert.equal(location.infrastructure.workshop, undefined);
    assert.equal(
      game.campImprovementService.advancePopulation(location).rate,
      0.04,
    );
  }
  assert.equal(CAMP_IMPROVEMENTS.workshop, undefined);
});

test("fortification levels and tower bonuses stack correctly", () => {
  const { location } = fixture();
  for (const [id, levels] of Object.entries({
    barricades: [
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    palisades: [
      [4, 0],
      [5, 0],
    ],
    walls: [
      [5, 1],
      [6, 2],
    ],
    ramparts: [[7, 3]],
  })) {
    levels.forEach(([defense, attack], index) => {
      location.infrastructure = { [id]: index + 1, defense_tower: 2 };
      assert.equal(location.defenseBonus, defense);
      assert.equal(location.locationAttackBonus, attack + 4);
    });
  }
});

test("chapel and tent healing add and chapel II revives at 75 percent", () => {
  const hero = new Hero({
    id: "h",
    name: "H",
    playerId: "p",
    maxHealth: 20,
    health: 5,
  });
  const recovery = new HeroRecoveryService();
  const site = { infrastructure: { chapel: 2, healing_tent: 2 } };
  assert.equal(
    recovery.recover(hero, { healingLocation: site }).restoredHealth,
    4,
  );
  hero.setBattleState({ health: 0, state: "ghost" });
  assert.equal(recovery.reviveAtBase(hero, site).health, 15);
});

test("barracks bonus is once per hero and garrison survives recalculation", () => {
  const { game, hero, location } = fixture({ barracks: 2, healing_tent: 2 });
  const slots = location.defenseSlots;
  assert.equal(slots, 3);
  assert.equal(
    game.trainHeroAtLocation({ heroId: hero.id, locationId: location.id })
      .success,
    true,
  );
  assert.equal(hero.statGrowth.attack, 1);
  assert.equal(hero.statGrowth.defense, 1);
  assert.equal(
    hero.moraleHistory.filter((entry) => entry.reason === "healing_tent")
      .length,
    1,
  );
  game.trainHeroAtLocation({ heroId: hero.id, locationId: location.id });
  game.campImprovementService.applyEffects(location);
  assert.equal(hero.statGrowth.attack, 1);
  assert.equal(location.defenseSlots, slots);
  const restored = Game.fromJSON(game.toJSON());
  assert.equal(restored.getLocation(location.id).defenseSlots, slots);
});

test("second school level grants a second training but never a third", () => {
  const { game, hero, location } = fixture({ military_school: 1 });
  game.trainHeroAtLocation({ heroId: hero.id, locationId: location.id });
  location.infrastructure.military_school = 2;
  game.trainHeroAtLocation({ heroId: hero.id, locationId: location.id });
  assert.equal(hero.statGrowth.attack, 2);
  assert.equal(
    game.trainHeroAtLocation({ heroId: hero.id, locationId: location.id })
      .success,
    false,
  );
});

test("paid academy divination works for warrior, checks presence and gold", () => {
  const { game, hero, location } = fixture({ magic_academy: 1 });
  const input = { playerId: "p1", heroId: hero.id, locationId: location.id };
  hero.resources.gold = 50;
  assert.equal(game.divineAtAcademy(input).success, true);
  assert.equal(hero.resources.gold, 0);
  assert.equal(game.heroClassFeatureService.activeDivination(hero).radius, 60);
  assert.equal(game.divineAtAcademy(input).reason, "insufficient_resources");
  location.removeHero(hero.id);
  hero.resources.gold = 50;
  assert.equal(game.divineAtAcademy(input).success, false);
  assert.equal(hero.resources.gold, 50);
});

test("import stock is limited, double priced, saved and rotates every ten minutes", () => {
  const { hero, location } = fixture({ trading_post: 2 });
  location.resources.stock = {};
  hero.resources = { gold: 100 };
  let now = 1000;
  const market = new MarketService({ now: () => now });
  const offer = market
    .getAvailableOffers(location, hero)
    .find((entry) => entry.imported);
  assert.ok(offer);
  location.infrastructure.trading_post = 1;
  const regular = market
    .getOffers(location, hero)
    .find((entry) => entry.itemId === offer.itemId);
  assert.equal(offer.buy, regular.buy * 2);
  assert.equal(market.getAvailableOffers(location, hero).length, 0);
  location.infrastructure.trading_post = 2;
  const before = JSON.stringify(location);
  assert.equal(
    market.execute({
      hero,
      location,
      itemId: offer.itemId,
      direction: "buy",
      preview: true,
    }).success,
    true,
  );
  assert.equal(JSON.stringify(location), before);
  assert.equal(
    market.execute({
      hero,
      location,
      itemId: offer.itemId,
      direction: "buy",
      lots: 2,
    }).success,
    true,
  );
  const restored = new Location(location.toJSON());
  assert.equal(
    market.execute({
      hero,
      location: restored,
      itemId: offer.itemId,
      direction: "buy",
    }).success,
    false,
  );
  now = 600_000;
  assert.ok(
    market
      .imports(restored)
      .every((entry) => entry.remaining === entry.quantity * 2),
  );
});

test("armorer II variants preserve bonuses across equip, save and unequip", () => {
  const { hero, location } = fixture({ armorers: 2 });
  hero.resources = { gold: 100 };
  const service = new ItemAcquisitionService();
  const context = { hero, location, canTrade: true };
  const offer = service
    .offers(context)
    .find(
      (entry) =>
        entry.itemId.startsWith("reinforced:") &&
        getItemDefinition(entry.itemId).allowedClasses.includes("warrior"),
    );
  assert.ok(offer);
  const definition = getItemDefinition(offer.itemId),
    base = getItemDefinition(offer.baseItemId);
  assert.equal(definition.modifiers.defense, base.modifiers.defense + 1);
  assert.equal(service.acquire(context, offer.id).success, true);
  const equipment = new EquipmentService();
  assert.equal(equipment.equip(hero, hero.carriedLoot.at(-1).id).success, true);
  const restored = new Hero(hero.toJSON());
  equipment.recalculateModifiers(restored);
  assert.equal(
    restored.equipmentModifiers.defense,
    definition.modifiers.defense,
  );
  const slot = Object.keys(restored.equipment)[0];
  equipment.unequip(restored, slot);
  assert.equal(restored.carriedLoot.at(-1).itemId, offer.itemId);
});

test("expedition reserves inhabitants, pauses growth, scales beer and horses, returns once", () => {
  const { game, hero, location } = fixture({ prospecting_post: 1, tavern: 2 });
  const input = {
    playerId: "p1",
    heroId: hero.id,
    originLocationId: location.id,
    specialistId: "specialist_geologist",
    food: 5,
    beer: 2,
    horses: 10,
  };
  const start = game.createProspectingExpedition(input);
  assert.equal(start.success, true);
  assert.equal(location.population, 25);
  assert.equal(start.maximumRadius, 20);
  const group = game.getAutonomousGroup(start.groupId);
  assert.equal(group.mission.speedMetersPerSecond, 4.5);
  assert.equal(
    game.campImprovementService.advancePopulation(location, 10).gained,
    0,
  );
  const restored = Game.fromJSON(game.toJSON());
  const returning = restored.getAutonomousGroup(group.id);
  returning.mission.phase = "returning";
  assert.equal(
    restored.prospectingService.arrive(returning, restored.locations, 2000)
      .success,
    true,
  );
  const home = restored.getLocation(location.id);
  assert.equal(home.population, 30);
  assert.equal(
    restored.prospectingService.arrive(returning, restored.locations, 2000)
      .success,
    false,
  );
  assert.equal(home.population, 30);
  assert.ok(
    restored.campImprovementService.advancePopulation(home, 5).gained > 0,
  );
  const before = JSON.stringify(game.toJSON());
  assert.equal(
    game.createProspectingExpedition({ ...input, beer: 3 }).success,
    false,
  );
  assert.equal(JSON.stringify(game.toJSON()), before);
});

test("building a camp watch post near the simulation edge keeps the world ticking", () => {
  const { game, hero, location, setNow } = fixture({ housing: 2 }, "camp");
  location.position = { latitude: 50, longitude: 12 };
  hero.updatePosition(location.position);
  location.population = 8;
  location.resources.stock.wood = 100;
  location.resources.stock.iron = 20;
  location.resources.production.wood = 2;
  location.features.resourceProduction = true;
  game.campImprovementService.applyEffects(location);
  for (const level of [1, 2]) {
    assert.equal(game.campImprovementService.build(location, "watch_post").success, true);
    assert.doesNotThrow(() => game.update(), `watch level ${level}`);
  }
  const beforeStock = location.resources.productionStock.wood ?? 0;
  const beforePopulation = location.population;
  const task = game.locationDismantlingService.start(location, "watch_post", game.now());
  assert.equal(task.success, true);
  setNow(task.task.deadline.expiresAt + 1);
  game.update();
  game.advanceCycle(10);
  assert.ok(location.resources.productionStock.wood > beforeStock);
  assert.ok(location.population > beforePopulation);
  assert.equal(location.dismantlings.length, 0);
  assert.equal(location.infrastructure.watch_post, undefined);
});

test("watch II sends one scout, extends server visibility and survives save", () => {
  const { game, hero, location, advance } = fixture({ watch_post: 2 });
  hero.updatePosition({ latitude: -90, longitude: -90 });
  game.addAutonomousGroup({
    id: "enemy",
    type: "army",
    owner: { kind: "faction", id: "enemy" },
    position: { latitude: 15, longitude: 0 },
    status: "idle",
    behavior: "aggressive",
  });
  advance(1000);
  advance(1001);
  assert.equal(
    game.autonomousGroups.filter((group) => group.type === "scout").length,
    1,
  );
  assert.equal(
    playerMapVisibility(game.toJSON(), "p1", 1001).autonomousGroups.has(
      "enemy",
    ),
    true,
  );
  const restored = Game.fromJSON(game.toJSON());
  assert.equal(restored.getLocationWatchZones("p1").length, 2);
  location.infrastructure.watch_post = 1;
  advance(1002);
  assert.equal(game.getLocationWatchZones("p1").length, 1);
});

test("relay delivers a message on arrival, not at departure, without duplication", () => {
  const { game, hero, other, location, advance } = fixture({
    messenger_relay: 1,
  });
  const result = game.sendRelayMessage({
    playerId: "p1",
    heroId: hero.id,
    locationId: location.id,
    recipientPlayerId: "p2",
    text: "Rendez-vous au fort.",
  });
  assert.equal(result.success, true);
  assert.equal(game.getPlayer("p2").informationRecords.length, 0);
  advance(1000);
  const messenger = game.getAutonomousGroup(result.groupId);
  assert.ok(messenger.movement);
  advance(messenger.movement.arrivesAt);
  assert.equal(messenger.status, "completed");
  assert.equal(
    game.getPlayer("p2").informationRecords.at(-1).text,
    "Rendez-vous au fort.",
  );
  advance(100000);
  assert.equal(game.getPlayer("p2").informationRecords.length, 1);
});

test("watch movement and attacks produce relay couriers", () => {
  const { game, other, location, advance } = fixture({
    watch_post: 1,
    messenger_relay: 1,
  });
  other.updatePosition({ latitude: 20, longitude: 0 });
  advance(1000);
  assert.ok(
    game.autonomousGroups.some(
      (group) => group.message?.kind === "watch_alert",
    ),
  );
  game.locationWatchService.attack(game, location.id, "attack-1");
  game.locationWatchService.attack(game, location.id, "attack-1");
  assert.equal(
    game.autonomousGroups.filter(
      (group) => group.message?.kind === "attack_alert",
    ).length,
    1,
  );
});

test("fog mask includes location watch areas", () => {
  const geometry = fogMaskGeometry({
    cells: [],
    center: { latitude: 0, longitude: 0 },
    radius: 10,
    simulation: true,
    zoneBounds: [
      { latitude: -85, longitude: -100 },
      { latitude: 85, longitude: 100 },
    ],
    revealedZones: [{ center: { latitude: 40, longitude: 40 }, radius: 35 }],
  });
  assert.equal(geometry.extraVisions.length, 1);
  assert.equal((fogOverlayMarkup(geometry).match(/<ellipse/g) ?? []).length, 2);
});

test("courier follows a moving recipient and keeps message private before arrival", () => {
  const { game, hero, other, location, advance } = fixture({
    messenger_relay: 1,
  });
  other.updatePosition({ latitude: 10, longitude: 0 });
  const result = game.sendRelayMessage({
    playerId: "p1",
    heroId: hero.id,
    locationId: location.id,
    recipientPlayerId: "p2",
    text: "Ordre confidentiel",
  });
  const state = game.toJSON();
  const projected = projectPlayerPayload(
    { state },
    {
      playerId: "p2",
      lobby: {
        configuration: { gameType: "duel" },
        players: [{ id: "p1" }, { id: "p2" }],
      },
      gameSnapshot: { state },
      positions: {
        positions: game.heroes.map((h) => ({
          playerId: h.playerId,
          position: h.position,
          connected: true,
        })),
      },
      now: 1000,
    },
  );
  assert.equal(JSON.stringify(projected).includes("Ordre confidentiel"), false);
  advance(1000);
  const messenger = game.getAutonomousGroup(result.groupId);
  other.updatePosition({ latitude: 20, longitude: 0 });
  advance(messenger.movement.arrivesAt);
  assert.equal(game.getPlayer("p2").informationRecords.length, 0);
  advance(4000);
  advance(messenger.movement.arrivesAt);
  assert.equal(
    game.getPlayer("p2").informationRecords.at(-1).text,
    "Ordre confidentiel",
  );
  assert.equal(
    playerMapVisibility(game.toJSON(), "p1").autonomousGroups.has(messenger.id),
    false,
  );
});

test("academy second level adds mage training and training cannot be claimed remotely", () => {
  const { game, hero, other, location } = fixture({
    magic_academy: 2,
    barracks: 1,
  });
  const input = { heroId: other.id, locationId: location.id };
  assert.equal(game.trainHeroAtLocation(input).success, false);
  location.ownerId = "p2";
  location.addHero(other.id);
  game.trainHeroAtLocation(input);
  game.trainHeroAtLocation(input);
  assert.equal(other.statGrowth.attack, 3);
  assert.equal(game.trainHeroAtLocation(input).success, false);
  assert.equal(hero.statGrowth.attack, 0);
});
