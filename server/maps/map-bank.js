import { readdir, readFile, stat, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { isMapPackage } from "../../app/js/map/map-package.js";
import { planPolygonCoverage, rectangleGeometry } from "./polygon-coverage.js";

export function mapBankFileName(value, type = "map") {
  const input =
    type === "portion"
      ? JSON.stringify([value.key, value.bounds, value.coveragePolygons])
      : type === "sector"
        ? JSON.stringify([value.key, value.bounds])
        : value.key;
  return (
    (type === "map" ? "" : type + "-") +
    createHash("sha256").update(input).digest("hex") +
    ".json"
  );
}

/** Banque de cartes et portions complètes. L'index ne conserve que leurs métadonnées. */
export class MapBank {
  constructor(directory, maxBytes = 512 * 1024 * 1024) {
    if (!Number.isFinite(maxBytes) || maxBytes < 0)
      throw new RangeError("Taille de banque cartographique invalide.");
    this.directory = directory;
    this.maxBytes = maxBytes;
    this.index = new Map();
  }
  async scan() {
    if (!this.directory) return [];
    let names;
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    const present = new Set(
      names.filter((name) =>
        /^(sector-|portion-)?[a-f0-9]{64}\.json$/.test(name),
      ),
    );
    for (const name of this.index.keys())
      if (!present.has(name)) this.index.delete(name);
    for (const name of present) {
      try {
        const info = await stat(path.join(this.directory, name));
        const previous = this.index.get(name);
        if (previous?.mtimeMs === info.mtimeMs && previous?.bytes === info.size)
          continue;
        if (!info.isFile() || info.size > 32 * 1024 * 1024 + 4096) {
          this.index.delete(name);
          continue;
        }
        const value = JSON.parse(
          await readFile(path.join(this.directory, name), "utf8"),
        );
        if (
          !isMapPackage(value) ||
          mapBankFileName(
            value,
            name.startsWith("sector-")
              ? "sector"
              : name.startsWith("portion-")
                ? "portion"
                : "map",
          ) !== name
        ) {
          this.index.delete(name);
          continue;
        }
        this.index.set(name, {
          name,
          key: value.key,
          bounds: value.bounds,
          coveragePolygons: value.coveragePolygons,
          bytes: info.size,
          mtimeMs: info.mtimeMs,
          createdAt: value.createdAt,
        });
      } catch (error) {
        this.index.delete(name);
        if (error.code && error.code !== "ENOENT") throw error;
      }
    }
    return [...this.index.values()];
  }
  async planPolygon(target, consume = null) {
    const candidates = planPolygonCoverage(target, await this.scan()).sources;
    const loaded = [];
    for (const entry of candidates) {
      let pack;
      try {
        pack = JSON.parse(
          await readFile(path.join(this.directory, entry.name), "utf8"),
        );
      } catch (error) {
        if (error instanceof SyntaxError || error.code === "ENOENT") continue;
        throw error;
      }
      const type = entry.name.startsWith("portion-")
        ? "portion"
        : entry.name.startsWith("sector-")
          ? "sector"
          : "map";
      if (
        !isMapPackage(pack) ||
        mapBankFileName(pack, type) !== entry.name ||
        JSON.stringify(pack.bounds) !== JSON.stringify(entry.bounds) ||
        JSON.stringify(pack.coveragePolygons) !==
          JSON.stringify(entry.coveragePolygons)
      )
        continue;
      if (consume) consume(pack);
      loaded.push(consume ? entry : { ...entry, pack });
    }
    return planPolygonCoverage(target, loaded);
  }
  async retain(protectedKeys, protectedBounds = [], protectedPolygons = []) {
    const entries = await this.scan();
    // Une carte sauvegardée peut utiliser un paquet couvrant sa zone sans copie supplémentaire.
    const protectedNames = new Set(
      entries
        .filter((entry) => protectedKeys.has(entry.key))
        .map((entry) => entry.name),
    );
    for (const bounds of protectedPolygons.length ? [] : protectedBounds) {
      for (const source of planPolygonCoverage(
        rectangleGeometry(bounds),
        entries,
      ).sources)
        protectedNames.add(source.name);
    }
    for (const geometry of protectedPolygons)
      for (const source of planPolygonCoverage(geometry, entries).sources)
        protectedNames.add(source.name);
    let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    for (const entry of entries.sort((a, b) => a.mtimeMs - b.mtimeMs)) {
      if (bytes <= this.maxBytes) break;
      if (protectedNames.has(entry.name)) continue;
      try {
        await unlink(path.join(this.directory, entry.name));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      this.index.delete(entry.name);
      bytes -= entry.bytes;
    }
  }
}
