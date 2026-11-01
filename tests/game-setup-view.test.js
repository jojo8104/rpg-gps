import assert from "node:assert/strict";
import test from "node:test";
import {
  nextSetupAction,
  previousSetupPage,
} from "../app/js/ui/game-setup-view.js";

test("la simulation conserve le choix du rythme avant le héros", () => {
  assert.deepEqual(nextSetupAction(1, "simulation"), { pageIndex: 2 });
  assert.deepEqual(nextSetupAction(3, "simulation"), { start: true });
  assert.equal(previousSetupPage(3, "simulation"), 2);
});

test("le GPS conserve toutes les étapes de préparation", () => {
  assert.deepEqual(nextSetupAction(1, "gps"), { pageIndex: 2 });
  assert.deepEqual(nextSetupAction(3, "gps"), { pageIndex: 4 });
  assert.equal(previousSetupPage(3, "gps"), 2);
});
