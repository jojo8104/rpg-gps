import assert from "node:assert/strict";
import test from "node:test";
import { AutonomousGroup } from "../app/js/core/autonomous-group.js";
import { AutonomousMovementService } from "../app/js/core/autonomous-movement-service.js";

const createGroup = () => new AutonomousGroup({ id: "g", type: "army", owner: { kind: "faction", id: "chaos" }, position: { latitude: 0, longitude: 0 }, behavior: "aggressive", mission: { kind: "attack_location", targetId: "fort" } });

test("un trajet temporel interpole la position et atteint exactement sa destination", () => {
  const service = new AutonomousMovementService(); const group = createGroup();
  const movement = service.start(group, { destination: { latitude: 0, longitude: .001 }, speedMetersPerSecond: 1, now: 1_000 });
  const halfway = service.advance(group, 1_000 + (movement.arrivesAt - 1_000) / 2);
  assert.equal(halfway.arrived, false); assert.ok(Math.abs(group.position.longitude - .0005) < .00001);
  assert.equal(service.advance(group, movement.arrivesAt).arrived, true);
  assert.deepEqual(group.position, { latitude: 0, longitude: .001 }); assert.equal(group.status, "arrived");
});

test("une interruption reprend par un nouveau trajet depuis son point exact", () => {
  const service = new AutonomousMovementService(); const group = createGroup();
  service.start(group, { destination: { latitude: 0, longitude: .002 }, speedMetersPerSecond: 2, now: 0 });
  const remaining = service.interrupt(group, { position: { latitude: 0, longitude: .001 }, occurredAt: 10_000 });
  assert.equal(group.status, "interrupted"); assert.deepEqual(group.position, { latitude: 0, longitude: .001 });
  service.resume(group, { ...remaining, now: 20_000 });
  assert.deepEqual(group.movement.origin, { latitude: 0, longitude: .001 }); assert.ok(group.movement.arrivesAt > 20_000);
});
