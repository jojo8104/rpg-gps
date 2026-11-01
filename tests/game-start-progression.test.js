import test from "node:test";
import assert from "node:assert/strict";
import { createGameStartController } from "../app/js/controllers/game-start-controller.js";

for (const mode of ["gps", "simulation"]) {
  test(`le lancement ${mode} conserve le niveau et les forces officiels`, () => {
    const hero = {
      level: 1,
      experience: 0,
      army: { units: [] },
      updatePosition() {},
    };
    const context = {
      $: () => ({ querySelector: () => ({}), addEventListener() {} }),
      mode,
      hero,
      capitalPlaced: true,
      manualSetupPlacements: new Set(),
      positionFor: (id) => {
        assert.equal(id, "capital-personnalisee");
        return { latitude: 0, longitude: 0 };
      },
      positioning: { position: null, locationPositions: new Map() },
      asGps: (position) => position,
      multiplayer: { active: false },
      game: {
        status: "preparing",
        locations: [],
        getLocationForScenarioSlot(slot) {
          assert.equal(slot, "capital");
          return { id: "capital-personnalisee" };
        },
        start() {
          this.status = "started";
        },
      },
      worldMap: { view: { focus() {} }, invalidateSize() {} },
      rebuildLocationEngine() {},
      ui: { game: { classList: { remove() {} } }, gpsSetup: {}, gpsStatus: {} },
      mapInteractions: {},
      deviceAlerts: { enable: async () => false },
      logTest() {},
      screenAwake: { start() {} },
      gps: { startCompass() {} },
      applyPosition() {},
      render() {},
      quests: { startAdventure() {} },
    };
    createGameStartController(context).finishGameStart();
    assert.equal(context.game.status, "started");
    assert.equal(hero.level, 1);
    assert.equal(hero.experience, 0);
    assert.deepEqual(hero.army.units, []);
  });
}
