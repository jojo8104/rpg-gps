import assert from "node:assert/strict";
import test from "node:test";
import { buildPlayerInteractionIntel } from "../app/js/core/player-interaction-policy.js";

const participants = [
  { playerId: "green-1", teamId: "green" },
  { playerId: "green-2", teamId: "green" },
  { playerId: "red-1", teamId: "red" },
];
const observerPosition = { latitude: 48, longitude: 2 };
const target = (playerId, latitude) => ({
  playerId,
  name: playerId,
  heroClassId: "warrior",
  position: { latitude, longitude: 2 },
  heroState: {
    level: 2,
    health: 20,
    maxHealth: 25,
    units: [{ combatantCount: 4 }],
  },
});

test("un allié est vert, identifié et propose les interactions sociales", () => {
  const intel = buildPlayerInteractionIntel({
    observerPlayerId: "green-1",
    target: target("green-2", 48.0001),
    participants,
    observerPosition,
    interactionRange: 25,
    allowPvP: true,
  });
  assert.equal(intel.teamColor, "green");
  assert.equal(intel.informationLevel, 3);
  assert.deepEqual(intel.actions.map(({ id, enabled }) => [id, enabled]), [
    ["talk", true],
    ["trade", true],
  ]);
});

test("un ennemi devient attaquable seulement à portée", () => {
  const close = buildPlayerInteractionIntel({
    observerPlayerId: "green-1",
    target: target("red-1", 48.0001),
    participants,
    observerPosition,
    interactionRange: 25,
    allowPvP: true,
  });
  const far = buildPlayerInteractionIntel({
    observerPlayerId: "green-1",
    target: target("red-1", 48.001),
    participants,
    observerPosition,
    interactionRange: 25,
    allowPvP: true,
    detectionRange: 150,
  });
  assert.equal(close.teamColor, "red");
  assert.equal(close.actions[0].enabled, true);
  assert.equal(far.actions[0].enabled, false);
  assert.equal(far.informationLevel, 1);
});

test("le PvP désactivé interdit le bouton même à portée", () => {
  const intel = buildPlayerInteractionIntel({ observerPlayerId: "green-1", target: target("red-1", 48.0001), participants, observerPosition, allowPvP: false });
  assert.equal(intel.actions[0].enabled, false);
});
