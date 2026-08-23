import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { AutonomousGroup } from "../app/js/core/autonomous-group.js";

const definition = { id: "militia", maxQuantity: 10, stats: { attack: 4, defense: 2, range: 1, speed: 2, healthPerSoldier: 8, combatHealthThreshold: 3 } };
const setup = { id: "s", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 2, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "A" }, { playerId: "p2", name: "B" }] };
const heroClasses = [{ id: "fighter", name: "Combattant", abilityIds: [] }];

test("une bataille applique les survivants et l'état ghost au monde", () => {
  let nextId = 1;
  const game = new Game({ setup, heroClasses, unitDefinitions: [definition], idGenerator: (prefix) => `${prefix}-${nextId++}` });
  const first = game.chooseHero("p1", { name: "A", classId: "fighter" });
  const second = game.chooseHero("p2", { name: "B", classId: "fighter" });
  game.start();
  const battle = game.createBattle({
    config: { grid: { width: 6, height: 3 } },
    teamParticipants: [{ id: "red", heroIds: [first.id], positions: { [first.id]: { x: 1, y: 1 } } }, { id: "blue", heroIds: [second.id], positions: { [second.id]: { x: 2, y: 1 } } }],
  });
  const firstBattleHero = battle.teams[0].heroes[0];
  firstBattleHero.attack = 1000;
  battle.attack(firstBattleHero.id, battle.teams[1].heroes[0].id);
  assert.equal(battle.status, "finished");
  game.resolveBattle(battle.id);
  assert.equal(game.getHero(second.id).state, "ghost");
  assert.equal(game.getHero(second.id).health, 0);
});

test("les unités de garnison sont les défenseurs persistants de la bataille", () => {
  let nextId = 1;
  const game = new Game({ setup, heroClasses, unitDefinitions: [definition], locations: [{ id: "fort", name: "Fort", type: "fort", source: "scenario", position: { latitude: 0, longitude: 0 }, ownerId: "p2", features: { capturable: true, garrison: true }, garrison: { units: [{ id: "fort-guard", ownerPlayerId: "p2", typeId: "militia", quantity: 6, rank: "soldier" }] } }], idGenerator: (prefix) => `${prefix}-${nextId++}` });
  const attacker = game.chooseHero("p1", { name: "A", classId: "fighter" }); game.chooseHero("p2", { name: "B", classId: "fighter" }); game.start();
  const battle = game.createBattle({ teamParticipants: [{ id: "attackers", heroIds: [attacker.id] }, { id: "defenders", heroIds: [], locationId: "fort" }], sourceLocationId: "fort", sourceEnemyTeamId: "defenders" });
  assert.equal(battle.teams[1].units[0].sourceId, "fort-guard");
  assert.equal(battle.teams[1].units[0].typeId, "militia");
  assert.deepEqual(battle.teams[1].units[0].tags, []);
  assert.equal(battle.teams[1].units[0].quantity, 6);
  assert.deepEqual(battle.teams[1].units[0].soldierHealth, [8, 8, 8, 8, 8, 8]);
  assert.equal(battle.teams[1].heroes[0].sourceId, "location-fort");
});

test("une armée autonome reçoit un commandant tactique et ses unités persistantes", () => {
  let nextId = 1; const game = new Game({ setup, heroClasses, unitDefinitions: [definition], idGenerator: (prefix) => `${prefix}-${nextId++}` });
  const hero = game.chooseHero("p1", { name: "A", classId: "fighter" }); game.chooseHero("p2", { name: "B", classId: "fighter" });
  const group = new AutonomousGroup({ id: "chaos-army", type: "army", owner: { kind: "faction", id: "chaos" }, position: { latitude: .1, longitude: .1 }, behavior: "aggressive", mission: { kind: "roam" }, army: { units: [{ id: "chaos-unit", ownerPlayerId: "chaos", typeId: "militia", quantity: 5, healthPerSoldier: 8, combatHealthThreshold: 3 }] } });
  game.addAutonomousGroup(group); game.start();
  const battle = game.createBattle({ teamParticipants: [{ id: "heroes", heroIds: [hero.id] }, { id: "chaos", heroIds: [], autonomousGroupId: group.id }], position: group.position });
  assert.equal(battle.teams[1].heroes[0].sourceId, "autonomous-group-chaos-army");
  assert.equal(battle.teams[1].units[0].sourceId, "chaos-unit"); assert.equal(battle.teams[1].units[0].heroSourceId, "autonomous-group-chaos-army");
});

test("une interception agressive crée automatiquement Battle", () => {
  let nextId = 1; const game = new Game({ setup, heroClasses, unitDefinitions: [definition], idGenerator: (prefix) => `${prefix}-${nextId++}` });
  const hero = game.chooseHero("p1", { name: "A", classId: "fighter" }); game.chooseHero("p2", { name: "B", classId: "fighter" }); hero.updatePosition({ latitude: .1, longitude: .101 });
  const group = new AutonomousGroup({ id: "chaos-moving", type: "army", owner: { kind: "faction", id: "chaos" }, position: { latitude: .1, longitude: .1 }, behavior: "aggressive", mission: { kind: "roam" }, army: { units: [{ id: "chaos-moving-unit", ownerPlayerId: "chaos", typeId: "militia", quantity: 5, healthPerSoldier: 8, combatHealthThreshold: 3 }] } });
  game.addAutonomousGroup(group); game.start();
  game.autonomousGroupService.movementService.start(group, { destination: { latitude: .1, longitude: .102 }, speedMetersPerSecond: 2, now: 0 });
  const result = game.advanceAutonomousGroups(group.movement.arrivesAt);
  const event = result.events.find((entry) => entry.type === "autonomous_group_attack_requested");
  assert.ok(event.battleId); assert.equal(game.battles.length, 1); assert.equal(game.battles[0].teams[1].units[0].sourceId, "chaos-moving-unit");
});
