import { mapBankFileName } from "../server/maps/map-bank.js";
import { readFile, readdir, realpath, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  isMapPackage,
  equivalentMapPackageKeys,
} from "../app/js/map/map-package.js";
import { mapBounds } from "../server/maps/osm-map-service.js";

// Nettoyage conservateur du disque uniquement. Aucun accès aux règles ni aux sessions.
const [directory, stateFile, mode] = process.argv.slice(2);
const apply = mode === "--apply";
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function protectedKeys() {
  const state = JSON.parse(await readFile(stateFile, "utf8"));
  if (
    state.version !== 1 ||
    !Array.isArray(state.lobbies) ||
    (state.manualSaves !== undefined && !Array.isArray(state.manualSaves)) ||
    (state.savedMaps !== undefined && !Array.isArray(state.savedMaps))
  )
    throw new Error("Format de sauvegarde inconnu : nettoyage refusé.");
  const areas = [];
  for (const lobby of state.lobbies)
    areas.push(
      lobby.playArea,
      lobby.launch?.playArea,
      lobby.game?.setup?.playArea,
    );
  for (const save of state.manualSaves ?? [])
    areas.push(save.launch?.playArea, save.game?.setup?.playArea);
  for (const map of state.savedMaps ?? []) areas.push(map.playArea);
  const polygons = areas.filter(Boolean).map((area) => {
    if (!Array.isArray(area.polygon) || area.polygon.length < 3)
      throw new Error("Zone sauvegardée invalide : nettoyage refusé.");
    return area.polygon;
  });
  const keys = new Set(polygons.flatMap(equivalentMapPackageKeys));
  keys.bounds = polygons.map(mapBounds);
  return keys;
}
try {
  if (!directory || !stateFile || (mode && !apply))
    throw new Error(
      "Usage : node clean-map-cache.mjs <maps> <server-state.json> [--apply]",
    );
  const resolved = await realpath(directory);
  if (
    resolved !== path.resolve(directory) ||
    path.dirname(path.resolve(stateFile)) !== path.dirname(resolved) ||
    path.basename(stateFile) !== "server-state.json"
  )
    throw new Error("Chemins inattendus : nettoyage refusé.");
  await protectedKeys();
  const report = {
    mode: apply ? "apply" : "preview",
    candidates: 0,
    removedFiles: 0,
    freedBytes: 0,
    protectedFiles: 0,
    recentFiles: 0,
    ignoredFiles: 0,
  };
  const cutoff = Date.now() - 120000;
  for (const entry of await readdir(resolved, { withFileTypes: true })) {
    if (
      !entry.isFile() ||
      !/^(sector-|portion-)?[a-f0-9]{64}\.json$/.test(entry.name)
    ) {
      report.ignoredFiles++;
      continue;
    }
    const file = path.join(resolved, entry.name);
    let value, info;
    try {
      value = JSON.parse(await readFile(file, "utf8"));
      info = await stat(file);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      if (error instanceof SyntaxError) {
        report.ignoredFiles++;
        continue;
      }
      throw error;
    }
    const expected = mapBankFileName(
      value,
      entry.name.startsWith("portion-")
        ? "portion"
        : entry.name.startsWith("sector-")
          ? "sector"
          : "map",
    );
    if (!isMapPackage(value) || expected !== entry.name) {
      report.ignoredFiles++;
      continue;
    }
    // Relire la sauvegarde pour chaque fichier : les parties peuvent évoluer pendant le diagnostic.
    const protection = await protectedKeys();
    const contributesToSaved = protection.bounds.some(
      (bounds) =>
        value.bounds[0] < bounds[2] &&
        value.bounds[1] < bounds[3] &&
        value.bounds[2] > bounds[0] &&
        value.bounds[3] > bounds[1],
    );
    if (protection.has(value.key) || contributesToSaved) {
      report.protectedFiles++;
      continue;
    }
    if (info.mtimeMs > cutoff) {
      report.recentFiles++;
      continue;
    }
    report.candidates++;
    if (apply) {
      try {
        await unlink(file);
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      report.removedFiles++;
      report.freedBytes += info.size;
    }
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error("Nettoyage interrompu : " + (error.code ?? error.message));
  process.exitCode = 1;
}
