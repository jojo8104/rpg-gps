import { gameAssets, WORLD_IMAGES } from "./asset-preloader.js";

export function backgroundAssetGroups(sources = WORLD_IMAGES) {
  const heroes = sources.filter((src) =>
    /\/assets\/heroes\/|\/assets\/units\/hero-/.test(src),
  );
  const locations = sources.filter((src) =>
    /\/assets\/(markers|scenes)\//.test(src),
  );
  const items = sources.filter((src) =>
    /\/assets\/(equipment|items|icons)\//.test(src),
  );
  const priority = new Set([...heroes, ...locations, ...items]);
  return [
    heroes,
    locations,
    items,
    sources.filter((src) => !priority.has(src)),
  ];
}

/** Une seule file par page ; ne bloque ni la configuration ni le démarrage. */
export function createBackgroundAssetLoader({
  assets = gameAssets,
  sources = WORLD_IMAGES,
} = {}) {
  let loading;
  return {
    start() {
      loading ??= (async () => {
        const failures = [];
        for (const group of backgroundAssetGroups(sources)) {
          failures.push(...(await assets.load(group, { concurrency: 2 })));
        }
        return failures;
      })().catch(() => []);
      return loading;
    },
  };
}

export const backgroundAssets = createBackgroundAssetLoader();
