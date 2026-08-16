import assert from "node:assert/strict";
import test from "node:test";
import { InteractionEngine } from "../app/js/core/interaction-engine.js";

test("un ennemi passif crée une rencontre sans bataille automatique", () => {
  const engine = new InteractionEngine({ locations: [{ id: "camp" }], enemyResolver: () => ({ name: "Brigands", aggressive: false }) });
  const result = engine.handle({ type: "LocationEntered", actorId: "hero", locationId: "camp" });
  assert.equal(result.type, "encounter"); assert.equal(result.autoBattle, false); assert.equal(result.encounter.status, "awaiting_decision");
});

test("un ennemi agressif demande une bataille automatique", () => {
  const engine = new InteractionEngine({ locations: [{ id: "camp" }], enemyResolver: () => ({ name: "Brigands", aggressive: true }) });
  const result = engine.handle({ type: "LocationEntered", actorId: "hero", locationId: "camp" });
  assert.equal(result.autoBattle, true); assert.equal(result.encounter.status, "attacking");
});
