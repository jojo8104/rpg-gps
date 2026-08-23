import assert from "node:assert/strict";
import test from "node:test";
import { AutonomousGroup } from "../app/js/core/autonomous-group.js";
import { AutonomousGroupService } from "../app/js/core/autonomous-group-service.js";
import { PlayArea } from "../app/js/core/play-area.js";

const area = new PlayArea({ id: "area", name: "A", polygon: [{ latitude: -.01, longitude: -.01 }, { latitude: -.01, longitude: .01 }, { latitude: .01, longitude: .01 }, { latitude: .01, longitude: -.01 }] });

test("attack_location produit une demande d'attaque à l'arrivée et une trace", () => {
  let id = 0; const service = new AutonomousGroupService({ idGenerator: (prefix) => `${prefix}-${++id}` });
  const group = new AutonomousGroup({ id: "army", type: "army", owner: { kind: "faction", id: "chaos" }, position: { latitude: 0, longitude: 0 }, behavior: "aggressive", mission: { kind: "attack_location", targetId: "fort" } });
  const first = service.advance({ groups: [group], locations: [{ id: "fort", position: { latitude: 0, longitude: .001 } }], playArea: area, now: 0, speedFor: () => 10 });
  assert.equal(first.events.length, 0); assert.equal(group.status, "traveling");
  const result = service.advance({ groups: [group], locations: [{ id: "fort", position: { latitude: 0, longitude: .001 } }], playArea: area, now: group.movement.arrivesAt, speedFor: () => 10 });
  assert.equal(result.events[0].type, "autonomous_group_location_attack_requested"); assert.equal(result.traces.length, 1); assert.equal(group.status, "interrupted");
});

test("une embuscade attaque immédiatement une cible entrée dans son rayon", () => {
  let id = 0; const service = new AutonomousGroupService({ idGenerator: (prefix) => `${prefix}-${++id}` });
  const group = new AutonomousGroup({ id: "army", type: "army", owner: { kind: "faction", id: "chaos" }, position: { latitude: 0, longitude: 0 }, behavior: "aggressive", mission: { kind: "roam" } });
  service.startAmbush(group, { now: 0, durationMs: 60_000, radiusMeters: 50 });
  const result = service.advance({ groups: [group], targets: [{ id: "hero", kind: "hero", hostile: true, position: { latitude: 0, longitude: .0001 } }], playArea: area, now: 10_000 });
  assert.equal(result.events[0].type, "autonomous_group_ambush_attack_requested"); assert.equal(group.status, "interrupted"); assert.equal(group.interruption.mode, "immediate_attack"); assert.equal(result.traces[0].kind, "ambush");
});

test("la résolution d'un convoi pillé produit une trace de destruction", () => {
  let id = 0; const service = new AutonomousGroupService({ idGenerator: (prefix) => `${prefix}-${++id}` });
  const group = new AutonomousGroup({ id: "convoy", type: "convoy", owner: { kind: "player", id: "p2" }, position: { latitude: 0, longitude: 0 }, mission: { kind: "transport" }, cargo: [{ itemId: "iron", quantity: 2 }] });
  group.status = "interrupted"; group.interruption = { id: "i", target: { kind: "hero", id: "h" }, status: "pending", reactionDeadlineAt: 30_000 };
  const result = service.resolveInterception(group, { now: 10_000 });
  assert.equal(result.outcome, "plundered"); assert.equal(result.trace.kind, "plunder"); assert.equal(result.trace.occupiedCargoSlots, 1);
});
