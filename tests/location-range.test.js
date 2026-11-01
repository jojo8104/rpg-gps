import test from "node:test";
import assert from "node:assert/strict";
import { LocationRenderer } from "../app/js/map/LocationRenderer.js";
test("le cercle suit la portée officielle, la couleur du camp et la disparition du lieu", (t) => {
  const previous = { L: globalThis.L, document: globalThis.document };
  t.after(() => Object.assign(globalThis, previous));
  const calls = [];
  const range = {
    addTo() {
      return this;
    },
    setLatLng() {
      return this;
    },
    setRadius(radius) {
      calls.push(radius);
      return this;
    },
    setStyle(style) {
      calls.push(style.color);
      return this;
    },
    remove() {
      calls.push("remove");
    },
  };
  const marker = {
    addTo() {
      return this;
    },
    on() {},
    setLatLng() {
      return this;
    },
    setIcon() {
      return this;
    },
    remove() {},
  };
  globalThis.L = {
    circle: (pos, options) => {
      calls.push(options.radius, options.color);
      return range;
    },
    divIcon: () => ({}),
    marker: () => marker,
  };
  globalThis.document = {
    createElement: () => ({
      textContent: "",
      get innerHTML() {
        return this.textContent;
      },
    }),
  };
  const renderer = new LocationRenderer({
    map: {},
    billboards: { set() {}, remove() {} },
    onSelect() {},
  });
  const location = {
    id: "a",
    type: "fort",
    name: "Fort",
    position: [48, 2],
    owner: "enemy",
    interactionRadius: 80,
  };
  renderer.render(location);
  renderer.render({ ...location, owner: "ally", interactionRadius: 100 });
  renderer.removeMissing(new Set());
  assert.deepEqual(calls, [80, "#ed7373", 100, "#68bcec", "remove"]);
});
