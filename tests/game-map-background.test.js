import assert from "node:assert/strict";
import test from "node:test";
import { GameMapBackground } from "../app/js/map/GameMapBackground.js";

function fixture(t, { mode = "gps", useDefaultSchedule = false } = {}) {
  const previousL = globalThis.L,
    previousDocument = globalThis.document;
  const events = {},
    calls = [],
    requests = [],
    timers = [];
  const element = () => ({
    _text: "",
    get textContent() {
      return this._text;
    },
    set textContent(value) {
      this._text = value;
      this.children = [];
    },
    children: [],
    setAttribute() {},
    replaceChildren(...children) {
      this.children = children;
    },
    append(child) {
      this.children.push(child);
    },
    addEventListener(name, handler) {
      this[name] = handler;
    },
  });
  globalThis.document = {
    createTextNode: (text) => ({ text }),
    createElement: element,
  };
  globalThis.L = {
    control: () => ({
      addTo() {
        this.onAdd?.();
        calls.push("status:add");
        return this;
      },
      remove() {
        calls.push("status:remove");
      },
    }),
    DomUtil: { create: element },
    DomEvent: { disableClickPropagation() {} },
    latLngBounds: () => ({
      pad() {
        return "bounds";
      },
    }),
  };
  t.after(() => {
    globalThis.L = previousL;
    globalThis.document = previousDocument;
  });
  const map = {
    on: (name, callback) => {
      events[name] = callback;
    },
    setMaxBounds: (value) => calls.push(["bounds", value]),
  };
  const background = new GameMapBackground({
    map,
    mode,
    preparationLayer: {
      addTo() {
        calls.push("real:add");
      },
      remove() {
        calls.push("real:remove");
      },
    },
    createSearch: () => ({
      addTo() {
        calls.push("search:add");
      },
      remove() {
        calls.push("search:remove");
      },
    }),
    createLayer: (_, data) => ({
      addTo() {
        calls.push(["canvas:add", data]);
        return this;
      },
      remove() {
        calls.push("canvas:remove");
      },
    }),
    ...(useDefaultSchedule
      ? {}
      : { schedule: (callback) => timers.push(callback) }),
    client: {
      prepare: () =>
        new Promise((resolve, reject) => requests.push({ resolve, reject })),
    },
  });
  return { background, calls, requests, events, timers };
}
const polygon = [
  { latitude: 48, longitude: 2 },
  { latitude: 48, longitude: 2.01 },
  { latitude: 48.01, longitude: 2 },
];
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("le minuteur par défaut garde le contexte Window après le chargement de carte", async (t) => {
  const previousTimeout = globalThis.setTimeout;
  const scheduled = [];
  globalThis.setTimeout = function (callback, delay) {
    assert.equal(this, globalThis, "setTimeout doit être appelé sur Window");
    scheduled.push({ callback, delay });
  };
  t.after(() => {
    globalThis.setTimeout = previousTimeout;
  });
  const f = fixture(t, { useDefaultSchedule: true });
  f.background.sync({ setupActive: false, polygon });
  f.requests[0].resolve({ cached: true });
  await flush();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 5000);
  assert.equal(f.background.element.children.length, 0);
  scheduled[0].callback();
  assert.ok(f.calls.includes("status:remove"));
});

test("le fond réel reste pendant le tracé puis une seule préparation alimente le fond local", async (t) => {
  const f = fixture(t);
  f.background.sync({ setupActive: true, polygon });
  assert.equal(f.requests.length, 0);
  f.background.sync({ setupActive: false, polygon });
  f.background.sync({ setupActive: false, polygon });
  assert.equal(f.requests.length, 1);
  assert.ok(!f.calls.includes("real:remove"));
  f.requests[0].resolve({ cached: true });
  await flush();
  assert.ok(f.calls.some((call) => call[0] === "canvas:add"));
  assert.ok(f.calls.includes("real:remove"));
  f.background.sync({ setupActive: true, polygon });
  assert.ok(f.calls.includes("canvas:remove"));
  assert.ok(f.calls.includes("real:add"));
});

test("un téléchargement ancien ne remplace pas une nouvelle zone ni une carte retirée", async (t) => {
  const f = fixture(t);
  f.background.sync({ setupActive: false, polygon });
  f.background.sync({
    setupActive: false,
    polygon: polygon.map((p) => ({ ...p, longitude: p.longitude + 1 })),
  });
  f.requests[0].resolve({ id: "old" });
  await flush();
  assert.equal(f.calls.filter((call) => call[0] === "canvas:add").length, 0);
  f.events.unload();
  f.requests[1].resolve({ id: "new" });
  await flush();
  assert.equal(f.calls.filter((call) => call[0] === "canvas:add").length, 0);
});

test("l’erreur conserve le fond réel et propose une reprise explicite", async (t) => {
  const f = fixture(t);
  f.background.sync({ setupActive: false, polygon });
  f.requests[0].reject(new Error("indisponible"));
  await flush();
  assert.equal(f.background.element.children[0].text, "indisponible");
  f.background.element.children[1].click();
  assert.equal(f.requests.length, 2);
  assert.ok(f.calls.includes("real:add"));
  f.requests[1].resolve({ cached: true });
  await flush();
});

test("la carte fictive utilise le fond Canvas sans extraction OSM", async (t) => {
  const f = fixture(t, { mode: "simulation" });
  f.background.sync({ setupActive: false, polygon });
  await flush();
  assert.equal(f.requests.length, 0);
  assert.ok(f.calls.some((call) => call[0] === "canvas:add"));
});

test("le joueur peut conserver la carte classique sans attendre Overpass ni subir un remplacement tardif", async (t) => {
  const f = fixture(t);
  f.background.sync({ setupActive: false, polygon });
  const classic = f.background.element.children.find(
    (button) => button.textContent === "Continuer avec la carte OSM",
  );
  assert.ok(classic);
  classic.click();
  assert.ok(f.calls.includes("real:add"));
  assert.ok(f.calls.includes("status:remove"));
  f.requests[0].resolve({ cached: true });
  await flush();
  assert.equal(f.calls.filter((call) => call[0] === "canvas:add").length, 0);
  f.background.sync({ setupActive: false, polygon });
  assert.equal(f.requests.length, 1);
});

test("la carte classique reste accessible après une erreur de préparation", async (t) => {
  const f = fixture(t);
  f.background.sync({ setupActive: false, polygon });
  f.requests[0].reject(new Error("timeout"));
  await flush();
  const classic = f.background.element.children.find(
    (button) => button.textContent === "Continuer avec la carte OSM",
  );
  classic.click();
  assert.ok(f.calls.includes("status:remove"));
  assert.equal(f.requests.length, 1);
});
