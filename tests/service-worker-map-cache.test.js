import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

async function worker(fetchImpl = async () => ({ fresh: true })) {
  const handlers = {},
    deleted = [];
  const context = {
    URL,
    fetch: fetchImpl,
    self: {
      location: new URL("http://localhost/service-worker.js"),
      addEventListener: (name, callback) => {
        handlers[name] = callback;
      },
      clients: { claim: async () => {} },
    },
    caches: {
      keys: async () => [
        "rpg-gps-field-old",
        "rpg-gps-map-packages-v1",
        "other-application",
      ],
      delete: async (key) => deleted.push(key),
    },
  };
  runInNewContext(
    await readFile(new URL("../service-worker.js", import.meta.url), "utf8"),
    context,
  );
  return { handlers, deleted };
}

test("une mise à jour retire le cache cartographique implicite et préserve les caches étrangers", async () => {
  const { handlers, deleted } = await worker();
  let completion;
  handlers.activate({
    waitUntil: (promise) => {
      completion = promise;
    },
  });
  await completion;
  assert.deepEqual(deleted, ["rpg-gps-field-old", "rpg-gps-map-packages-v1"]);
});

for (const pathname of [
  "/api/maps/search?q=Paris", "/api/dashboard/parties",
  "/api/dashboard/party?code=TEST", "/api/dashboard/history?code=TEST",
  "/dashboard/", "/dashboard/dashboard.js", "/dashboard/dashboard.css",
  "/dashboard/history-charts.js", "/editor/", "/health",
]) {
  test(`réponse serveur fraîche sans cache pour ${pathname}`, async () => {
    const requests = [];
    const { handlers } = await worker(async (request, options) => {
      requests.push({ request, options });
      return { version: requests.length };
    });
    const request = { method: "GET", url: `http://localhost${pathname}` };
    for (let version = 1; version <= 2; version++) {
      let response;
      handlers.fetch({ request, respondWith: (promise) => { response = promise; } });
      assert.equal((await response).version, version);
      assert.equal(requests.at(-1).options.cache, "no-store");
    }
  });
}

test("le Dashboard hors ligne ne réutilise pas un ancien état", async () => {
  const { handlers } = await worker(async () => { throw new Error("offline"); });
  let response;
  handlers.fetch({
    request: { method: "GET", url: "http://localhost/api/dashboard/parties" },
    respondWith: (promise) => { response = promise; },
  });
  await assert.rejects(response, /offline/);
});
