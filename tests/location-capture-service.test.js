import assert from "node:assert/strict";
import test from "node:test";
import { Location } from "../app/js/core/location.js";
import { LocationCaptureService } from "../app/js/core/location-capture-service.js";

const service = new LocationCaptureService();
const place = (overrides = {}) => new Location({ id: "target", name: "Cible", type: "village", source: "scenario", position: { latitude: 0, longitude: 0 }, features: { capturable: true }, ...overrides });

test("un lieu capturable sans garnison passe sous contrôle par interaction", () => {
  const location = place();
  const result = service.capture({ location, playerId: "p1", relation: "neutral" });
  assert.equal(result.success, true);
  assert.equal(result.method, "interaction");
  assert.equal(location.ownerId, "p1");
  assert.equal(location.controllerId, "p1");
});

test("une garnison impose une victoire militaire", () => {
  const location = place({ ownerId: "p2", garrison: { units: [{ id: "guard", ownerPlayerId: "p2", typeId: "militia", quantity: 5, rank: "soldier" }] } });
  assert.equal(service.capture({ location, playerId: "p1", relation: "enemy" }).reason, "battle_required");
  assert.equal(service.capture({ location, playerId: "p1", relation: "enemy", afterBattle: true }).success, true);
});

test("la condition de capture distingue attaque sans combat et bataille", () => {
  assert.equal(service.getRequirement({ location: place(), relation: "neutral" }).state, "can_capture");
  assert.equal(service.getRequirement({ location: place({ garrison: { units: [{ id: "neutral-guard", ownerPlayerId: "neutral", typeId: "militia", quantity: 1 }] } }), relation: "neutral" }).state, "battle_required");
});

test("une quête protectrice doit être accomplie avant toute capture", () => {
  const location = place({ capture: { questObjectiveId: "help-mayor" } });
  assert.equal(service.capture({ location, playerId: "p1", relation: "neutral", isQuestCompleted: () => false }).reason, "quest_required");
  const result = service.capture({ location, playerId: "p1", relation: "neutral", isQuestCompleted: (id) => id === "help-mayor" });
  assert.equal(result.success, true);
  assert.equal(result.method, "quest");
});
