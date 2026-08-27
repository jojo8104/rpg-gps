import assert from "node:assert/strict";
import test from "node:test";
import { AutonomousGroup } from "../app/js/core/autonomous-group.js";
import { AutonomousGroupDetectionService } from "../app/js/core/autonomous-group-detection-service.js";

const groupAt = (id, x, status = "traveling") => new AutonomousGroup({ id, type: "army", owner: { kind: "faction", id: "chaos" }, factionId: "chaos", position: { latitude: x, longitude: 0 }, status, behavior: "aggressive", mission: { kind: "roam" }, army: { units: [{ id: `${id}-unit`, ownerPlayerId: "chaos", typeId: "raider", quantity: 6 }] } });

test("la carte ne reçoit que les groupes détectés par le héros", () => {
  const service = new AutonomousGroupDetectionService({ distanceFn: (first, second) => Math.abs(first.latitude - second.latitude) });
  const detected = service.detect({ observer: { position: { latitude: 0, longitude: 0 }, classId: "warrior" }, groups: [groupAt("near", 10), groupAt("far", 100)], baseRadius: 20 });
  assert.deepEqual(detected.map((group) => group.id), ["near"]); assert.equal(detected[0].soldiers, 6);
});

test("la statistique de détection porte plus loin mais la discrétion et l'embuscade réduisent la visibilité", () => {
  const service = new AutonomousGroupDetectionService({ distanceFn: (first, second) => Math.abs(first.latitude - second.latitude) });
  assert.equal(service.detect({ observer: { position: { latitude: 0, longitude: 0 }, detectionMultiplier: 1.5 }, groups: [groupAt("scouted", 35)], baseRadius: 20 }).length, 1);
  const hidden = groupAt("hidden", 20, "ambushing"); hidden.concealmentMultiplier = .65;
  assert.equal(service.detect({ observer: { position: { latitude: 0, longitude: 0 }, detectionMultiplier: 1.5 }, groups: [hidden], baseRadius: 20 }).length, 0);
});
