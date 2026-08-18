import assert from "node:assert/strict";
import test from "node:test";
import { Location } from "../app/js/core/location.js";
import { LocationCaptureService } from "../app/js/core/location-capture-service.js";

const service = new LocationCaptureService();
const place = (overrides = {}) => new Location({ id: "target", name: "Cible", type: "village", source: "scenario", position: { latitude: 0, longitude: 0 }, features: { capturable: true }, ...overrides });

test("un lieu capturable sans garnison passe sous contrôle à l'entrée", () => {
  const location = place();
  const result = service.capture({ location, playerId: "p1", relation: "neutral" });
  assert.equal(result.success, true);
  assert.equal(result.method, "presence");
  assert.equal(location.ownerId, "p1");
  assert.equal(location.controllerId, "p1");
});

test("une garnison impose une victoire militaire", () => {
  const location = place({ ownerId: "p2", garrison: { units: [{ id: "guard", ownerPlayerId: "p2", typeId: "militia", quantity: 5, rank: "soldier" }] } });
  assert.equal(service.capture({ location, playerId: "p1", relation: "enemy" }).reason, "battle_required");
  assert.equal(service.capture({ location, playerId: "p1", relation: "enemy", afterBattle: true }).success, true);
});

test("une quête protectrice doit être accomplie avant toute capture", () => {
  const location = place({ capture: { questObjectiveId: "help-mayor" } });
  assert.equal(service.capture({ location, playerId: "p1", relation: "neutral", isQuestCompleted: () => false }).reason, "quest_required");
  const result = service.capture({ location, playerId: "p1", relation: "neutral", isQuestCompleted: (id) => id === "help-mayor" });
  assert.equal(result.success, true);
  assert.equal(result.method, "quest");
});
