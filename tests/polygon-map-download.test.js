import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import clipping from "polygon-clipping";
import { OsmMapService, mapBounds } from "../server/maps/osm-map-service.js";
import {
  playAreaGeometry,
  simpleQueryRegions,
  geometryArea,
} from "../server/maps/polygon-coverage.js";
import { createGeographyLayer } from "../app/js/map/GeographyRenderer.js";

const triangle = [
  { latitude: 48, longitude: 2 },
  { latitude: 48, longitude: 2.01 },
  { latitude: 48.01, longitude: 2 },
];
test("la requête utilise le polygone sans marge et sa couverture ne comprend pas les coins du rectangle", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-map-poly-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const queries = [];
  const service = new OsmMapService({
    directory,
    fetchImpl: async (url, options) => {
      queries.push(options.body.get("data"));
      return Response.json({ elements: [] });
    },
  });
  const first = await service.prepare(triangle);
  assert.deepEqual(mapBounds(triangle), [48, 2, 48.01, 2.01]);
  assert.ok(queries[0].includes('(poly:"48 2 48 2.01 48.01 2")'));
  assert.deepEqual(first.coveragePolygons, playAreaGeometry(triangle));
  const opposite = [
    { latitude: 48.01, longitude: 2.01 },
    { latitude: 48.01, longitude: 2 },
    { latitude: 48, longitude: 2.01 },
  ];
  await service.prepare(opposite);
  assert.equal(
    queries.length,
    2,
    "l’autre moitié n’est pas couverte par le seul rectangle englobant",
  );
  const square = [triangle[0], triangle[1], opposite[0], triangle[2]];
  await service.prepare(square);
  assert.equal(
    queries.length,
    2,
    "l’union des deux triangles couvre ensuite le carré sans téléchargement",
  );
});

test("un trou déjà couvert est exclu des contours simples envoyés à Overpass", () => {
  const target = [
    [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  ];
  const covered = [
    [
      [
        [3, 3],
        [7, 3],
        [7, 7],
        [3, 7],
        [3, 3],
      ],
    ],
  ];
  const missing = clipping.difference(target, covered);
  const regions = simpleQueryRegions(missing);
  assert.ok(regions.every((region) => region.length === 1));
  assert.equal(geometryArea(regions.map((region) => region)), 84);
  for (const region of regions)
    assert.equal(clipping.intersection([region], covered).length, 0);
  assert.equal(
    clipping.xor(missing, clipping.union(...regions.map((region) => [region])))
      .length,
    0,
  );
});

test("le dessin garde son fond simple puis découpe les détails au polygone", (t) => {
  const previousL = globalThis.L,
    previousDocument = globalThis.document;
  t.after(() => {
    globalThis.L = previousL;
    globalThis.document = previousDocument;
  });
  const calls = [];
  const ctx = new Proxy(
    {},
    {
      get: (target, key) =>
        target[key] ?? ((...args) => calls.push([key, ...args])),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    },
  );
  globalThis.document = {
    createElement: () => ({ setAttribute() {}, getContext: () => ctx }),
  };
  const point = (x, y) => ({
    x,
    y,
    add: (p) => point(x + p.x, y + p.y),
    subtract: (p) => point(x - p.x, y - p.y),
  });
  globalThis.L = {
    point,
    latLngBounds: () => ({
      pad() {
        return this;
      },
      intersects: () => true,
    }),
    GridLayer: {
      extend: (methods) =>
        class {
          constructor(options) {
            this.options = options;
            Object.assign(this, methods);
          }
          getTileSize() {
            return { x: 256, y: 256 };
          }
        },
    },
  };
  const map = { project: ([lat, lng]) => point(lng, lat), unproject: (p) => p };
  const layer = createGeographyLayer(
    map,
    { features: [] },
    { clipPolygon: triangle },
  );
  layer.createTile({ x: 0, y: 0, z: 1 });
  assert.ok(
    calls.findIndex((call) => call[0] === "fillRect") <
      calls.findIndex((call) => call[0] === "clip"),
  );
  assert.deepEqual(
    calls.filter((call) => ["moveTo", "lineTo"].includes(call[0])),
    [
      ["moveTo", 2, 48],
      ["lineTo", 2.01, 48],
      ["lineTo", 2, 48.01],
    ],
  );
  assert.equal(calls.at(-1)[0], "restore");
  assert.equal(
    layer.options.bounds,
    undefined,
    "les tuiles de fond simple couvrent aussi l’extérieur",
  );
});
