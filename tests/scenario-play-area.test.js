import test from "node:test";
import assert from "node:assert/strict";
import { validateLobbyPlayArea } from "../server/lobby/scenario-play-area.js";
import {
  scenarioBundles,
  buildScenarioBundles,
} from "../server/lobby/scenario-catalog.js";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { branchExample } from "../editor/js/branch-example.js";
import { addLocation } from "../editor/js/project.js";
const area = {
  name: "Terrain du scénario",
  polygon: [
    { latitude: 48.8, longitude: 2.2 },
    { latitude: 48.8, longitude: 2.4 },
    { latitude: 48.9, longitude: 2.4 },
    { latitude: 48.9, longitude: 2.2 },
  ],
  excludedPolygons: [],
};
test("les lieux nouveaux sont aléatoires et le paquet conserve son terrain sans le modifier", () => {
  const project = branchExample();
  project.world.playArea = structuredClone(area);
  const location = addLocation(project);
  assert.equal(
    project.world.locationSlots.find((slot) => slot.id === location.id)
      .defaultPlacement.strategy,
    "random",
  );
  const bundle = buildScenarioBundles([project]).get(project.quest.id);
  assert.deepEqual(bundle.playArea, area);
  bundle.playArea.polygon[0].latitude = 0;
  assert.equal(project.world.playArea.polygon[0].latitude, 48.8);
});
test("choisir un terrain de scénario effectue le même contrôle que le tracé manuel", () => {
  const bundle = scenarioBundles.get("chaos"),
    previous = bundle.playArea;
  bundle.playArea = area;
  try {
    const service = new LobbyService();
    const host = service.createLobby({
      playerName: "Test",
      positionMode: "gps",
    });
    const result = service.updateConfiguration({
      token: host.session.token,
      configuration: { scenarioId: "chaos" },
    });
    assert.deepEqual(result.playArea, validateLobbyPlayArea(area, result.code));
    const manual = service.setPlayArea({
      token: host.session.token,
      playArea: area,
    });
    assert.deepEqual(manual.playArea, result.playArea);
    const simulation = service.updateConfiguration({
      token: host.session.token,
      configuration: { positionMode: "simulation" },
    });
    assert.equal(simulation.playArea, null);
  } finally {
    bundle.playArea = previous;
  }
});
test("un terrain de scénario invalide est refusé et ne modifie pas la configuration", () => {
  const bundle = scenarioBundles.get("chaos"),
    previous = bundle.playArea;
  bundle.playArea = { ...area, polygon: [{ latitude: 120, longitude: 2 }] };
  try {
    const service = new LobbyService();
    const host = service.createLobby({
      playerName: "Test",
      positionMode: "gps",
    });
    assert.throws(
      () =>
        service.updateConfiguration({
          token: host.session.token,
          configuration: { scenarioId: "chaos" },
        }),
      (error) => error.code === "invalid_play_area",
    );
    assert.equal(service.snapshot(host.lobby.code).playArea, null);
  } finally {
    bundle.playArea = previous;
  }
});
