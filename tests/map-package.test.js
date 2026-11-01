import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  convertOsmMap,
  mapBounds,
  OsmMapService,
} from "../server/maps/osm-map-service.js";
import { mapPackageKey } from "../app/js/map/map-package.js";
import { createMapPackageClient } from "../app/js/map/map-package-client.js";
import { createRpgGpsServer } from "../server/server.js";
import { createMapHttpApi } from "../server/maps/map-http-api.js";
import { createServer } from "node:http";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { OsmMapWorkerService } from "../server/maps/osm-map-worker-service.js";

const polygon = [
  { latitude: 48, longitude: 2 },
  { latitude: 48, longitude: 2.01 },
  { latitude: 48.01, longitude: 2.01 },
  { latitude: 48.01, longitude: 2 },
];
const geometry = (points) => points.map(([lon, lat]) => ({ lon, lat }));
const data = {
  elements: [
    {
      type: "way",
      id: 1,
      tags: { highway: "footway" },
      geometry: geometry([
        [2, 48],
        [2.01, 48.01],
      ]),
    },
    {
      type: "way",
      id: 2,
      tags: { building: "yes" },
      geometry: geometry([
        [2, 48],
        [2.001, 48],
        [2.001, 48.001],
        [2, 48],
      ]),
    },
    {
      type: "relation",
      id: 3,
      tags: { natural: "water", type: "multipolygon" },
      members: [
        {
          type: "way",
          role: "outer",
          geometry: geometry([
            [2, 48],
            [2.01, 48],
            [2.01, 48.01],
          ]),
        },
        {
          type: "way",
          role: "outer",
          geometry: geometry([
            [2, 48],
            [2, 48.01],
            [2.01, 48.01],
          ]),
        },
        {
          type: "way",
          role: "inner",
          geometry: geometry([
            [2.002, 48.002],
            [2.003, 48.002],
            [2.003, 48.003],
            [2.002, 48.002],
          ]),
        },
      ],
    },
  ],
};
function packageData() {
  return convertOsmMap(data, {
    polygon,
    bounds: mapBounds(polygon),
    now: 1000,
  });
}

test("conversion OSM : chemins, bâtiments et eau avec îlot ; coordonnées dans l'ordre GeoJSON", () => {
  const result = packageData();
  assert.equal(result.features.length, 3);
  assert.deepEqual(result.features[0].geometry.coordinates[0], [2, 48]);
  assert.equal(result.features[2].geometry.coordinates.length, 2);
  assert.equal(result.key, mapPackageKey(polygon));
  assert.throws(
    () => convertOsmMap({ ...data, remark: "timeout" }, { polygon }),
    /incomplète/,
  );
});

test("les zones trop grandes, invalides et dégénérées sont rejetées avant extraction", () => {
  assert.throws(() => mapBounds([]));
  assert.throws(() => mapBounds(polygon.map((p) => ({ ...p, latitude: 91 }))));
  assert.throws(() =>
    mapBounds([
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
      { latitude: 1, longitude: 1 },
    ]),
  );
  assert.throws(() => mapBounds([polygon[0], polygon[0], polygon[0]]));
  assert.equal(mapBounds(polygon)[0], 48);
});

test("une extraction concurrente et une reprise serveur utilisent la même carte persistée", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-map-"));
  let requests = 0;
  const fetchImpl = async () => {
    requests++;
    return Response.json(data);
  };
  try {
    const service = new OsmMapService({ directory, fetchImpl });
    const [first, second] = await Promise.all([
      service.prepare(polygon),
      service.prepare(polygon),
    ]);
    assert.deepEqual(first, second);
    assert.equal(requests, 1);
    const resumed = new OsmMapService({ directory, fetchImpl });
    assert.deepEqual(await resumed.prepare(polygon), first);
    assert.equal(requests, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("le mobile ne conserve plus de carte implicite et consulte le serveur", async () => {
  const deleted = [];
  let requests = 0;
  const cacheStorage = {
    delete: async (key) => deleted.push(key),
    open: () => {
      throw new Error("Pas de stockage implicite");
    },
  };
  const first = createMapPackageClient({
    cacheStorage,
    fetchImpl: async () => {
      requests++;
      return Response.json(packageData());
    },
  });
  assert.equal((await first.prepare(polygon)).cached, false);
  const resumed = createMapPackageClient({
    cacheStorage,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  await assert.rejects(resumed.prepare(polygon), /offline/);
  assert.equal(requests, 1);
  assert.ok(deleted.every((key) => key === "rpg-gps-map-packages-v1"));
  const limited = createMapPackageClient({
    cacheStorage: {
      open: async () => {
        throw new Error("quota");
      },
    },
    fetchImpl: async () => Response.json(packageData()),
  });
  assert.equal((await limited.prepare(polygon)).cached, false);
});

test("un téléchargement mobile échoué est réessayable et une mauvaise zone est refusée", async () => {
  let attempts = 0;
  const client = createMapPackageClient({
    cacheStorage: null,
    fetchImpl: async () =>
      ++attempts === 1
        ? Response.json({ error: "occupé" }, { status: 503 })
        : Response.json(packageData()),
  });
  await assert.rejects(client.prepare(polygon), /occupé/);
  assert.equal((await client.prepare(polygon)).features.length, 3);
  const invalid = createMapPackageClient({
    cacheStorage: null,
    fetchImpl: async () =>
      Response.json({ ...packageData(), key: "autre-zone" }),
  });
  await assert.rejects(invalid.prepare(polygon), /invalide/);
});

test("API carte : préparation POST, erreurs explicites et recherche de lieu mise en cache", async (t) => {
  let searches = 0;
  const lobbyService = new LobbyService();
  lobbyService.retainedMapPolygons = () => [polygon];
  const server = createRpgGpsServer({
    lobbyService,
    mapService: {
      prepare: async (points) => {
        mapBounds(points);
        return packageData();
      },
    },
    mapFetch: async () => {
      searches++;
      return Response.json([
        { display_name: "Paris", lat: "48.85", lon: "2.35" },
      ]);
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const prepared = await fetch(`${base}/api/maps/prepare`, {
    method: "POST",
    body: JSON.stringify({ polygon }),
  });
  assert.equal(prepared.status, 200);
  assert.equal((await prepared.json()).key, mapPackageKey(polygon));
  assert.equal((await fetch(`${base}/api/maps/prepare`)).status, 405);
  assert.equal(
    (await fetch(`${base}/api/maps/prepare`, { method: "POST", body: "{" }))
      .status,
    400,
  );
  assert.equal(
    (
      await fetch(`${base}/api/maps/prepare`, {
        method: "POST",
        body: JSON.stringify({ polygon: [] }),
      })
    ).status,
    400,
  );
  const search = await fetch(`${base}/api/maps/search?q=Paris`);
  assert.equal((await search.json())[0].latitude, 48.85);
  assert.equal((await fetch(`${base}/api/maps/search?q=Paris`)).status, 200);
  assert.equal(searches, 1);
  assert.equal((await fetch(`${base}/api/maps/search?q=Lyon`)).status, 429);
});

test("le diagnostic distingue expiration et DNS sans journaliser la zone", async () => {
  for (const failure of [
    new DOMException("timeout", "TimeoutError"),
    new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } }),
  ]) {
    const diagnostics = [];
    let status, body;
    const api = createMapHttpApi({
      isAllowedPolygon: () => true,
      maps: {
        prepare: async () => {
          throw failure;
        },
      },
      onProviderError: (details) => diagnostics.push(details),
    });
    await api(
      {
        url: "/api/maps/prepare",
        method: "POST",
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(JSON.stringify({ polygon }));
        },
      },
      {
        writeHead: (code) => {
          status = code;
        },
        end: (value) => {
          body = JSON.parse(value);
        },
      },
    );
    assert.equal(status, 502);
    assert.match(body.error, /Extraction de la zone OSM/);
    assert.equal(
      body.code,
      failure.name === "TimeoutError"
        ? "map_provider_timeout"
        : "map_provider_unreachable",
    );
    assert.equal(diagnostics[0].operation, "prepare");
    assert.equal(diagnostics[0].code, failure.cause?.code ?? null);
    assert.ok(!JSON.stringify(diagnostics).includes("48.01"));
  }
});

test("une panne arrête les appels, impose une pause globale puis permet le secours", async () => {
  for (const failure of [
    new DOMException("timeout", "TimeoutError"),
    Response.json({}, { status: 504 }),
    Response.json({}, { status: 429, headers: { "Retry-After": "120" } }),
    Response.json({}, { status: 406 }),
  ]) {
    let now = 1000;
    const calls = [];
    const service = new OsmMapService({
      now: () => now,
      endpoint: "https://primary.invalid/api",
      fallbackEndpoint: "https://secondary.invalid/api",
      fetchImpl: async (url) => {
        calls.push(url);
        if (calls.length === 1) {
          if (failure instanceof Error) throw failure;
          return failure;
        }
        return Response.json(data);
      },
    });
    await assert.rejects(service.prepare(polygon));
    assert.equal(calls.length, 1);
    await assert.rejects(service.prepare(polygon), { status: 429 });
    await assert.rejects(
      service.prepare(polygon.map((p) => ({ ...p, latitude: p.latitude + 1 }))),
      { status: 429 },
    );
    assert.equal(calls.length, 1);
    now += 120001;
    assert.equal((await service.prepare(polygon)).features.length, 3);
    assert.deepEqual(calls, [
      "https://primary.invalid/api",
      "https://secondary.invalid/api",
    ]);
    await service.prepare(polygon);
    assert.equal(calls.length, 2);
  }
});

test("un fournisseur personnalisé n'impose aucun secours public", async () => {
  let calls = 0;
  const service = new OsmMapService({
    endpoint: "https://custom.invalid/api",
    fetchImpl: async () => {
      calls++;
      throw new DOMException("timeout", "TimeoutError");
    },
  });
  await assert.rejects(service.prepare(polygon));
  assert.equal(calls, 1);
});

test("le worker prépare et partage la carte, reprend une panne et s'arrête sans requête orpheline", async (t) => {
  const calls = [];
  const upstream = createServer((request, response) => {
    calls.push(request.url);
    request.resume();
    response.writeHead(200, {
      "Content-Type": "application/json",
    });
    response.end(JSON.stringify(data));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => upstream.close(resolve)));
  const base = `http://127.0.0.1:${upstream.address().port}`;
  const service = new OsmMapWorkerService({
    endpoint: `${base}/primary`,
    fallbackEndpoint: `${base}/secondary`,
  });
  t.after(() => service.close());
  await assert.rejects(service.prepare([]));
  assert.equal(service.worker, null);
  const [first, second] = await Promise.all([
    service.prepare(polygon),
    service.prepare(polygon),
  ]);
  assert.deepEqual(first, second);
  assert.equal(first.features.length, 3);
  assert.deepEqual(calls, ["/primary"]);
  await service.prepare(polygon);
  assert.equal(calls.length, 1);
  await service.close();
  assert.equal(service.worker, null);
  assert.equal(service.requests.size, 0);
  await assert.rejects(service.prepare(polygon), /arrêté/);
});

test("une expiration n'entraîne aucun découpage ni nouvel appel automatique", async () => {
  let now = 1000,
    calls = 0;
  const service = new OsmMapService({
    now: () => now,
    fetchImpl: async () => {
      calls++;
      return Response.json({ elements: [], remark: "Query timed out" });
    },
  });
  await assert.rejects(service.prepare(polygon), /expiré/);
  assert.equal(calls, 1);
  await assert.rejects(service.prepare(polygon), { status: 429 });
  assert.equal(calls, 1);
  now += 30001;
  await assert.rejects(service.prepare(polygon), /expiré/);
  assert.equal(calls, 2, "une nouvelle demande explicite ajoute un seul appel");
});

test("le budget global arrête la récupération sans lancer les fournisseurs et secteurs suivants", async () => {
  let calls = 0;
  const service = new OsmMapService({
    endpoint: "https://primary.invalid/api",
    fallbackEndpoint: "https://secondary.invalid/api",
    preparationTimeoutMs: 10,
    fetchImpl: async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return Response.json(data);
    },
  });
  await assert.rejects(service.prepare(polygon), { name: "TimeoutError" });
  assert.equal(calls, 1);
  assert.equal(service.pending.size, 0);
  assert.equal(service.memory.size, 0);
});

test("le mobile explique une expiration et autorise une nouvelle tentative", async () => {
  let calls = 0;
  const client = createMapPackageClient({
    cacheStorage: null,
    fetchImpl: async () => {
      if (++calls === 1) throw new DOMException("timeout", "TimeoutError");
      return Response.json(packageData());
    },
  });
  await assert.rejects(client.prepare(polygon), /reprendre les secteurs/);
  assert.equal((await client.prepare(polygon)).features.length, 3);
});

test("les zones équivalentes partagent les requêtes, le cache disque et sa conservation", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-map-equivalent-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const rotated = [...polygon.slice(2), ...polygon.slice(0, 2)].reverse();
  const closed = [...rotated, rotated[0]];
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const service = new OsmMapService({
    directory,
    fetchImpl: async () => {
      calls++;
      await gate;
      return Response.json(data);
    },
  });
  const first = service.prepare(polygon);
  const same = service.prepare(closed);
  const other = polygon.map((p) => ({ ...p, latitude: p.latitude + 1 }));
  await assert.rejects(service.prepare(other), { status: 429 });
  release();
  const [a, b] = await Promise.all([first, same]);
  assert.equal(calls, 1);
  assert.equal(a.key, mapPackageKey(polygon));
  assert.equal(b.key, mapPackageKey(closed));
  await service.retain([rotated]);
  const resumed = new OsmMapService({
    directory,
    fetchImpl: () => {
      throw new Error("Aucun réseau attendu");
    },
  });
  assert.equal((await resumed.prepare(rotated)).key, mapPackageKey(rotated));
  assert.equal(calls, 1);
});

test("les pauses augmentent, respectent Retry-After et laissent passer les cartes en cache", async () => {
  let now = Date.parse("2026-10-24T00:00:00Z"),
    calls = 0;
  const other = polygon.map((p) => ({ ...p, latitude: p.latitude + 1 }));
  const service = new OsmMapService({
    now: () => now,
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return Response.json(data);
      return Response.json(
        {},
        {
          status: 429,
          headers: { "Retry-After": new Date(now + 45000).toUTCString() },
        },
      );
    },
  });
  await service.prepare(polygon);
  await assert.rejects(service.prepare(other), (e) => e.retryAfter === 45);
  assert.equal((await service.prepare(polygon)).features.length, 3);
  now += 45001;
  await assert.rejects(service.prepare(other), (e) => e.retryAfter === 60);
  now += 59999;
  await assert.rejects(service.prepare(other), { status: 429 });
  assert.equal(calls, 3);
});

test("l'API refuse les zones non enregistrées avant tout appel au fournisseur et expose Retry-After", async () => {
  let calls = 0,
    status,
    headers,
    body;
  const request = {
    url: "/api/maps/prepare",
    method: "POST",
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify({ polygon }));
    },
  };
  const response = {
    writeHead: (code, value) => {
      status = code;
      headers = value;
    },
    end: (value) => {
      body = JSON.parse(value);
    },
  };
  const maps = {
    prepare: async () => {
      calls++;
      throw Object.assign(new Error("Pause fournisseur"), {
        status: 429,
        retryAfter: 90,
      });
    },
  };
  await createMapHttpApi({ maps })(request, response);
  assert.equal(status, 403);
  assert.equal(calls, 0);
  await createMapHttpApi({ maps, isAllowedPolygon: () => true })(
    request,
    response,
  );
  assert.equal(status, 429);
  assert.equal(headers["Retry-After"], "90");
  assert.equal(body.retryAfter, 90);
  assert.equal(calls, 1);
});
