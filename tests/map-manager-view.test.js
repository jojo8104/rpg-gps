import test from "node:test";
import assert from "node:assert/strict";
import { mountMapManager } from "../dashboard/map-manager.js";

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.events = {};
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = children;
  }
  get lastChild() {
    return this.children.at(-1);
  }
  setAttribute() {}
  addEventListener(name, handler) {
    this.events[name] = handler;
  }
}
const descendants = (element) => [
  element,
  ...element.children.flatMap(descendants),
];

test("la banque affiche le fond sous les zones et explique les suppressions protégées", async (t) => {
  const previousDocument = globalThis.document,
    previousL = globalThis.L;
  t.after(() => {
    globalThis.document = previousDocument;
    globalThis.L = previousL;
  });
  globalThis.document = { createElement: (tag) => new Element(tag) };
  const order = [];
  const map = {
    setView() {
      return this;
    },
    invalidateSize() {},
    fitBounds() {},
  };
  const tiles = [];
  globalThis.L = {
    map: () => map,
    tileLayer: (url, options) => {
      tiles.push({ url, options });
      return {
        addTo(target) {
          assert.equal(target, map);
          order.push("base");
        },
      };
    },
    layerGroup: () => ({
      addTo() {
        order.push("zones");
        return this;
      },
      clearLayers() {},
    }),
    polygon: () => ({ addTo() {} }),
  };
  const root = new Element("details");
  let reads = 0;
  const manager = mountMapManager(root, {
    api: async (url) => {
      assert.equal(url, "/api/dashboard/maps");
      reads++;
      return {
        savedMaps: [
          {
            id: "parc",
            name: "Parc",
            complete: true,
            sourceCount: 1,
            sourceBytes: 50,
            sourceIds: ["one.json"],
            playArea: {
              polygon: [
                { latitude: 48, longitude: 2 },
                { latitude: 48, longitude: 3 },
                { latitude: 49, longitude: 3 },
              ],
            },
          },
        ],
        bank: {
          bytes: 50,
          maxBytes: 100,
          protectedBytes: 50,
          busy: false,
          files: [
            {
              id: "one.json",
              bytes: 50,
              type: "map",
              protected: true,
              usedBy: ["Partie : TEST"],
              coveragePolygons: [
                [
                  [
                    [2, 48],
                    [3, 48],
                    [3, 49],
                    [2, 48],
                  ],
                ],
              ],
            },
          ],
        },
      };
    },
  });
  manager.setAuthenticated(true);
  assert.equal(reads, 0, "panneau fermé sans chargement");
  const refresh = descendants(root).find(
    (element) => element.textContent === "Actualiser la banque",
  );
  await refresh.onclick();
  await refresh.onclick();
  const thumbnail = descendants(root).find((element) => element.tag === "img");
  assert.equal(thumbnail.alt, "Contour de Parc");
  assert.match(thumbnail.src, /^data:image\/svg\+xml,/);
  assert.ok(
    descendants(root).some((element) => element.className === "bank-card-grid"),
  );
  assert.equal(tiles.length, 1, "fond conservé entre deux actualisations");
  assert.match(tiles[0].url, /tile.openstreetmap.org/);
  assert.match(tiles[0].options.attribution, /OpenStreetMap/);
  assert.deepEqual(order, ["base", "zones"]);
  const remove = descendants(root).find(
    (element) => element.textContent === "Supprimer",
  );
  assert.equal(remove.disabled, true);
  assert.match(remove.title, /Partie : TEST/);
  assert.ok(
    descendants(root).some(
      (element) =>
        element.tag === "small" &&
        element.textContent.includes("Partie : TEST"),
    ),
  );
});
