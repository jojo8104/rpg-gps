import { STARTUP_ASSETS } from "./startup-assets.js";

export const STARTUP_IMAGES = STARTUP_ASSETS.map(
  (path) => new URL(`../assets/${path}`, import.meta.url).href,
);

export const PORTRAIT_IMAGES = STARTUP_IMAGES.filter(
  (src) =>
    /\/assets\/(portraits|characters)\//.test(src) &&
    !src.includes("/portraits/modular/"),
);
export const WORLD_IMAGES = STARTUP_IMAGES.filter(
  (src) => !PORTRAIT_IMAGES.includes(src),
);

/** Partage les téléchargements en cours et conserve ceux déjà réussis. */
export class AssetLoadingSession {
  constructor({ loader = preloadStartupImages } = {}) {
    this.loader = loader;
    this.downloads = new Map();
    this.loaded = new Set();
  }

  async load(sources, { concurrency = 2, onProgress = () => {} } = {}) {
    const uniqueSources = [...new Set(sources)];
    const missing = uniqueSources.filter((src) => !this.loaded.has(src));
    let completed = uniqueSources.length - missing.length;
    let settled = completed;
    let next = 0;
    const failed = [];
    const report = () =>
      onProgress({ completed, settled, total: uniqueSources.length });
    report();
    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, missing.length) },
        async () => {
          while (next < missing.length) {
            const src = missing[next++];
            if (this.loaded.has(src)) {
              completed++;
              settled++;
              report();
              continue;
            }
            if (!this.downloads.has(src)) {
              const download = Promise.resolve()
                .then(() => this.loader({ sources: [src] }))
                .then(([result]) => {
                  if (result.status !== "fulfilled") throw result.reason;
                  this.loaded.add(src);
                })
                .finally(() => this.downloads.delete(src));
              this.downloads.set(src, download);
            }
            try {
              await this.downloads.get(src);
              completed++;
            } catch (error) {
              failed.push({ src, error });
            }
            settled++;
            report();
          }
        },
      ),
    );
    return failed;
  }
}

export const gameAssets = new AssetLoadingSession();

/** Téléchargement borné pour ne pas saturer les connexions mobiles. */
export async function preloadStartupImages({
  createImage = () => new Image(),
  timeoutMs = 30000,
  sources = PORTRAIT_IMAGES,
  onProgress = () => {},
  concurrency = 6,
} = {}) {
  const results = new Array(sources.length);
  let next = 0;
  let completed = 0;
  onProgress({ completed, total: sources.length });
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), sources.length) },
      async () => {
        while (next < sources.length) {
          const index = next++;
          const src = sources[index];
          try {
            await new Promise((resolve, reject) => {
              const image = createImage();
              const finish = (error) => {
                clearTimeout(timer);
                image.onload = null;
                image.onerror = null;
                if (error) reject(error);
                else resolve();
              };
              const timer = setTimeout(
                () => finish(new Error(`Chargement trop long : ${src}`)),
                timeoutMs,
              );
              image.onload = () => finish();
              image.onerror = () =>
                finish(new Error(`Image indisponible : ${src}`));
              image.src = src;
            });
            results[index] = { status: "fulfilled", value: src };
          } catch (reason) {
            results[index] = { status: "rejected", reason, src };
          }
          onProgress({ completed: ++completed, total: sources.length });
        }
      },
    ),
  );
  return results;
}
