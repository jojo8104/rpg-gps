import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { intersection } from "../server/maps/map-coverage.js";
import { OsmMapService, mapBounds } from "../server/maps/osm-map-service.js";
import { MapBank } from "../server/maps/map-bank.js";
import { mapPackageKey } from "../app/js/map/map-package.js";

const polygon = (lat, size = 0.01) => [
  { latitude: lat, longitude: 2 },
  { latitude: lat, longitude: 2 + size },
  { latitude: lat + size, longitude: 2 + size },
  { latitude: lat + size, longitude: 2 },
];
const empty = () => Response.json({ elements: [] });
async function storage(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-map-bank-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("les téléchargements restent dans la banque après disparition des parties et sont relus sans réseau", async (t) => {
  const directory = await storage(t);
  let calls = 0;
  const service = new OsmMapService({
    directory,
    fetchImpl: () => {
      calls++;
      return empty();
    },
  });
  const first = await service.prepare(polygon(48));
  await service.retain([]);
  assert.equal((await readdir(directory)).length, 1);
  const restarted = new OsmMapService({
    directory,
    fetchImpl: () => {
      throw new Error("Réseau interdit");
    },
  });
  assert.deepEqual(await restarted.prepare(polygon(48)), first);
  assert.equal(calls, 1);
});

test("une carte couvrante sert une autre zone, sa sauvegarde protège le fichier source sans copie", async (t) => {
  const directory = await storage(t);
  const outer = polygon(48);
  const inner = polygon(48.002, 0.002).map((p) => ({
    ...p,
    longitude: p.longitude + 0.002,
  }));
  let calls = 0;
  const service = new OsmMapService({
    directory,
    bankMaxBytes: 0,
    fetchImpl: () => {
      calls++;
      return empty();
    },
  });
  await service.prepare(outer);
  await service.retain([inner]);
  const restarted = new OsmMapService({
    directory,
    bankMaxBytes: 0,
    fetchImpl: () => {
      throw new Error("Réseau interdit");
    },
  });
  const reused = await restarted.prepare(inner);
  assert.equal(reused.key, mapPackageKey(inner));
  assert.equal((await readdir(directory)).length, 1);
  await restarted.retain([inner]);
  assert.equal((await readdir(directory)).length, 1);
  await restarted.retain([]);
  assert.equal((await readdir(directory)).length, 0);
  assert.equal(calls, 1);
});

test("un recouvrement partiel est complété sans redemander la surface déjà couverte", async (t) => {
  const directory = await storage(t);
  const requests = [];
  const service = new OsmMapService({
    directory,
    fetchImpl: (url, options) => {
      requests.push(
        options.body
          .get("data")
          .match(/way\[highway\]\(([^)]+)\)/)[1]
          .split(",")
          .map(Number),
      );
      return empty();
    },
  });
  await service.prepare(polygon(48));
  await service.prepare(polygon(48.008));
  assert.ok(requests.length > 1);
  for (const rect of requests.slice(1))
    assert.equal(intersection(rect, mapBounds(polygon(48))), null);
});

test("la limite retire d'abord les fichiers anciens inutilisés et préserve les cartes liées", async (t) => {
  const directory = await storage(t);
  const service = new OsmMapService({ directory, fetchImpl: empty });
  await service.prepare(polygon(48));
  await service.prepare(polygon(49));
  const bank = new MapBank(directory);
  let entries = await bank.scan();
  const first = entries.find(
    (entry) => entry.key === mapPackageKey(polygon(48)),
  );
  const second = entries.find(
    (entry) => entry.key === mapPackageKey(polygon(49)),
  );
  await utimes(
    path.join(directory, first.name),
    new Date(1000),
    new Date(1000),
  );
  await utimes(
    path.join(directory, second.name),
    new Date(2000),
    new Date(2000),
  );
  bank.maxBytes = second.bytes;
  await bank.retain(new Set());
  assert.deepEqual(
    (await bank.scan()).map((entry) => entry.key),
    [second.key],
  );
  bank.maxBytes = 0;
  await bank.retain(new Set([second.key]));
  assert.equal((await bank.scan()).length, 1);
  await bank.retain(new Set());
  assert.equal((await bank.scan()).length, 0);
});
