import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

function createGame() {
  let now = 1_000; let id = 0;
  const setup = { id: "convoy", name: "Convois", mode: "quick", scenarioId: "none", playerCount: 1, playArea: { id: "area", name: "Zone", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 50 }, { latitude: 50, longitude: 0 }] }, participants: [{ playerId: "p1", name: "Joueur" }] };
  const locations = [
    { id: "town", name: "Ville", type: "town", source: "test", position: { latitude: 5, longitude: 5 }, ownerId: "p1", controllerId: "p1", population: 30, infrastructure: { trading_post: 1 }, resources: { stock: { wood: 20, iron: 10, horse: 4 }, production: {}, productionStock: {} } },
    { id: "mine", name: "Mine", type: "mine", source: "test", position: { latitude: 15, longitude: 5 }, ownerId: "p1", controllerId: "p1", population: 10, resources: { stock: {}, production: { iron: 2 }, productionStock: { iron: 20 } } },
  ];
  const game = new Game({ setup, heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }], locations, coordinateMode: "simulation", now: () => now, idGenerator: (prefix) => `${prefix}-${++id}`, tradingConvoyConfig: { creationCost: { wood: 8, iron: 3, horse: 2 }, capacitySlots: 2, speedMetersPerSecond: 1 } });
  const hero = game.chooseHero("p1", { name: "A", classId: "warrior" }); game.start();
  hero.updatePosition(game.getLocation("town").position); game.getLocation("town").addHero(hero.id);
  return { game, hero, setNow: (value) => { now = value; }, now: () => now };
}

test("le comptoir paie et crée un convoi autonome spécialisé", () => {
  const { game, hero } = createGame();
  const result = game.createTradingConvoy({ playerId: "p1", heroId: hero.id, originLocationId: "town", destinationLocationId: "mine", resourceId: "iron" });
  assert.equal(result.success, true);
  assert.deepEqual(game.getLocation("town").resources.stock, { wood: 12, iron: 7, horse: 2 });
  const convoy = game.getAutonomousGroup(result.groupId);
  assert.equal(convoy.type, "convoy"); assert.equal(convoy.mission.phase, "outbound"); assert.equal(convoy.owner.id, "p1");
});

test("le convoi va à la mine, charge, revient, décharge et repart", () => {
  const { game, hero, setNow, now } = createGame();
  const { groupId } = game.createTradingConvoy({ playerId: "p1", heroId: hero.id, originLocationId: "town", destinationLocationId: "mine", resourceId: "iron" });
  const convoy = game.getAutonomousGroup(groupId);
  game.advanceAutonomousGroups(now());
  setNow(convoy.movement.arrivesAt); game.advanceAutonomousGroups(now());
  assert.equal(convoy.mission.phase, "inbound"); assert.deepEqual(convoy.cargo, [{ itemId: "iron", quantity: 20, occupiedSlots: 2 }]);
  game.advanceAutonomousGroups(now());
  setNow(convoy.movement.arrivesAt); game.advanceAutonomousGroups(now());
  assert.equal(convoy.mission.phase, "outbound"); assert.deepEqual(convoy.cargo, []); assert.equal(game.getLocation("town").resources.stock.iron, 27);
  game.advanceAutonomousGroups(now()); assert.equal(convoy.status, "traveling");
});

test("la perte de la destination suspend la liaison et l'état chargé survit à une sauvegarde", () => {
  const { game, hero, setNow, now } = createGame();
  const { groupId } = game.createTradingConvoy({ playerId: "p1", heroId: hero.id, originLocationId: "town", destinationLocationId: "mine", resourceId: "iron" });
  const convoy = game.getAutonomousGroup(groupId); game.advanceAutonomousGroups(now()); setNow(convoy.movement.arrivesAt); game.advanceAutonomousGroups(now());
  const restored = Game.fromJSON(game.toJSON(), { now: () => now() });
  assert.equal(restored.getAutonomousGroup(groupId).mission.phase, "inbound"); assert.equal(restored.getAutonomousGroup(groupId).cargo[0].quantity, 20);
  restored.getLocation("mine").setOwner("enemy"); restored.advanceAutonomousGroups(now());
  assert.equal(restored.getAutonomousGroup(groupId).status, "suspended"); assert.equal(restored.getAutonomousGroup(groupId).mission.suspensionReason, "destination_not_owned");
});

test("le propriétaire peut arrêter manuellement un convoi", () => {
  const { game, hero } = createGame();
  const { groupId } = game.createTradingConvoy({ playerId: "p1", heroId: hero.id, originLocationId: "town", destinationLocationId: "mine", resourceId: "iron" });
  assert.equal(game.stopTradingConvoy({ playerId: "p1", groupId }).success, true);
  assert.equal(game.getAutonomousGroup(groupId).status, "stopped");
});
