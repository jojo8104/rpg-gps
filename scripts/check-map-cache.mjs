import { mapBankFileName } from "../server/maps/map-bank.js";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { isMapPackage, mapPackageKey } from "../app/js/map/map-package.js";

// Lecture seule. Aucune coordonnée ni clé de zone n’est affichée.
const directory = process.argv[2];
const stateFile = process.argv[3];
if (!directory) {
  console.error("Usage : node scripts/check-map-cache.mjs <répertoire maps>");
  process.exitCode = 2;
} else {
  try {
    const entries = await readdir(directory);
    const result = {
      directory: path.resolve(directory),
      completeMaps: 0,
      validCompleteMaps: 0,
      sectors: 0,
      portions: 0,
      invalidFiles: 0,
      temporaryFiles: entries.filter((name) => name.endsWith(".tmp")).length,
      bytes: 0,
      completeMapBytes: 0,
      largestCompleteMapBytes: 0,
      writable: false,
    };
    try {
      await access(directory, constants.W_OK);
      result.writable = true;
    } catch {}
    const completeKeys = new Set(),
      sectorCounts = new Map();
    for (const name of entries.filter((name) =>
      /^(sector-|portion-)?[a-f0-9]{64}\.json$/.test(name),
    )) {
      const file = path.join(directory, name),
        info = await stat(file);
      if (!info.isFile()) continue;
      result.bytes += info.size;
      const portion = name.startsWith("portion-");
      const sector = name.startsWith("sector-") || portion;
      if (portion) result.portions++;
      else if (sector) result.sectors++;
      else result.completeMaps++;
      try {
        const value = JSON.parse(await readFile(file, "utf8"));
        const valid =
          isMapPackage(value) &&
          ((sector && !portion) ||
            (portion && mapBankFileName(value, "portion") === name) ||
            createHash("sha256").update(value.key).digest("hex") + ".json" ===
              name);
        if (!valid) result.invalidFiles++;
        else if (!sector) {
          result.validCompleteMaps++;
          result.completeMapBytes += info.size;
          result.largestCompleteMapBytes = Math.max(
            result.largestCompleteMapBytes,
            info.size,
          );
          completeKeys.add(value.key);
        } else if (
          mapBankFileName(value, portion ? "portion" : "sector") === name
        ) {
          sectorCounts.set(value.key, (sectorCounts.get(value.key) ?? 0) + 1);
        }
      } catch {
        result.invalidFiles++;
      }
    }
    result.averageCompleteMapBytes = result.validCompleteMaps
      ? Math.round(result.completeMapBytes / result.validCompleteMaps)
      : 0;
    if (stateFile) {
      const state = JSON.parse(await readFile(stateFile, "utf8"));
      if (state.version !== 1 || !Array.isArray(state.lobbies))
        throw Object.assign(new Error("État inconnu"), {
          code: "INVALID_STATE",
        });
      result.lobbies = state.lobbies.map((lobby) => {
        const areas = [
          ["preparation", lobby.playArea],
          ["launch", lobby.launch?.playArea],
          ["game", lobby.game?.setup?.playArea],
        ];
        return {
          code: lobby.code,
          status: lobby.status,
          createdAt: lobby.createdAt,
          zones: areas
            .filter(
              ([, area]) =>
                Array.isArray(area?.polygon) && area.polygon.length >= 3,
            )
            .map(([source, area]) => {
              const key = mapPackageKey(area.polygon);
              return {
                source,
                mapId: createHash("sha256").update(key).digest("hex"),
                completeMapAvailable: completeKeys.has(key),
                savedSectors: sectorCounts.get(key) ?? 0,
              };
            }),
        };
      });
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Inspection du cache impossible : " + error.code);
    process.exitCode = 1;
  }
}
