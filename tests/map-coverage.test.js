import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { planMapCoverage, intersection } from "../server/maps/map-coverage.js";
import { OsmMapService, mapBounds } from "../server/maps/osm-map-service.js";
import clipping from "polygon-clipping";
import { MapBank } from "../server/maps/map-bank.js";

const surface = (rect) => (rect[2] - rect[0]) * (rect[3] - rect[1]);
const entry = (name, bounds) => ({ name, bounds, bytes: 1 });

test("la différence conserve exactement les trous, sans recouvrement ni rectangle hors cible", () => {
  const target = [0, 0, 10, 10];
  const sources = [
    entry("centre", [2, 2, 8, 8]),
    entry("gauche", [-1, -1, 11, 3]),
    entry("doublon", [3, 3, 4, 4]),
  ];
  const plan = planMapCoverage(target, sources);
  assert.equal(plan.sources.length, 2);
  assert.equal(
    plan.missing.reduce((sum, rect) => sum + surface(rect), 0),
    40,
  );
  for (const rect of plan.missing) {
    assert.deepEqual(intersection(rect, target), rect);
    for (const source of sources)
      assert.equal(intersection(rect, source.bounds), null);
  }
  for (let i = 0; i < plan.missing.length; i++)
    for (let j = i + 1; j < plan.missing.length; j++)
      assert.equal(intersection(plan.missing[i], plan.missing[j]), null);
  assert.equal(
    planMapCoverage(target, [
      entry("ouest", [0, 0, 10, 5]),
      entry("est", [0, 5, 10, 10]),
    ]).missing.length,
    0,
  );
});

const polygon = [
  { latitude: 48, longitude: 2 },
  { latitude: 48, longitude: 2.01 },
  { latitude: 48.01, longitude: 2.01 },
  { latitude: 48.01, longitude: 2 },
];
const lake = {
  id: "relation/1/0",
  kind: "water",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [2, 48],
        [2.01, 48],
        [2.01, 48.01],
        [2, 48],
      ],
      [
        [2.002, 48.002],
        [2.003, 48.002],
        [2.003, 48.003],
        [2.002, 48.002],
      ],
    ],
  },
};
async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-map-overlap-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bounds = mapBounds(polygon);
  const seed = async (name, rect) => {
    const key = `bank-${name}`;
    const pack = { version: 1, key, bounds: rect, features: [lake] };
    await writeFile(
      path.join(
        directory,
        createHash("sha256").update(key).digest("hex") + ".json",
      ),
      JSON.stringify(pack),
    );
  };
  return { directory, bounds, seed };
}
const queryBounds = (options) =>
  options.body
    .get("data")
    .match(/way\[highway\]\(([^)]+)\)/)[1]
    .split(",")
    .map(Number);

test("deux cartes couvrant ensemble la cible suffisent sans réseau, avec îlot et identifiants conservés", async (t) => {
  const { directory, bounds, seed } = await fixture(t);
  const [s, w, n, e] = bounds,
    middle = (w + e) / 2;
  await seed("ouest", [s, w, n, middle]);
  await seed("est", [s, middle, n, e]);
  const service = new OsmMapService({
    directory,
    fetchImpl: () => {
      throw new Error("Aucun appel attendu");
    },
  });
  const result = await service.prepare(polygon);
  assert.deepEqual(result.bounds, bounds);
  assert.deepEqual(result.features, [lake]);
  assert.equal((await readdir(directory)).length, 3);
});

test("une nouvelle carte ne télécharge que la bande non couverte", async (t) => {
  const { directory, bounds, seed } = await fixture(t);
  const [s, w, n, e] = bounds,
    middle = (w + e) / 2;
  await seed("ouest", [s, w, n, middle]);
  const requested = [];
  const service = new OsmMapService({
    directory,
    fetchImpl: async (url, options) => {
      requested.push(queryBounds(options));
      return Response.json({ elements: [] });
    },
  });
  const result = await service.prepare(polygon);
  assert.deepEqual(requested, [[s, middle, n, e]]);
  assert.deepEqual(result.features, [lake]);
});

test("une reprise groupe tous les manques dans un seul appel, sans redemander la zone centrale", async (t) => {
  const { directory, bounds, seed } = await fixture(t);
  const [s, w, n, e] = bounds,
    ds = (n - s) / 3,
    dw = (e - w) / 3;
  const centre = [s + ds, w + dw, n - ds, e - dw];
  await seed("centre", centre);
  let failedCalls = 0;
  const failed = new OsmMapService({
    directory,
    fetchImpl: async () => {
      failedCalls++;
      throw new TypeError("fetch failed");
    },
  });
  await assert.rejects(failed.prepare(polygon), /fetch failed/);
  assert.equal(failedCalls, 1);
  assert.equal(
    (await readdir(directory)).length,
    1,
    "aucune carte incomplète n’est publiée après échec",
  );
  const queries = [];
  const resumed = new OsmMapService({
    directory,
    fetchImpl: async (url, options) => {
      queries.push(options.body.get("data"));
      return Response.json({ elements: [] });
    },
  });
  const result = await resumed.prepare(polygon);
  assert.deepEqual(result.features, [lake]);
  assert.equal(queries.length, 1);
  const contours = [
    ...new Set(
      [...queries[0].matchAll(/poly:\"([^\"]+)\"/g)].map((match) => match[1]),
    ),
  ].map((text) => {
    const values = text.split(" ").map(Number),
      ring = [];
    for (let i = 0; i < values.length; i += 2)
      ring.push([values[i + 1], values[i]]);
    ring.push(ring[0]);
    return [ring];
  });
  assert.ok(contours.length > 1);
  const centreGeometry = [
    [
      [
        [centre[1], centre[0]],
        [centre[3], centre[0]],
        [centre[3], centre[2]],
        [centre[1], centre[2]],
        [centre[1], centre[0]],
      ],
    ],
  ];
  for (const contour of contours)
    assert.equal(clipping.intersection([contour], centreGeometry).length, 0);
  const target = [
    [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  ];
  assert.equal(
    clipping.xor(
      clipping.difference(target, centreGeometry),
      clipping.union(...contours.map((contour) => [contour])),
    ).length,
    0,
  );
  await new OsmMapService({
    directory,
    fetchImpl: () => {
      throw new Error("Aucun appel attendu");
    },
  }).prepare(polygon);
});

test("les sources de plusieurs couvertures partielles restent protégées même avec un budget nul", async (t) => {
  const { directory, bounds, seed } = await fixture(t);
  const [s, w, n, e] = bounds,
    middle = (w + e) / 2;
  await seed("ouest", [s, w, n, middle]);
  await seed("est", [s, middle, n, e]);
  const bank = new MapBank(directory, 0);
  await bank.retain(new Set(), [bounds]);
  assert.equal((await bank.scan()).length, 2);
  await bank.retain(new Set());
  assert.equal((await bank.scan()).length, 0);
});

test("une couverture trop fragmentée est refusée avant toute extraction", async (t) => {
  const { directory, bounds, seed } = await fixture(t);
  const [s, w, n, e] = bounds,
    step = (e - w) / 35;
  for (let i = 0; i < 17; i++)
    await seed(`bande-${i}`, [
      s,
      w + (2 * i + 1) * step,
      n,
      w + (2 * i + 2) * step,
    ]);
  let calls = 0;
  const service = new OsmMapService({
    directory,
    fetchImpl: () => {
      calls++;
      return Response.json({ elements: [] });
    },
  });
  await assert.rejects(service.prepare(polygon), /fragmentée/);
  assert.equal(calls, 0);
});
