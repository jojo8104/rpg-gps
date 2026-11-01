import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../app/js/core/game.js";
import { Location } from "../app/js/core/location.js";
import { projectPlayerPayload } from "../server/realtime/player-projection.js";
import { SnapshotStream } from "../server/realtime/snapshot-stream.js";
import { SnapshotReceiver } from "../app/js/core/snapshot-delta.js";
import { socialGame } from "./fixtures/player-social-game.js";

function fixture() {
  const source = socialGame().game.toJSON();
  source.scenario = {
    id: "chaos",
    name: "Scenario",
    intro: "Test",
    initialPhaseId: "first",
    locationSlots: [
      { id: "known-slot", type: "fort" },
      { id: "hidden-slot", type: "fort" },
    ],
    phases: [
      {
        id: "first",
        title: "Départ",
        description: "Test",
        objectives: [],
        eventIds: [],
        transitions: [],
      },
    ],
    events: [],
  };
  source.scenarioState = null;
  source.locations = ["known", "hidden"].map((id, index) =>
    new Location({
      id,
      name: id,
      type: "fort",
      source: "scenario",
      visibility: "hidden",
      position: { latitude: 0.1 + index * 0.1, longitude: 0.1 },
    }).toJSON(),
  );
  source.scenarioLocationBindings = source.locations.map((location) => ({
    locationSlotId: `${location.id}-slot`,
    locationId: location.id,
  }));
  source.scenarioRuntime = {
    scenarioId: "chaos",
    placements: Object.fromEntries(
      source.locations.map((location) => [
        `${location.id}-slot`,
        {
          locationId: location.id,
          strategy: "fixed",
          status: location.id === "hidden" ? "pending" : "placed",
          position: location.position,
        },
      ]),
    ),
  };
  const game = Game.fromJSON(source);
  game.getPlayer("a").discoverLocation("known");
  const project = () => {
    const state = game.toJSON();
    return projectPlayerPayload(
      { code: "A", revision: 1, state },
      {
        playerId: "a",
        lobby: {
          configuration: { gameType: "cooperation" },
          players: game.players,
        },
        gameSnapshot: { state },
        positions: { positions: [] },
        now: 1000,
      },
    );
  };
  return { game, project };
}

test("hidden scenario location: reproduce dangling binding and restore the filtered snapshot", () => {
  const { game, project } = fixture();
  const broken = game.toJSON();
  broken.locations = broken.locations.filter(
    (location) => location.id === "known",
  );
  assert.throws(() => Game.fromJSON(broken), /Le lieu associé n'existe pas/);
  const projected = project().state;
  assert.deepEqual(projected.scenarioLocationBindings, [
    { locationSlotId: "known-slot", locationId: "known" },
  ]);
  assert.deepEqual(Object.keys(projected.scenarioRuntime.placements), [
    "known-slot",
  ]);
  assert.doesNotThrow(() => Game.fromJSON(projected));
  assert.equal(game.scenarioLocationBindings.length, 2);
  assert.ok(game.scenarioRuntime.placements["hidden-slot"]);
});

test("discovery and removal update locations, bindings and placements together through deltas", () => {
  const { game, project } = fixture();
  const stream = new SnapshotStream();
  const receiver = new SnapshotReceiver();
  const receive = () =>
    receiver.receive(
      "game",
      JSON.parse(JSON.stringify(stream.encode(project()))),
    );
  assert.doesNotThrow(() => Game.fromJSON(receive().state));
  game.getPlayer("a").discoverLocation("hidden");
  game.scenarioRuntime.placements["hidden-slot"].status = "placed";
  const discovered = Game.fromJSON(receive().state);
  assert.equal(discovered.scenarioLocationBindings.length, 2);
  assert.ok(discovered.getLocation("hidden"));
  game.getLocation("hidden").state = "dismissed";
  const removed = Game.fromJSON(receive().state);
  assert.equal(removed.scenarioLocationBindings.length, 1);
  assert.equal(removed.getLocation("hidden"), null);
});

test("a projected scenario with no visible places still restores without rebuilding hidden placements", () => {
  const { game, project } = fixture();
  game.getLocation("known").state = "dismissed";
  const snapshot = project().state;
  assert.deepEqual(snapshot.locations, []);
  assert.deepEqual(snapshot.scenarioRuntime.placements, {});
  assert.doesNotThrow(() => Game.fromJSON(snapshot));
});

test("un placement de quête masqué publie sa progression sans révéler son lieu", () => {
  const { game, project } = fixture();
  game.scenario.getPhase("first").objectives.push({
    id: "find",
    text: "Chercher le camp",
    trigger: { type: "locationPlaced", locationSlotId: "hidden-slot" },
  });
  game.scenarioState.activateOfferedPhase(game.scenario, "first");
  Object.assign(game.scenarioRuntime.placements["hidden-slot"], {
    strategy: "distance",
    status: "walking",
    origin: { latitude: 0.1, longitude: 0.1 },
    lastPosition: { latitude: 0.2, longitude: 0.1 },
    distanceMeters: 100,
    minimumDistanceMeters: 150,
    distanceFromOriginMeters: 100,
    minimumDistanceFromOriginMeters: 75,
    confirmationCount: 0,
    confirmations: 2,
  });
  const snapshot = project().state;
  const progress = snapshot.scenarioRuntime.placements["hidden-slot"];
  assert.equal(progress.distanceMeters, 100);
  assert.equal(progress.status, "walking");
  for (const key of ["locationId", "position", "origin", "lastPosition"])
    assert.equal(Object.hasOwn(progress, key), false);
  assert.equal(
    snapshot.locations.some((location) => location.id === "hidden"),
    false,
  );
  assert.equal(
    snapshot.scenarioLocationBindings.some(
      (binding) => binding.locationId === "hidden",
    ),
    false,
  );
  assert.doesNotThrow(() => Game.fromJSON(snapshot));
  assert.equal(
    game.scenarioRuntime.placements["hidden-slot"].locationId,
    "hidden",
  );
  game.scenarioState.getCurrentPhaseState().status = "completed";
  assert.equal(
    project().state.scenarioRuntime.placements["hidden-slot"],
    undefined,
  );
});
