import assert from "node:assert/strict";
import test from "node:test";
import { AutonomousGroup } from "../app/js/core/autonomous-group.js";
import { AutonomousInterceptionService } from "../app/js/core/autonomous-interception-service.js";
import { AutonomousMovementService } from "../app/js/core/autonomous-movement-service.js";
import { Game } from "../app/js/core/game.js";

const movementService = new AutonomousMovementService();
const segment = { from: { latitude: 0, longitude: 0 }, to: { latitude: 0, longitude: .002 }, fromAt: 0, toAt: 20_000 };

test("un messager rapide laisse au moins quinze secondes pour réagir puis son message est lu et détruit", () => {
  const service = new AutonomousInterceptionService({ engagementRadiusMeters: 20, minimumReactionMs: 15_000 });
  const group = new AutonomousGroup({ id: "m", type: "messenger", owner: { kind: "faction", id: "chaos" }, position: { latitude: 0, longitude: 0 }, behavior: "passive", mission: { kind: "deliver_message" }, message: { id: "msg", content: "ordre" } });
  movementService.start(group, { destination: { latitude: 0, longitude: .002 }, speedMetersPerSecond: 100, now: 0 });
  const detection = service.detect(segment, [{ id: "hero", kind: "hero", position: { latitude: 0, longitude: .001 } }]);
  const interruption = service.create(group, detection, { id: "i", movementService });
  assert.equal(interruption.reactionDeadlineAt - interruption.startedAt, 15_000);
  const result = service.resolve(group, { now: interruption.startedAt + 1_000 });
  assert.equal(result.outcome, "destroyed"); assert.equal(result.information.id, "msg"); assert.equal(group.message, null); assert.equal(group.status, "destroyed");
});

test("une armée agressive prend immédiatement l'initiative et demande une bataille", () => {
  const service = new AutonomousInterceptionService();
  const group = new AutonomousGroup({ id: "a", type: "army", owner: { kind: "faction", id: "chaos" }, position: { latitude: 0, longitude: 0 }, behavior: "aggressive", mission: { kind: "roam" } });
  movementService.start(group, { destination: { latitude: 0, longitude: .002 }, speedMetersPerSecond: 1, now: 0 });
  const detection = service.detect(segment, [{ id: "hero", position: { latitude: 0, longitude: .001 } }]);
  const interruption = service.create(group, detection, { id: "i", movementService });
  assert.equal(interruption.mode, "immediate_attack"); assert.equal(interruption.reactionDeadlineAt, interruption.startedAt);
  assert.equal(service.resolve(group, { now: interruption.startedAt, action: "attack" }).outcome, "battle_requested");
});

test("une cible discrète doit passer plus près pour être interceptée", () => {
  const service = new AutonomousInterceptionService({ engagementRadiusMeters: 100 });
  const discreet = { id: "scout", position: { latitude: .00072, longitude: .001 }, concealmentMultiplier: .65 };
  assert.equal(service.detect(segment, [discreet]), null);
  assert.notEqual(service.detect(segment, [{ ...discreet, concealmentMultiplier: 1 }]), null);
});

test("la détection du groupe compense une partie de la discrétion de sa cible", () => {
  const service = new AutonomousInterceptionService({ engagementRadiusMeters: 100 });
  const target = { id: "scout", position: { latitude: .00072, longitude: .001 }, concealmentMultiplier: .65 };
  assert.equal(service.detect(segment, [target]), null);
  assert.notEqual(service.detect(segment, [target], { observerDetectionMultiplier: 1.5 }), null);
});

test("un convoi intercepté est pillé puis détruit", () => {
  const service = new AutonomousInterceptionService();
  const group = new AutonomousGroup({ id: "c", type: "convoy", owner: { kind: "player", id: "p2" }, position: { latitude: 0, longitude: 0 }, mission: { kind: "transport" }, cargo: [{ itemId: "wood", quantity: 10 }] });
  movementService.start(group, { destination: { latitude: 0, longitude: .002 }, speedMetersPerSecond: 1, now: 0 });
  const detection = service.detect(segment, [{ id: "hero", position: { latitude: 0, longitude: .001 } }]);
  service.create(group, detection, { id: "i", movementService });
  const result = service.resolve(group, { now: detection.occurredAt });
  assert.equal(result.outcome, "plundered"); assert.deepEqual(result.cargo, [{ itemId: "wood", quantity: 10 }]); assert.deepEqual(group.cargo, []);
});

test("Game transforme un message intercepté en renseignement et applique ses effets cartographiques", () => {
  let id = 0;
  const setup = { id: "s", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 1, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "A" }] };
  const game = new Game({ setup, heroClasses: [{ id: "fighter", name: "F", abilityIds: [] }], locations: [{ id: "fort", name: "Fort", type: "fort", source: "test", position: { latitude: .1, longitude: .1 } }], idGenerator: (prefix) => `${prefix}-${++id}` });
  const hero = game.chooseHero("p1", { name: "A", classId: "fighter" }); game.start();
  const group = new AutonomousGroup({ id: "messenger", type: "messenger", owner: { kind: "faction", id: "chaos" }, position: { latitude: .1, longitude: .1 }, mission: { kind: "deliver_message" }, message: { id: "message", text: "Attaquez le fort", mapEffects: [{ type: "reveal_location", locationId: "fort", knowledgeLevel: 2 }] } });
  group.status = "interrupted"; group.interruption = { id: "i", target: { kind: "hero", id: hero.id }, status: "pending", reactionDeadlineAt: 30_000 };
  game.addAutonomousGroup(group);
  const result = game.resolveAutonomousInterception({ groupId: group.id, now: 10_000 });
  const player = game.getPlayer("p1"); assert.equal(result.success, true); assert.equal(player.informationRecords.length, 1); assert.equal(player.getLocationKnowledge("fort"), 2); assert.equal(result.event.informationId, player.informationRecords[0].id);
});
