import assert from "node:assert/strict";
import test from "node:test";
import { createGpsController } from "../app/js/controllers/gps-controller.js";
import { GpsAccuracyLog } from "../app/js/core/gps-accuracy-log.js";

function fixture() {
  const calls = [],
    trackers = [],
    compasses = [];
  let time = 0;
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args]);
  const controller = createGpsController({
    accuracyLog: new GpsAccuracyLog(),
    now: () => time,
    onPosition: record("position"),
    onHeading: record("heading"),
    onFirstFix: record("first"),
    onSample: record("sample"),
    onStatus: record("status"),
    onAccuracySummary: record("summary"),
    onLog: record("log"),
    createTracker: (options) => {
      const tracker = {
        options,
        start: () => true,
        stop: () => {
          tracker.stopped = true;
        },
      };
      trackers.push(tracker);
      return tracker;
    },
    createOrientation: (options) => {
      const compass = {
        options,
        start: async () => true,
        stop: () => {
          compass.stopped = true;
        },
      };
      compasses.push(compass);
      return compass;
    },
  });
  const position = {
    latitude: 48,
    longitude: 2,
    accuracy: 5,
    heading: 90,
    updatedAt: "2026-10-01T10:00:00Z",
  };
  return {
    controller,
    trackers,
    compasses,
    calls,
    position,
    time(value) {
      time = value;
    },
  };
}

test("le GPS journalise les relevés et recentre seulement au premier point", () => {
  const f = fixture();
  f.controller.start();
  f.trackers[0].options.onPosition(f.position);
  f.trackers[0].options.onPosition(f.position);
  assert.equal(f.calls.filter(([name]) => name === "first").length, 1);
  assert.equal(f.calls.filter(([name]) => name === "position").length, 2);
  assert.equal(f.calls.filter(([name]) => name === "sample").length, 2);
});

test("le réveil relance uniquement un suivi actif et ignore les anciens relevés", () => {
  const f = fixture();
  assert.equal(f.controller.resume(), false);
  f.controller.start();
  f.controller.resume();
  assert.equal(f.trackers[0].stopped, true);
  f.trackers[0].options.onPosition(f.position);
  assert.equal(f.calls.filter(([name]) => name === "position").length, 0);
  f.trackers[1].options.onPosition(f.position);
  assert.equal(f.calls.filter(([name]) => name === "position").length, 1);
  f.controller.reset();
  assert.equal(f.controller.resume(), false);
});

test("la boussole récente est prioritaire, puis le cap GPS prend le relais", async () => {
  const f = fixture();
  await f.controller.startCompass();
  f.compasses[0].options.onHeading({ heading: 180 });
  const compassHeading = f.controller.heading;
  f.controller.start();
  f.time(1000);
  f.trackers[0].options.onPosition(f.position);
  assert.equal(f.controller.heading, compassHeading);
  f.time(4000);
  f.trackers[0].options.onPosition(f.position);
  assert.notEqual(f.controller.heading, compassHeading);
});

test("redémarrer ou réinitialiser arrête les anciens capteurs et ignore leurs callbacks", async () => {
  const f = fixture();
  f.controller.start();
  const old = f.trackers[0];
  f.controller.start();
  assert.equal(old.stopped, true);
  f.calls.length = 0;
  old.options.onPosition(f.position);
  old.options.onError({ message: "obsolete", code: 1 });
  assert.deepEqual(f.calls, []);
  await f.controller.startCompass();
  f.controller.reset();
  f.calls.length = 0;
  f.trackers[1].options.onPosition(f.position);
  f.compasses[0].options.onHeading({ heading: 45 });
  assert.deepEqual(f.calls, []);
  assert.equal(f.controller.heading, 0);
});

test("une autorisation boussole arrivée après reset est nettoyée", async () => {
  let complete,
    stopped = 0;
  const controller = createGpsController({
    onLog: () => assert.fail("aucun message pour l'ancienne partie"),
    createOrientation: () => ({
      start: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
      stop: () => stopped++,
    }),
  });
  const pending = controller.startCompass();
  controller.reset();
  complete(true);
  assert.equal(await pending, false);
  assert.equal(stopped, 2);
});
