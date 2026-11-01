import assert from "node:assert/strict";
import test from "node:test";
import { access } from "node:fs/promises";
import {
  backgroundAssetGroups,
  createBackgroundAssetLoader,
} from "../app/js/background-assets.js";
import {
  preloadStartupImages,
  STARTUP_IMAGES,
  PORTRAIT_IMAGES,
  WORLD_IMAGES,
  AssetLoadingSession,
} from "../app/js/asset-preloader.js";

test("tous les assets du catalogue existent", async () => {
  await Promise.all(STARTUP_IMAGES.map((src) => access(new URL(src))));
});

test("la file de configuration respecte héros, lieux, objets et reste unique pendant le jeu", async () => {
  const sources = [
    "/assets/equipment/sword.png",
    "/assets/markers/village.png",
    "/assets/heroes/walk.png",
    "/assets/units/archer.png",
  ];
  const groups = backgroundAssetGroups(sources);
  assert.deepEqual(groups, [
    [sources[2]],
    [sources[1]],
    [sources[0]],
    [sources[3]],
  ]);
  const requests = [];
  let finishHero;
  const queue = createBackgroundAssetLoader({
    sources,
    assets: {
      async load(group) {
        requests.push(group);
        if (group === undefined) throw new Error("invalid group");
        if (group[0] === sources[2])
          await new Promise((resolve) => {
            finishHero = resolve;
          });
        return group[0] === sources[1]
          ? [{ src: sources[1], error: new Error("missing") }]
          : [];
      },
    },
  });
  const background = queue.start();
  assert.equal(queue.start(), background);
  assert.deepEqual(requests, [[sources[2]]]);
  finishHero();
  assert.equal((await background).length, 1);
  assert.deepEqual(requests, groups);
});

test("l’accueil ne charge que les portraits, le reste attend la configuration", () => {
  assert.ok(PORTRAIT_IMAGES.length > 0);
  assert.ok(PORTRAIT_IMAGES.length < STARTUP_IMAGES.length / 10);
  assert.ok(PORTRAIT_IMAGES.every((src) => !src.includes("/portraits/modular/")));
  assert.ok(WORLD_IMAGES.some((src) => src.includes("/portraits/modular/")));
  assert.ok(
    PORTRAIT_IMAGES.every((src) => /\/(portraits|characters)\//.test(src)),
  );
  assert.deepEqual(
    new Set([...PORTRAIT_IMAGES, ...WORLD_IMAGES]),
    new Set(STARTUP_IMAGES),
  );
  assert.equal(
    WORLD_IMAGES.some((src) => PORTRAIT_IMAGES.includes(src)),
    false,
  );
});

test("le lancement partage les téléchargements de fond sans doublons", async () => {
  const requests = [];
  const pending = new Map();
  const session = new AssetLoadingSession({
    loader: ({ sources: [src] }) => {
      requests.push(src);
      return new Promise((resolve) =>
        pending.set(src, () => resolve([{ status: "fulfilled", value: src }])),
      );
    },
  });
  const background = session.load(["one", "two"], { concurrency: 1 });
  const foreground = session.load(["one", "two"], { concurrency: 2 });
  await new Promise((resolve) => setImmediate(resolve));
  // Le second téléchargement termine avant que la file de fond y arrive.
  pending.get("two")();
  pending.get("one")();
  assert.deepEqual(await foreground, []);
  assert.deepEqual(await background, []);
  assert.deepEqual(requests.sort(), ["one", "two"]);
  const progress = [];
  await session.load(["one", "two"], {
    onProgress: (state) => progress.push(state),
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(progress, [{ completed: 2, settled: 2, total: 2 }]);
});

test("un échec en fond ne bloque pas les menus et seul le visuel manquant est retenté", async () => {
  const requests = [];
  let online = false;
  const session = new AssetLoadingSession({
    loader: async ({ sources: [src] }) => {
      requests.push(src);
      return [
        src === "missing" && !online
          ? { status: "rejected", reason: new Error("offline") }
          : { status: "fulfilled", value: src },
      ];
    },
  });
  const failed = await session.load(["ready", "missing"]);
  assert.equal(failed.length, 1);
  online = true;
  assert.deepEqual(await session.load(["ready", "missing"]), []);
  assert.deepEqual(requests, ["ready", "missing", "missing"]);
});

test("la progression atteint le total et signale les échecs sans bloquer", async () => {
  const progress = [];
  const results = await preloadStartupImages({
    sources: ["ok", "error", "ok"],
    concurrency: 2,
    createImage: () => ({
      set src(src) {
        queueMicrotask(() =>
          src === "error" ? this.onerror() : this.onload(),
        );
      },
    }),
    onProgress: (value) => progress.push(value.completed),
  });
  assert.deepEqual(progress, [0, 1, 2, 3]);
  assert.deepEqual(
    results.map((result) => result.status),
    ["fulfilled", "rejected", "fulfilled"],
  );
});

test("une image sans réponse se termine par un échec récupérable", async () => {
  const results = await preloadStartupImages({
    sources: ["timeout"],
    createImage: () => ({}),
    timeoutMs: 5,
  });
  assert.equal(results[0].status, "rejected");
});
