import { isMapPackage, mapPackageKey } from "./map-package.js";

/** Le serveur conserve les cartes ; le navigateur partage seulement les requêtes en cours. */
export function createMapPackageClient({
  fetchImpl = globalThis.fetch,
  cacheStorage = globalThis.caches,
} = {}) {
  const pending = new Map();
  const legacyCleanup = Promise.resolve()
    .then(() => cacheStorage?.delete?.("rpg-gps-map-packages-v1"))
    .catch(() => {});
  async function load(polygon) {
    const key = mapPackageKey(polygon);
    await legacyCleanup;
    let response;
    try {
      response = await fetchImpl("/api/maps/prepare", {
        method: "POST",
        signal: AbortSignal.timeout(130000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ polygon }),
      });
    } catch (error) {
      if (["TimeoutError", "AbortError"].includes(error.name))
        throw new Error(
          "La préparation de la carte a dépassé deux minutes. Le fond actuel reste disponible ; réessayez pour reprendre les secteurs déjà téléchargés.",
        );
      throw error;
    }
    const value = await response.json();
    if (!response.ok)
      throw new Error(value.error || "Téléchargement de la carte impossible.");
    if (value.key !== key || !isMapPackage(value))
      throw new Error("La carte reçue est invalide.");
    return { ...value, cached: false };
  }
  return {
    prepare(polygon) {
      const key = mapPackageKey(polygon);
      if (!pending.has(key))
        pending.set(
          key,
          load(polygon).finally(() => pending.delete(key)),
        );
      return pending.get(key);
    },
  };
}
