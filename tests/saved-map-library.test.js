import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { OsmMapService } from "../server/maps/osm-map-service.js";
import { mapPackageKey } from "../app/js/map/map-package.js";
import { OsmMapWorkerService } from "../server/maps/osm-map-worker-service.js";
import { createRpgGpsServer } from "../server/server.js";
import { io } from "socket.io-client";

const polygon = [
  { latitude: 48, longitude: 2 },
  { latitude: 48, longitude: 2.01 },
  { latitude: 48.01, longitude: 2.01 },
];
const area = {
  name: "Terrain",
  polygon,
  excludedPolygons: [
    [
      { latitude: 48.001, longitude: 2.004 },
      { latitude: 48.001, longitude: 2.005 },
      { latitude: 48.002, longitude: 2.005 },
    ],
  ],
};
const other = polygon.map((p) => ({ ...p, latitude: p.latitude + 1 }));
const fileName = (key) =>
  createHash("sha256").update(key).digest("hex") + ".json";

test("bibliothèque privée persistée, exclusions réutilisables et contrôle de l’organisateur", () => {
  const service = new LobbyService();
  const account = service.createAccount({ name: "Jo" });
  const host = service.createLobby({
    playerName: "Jo",
    accountId: account.id,
    maxPlayers: 2,
  });
  const guest = service.joinLobby({ code: host.lobby.code, playerName: "Léa" });
  const token = host.session.token;
  const map = service.saveMap({ token, name: "Mon parc", playArea: area });
  assert.deepEqual(map.playArea.polygon, polygon);
  assert.equal(map.geographyKey, mapPackageKey(polygon));
  assert.equal(
    service.exportState().savedMaps[0].geographyKey,
    map.geographyKey,
  );
  assert.deepEqual(map.playArea.excludedPolygons, area.excludedPolygons);
  assert.ok(!("owner" in map));
  assert.deepEqual(service.listSavedMaps({ token: guest.session.token }), []);
  assert.throws(() =>
    service.deleteSavedMap({ token: guest.session.token, id: map.id }),
  );
  assert.throws(
    () =>
      service.saveMap({
        token: guest.session.token,
        name: "Non",
        playArea: area,
      }),
    /organisateur/,
  );
  assert.throws(() => service.saveMap({ token, name: " ", playArea: area }));
  assert.throws(
    () => service.saveMap({ token, name: "Mon parc", playArea: area }),
    /existe déjà/,
  );
  const restored = new LobbyService({ initialState: service.exportState() });
  assert.equal(restored.listSavedMaps({ token })[0].name, "Mon parc");
  restored.setPlayArea({ token, playArea: map.playArea });
  assert.deepEqual(
    restored.snapshot(host.lobby.code).playArea.polygon,
    polygon,
  );
  restored.deleteSavedMap({ token, id: map.id });
  assert.deepEqual(restored.listSavedMaps({ token }), []);
  assert.ok(
    restored
      .retainedMapPolygons()
      .some((p) => mapPackageKey(p) === mapPackageKey(polygon)),
  );
});

test("les commandes réseau sauvegardent, listent et suppriment uniquement les cartes de la session", async (t) => {
  const server = createRpgGpsServer({ mapService: {} });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const socket = io(`http://127.0.0.1:${server.address().port}`, {
    transports: ["websocket"],
  });
  t.after(async () => {
    socket.close();
    await new Promise((resolve) => server.close(resolve));
  });
  await new Promise((resolve) => socket.once("connect", resolve));
  const request = (event, payload = {}) =>
    new Promise((resolve, reject) =>
      socket
        .timeout(4000)
        .emit(event, payload, (error, value) =>
          error ? reject(error) : resolve(value),
        ),
    );
  assert.equal((await request("map:list")).ok, false);
  assert.equal((await request("lobby:create", { playerName: "Jo" })).ok, true);
  const saved = await request("map:save", {
    name: "Parc réseau",
    playArea: area,
  });
  assert.equal(saved.ok, true);
  const listed = await request("map:list");
  assert.equal(listed.maps[0].id, saved.map.id);
  assert.equal(JSON.stringify(listed).includes("owner"), false);
  assert.equal(
    (await request("map:delete", { id: saved.map.id })).deleted,
    true,
  );
  assert.deepEqual((await request("map:list")).maps, []);
});

test("nettoyage des cartes et secteurs inutilisés, conservation partagée et reprise sans fournisseur", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-map-retention-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let queries = 0;
  const service = new OsmMapService({
    directory,
    bankMaxBytes: 0,
    fetchImpl: async () => {
      queries++;
      return Response.json({ elements: [] });
    },
  });
  const first = await service.prepare(polygon);
  await service.prepare(other);
  const sector = { ...first, bounds: [48, 2, 48.005, 2.005] };
  const sectorName =
    "sector-" + fileName(JSON.stringify([first.key, sector.bounds]));
  await writeFile(path.join(directory, sectorName), JSON.stringify(sector));
  await writeFile(path.join(directory, "unrelated.json"), "keep");
  await service.retain([polygon, polygon]);
  assert.ok((await readdir(directory)).includes(fileName(first.key)));
  assert.ok((await readdir(directory)).includes(sectorName));
  assert.ok(
    !(await readdir(directory)).includes(fileName(mapPackageKey(other))),
  );
  assert.ok(!service.memory.has(mapPackageKey(other)));
  const resumed = new OsmMapService({
    directory,
    bankMaxBytes: 0,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(await resumed.prepare(polygon), first);
  await resumed.retain([]);
  assert.deepEqual(await readdir(directory), ["unrelated.json"]);
  assert.equal(
    await readFile(path.join(directory, "unrelated.json"), "utf8"),
    "keep",
  );
  assert.equal(queries, 2);
});

test("une extraction en cours reste protégée lors du nettoyage", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-map-pending-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let finish;
  const service = new OsmMapService({
    directory,
    bankMaxBytes: 0,
    fetchImpl: () =>
      new Promise((resolve) => {
        finish = () => resolve(Response.json({ elements: [] }));
      }),
  });
  const pending = service.prepare(polygon);
  while (!finish) await new Promise((resolve) => setTimeout(resolve, 5));
  await service.retain([]);
  finish();
  const map = await pending;
  assert.ok((await readdir(directory)).includes(fileName(map.key)));
  await service.retain([]);
  assert.deepEqual(await readdir(directory), []);
});

test("le worker applique la conservation puis libère effectivement les fichiers", async (t) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), "rpg-map-worker-retain-"),
  );
  const worker = new OsmMapWorkerService({
    directory,
    bankMaxBytes: 0,
    endpoint: "http://127.0.0.1:1",
  });
  t.after(async () => {
    await worker.close();
    await rm(directory, { recursive: true, force: true });
  });
  const map = {
    version: 1,
    key: mapPackageKey(polygon),
    bounds: [48, 2, 48.01, 2.01],
    features: [],
  };
  await writeFile(path.join(directory, fileName(map.key)), JSON.stringify(map));
  await worker.retain([polygon]);
  assert.deepEqual(await worker.prepare(polygon), map);
  await worker.retain([]);
  assert.deepEqual(await readdir(directory), []);
});
