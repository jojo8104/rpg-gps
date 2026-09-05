import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readServerConfig } from "../server/config.js";
import { createRpgGpsServer } from "../server/server.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("la configuration du serveur possède des valeurs sûres", () => {
  assert.deepEqual(readServerConfig({}), { host: "127.0.0.1", port: 3000 });
  assert.deepEqual(readServerConfig({ RPG_GPS_HOST: "0.0.0.0", RPG_GPS_PORT: "8080" }), {
    host: "0.0.0.0",
    port: 8080,
  });
  assert.throws(() => readServerConfig({ RPG_GPS_PORT: "70000" }), /port valide/);
});

test("le serveur expose sa santé et les fichiers du jeu", async (context) => {
  const server = createRpgGpsServer({ projectRoot, now: () => 5_000 });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok", uptimeSeconds: 0 });
  assert.equal(health.headers.get("cache-control"), "no-store");

  const home = await fetch(`${origin}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /^text\/html/);
  assert.match(await home.text(), /RPG GPS/);

  const script = await fetch(`${origin}/app/js/main.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /^text\/javascript/);
});

test("le serveur refuse les méthodes d’écriture et les fichiers absents", async (context) => {
  const server = createRpgGpsServer({ projectRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();

  const write = await fetch(`http://127.0.0.1:${port}/`, { method: "POST" });
  assert.equal(write.status, 405);
  const missing = await fetch(`http://127.0.0.1:${port}/absent.txt`);
  assert.equal(missing.status, 404);
});
