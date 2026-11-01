import assert from "node:assert/strict";
import test from "node:test";
import { hasHeroMoved } from "../app/js/map/hero-motion.js";
import { UnitRenderer } from "../app/js/map/UnitRenderer.js";

test("le sprite marche pendant l'interpolation puis s'arrête, sans redémarrer sur un état répété", (t) => {
  const previous = {
    L: globalThis.L,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  t.after(() => Object.assign(globalThis, previous));
  const frames = [],
    timers = [],
    states = [],
    cancelled = [];
  let position = { lat: 0, lng: 0 };
  const marker = {
    addTo() {
      return this;
    },
    on() {},
    getLatLng: () => position,
    setLatLng(value) {
      position = { lat: value[0], lng: value[1] };
    },
  };
  globalThis.L = { divIcon: () => ({}), marker: () => marker };
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  globalThis.cancelAnimationFrame = (id) => cancelled.push(id);
  globalThis.setTimeout = (callback) => {
    timers.push(callback);
    return timers.length;
  };
  globalThis.clearTimeout = () => {};
  const renderer = new UnitRenderer({
    map: { on() {} },
    mode: "simulation",
    billboards: { set: (id, state) => states.push(state.walking), render() {} },
  });
  renderer.render([0, 0], null, 90);
  assert.equal(states.at(-1), false);
  renderer.render([1, 1], null, 90);
  assert.equal(states.at(-1), true);
  assert.equal(frames.length, 1);
  renderer.render([1, 1], null, 90);
  assert.equal(frames.length, 1);
  frames[0](performance.now() + 1000);
  assert.deepEqual(position, { lat: 1, lng: 1 });
  assert.equal(timers.length, 1);
  timers[0]();
  assert.equal(states.at(-1), false);
});

test("la marche ignore une position répétée et les petits écarts GPS", () => {
  assert.equal(hasHeroMoved(null, [48, 2], "gps"), false);
  assert.equal(hasHeroMoved([48, 2], [48, 2], "gps"), false);
  assert.equal(hasHeroMoved([48, 2], [48.000001, 2], "gps"), false);
  assert.equal(hasHeroMoved([48, 2], [48.00002, 2], "gps"), true);
});
test("la marche s'active aussi pour les déplacements fictifs officiels", () => {
  assert.equal(hasHeroMoved([0, 0], [0, 0], "simulation"), false);
  assert.equal(hasHeroMoved([0, 0], [1, 1], "simulation"), true);
});
