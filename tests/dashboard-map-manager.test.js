import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { OsmMapService } from "../server/maps/osm-map-service.js";
import { OsmMapWorkerService } from "../server/maps/osm-map-worker-service.js";
import { createRpgGpsServer } from "../server/server.js";

const polygon = [
  { latitude: 48, longitude: 2 },
  { latitude: 48, longitude: 2.01 },
  { latitude: 48.01, longitude: 2.01 },
  { latitude: 48.01, longitude: 2 },
];
test("le Dashboard consulte sans télécharger, protège les données utiles et gère références et fichiers", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-dashboard-maps-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let downloads = 0;
  const maps = new OsmMapService({
    directory,
    fetchImpl: async () => {
      downloads++;
      return Response.json({ elements: [] });
    },
  });
  const lobbies = new LobbyService();
  const host = lobbies.createLobby({ playerName: "Jo" });
  const saved = lobbies.saveMap({
    token: host.session.token,
    name: "Parc",
    playArea: { name: "Parc", polygon },
  });
  await maps.prepare(polygon);
  await maps.prepare(polygon.map((p) => ({ ...p, latitude: p.latitude + 1 })));
  await writeFile(path.join(directory, "foreign.json"), "préserver");
  const server = createRpgGpsServer({
    lobbyService: lobbies,
    mapService: maps,
    dashboardToken: "test",
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: "Bearer test" };
  assert.equal((await fetch(base + "/api/dashboard/maps")).status, 401);
  const data = await (
    await fetch(base + "/api/dashboard/maps", { headers })
  ).json();
  assert.equal(downloads, 2);
  assert.equal(data.savedMaps[0].complete, true);
  assert.equal(data.savedMaps[0].coveragePercent, 100);
  assert.equal(data.savedMaps[0].owner, undefined);
  assert.equal(data.bank.files.length, 2);
  const protectedFile = data.bank.files.find((file) => file.protected),
    unused = data.bank.files.find((file) => !file.protected);
  assert.ok(protectedFile.usedBy.includes("Carte : Parc"));
  const remove = (id, confirm = id) =>
    fetch(base + "/api/dashboard/maps?id=" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { ...headers, "X-Dashboard-Confirm": confirm },
    });
  assert.equal((await remove(unused.id, "wrong")).status, 400);
  assert.equal((await remove(protectedFile.id)).status, 409);
  assert.equal((await remove("../foreign.json")).status, 404);
  assert.equal((await remove(unused.id)).status, 200);
  assert.equal(
    (
      await fetch(base + "/api/dashboard/saved-map/prepare?id=" + saved.id, {
        method: "POST",
        headers: { ...headers, "X-Dashboard-Confirm": saved.id },
      })
    ).status,
    200,
  );
  assert.equal(
    downloads,
    2,
    "compléter une carte déjà disponible ne rappelle pas Overpass",
  );
  assert.equal(
    (
      await fetch(base + "/api/dashboard/saved-map?id=" + saved.id, {
        method: "DELETE",
        headers: { ...headers, "X-Dashboard-Confirm": saved.id },
      })
    ).status,
    200,
  );
  assert.equal(lobbies.dashboardSavedMaps().length, 0);
  assert.ok(
    (await readdir(directory)).includes(protectedFile.id),
    "retirer la référence ne purge pas ses données",
  );
  const purge = await fetch(base + "/api/dashboard/maps/unused", {
    method: "DELETE",
    headers: { ...headers, "X-Dashboard-Confirm": "unused" },
  });
  assert.equal(purge.status, 200);
  assert.deepEqual(await readdir(directory), ["foreign.json"]);
  assert.equal(downloads, 2);
});

test("le vrai worker expose l’inspection administrative et refuse une suppression protégée", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-worker-map-admin-"));
  const source = new OsmMapService({
    directory,
    fetchImpl: async () => Response.json({ elements: [] }),
  });
  await source.prepare(polygon);
  const worker = new OsmMapWorkerService({
    directory,
    endpoint: "http://127.0.0.1:1",
  });
  t.after(async () => {
    await worker.close();
    await rm(directory, { recursive: true, force: true });
  });
  const report = await worker.admin({ action: "inspect", polygons: [polygon] });
  assert.equal(report.files.length, 1);
  assert.equal(report.files[0].protected, true);
  await assert.rejects(
    worker.admin({
      action: "remove",
      id: report.files[0].id,
      polygons: [polygon],
    }),
    { status: 409 },
  );
});
