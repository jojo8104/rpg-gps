import assert from "node:assert/strict";
import test from "node:test";
import { LocationEngine, LOCATION_STATES } from "../app/js/core/location-engine.js";

const location = { id: "village", position: { latitude: 48, longitude: 2 }, interactionRadius: 100 };
test("une présence continue n'émet qu'une entrée puis une sortie", () => {
  const engine = new LocationEngine({ locations: [location], exitMarginMeters: 0 });
  assert.equal(engine.update({ actorId: "hero", position: location.position })[0].type, "LocationEntered");
  assert.deepEqual(engine.update({ actorId: "hero", position: location.position }), []);
  assert.equal(engine.getState("hero", "village"), LOCATION_STATES.INSIDE);
  assert.equal(engine.update({ actorId: "hero", position: { latitude: 48.01, longitude: 2 } })[0].type, "LocationExited");
});

test("le cooldown empêche une réentrée immédiate", () => {
  let now = 0; const engine = new LocationEngine({ locations: [location], cooldownMs: 1000, exitMarginMeters: 0, now: () => now });
  assert.equal(engine.update({ actorId: "hero", position: location.position }).length, 1); now = 10;
  engine.update({ actorId: "hero", position: { latitude: 48.01, longitude: 2 } }); now = 20;
  assert.deepEqual(engine.update({ actorId: "hero", position: location.position }), []);
  assert.equal(engine.getState("hero", "village"), LOCATION_STATES.EXITED);
  now = 1010;
  assert.equal(engine.update({ actorId: "hero", position: location.position })[0].type, "LocationEntered");
});
