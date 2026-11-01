import assert from "node:assert/strict";
import test from "node:test";
import { createMapInteractionController } from "../app/js/controllers/map-interaction-controller.js";

function fixture() {
  const calls = [];
  let sheetOpen = false;
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args]);
  const session = {
    mode: "simulation",
    setupActive: true,
    enabledLocationIds: new Set(),
    tasks: new Map(),
    field: {
      exclusionDraftPoints: [],
      addExclusionPoint(point) {
        this.exclusionDraftPoints.push(point);
      },
    },
    playArea: { allowsPlacement: () => false },
  };
  const controller = createMapInteractionController({
    getSession: () => session,
    asGps: (value) =>
      Array.isArray(value)
        ? { latitude: value[0], longitude: value[1] }
        : value,
    activateDivinationAt: record("divination"),
    moveLocation: record("move"),
    addSetupAutonomousGroup: record("group"),
    renderGpsLocationButtons: record("buttons"),
    updateSetupCompletion: record("completion"),
    onChange: record("render"),
    onLog: record("log"),
    onExclusionReady: record("exclusion"),
    onAreaStatus: record("status"),
    onCapitalPlaced: record("capital"),
    onSetupReady: record("ready"),
    isSheetOpen: () => sheetOpen,
    onCloseLocation: record("close"),
    applyPosition: record("position"),
  });
  return {
    controller,
    calls,
    session,
    openSheet() {
      sheetOpen = true;
    },
  };
}

test("un clic ordinaire ferme une fiche, puis permet un déplacement uniquement en simulation", () => {
  const f = fixture();
  f.controller.click({ latitude: 1, longitude: 2 });
  assert.deepEqual(f.calls, [["position", [1, 2]]]);
  f.openSheet();
  f.controller.click({ latitude: 3, longitude: 4 });
  assert.deepEqual(f.calls.at(-1), ["close"]);
});

test("un placement manuel hors zone est refusé sans terminer la tâche", () => {
  const f = fixture();
  f.session.tasks.set("capital", { kind: "location", id: "royal-capital" });
  f.controller.mode = "setup-manual:capital";
  f.controller.click({ latitude: 1, longitude: 2 });
  assert.equal(f.session.tasks.size, 1);
  assert.equal(
    f.calls.some(([name]) => name === "move"),
    false,
  );
  assert.equal(f.controller.mode, "setup-manual:capital");
});

test("le dessin d'exclusion ne déplace pas le héros et devient validable au troisième sommet", () => {
  const f = fixture();
  f.controller.mode = "draw-exclusion";
  for (let i = 0; i < 3; i++) f.controller.click({ latitude: i, longitude: i });
  assert.deepEqual(
    f.calls.filter(([name]) => name === "exclusion"),
    [
      ["exclusion", false],
      ["exclusion", false],
      ["exclusion", true],
    ],
  );
  assert.equal(
    f.calls.some(([name]) => name === "position"),
    false,
  );
  f.controller.reset();
  assert.equal(f.controller.mode, null);
});

test("la sélection de divination reçoit des coordonnées GPS sans déplacer le héros", () => {
  const f = fixture();
  f.controller.mode = "target-divination";
  f.controller.click({ latitude: 1, longitude: 2 });
  assert.deepEqual(f.calls, [["divination", { latitude: 1, longitude: 2 }]]);
});
