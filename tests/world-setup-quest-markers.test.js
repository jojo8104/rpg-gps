import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { createWorldSetupController } from "../app/js/controllers/world-setup-controller.js";
import { mapLocationEnabled } from "../app/js/core/player-map-visibility.js";

for (const mode of ["gps", "simulation"])
  for (const preference of ["auto", "manual", "mixed"]) {
    test(
      "les marqueurs de quête sont placés en " + mode + " / " + preference,
      () => {
        const slots = [
          { id: "capital", type: "capital" },
          ...[1, 2].map((n) => ({
            id: "prospectors-trace-" + n,
            type: "quest",
            appearance: {
              on: "ActionCompleted",
              questId: "missing-prospectors",
              actionId: n === 1 ? "question-chief" : "inspect-first-trace",
            },
          })),
        ];
        const locations = slots.map((s, n) => ({
          id: s.id === "capital" ? "royal-capital" : s.id,
          type: s.type,
          name: s.id,
          source: "scenario",
          position: { latitude: 0.1 + n * 0.1, longitude: 0.1 },
        }));
        const game = new Game({
          setup: {
            id: "setup",
            name: "Test",
            mode: "quick",
            scenarioId: "test",
            playerCount: 1,
            participants: [{ playerId: "p1", name: "A" }],
            playArea: {
              id: "area",
              name: "Zone",
              polygon: [
                { latitude: 0, longitude: 0 },
                { latitude: 0, longitude: 1 },
                { latitude: 1, longitude: 0 },
              ],
            },
          },
          scenario: {
            id: "test",
            name: "Test",
            intro: "Test",
            initialPhaseId: "idle",
            locationSlots: slots,
            phases: [
              {
                id: "idle",
                title: "Test",
                description: "Test",
                objectives: [],
              },
            ],
          },
          scenarioLocationBindings: slots.map((s) => ({
            locationSlotId: s.id,
            locationId: s.id === "capital" ? "royal-capital" : s.id,
          })),
          locations,
          coordinateMode: mode,
          questSystemEnabled: false,
        });
        const positions = new Map(
          locations.map((l) => [l.id, { ...l.position }]),
        );
        // Le second indice vient d’une ancienne zone et doit être replacé.
        positions.set("prospectors-trace-2", { latitude: 2, longitude: 2 });
        const context = {
          game,
          mode,
          validatedPlayArea: game.setup.playArea,
          enabledGpsLocationIds: new Set(),
          manualSetupPlacements: new Map(),
          positioning: { locationPositions: positions },
          asGps: (p) =>
            Array.isArray(p) ? { latitude: p[0], longitude: p[1] } : p,
          positionFor: (id) => positions.get(id),
          setupView: {
            readWorldPreferences: () => ({ placement: preference }),
          },
          setupPlacementService: {
            findCentralPosition: () => ({ latitude: 0.1, longitude: 0.1 }),
            generate: () => [{ latitude: 0.6, longitude: 0.2 }],
          },
          ui: {
            gpsAreaStatus: {},
            gpsLocationButtons: { querySelectorAll: () => [] },
            finishGpsSetup: {},
          },
          rebuildLocationEngine() {},
          render() {},
          logTest() {},
          worldMap: { view: { focus() {} } },
          resolveLocationEnemy: () => null,
        };
        const controller = createWorldSetupController(context);
        context.moveLocation = controller.moveLocation;
        controller.applyWorldSetup();
        for (const n of [1, 2]) {
          const id = "prospectors-trace-" + n;
          assert.equal(game.scenarioRuntime.placements[id].status, "placed");
          assert.equal(
            mapLocationEnabled(game.getLocation(id), game, "p1"),
            false,
          );
          assert.equal(context.enabledGpsLocationIds.has(id), true);
          assert.equal(
            context.manualSetupPlacements.has("location:" + id),
            false,
          );
          assert.equal(
            game.setup.playArea.allowsPlacement(game.getLocation(id).position),
            true,
          );
        }
        assert.deepEqual(
          game.getLocation("prospectors-trace-1").position,
          locations[1].position,
        );
        assert.deepEqual(game.getLocation("prospectors-trace-2").position, {
          latitude: 0.6,
          longitude: 0.2,
        });
      },
    );
  }
