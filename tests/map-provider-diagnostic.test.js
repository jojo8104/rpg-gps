import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { OsmMapService } from "../server/maps/osm-map-service.js";
import { OsmMapWorkerService } from "../server/maps/osm-map-worker-service.js";
import { createMapHttpApi } from "../server/maps/map-http-api.js";
import { mapErrorPayload } from "../server/maps/map-provider-diagnostic.js";

const polygon = [
  { latitude: 48, longitude: 2 },
  { latitude: 48, longitude: 2.01 },
  { latitude: 48.01, longitude: 2.01 },
  { latitude: 48.01, longitude: 2 },
];
test("un rejet HTTP est transmis par le vrai worker et journalisé sans URL ni polygone", async (t) => {
  let calls = 0;
  const upstream = createServer((request, response) => {
    calls++;
    request.resume();
    response.writeHead(406);
    response.end("corps non journalisé");
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const worker = new OsmMapWorkerService({
    endpoint: `http://127.0.0.1:${upstream.address().port}/private-secret`,
  });
  t.after(async () => {
    await worker.close();
    await new Promise((resolve) => upstream.close(resolve));
  });
  const logs = [];
  const api = createMapHttpApi({
    maps: worker,
    isAllowedPolygon: () => true,
    onProviderError: (entry) => logs.push(entry),
  });
  let status, body;
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
  assert.equal(body.providerStatus, 406);
  assert.equal(body.code, "map_provider_http_error");
  assert.match(body.error, /HTTP 406/);
  assert.match(body.error, /banque/);
  assert.equal(logs[0].httpStatus, 406);
  assert.equal(logs[0].provider, "principal");
  assert.ok(!JSON.stringify(logs).includes("48.01"));
  assert.ok(!JSON.stringify(logs).includes("private-secret"));
  assert.ok(!JSON.stringify(logs).includes("corps non"));
  assert.equal(calls, 1);
});

test("le message d’expiration distingue cache disponible et nouvelle extraction échouée", () => {
  const error = Object.assign(new Error("timeout"), {
    name: "TimeoutError",
    retryAfter: 120,
  });
  const payload = mapErrorPayload(error);
  assert.equal(payload.code, "map_provider_timeout");
  assert.equal(payload.retryAfter, 120);
  assert.match(
    payload.error,
    /surfaces manquantes ne sont pas encore téléchargées/,
  );
  assert.match(payload.error, /120 secondes/);
});

test("la conservation accepte un terrain dépassant les limites d’extraction sans télécharger ni supprimer ses sources", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-retention-large-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let calls = 0;
  const maps = new OsmMapService({
    directory,
    bankMaxBytes: 0,
    fetchImpl: async () => {
      calls++;
      return Response.json({ elements: [] });
    },
  });
  await maps.prepare(polygon);
  const oversized = [
    { latitude: 47, longitude: 1 },
    { latitude: 47, longitude: 3 },
    { latitude: 49, longitude: 3 },
    { latitude: 49, longitude: 1 },
  ];
  await maps.retain([oversized]);
  assert.equal((await readdir(directory)).length, 1);
  assert.equal(calls, 1);
  await assert.rejects(maps.prepare(oversized), RangeError);
  assert.equal(calls, 1);
});
