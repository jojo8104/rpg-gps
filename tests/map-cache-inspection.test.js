import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { mapPackageKey } from "../app/js/map/map-package.js";
const run = promisify(execFile);
test("le diagnostic distingue les cartes valides et les fichiers incomplets sans écrire ni afficher de coordonnées", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-map-inspection-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const value = {
    version: 1,
    key: "test-zone",
    bounds: [48.1234567, 2, 48.1244567, 2.001],
    features: [],
  };
  const name = createHash("sha256").update(value.key).digest("hex") + ".json";
  const wrong = "0".repeat(64) + ".json",
    sector = "sector-" + "1".repeat(64) + ".json";
  await writeFile(path.join(directory, name), JSON.stringify(value));
  await writeFile(path.join(directory, wrong), JSON.stringify(value));
  await writeFile(path.join(directory, sector), JSON.stringify(value));
  await writeFile(path.join(directory, "incomplete.tmp"), "unfinished");
  const before = new Map(
    await Promise.all(
      (await readdir(directory)).map(async (file) => [
        file,
        await readFile(path.join(directory, file), "utf8"),
      ]),
    ),
  );
  const { stdout, stderr } = await run(process.execPath, [
    fileURLToPath(new URL("../scripts/check-map-cache.mjs", import.meta.url)),
    directory,
  ]);
  assert.equal(stderr, "");
  const report = JSON.parse(stdout);
  assert.equal(report.completeMaps, 2);
  assert.equal(report.validCompleteMaps, 1);
  assert.equal(
    report.completeMapBytes,
    Buffer.byteLength(JSON.stringify(value)),
  );
  assert.equal(report.averageCompleteMapBytes, report.completeMapBytes);
  assert.equal(report.largestCompleteMapBytes, report.completeMapBytes);
  assert.equal(report.sectors, 1);
  assert.equal(report.invalidFiles, 1);
  assert.equal(report.temporaryFiles, 1);
  assert.ok(!stdout.includes("48.1234567"));
  assert.ok(!stdout.includes(value.key));
  assert.deepEqual(new Set(await readdir(directory)), new Set(before.keys()));
  for (const [file, content] of before)
    assert.equal(await readFile(path.join(directory, file), "utf8"), content);
});

test("le rapprochement distingue une carte complète, un secteur et une zone absente sans divulguer la sauvegarde", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "rpg-map-match-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const polygon = [
    { latitude: 48.1234567, longitude: 2 },
    { latitude: 48.1244567, longitude: 2 },
    { latitude: 48.1244567, longitude: 2.001 },
  ];
  const other = polygon.map((p) => ({ ...p, latitude: p.latitude + 1 }));
  const bounds = [48.1234567, 2, 48.1244567, 2.001];
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  const key = mapPackageKey(polygon),
    otherKey = mapPackageKey(other);
  await writeFile(
    path.join(directory, hash(key) + ".json"),
    JSON.stringify({ version: 1, key, bounds, features: [] }),
  );
  await writeFile(
    path.join(
      directory,
      "sector-" + hash(JSON.stringify([otherKey, bounds])) + ".json",
    ),
    JSON.stringify({ version: 1, key: otherKey, bounds, features: [] }),
  );
  const stateFile = path.join(directory, "state.json");
  await writeFile(
    stateFile,
    JSON.stringify({
      version: 1,
      sessions: [{ hash: "secret-session" }],
      lobbies: [
        {
          code: "TEST",
          playArea: { polygon },
          launch: { playArea: { polygon: other } },
          game: {
            setup: {
              playArea: {
                polygon: polygon.map((p) => ({
                  ...p,
                  latitude: p.latitude + 2,
                })),
              },
            },
          },
        },
      ],
    }),
  );
  const { stdout } = await run(process.execPath, [
    fileURLToPath(new URL("../scripts/check-map-cache.mjs", import.meta.url)),
    directory,
    stateFile,
  ]);
  const zones = JSON.parse(stdout).lobbies[0].zones;
  assert.deepEqual(
    zones.map((z) => [z.source, z.completeMapAvailable, z.savedSectors]),
    [
      ["preparation", true, 0],
      ["launch", false, 1],
      ["game", false, 0],
    ],
  );
  assert.ok(!stdout.includes("48.1234567"));
  assert.ok(!stdout.includes("secret-session"));
  assert.ok(!stdout.includes(key));
});
