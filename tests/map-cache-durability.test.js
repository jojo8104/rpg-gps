import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { OsmMapWorkerService } from "../server/maps/osm-map-worker-service.js";
import { isMapPackage, mapPackageKey } from "../app/js/map/map-package.js";

// Le fournisseur synthétique s'arrête vraiment : un nouveau worker doit lire le disque.
test("une extraction unique est persistée et redistribuée après arrêt du fournisseur et redémarrage du worker", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-map-durability-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const polygon = [
    { latitude: 48, longitude: 2 },
    { latitude: 48, longitude: 2.001 },
    { latitude: 48.001, longitude: 2.001 },
    { latitude: 48.001, longitude: 2 },
  ];
  let queries = 0,
    sourceClosed = false;
  const upstream = createServer((request, response) => {
    queries++;
    request.resume();
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({
        elements: [
          {
            type: "way",
            id: 123,
            tags: { highway: "footway" },
            geometry: [
              { lat: 48, lon: 2 },
              { lat: 48.001, lon: 2.001 },
            ],
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    if (!sourceClosed) await new Promise((resolve) => upstream.close(resolve));
  });
  const options = {
    directory,
    endpoint: "http://127.0.0.1:" + upstream.address().port,
    requestTimeoutMs: 10000,
  };
  const worker = new OsmMapWorkerService(options);
  t.after(() => worker.close());
  const [first, second] = await Promise.all([
    worker.prepare(polygon),
    worker.prepare(polygon),
  ]);
  assert.deepEqual(first, second);
  assert.equal(queries, 1);
  assert.equal(isMapPackage(first), true);
  const file =
    createHash("sha256").update(mapPackageKey(polygon)).digest("hex") + ".json";
  assert.deepEqual(await readdir(directory), [file]);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(directory, file), "utf8")),
    first,
  );
  await worker.close();
  await new Promise((resolve) => upstream.close(resolve));
  sourceClosed = true;
  const resumed = new OsmMapWorkerService(options);
  t.after(() => resumed.close());
  const restored = await resumed.prepare(polygon);
  assert.deepEqual(restored, first);
  assert.equal(queries, 1);
  assert.deepEqual(await readdir(directory), [file]);
});
