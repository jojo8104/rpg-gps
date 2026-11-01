import test from "node:test";
import assert from "node:assert/strict";
import { AutonomousGroup } from "../app/js/core/autonomous-group.js";
import { AutonomousGroupTrace } from "../app/js/core/autonomous-group-trace.js";
import { Location } from "../app/js/core/location.js";
import { ResourceZone } from "../app/js/core/resource-zone.js";
import { Game } from "../app/js/core/game.js";
import { ScenarioLocationBinding } from "../app/js/core/scenario-location-binding.js";
import { discoverNearbyLocations, playerMapVisibility } from "../app/js/core/player-map-visibility.js";
import { projectPlayerPayload } from "../server/realtime/player-projection.js";
import { socialGame } from "./fixtures/player-social-game.js";

function fixture() {
  const { game, heroes } = socialGame();
  const p = (latitude) => ({ latitude, longitude: 0 });
  game.autonomousGroups = [0.00001, 0.01].map((lat, i) => new AutonomousGroup({ id: `ga-${i}`, type: "army", owner: { kind: "independent", id: "bandits" }, position: p(lat) }));
  game.locations = [0.00001, 0.01, 0.02].map((lat, i) => new Location({ id: `place-${i}`, name: `Lieu ${i}`, type: "camp", source: "test", visibility: "visible", position: p(lat) }));
  game.getPlayer("a").discoverLocation("place-1");
  game.autonomousGroupTraces = [0.00001, 0.01].map((lat, i) => new AutonomousGroupTrace({ id: `trace-${i}`, groupId: `ga-${i}`, groupType: "army", owner: { kind: "independent", id: "bandits" }, soldierCount: 50, position: p(lat), createdAt: 1000 }));
  game.resourceZones = [0.00001, 0.01].map((lat, i) => new ResourceZone({ id: `zone-${i}`, resourceId: "gold", locationType: "mine", position: p(lat), discoveredByPlayerIds: i === 0 ? ["a"] : [] }));
  const project = () => {
    const state = game.toJSON();
    return projectPlayerPayload({ game: { code: "A", state }, world: { state } }, {
      playerId: "a", lobby: { configuration: { gameType: "cooperation" }, players: game.players },
      gameSnapshot: { state }, now: 1000,
      positions: { positions: heroes.map((h) => ({ playerId: h.playerId, position: h.position, connected: true })) },
    });
  };
  return { game, heroes, project };
}

test("la projection affiche les lieux existants et filtre les GA non détectés", () => {
  const { game, project } = fixture();
  discoverNearbyLocations(game);
  const packet = project();
  for (const snapshot of [packet.game.state, packet.world.state]) {
    assert.deepEqual(snapshot.locations.map((l) => l.id), ["place-0", "place-1", "place-2"]);
    assert.deepEqual(snapshot.autonomousGroups.map((g) => g.id), ["ga-0"]);
    assert.deepEqual(snapshot.autonomousGroupTraces.map((g) => g.id), ["trace-0"]);
    assert.deepEqual(snapshot.resourceZones.map((g) => g.id), ["zone-0"]);
    assert.doesNotThrow(() => Game.fromJSON(snapshot));
  }
  assert.equal(game.autonomousGroups.length, 2);
  assert.equal(game.locations.length, 3);
});

test("le serveur annonce les lieux placés même cachés et conserve leurs renseignements", () => {
  const { game, heroes } = fixture();
  game.locations[2].visibility = "hidden";
  heroes[0].updatePosition(game.locations[2].position);
  discoverNearbyLocations(game);
  assert.equal(game.getPlayer("a").knowsLocation("place-2"), true);
  assert.equal(game.getPlayer("b").knowsLocation("place-2"), true);
  assert.equal(game.getPlayer("b").getLocationKnowledge("place-2"), 1);
  game.locations[2].visibility = "visible";
  discoverNearbyLocations(game);
  heroes[0].updatePosition({ latitude: 1, longitude: 0 });
  discoverNearbyLocations(game);
  const visible = playerMapVisibility(game.toJSON(), "a", 1000);
  assert.ok(visible.locations.has("place-2"));
  assert.equal(visible.autonomousGroups.size, 0);
});

test("les lieux placés sont visibles avant toute quête, les emplacements différés restent masqués", () => {
  const { game, project } = fixture();
  game.locations[0].visibility = "hidden";
  game.locations[0].id = "prospector-battlefield";
  game.scenarioLocationBindings = [new ScenarioLocationBinding({ locationSlotId: "future", locationId: "place-2" })];
  game.scenarioRuntime = { placements: { future: { strategy: "distance", status: "waiting", locationId: "place-2" } } };
  assert.deepEqual([...playerMapVisibility(game.toJSON(), "a").locations], ["prospector-battlefield", "place-1"]);
  assert.deepEqual(project().game.state.locations.map((location) => location.id), ["prospector-battlefield", "place-1"]);
  game.scenarioRuntime.placements.future.status = "placed";
  assert.ok(playerMapVisibility(game.toJSON(), "a").locations.has("place-2"));
  game.locations[2].state = "destroyed";
  assert.equal(playerMapVisibility(game.toJSON(), "a").locations.has("place-2"), false);
});

test("GA visibility follows movement, concealment, divination expiry and simulation distances", () => {
  const { game, heroes } = fixture();
  game.coordinateMode = "simulation";
  game.autonomousGroups[0].position = { latitude: 15, longitude: 0 };
  game.autonomousGroups[1].position = { latitude: 80, longitude: 0 };
  assert.ok(playerMapVisibility(game.toJSON(), "a", 1000).autonomousGroups.has("ga-0"));
  game.autonomousGroups[0].status = "ambushing";
  assert.equal(playerMapVisibility(game.toJSON(), "a", 1000).autonomousGroups.has("ga-0"), false);
  heroes[0].classFeatureState.divinationVision = { center: { latitude: 80, longitude: 0 }, radius: 5, expiresAt: 2000 };
  assert.ok(playerMapVisibility(game.toJSON(), "a", 1000).autonomousGroups.has("ga-1"));
  assert.equal(playerMapVisibility(game.toJSON(), "a", 2000).autonomousGroups.has("ga-1"), false);
});
