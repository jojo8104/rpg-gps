import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { LocationSpacingPolicy, placedLocations } from "../app/js/core/location-spacing-policy.js";
import { PlayArea } from "../app/js/core/play-area.js";
import { SetupPlacementService } from "../app/js/core/setup-placement-service.js";

const playArea = new PlayArea({ id: "area", name: "Terrain", polygon: [
  { latitude: 0, longitude: 0 }, { latitude: 0, longitude: 80 },
  { latitude: 80, longitude: 80 }, { latitude: 80, longitude: 0 },
] });
const setup = { id: "spacing", name: "Espacement", mode: "quick", scenarioId: "spacing", playerCount: 1,
  playArea: playArea.toJSON(), participants: [{ playerId: "p", name: "Joueur" }],
  locationSetup: { rangePolicy: { mode: "fixed" } } };
const locations = [
  { id: "a", name: "Mine", type: "mine", interactionRadius: 20, position: { latitude: 20, longitude: 20 } },
  { id: "b", name: "Village", type: "village", interactionRadius: 30, position: { latitude: 60, longitude: 60 } },
];
const gameFixture = () => new Game({ setup, locations: locations.map((location) => ({ ...location, source: "scenario" })), coordinateMode: "simulation" });

test("la génération écarte deux indices superposés sans les révéler", () => {
  const entries = [{ ...locations[0], source: "scenario" }, ...[1, 2].map(n => ({
    id: `trace-${n}`, name: `Indice ${n}`, type: "quest", roles: ["quest", "clue"],
    position: { ...locations[0].position }, source: "scenario",
  }))];
  const slots = entries.map(l => ({ id: l.id, type: l.type,
    appearance: l.type === "quest" ? { on: "ActionCompleted", questId: "q", actionId: l.id } : undefined }));
  const game = new Game({ setup, coordinateMode: "simulation", locations: entries,
    scenario: { id: "spacing", name: "Test", intro: "Test", initialPhaseId: "idle", locationSlots: slots,
      phases: [{ id: "idle", title: "Test", description: "Test", objectives: [] }] },
    scenarioLocationBindings: entries.map(l => ({ locationSlotId: l.id, locationId: l.id })) });
  const policy = new LocationSpacingPolicy({ setup: game.setup, coordinateMode: "simulation" });
  for (const location of game.locations) {
    assert.equal(policy.check(location, location.position, game.locations).success, true);
    if (location.type === "quest")
      assert.deepEqual(game.scenarioRuntime.placements[location.id].appearedForPlayerIds, []);
  }
});

test("les indices réservent un espace lisible, même cachés, dans les deux modes", () => {
  const clue = { ...locations[0], type: "quest", roles: ["quest", "clue"] };
  for (const coordinateMode of ["gps", "simulation"]) {
    const policy = new LocationSpacingPolicy({ setup: { ...setup, playArea }, coordinateMode });
    assert.equal(policy.check(clue, locations[1].position, [locations[1]]).success, false);
    assert.equal(policy.check(locations[1], clue.position, [clue]).success, false);
    assert.equal(policy.requiredDistance(clue, locations[1]), coordinateMode === "gps" ? 70 : 24);
  }
});

test("le seuil GPS additionne les rayons avec une marge d’un mètre", () => {
  const policy = new LocationSpacingPolicy({ setup: { ...setup, playArea } });
  assert.equal(policy.requiredDistance(...locations), 51);
  assert.equal(policy.check(locations[1], { latitude: 20.0001, longitude: 20 }, [locations[0]]).reason, "location_too_close");
  assert.equal(policy.check(locations[1], { latitude: 20.001, longitude: 20 }, [locations[0]]).success, true);
});

test("le serveur refuse un déplacement trop proche sans modifier le lieu", () => {
  const game = gameFixture();
  const before = { ...game.getLocation("b").position };
  const refused = game.updateLocationPosition({ locationId: "b", position: { latitude: 20, longitude: 36 } });
  assert.equal(refused.reason, "location_too_close");
  assert.equal(refused.minimumDistance, 17);
  assert.deepEqual(game.getLocation("b").position, before);
  assert.equal(game.updateLocationPosition({ locationId: "b", position: { latitude: 20, longitude: 37 } }).success, true);
});

test("un placement groupé invalide ne déplace aucun lieu", () => {
  const game = gameFixture();
  const before = game.locations.map((location) => ({ ...location.position }));
  assert.equal(game.updateLocationPositions([
    { locationId: "a", position: { latitude: 40, longitude: 40 } },
    { locationId: "b", position: { latitude: 40, longitude: 42 } },
  ]).reason, "location_too_close");
  assert.deepEqual(game.locations.map((location) => location.position), before);
});

test("les emplacements différés et les convois ne bloquent pas les lieux", () => {
  const game = gameFixture();
  game.scenarioRuntime = { placements: { mine: { status: "waiting", locationId: "a" } } };
  assert.equal(placedLocations(game).some((location) => location.id === "a"), false);
  assert.equal(game.updateLocationPosition({ locationId: "b", position: locations[0].position }).success, true);
  const policy = new LocationSpacingPolicy({ setup: game.setup, coordinateMode: "simulation" });
  assert.equal(policy.check({ ...locations[1], type: "convoy" }, locations[0].position, locations).success, true);
});

test("une zone trop petite refuse le placement sans réduire l’écart demandé", () => {
  const service = new SetupPlacementService({ distanceFn: (a, b) => Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude) });
  assert.throws(() => service.generate({ playArea, count: 2, minimumDistance: 200 }), /distance minimale/);
});
