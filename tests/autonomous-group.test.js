import assert from "node:assert/strict";
import test from "node:test";
import { AutonomousGroup, AUTONOMOUS_GROUP_TYPES } from "../app/js/core/autonomous-group.js";
import { Game } from "../app/js/core/game.js";

const setup = {
  id: "setup", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 1,
  playArea: { id: "area", name: "Zone", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] },
  participants: [{ playerId: "p1", name: "Joueur" }],
};

const group = (overrides = {}) => new AutonomousGroup({
  id: "group-1", type: "convoy", owner: { kind: "player", id: "p1" },
  position: { latitude: 48, longitude: 2 }, originLocationId: "camp-1",
  behavior: "traveling", mission: { kind: "transport", targetId: "fort-1" },
  cargo: [{ itemId: "wood", quantity: 10 }], ...overrides,
});

test("les cinq types de groupes autonomes sont disponibles", () => {
  assert.deepEqual(AUTONOMOUS_GROUP_TYPES, ["rogue", "army", "messenger", "convoy", "prospecting"]);
});

test("un groupe conserve son propriétaire et produit des données sérialisables", () => {
  const convoy = group();
  const snapshot = convoy.toJSON();
  assert.deepEqual(snapshot.owner, { kind: "player", id: "p1" });
  assert.equal(snapshot.type, "convoy");
  assert.equal(snapshot.mission.kind, "transport");
  assert.deepEqual(snapshot.cargo, [{ itemId: "wood", quantity: 10 }]);
  assert.deepEqual(new AutonomousGroup(snapshot).toJSON(), snapshot);
});

test("le propriétaire est obligatoire et doit avoir un type reconnu", () => {
  assert.throws(() => group({ owner: null }), /propriétaire/);
  assert.throws(() => group({ owner: { kind: "unknown", id: "p1" } }), /pas reconnu/);
});

test("Game gère les groupes par identifiant et propriétaire", () => {
  const game = new Game({ setup, autonomousGroups: [group()] });
  assert.equal(game.getAutonomousGroup("group-1").type, "convoy");
  assert.equal(game.getAutonomousGroupsByOwner({ kind: "player", id: "p1" }).length, 1);
  assert.equal(game.addAutonomousGroup(group()), false);
  assert.equal(game.toJSON().autonomousGroups.length, 1);
  assert.equal(game.removeAutonomousGroup("group-1").id, "group-1");
  assert.equal(game.getAutonomousGroup("group-1"), null);
});

test("un groupe rogue utilise directement le modèle générique", () => {
  const rogue = new AutonomousGroup({
    id: "rogue-1", type: "rogue", owner: { kind: "independent", id: "rogue-1" },
    position: { latitude: 0, longitude: 0 }, army: {}, behavior: "roaming",
    mission: { kind: "roam" }, morale: 2,
  });
  assert.equal(rogue.type, "rogue");
  assert.deepEqual(rogue.owner, { kind: "independent", id: "rogue-1" });
  assert.equal(rogue.toJSON().morale, 2);
  assert.equal(new AutonomousGroup(rogue.toJSON()).morale, 2);
});
