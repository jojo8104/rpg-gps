import { unlink } from "node:fs/promises";
import path from "node:path";
import { equivalentMapPackageKeys } from "../../app/js/map/map-package.js";
import {
  playAreaGeometry,
  planPolygonCoverage,
  packCoverage,
} from "./polygon-coverage.js";

/** Opérations disque administratives, sans téléchargement ni accès aux règles du jeu. */
export async function administerMapBank(
  service,
  { action = "inspect", id, polygons = [] },
) {
  if (!["inspect", "remove", "purge-unused"].includes(action))
    throw Object.assign(new Error("Action cartographique inconnue."), {
      status: 400,
    });
  if (
    action !== "inspect" &&
    (service.pending.size || service.adminBusy || service.retaining)
  )
    throw Object.assign(
      new Error("Une préparation cartographique est en cours."),
      { status: 409 },
    );
  if (action !== "inspect") service.adminBusy = true;
  try {
    const entries = await service.bank.scan();
    const keys = new Set(polygons.flatMap(equivalentMapPackageKeys));
    for (const key of service.pending.keys()) keys.add(key);
    const protectedNames = new Set(
      entries.filter((entry) => keys.has(entry.key)).map((entry) => entry.name),
    );
    for (const polygon of polygons)
      for (const entry of planPolygonCoverage(
        playAreaGeometry(polygon),
        entries,
      ).sources)
        protectedNames.add(entry.name);
    const files = entries.map((entry) => ({
      id: entry.name,
      type: entry.name.startsWith("portion-")
        ? "portion"
        : entry.name.startsWith("sector-")
          ? "sector"
          : "map",
      bytes: entry.bytes,
      createdAt: entry.createdAt ?? entry.mtimeMs,
      bounds: entry.bounds,
      coveragePolygons: packCoverage(entry),
      protected: protectedNames.has(entry.name),
    }));
    if (action === "inspect")
      return {
        maxBytes: service.bank.maxBytes,
        bytes: files.reduce((sum, file) => sum + file.bytes, 0),
        protectedBytes: files
          .filter((file) => file.protected)
          .reduce((sum, file) => sum + file.bytes, 0),
        busy: service.pending.size > 0,
        files,
      };
    const targets =
      action === "remove"
        ? files.filter((file) => file.id === id)
        : files.filter((file) => !file.protected);
    if (action === "remove" && !targets.length)
      throw Object.assign(new Error("Fichier cartographique introuvable."), {
        status: 404,
      });
    if (targets.some((file) => file.protected))
      throw Object.assign(
        new Error(
          "Ces données sont utilisées par une carte ou une partie et restent protégées.",
        ),
        { status: 409 },
      );
    let bytes = 0,
      count = 0;
    for (const file of targets) {
      try {
        await unlink(path.join(service.directory, file.id));
        count++;
        bytes += file.bytes;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      service.bank.index.delete(file.id);
    }
    service.memory.clear();
    service.parts.clear();
    return { removedFiles: count, freedBytes: bytes };
  } finally {
    if (action !== "inspect") service.adminBusy = false;
  }
}
