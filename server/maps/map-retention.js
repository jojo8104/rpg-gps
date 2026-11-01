import { equivalentMapPackageKeys } from "../../app/js/map/map-package.js";

/** Banque plafonnée ; protection des sources contribuant aux zones enregistrées. */
export async function pruneMapPackages(
  service,
  polygons,
  protectedBounds = [],
  protectedPolygons = [],
) {
  const retained = new Set(polygons.flatMap(equivalentMapPackageKeys));
  for (const key of service.pending.keys()) {
    try {
      const polygon = JSON.parse(key.slice(key.indexOf(":") + 1)).map(
        ([latitude, longitude]) => ({ latitude, longitude }),
      );
      for (const alias of equivalentMapPackageKeys(polygon))
        retained.add(alias);
    } catch {
      /* Une clé étrangère ne protège aucun autre fichier. */
    }
  }
  const keep = (key) => retained.has(key) || service.pending.has(key);
  for (const key of service.memory.keys())
    if (!keep(key)) service.memory.delete(key);
  for (const [key, value] of service.parts)
    if (!keep(value.key)) service.parts.delete(key);
  if (!service.directory) return;
  await service.bank.retain(retained, protectedBounds, protectedPolygons);
}
