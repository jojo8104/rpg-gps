import assert from "node:assert/strict";
import test from "node:test";
import { EngagementService } from "../app/js/core/engagement-service.js";

test("un engagement est possible uniquement dans le rayon configuré", () => {
  const service = new EngagementService({ engagementRadiusMeters: 100 });
  const first = { id: "a", state: "active", position: { latitude: 48.8566, longitude: 2.3522 } };
  const near = { id: "b", state: "active", position: { latitude: 48.857, longitude: 2.3522 } };
  const far = { id: "c", state: "active", position: { latitude: 48.86, longitude: 2.3522 } };
  assert.equal(service.canEngage(first, near), true);
  assert.equal(service.canEngage(first, far), false);
});

test("le contexte GPS crée une zone sans géométrie tactique", () => {
  const service = new EngagementService();
  const context = service.createContext([{ id: "west", position: { latitude: 48.8566, longitude: 2.35 } }, { id: "east", position: { latitude: 48.8566, longitude: 2.351 } }]);
  const teams = service.createTeamParticipants({ teams: [{ id: "red", heroIds: ["west"] }, { id: "blue", heroIds: ["east"] }], context });
  assert.equal(context.radiusMeters >= 50, true);
  assert.deepEqual(teams, [{ id: "red", heroIds: ["west"] }, { id: "blue", heroIds: ["east"] }]);
});
