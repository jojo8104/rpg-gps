import assert from "node:assert/strict";
import test from "node:test";
import { createMapController } from "../app/js/controllers/map-controller.js";

function fixture(mode = "gps") {
  const views = [],
    calls = [],
    queued = [];
  let paused = false;
  let setupActive = false;
  const controller = createMapController({
    element: {},
    getSession: () => ({ mode, position: [1, 2], setupActive }),
    isPaused: () => paused,
    onFollowState: (state) => calls.push(["state", state.mode]),
    onDeferredRender: () => calls.push(["deferred"]),
    schedule: (callback) => queued.push(callback),
    createView: () => {
      const view = {
        bearingEnabled: false,
        map: {
          on: (name, callback) => {
            view.drag = callback;
          },
          remove: () => {
            view.removed = true;
          },
          invalidateSize: () => calls.push(["resize"]),
        },
        setBearingEnabled(value) {
          this.bearingEnabled = value;
        },
        focus: () => calls.push(["focus"]),
        follow: () => calls.push(["follow"]),
        setHeroHeading: () => calls.push(["heading"]),
        setHeroPosition: (...args) => calls.push(["position", ...args]),
        render: () => calls.push(["render"]),
        setAlliedHeroes: () => calls.push(["allies"]),
      };
      views.push(view);
      return view;
    },
  });
  controller.initialize({});
  return {
    controller,
    calls,
    views,
    queued,
    pause() {
      paused = true;
    },
    prepare() {
      setupActive = true;
    },
  };
}

test("la sélection d'une zone distante n'est pas recentrée par les mesures GPS", () => {
  const f = fixture();
  f.prepare();
  f.calls.length = 0;
  f.controller.follow([48, 2]);
  f.controller.displayPosition({ latitude: 48, longitude: 2 }, 5, 90);
  assert.deepEqual(f.calls, [
    ["position", { latitude: 48, longitude: 2 }, 5, 90],
  ]);
});

test("le pion GPS se déplace sans rendu global même en navigation libre", () => {
  const f = fixture();
  f.views[0].drag();
  f.calls.length = 0;
  f.controller.displayPosition({ latitude: 48, longitude: 2 }, 5, 90);
  assert.deepEqual(f.calls, [
    ["position", { latitude: 48, longitude: 2 }, 5, 90],
  ]);
  f.pause();
  f.controller.displayPosition({ latitude: 49, longitude: 3 }, 5, 90);
  assert.deepEqual(f.calls.at(-1), ["deferred"]);
});

test("recentrage GPS et orientation, glissement libre puis reprise du suivi", () => {
  const f = fixture();
  f.controller.recenter();
  assert.equal(f.controller.followMode, "centered");
  assert.equal(f.views[0].bearingEnabled, false);
  f.controller.recenter();
  assert.equal(f.controller.followMode, "bearing");
  f.views[0].drag();
  assert.equal(f.controller.followMode, "free");
  f.calls.length = 0;
  f.controller.follow([3, 4]);
  assert.deepEqual(f.calls, []);
  f.controller.recenter();
  assert.equal(f.controller.followMode, "centered");
  f.controller.recenter();
  assert.equal(f.controller.followMode, "bearing");
  f.controller.recenter();
  assert.equal(f.controller.followMode, "centered");
  assert.equal(f.views[0].bearingEnabled, false);
});

test("le second clic active aussi le suivi de dos en simulation", () => {
  const f = fixture("simulation");
  f.controller.recenter();
  assert.equal(f.controller.followMode, "centered");
  assert.equal(f.views[0].bearingEnabled, false);
  f.controller.recenter();
  assert.equal(f.controller.followMode, "bearing");
});

test("la pause diffère les rendus et le cap sans déplacer la carte", () => {
  const f = fixture();
  f.pause();
  f.calls.length = 0;
  f.controller.render({}, []);
  f.controller.setHeading(30);
  f.controller.follow([3, 4]);
  assert.deepEqual(f.calls, [["deferred"], ["deferred"]]);
});

test("remplacer la carte la retire et invalide les anciens gestes et redimensionnements", () => {
  const f = fixture();
  f.controller.invalidateSize();
  const old = f.views[0];
  f.controller.initialize({});
  assert.equal(old.removed, true);
  f.calls.length = 0;
  old.drag();
  f.queued[0]();
  assert.deepEqual(f.calls, []);
  assert.equal(f.controller.followMode, "free");
});
