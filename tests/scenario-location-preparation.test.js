import assert from "node:assert/strict";
import test from "node:test";
import { GameSetup } from "../app/js/core/game-setup.js";
import { prepareScenarioLocationsForPlayArea } from "../app/js/core/scenario-location-preparation.js";

test("les coordonnées de catalogue fixes sont préparées dans la PlayArea", () => {
  const setup = new GameSetup({
    id: "setup-away-from-catalog",
    name: "Zone réelle",
    mode: "quick",
    scenarioId: "test",
    playArea: {
      id: "real-area",
      name: "Zone réelle",
      polygon: [
        { latitude: 45, longitude: 4 },
        { latitude: 45, longitude: 4.01 },
        { latitude: 45.01, longitude: 4.01 },
        { latitude: 45.01, longitude: 4 },
      ],
    },
  });
  const locations = [
    {
      id: "royal-capital",
      position: { latitude: 48.8566, longitude: 2.3522 },
    },
    {
      id: "walking-camp",
      position: { latitude: 48.86, longitude: 2.36 },
    },
  ];
  const prepared = prepareScenarioLocationsForPlayArea({
    scenario: {
      locationSlots: [
        { id: "capital", defaultPlacement: { strategy: "fixed" } },
        { id: "camp", defaultPlacement: { strategy: "distance" } },
      ],
    },
    setup,
    bindings: [
      { locationSlotId: "capital", locationId: "royal-capital" },
      { locationSlotId: "camp", locationId: "walking-camp" },
    ],
    locations,
  });

  assert.equal(setup.playArea.allowsPlacement(prepared[0].position), true);
  assert.deepEqual(prepared[1].position, locations[1].position);
  assert.deepEqual(locations[0].position, {
    latitude: 48.8566,
    longitude: 2.3522,
  });
});
