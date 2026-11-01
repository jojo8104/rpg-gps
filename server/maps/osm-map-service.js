import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { pruneMapPackages } from "./map-retention.js";
import {
  playAreaGeometry,
  geometryBounds,
  simpleQueryRegions,
} from "./polygon-coverage.js";
import { buildOverpassMapQuery } from "./overpass-map-query.js";
import { MapBank } from "./map-bank.js";
import { createMapFeatureAssembly } from "./map-coverage.js";
import { administerMapBank } from "./map-administration.js";
import {
  MapRequestPolicy,
  retryAfterMilliseconds,
} from "./map-request-policy.js";
import { PlayArea } from "../../app/js/core/play-area.js";
import {
  MAP_PACKAGE_VERSION,
  mapPackageKey,
  isMapPackage,
  equivalentMapPackageKeys,
} from "../../app/js/map/map-package.js";

export function mapBounds(polygon) {
  if (!Array.isArray(polygon) || polygon.length > 100)
    throw new RangeError("La zone doit contenir de 3 à 100 sommets.");
  const area = new PlayArea({ id: "map", name: "Carte", polygon });
  const latitudes = area.polygon.map((p) => p.latitude);
  const longitudes = area.polygon.map((p) => p.longitude);
  const south = Math.min(...latitudes),
    north = Math.max(...latitudes);
  const west = Math.min(...longitudes),
    east = Math.max(...longitudes);
  const width =
    (east - west) * 111320 * Math.cos(((north + south) * Math.PI) / 360);
  const height = (north - south) * 111320;
  if (
    Math.max(Math.abs(south), Math.abs(north)) > 80 ||
    east - west > 180 ||
    width <= 0 ||
    height <= 0 ||
    width > 20000 ||
    height > 20000 ||
    width * height > 100000000 ||
    area.getAreaSquareMeters() < 1
  )
    throw new RangeError(
      "Choisissez une zone de surface positive, de moins de 100 km² et 20 km de côté, entre 80° sud et 80° nord.",
    );
  return [south, west, north, east];
}

function kindFor(tags = {}) {
  if (tags.building && tags.building !== "no") return "building";
  if (
    tags.natural === "water" ||
    tags.water ||
    tags.landuse === "reservoir" ||
    tags.waterway === "riverbank"
  )
    return "water";
  if (tags.natural === "wood" || tags.landuse === "forest") return "forest";
  if (
    ["grass", "meadow", "recreation_ground", "village_green"].includes(
      tags.landuse,
    ) ||
    tags.leisure === "park" ||
    tags.natural === "grassland"
  )
    return "grass";
  if (tags.highway) return "road";
  if (tags.waterway) return "waterway";
  return null;
}

function coordinates(geometry = []) {
  // Une géométrie partielle ne doit pas créer un raccourci artificiel.
  if (
    !geometry.every((p) => Number.isFinite(p?.lon) && Number.isFinite(p?.lat))
  )
    return [];
  return geometry.map((p) => [
    Number(p.lon.toFixed(7)),
    Number(p.lat.toFixed(7)),
  ]);
}
const equal = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];
function ringsFor(members, role) {
  const parts = members
    .filter((m) => m.type === "way" && (m.role || "outer") === role)
    .map((m) => coordinates(m.geometry))
    .filter((points) => points.length >= 2);
  const rings = [];
  while (parts.length) {
    let ring = parts.pop();
    while (!equal(ring[0], ring.at(-1))) {
      const index = parts.findIndex(
        (part) =>
          equal(part[0], ring.at(-1)) || equal(part.at(-1), ring.at(-1)),
      );
      if (index < 0) break;
      let part = parts.splice(index, 1)[0];
      if (!equal(part[0], ring.at(-1))) part = part.reverse();
      ring = ring.concat(part.slice(1));
    }
    if (ring.length >= 4 && equal(ring[0], ring.at(-1))) rings.push(ring);
  }
  return rings;
}
function inside(point, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (
      ring[i][1] > point[1] !== ring[j][1] > point[1] &&
      point[0] <
        ((ring[j][0] - ring[i][0]) * (point[1] - ring[i][1])) /
          (ring[j][1] - ring[i][1]) +
          ring[i][0]
    )
      result = !result;
  }
  return result;
}

export function convertOsmMap(data, { polygon, bounds, now = Date.now() }) {
  if (!Array.isArray(data?.elements) || data.remark)
    throw new Error("Extraction OSM incomplète.");
  const features = [];
  for (const element of data.elements) {
    const kind = kindFor(element.tags);
    if (!kind) continue;
    if (element.type === "relation") {
      const outer = ringsFor(element.members ?? [], "outer");
      const inner = ringsFor(element.members ?? [], "inner");
      outer.forEach((ring, index) =>
        features.push({
          id: `relation/${element.id}/${index}`,
          kind,
          geometry: {
            type: "Polygon",
            coordinates: [
              ring,
              ...inner.filter((hole) => inside(hole[0], ring)),
            ],
          },
        }),
      );
    } else if (element.type === "way") {
      const points = coordinates(element.geometry);
      if (points.length < 2) continue;
      const linear = kind === "road" || kind === "waterway";
      if (!linear && (points.length < 4 || !equal(points[0], points.at(-1))))
        continue;
      features.push({
        id: `way/${element.id}`,
        kind,
        subtype: element.tags?.highway ?? element.tags?.waterway ?? null,
        geometry: {
          type: linear ? "LineString" : "Polygon",
          coordinates: linear ? points : [points],
        },
      });
    }
  }
  const result = {
    version: MAP_PACKAGE_VERSION,
    key: mapPackageKey(polygon),
    source: "OpenStreetMap",
    attribution: "© OpenStreetMap contributors",
    createdAt: now,
    bounds,
    features,
  };
  if (!isMapPackage(result)) throw new Error("Carte OSM invalide.");
  return result;
}

export class OsmMapService {
  constructor({
    fetchImpl = globalThis.fetch,
    directory = null,
    endpoint,
    fallbackEndpoint,
    requestTimeoutMs = 20000,
    preparationTimeoutMs = 120000,
    bankMaxBytes = Number(
      process.env.RPG_GPS_MAP_BANK_MAX_BYTES ?? 512 * 1024 * 1024,
    ),
    now = Date.now,
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.directory = directory;
    const configured = endpoint || process.env.RPG_GPS_OVERPASS_URL;
    this.endpoint = configured || "https://overpass-api.de/api/interpreter";
    this.fallbackEndpoint =
      fallbackEndpoint ??
      process.env.RPG_GPS_OVERPASS_FALLBACK_URL ??
      (configured ? null : "https://overpass.private.coffee/api/interpreter");
    this.requestTimeoutMs = requestTimeoutMs;
    this.preparationTimeoutMs = preparationTimeoutMs;
    this.parts = new Map();
    this.now = now;
    this.pending = new Map();
    this.memory = new Map();
    this.policy = new MapRequestPolicy(now);
    this.endpointIndex = 0;
    this.bank = new MapBank(directory, bankMaxBytes);
  }
  async retain(polygons) {
    if (this.adminBusy || this.retaining) return;
    this.retaining = true;
    try {
      const pendingPolygons = [...this.pending.keys()].map((key) =>
        JSON.parse(key.slice(key.indexOf(":") + 1)).map(
          ([latitude, longitude]) => ({ latitude, longitude }),
        ),
      );
      const geometries = [...polygons, ...pendingPolygons].map(
        playAreaGeometry,
      );
      await pruneMapPackages(
        this,
        polygons,
        geometries.map(geometryBounds),
        geometries,
      );
    } finally {
      this.retaining = false;
    }
  }

  async prepare(polygon) {
    const bounds = mapBounds(polygon);
    const key = mapPackageKey(polygon);
    for (const alias of equivalentMapPackageKeys(polygon)) {
      if (this.memory.has(alias)) return { ...this.memory.get(alias), key };
      if (this.pending.has(alias))
        return { ...(await this.pending.get(alias)), key };
    }
    if (this.pending.size >= 1 || this.adminBusy)
      throw Object.assign(
        new Error("Préparation de cartes occupée. Réessayez dans un instant."),
        { status: 429 },
      );
    const operation = this.load(key, polygon, bounds);
    this.pending.set(key, operation);
    try {
      const result = await operation;
      if (this.memory.size >= 20)
        this.memory.delete(this.memory.keys().next().value);
      this.memory.set(key, result);
      return result;
    } finally {
      this.pending.delete(key);
    }
  }
  admin(options) {
    return administerMapBank(this, options);
  }
  async load(key, polygon, bounds) {
    const id = createHash("sha256").update(key).digest("hex");
    const file = this.directory && path.join(this.directory, `${id}.json`);
    if (file) {
      for (const alias of equivalentMapPackageKeys(polygon)) {
        try {
          const aliasId = createHash("sha256").update(alias).digest("hex");
          const cached = JSON.parse(
            await readFile(
              path.join(this.directory, `${aliasId}.json`),
              "utf8",
            ),
          );
          if (cached.key === alias && isMapPackage(cached))
            return { ...cached, key };
        } catch {
          /* Cache absent ou invalide : préparer la carte. */
        }
      }
    }
    const target = playAreaGeometry(polygon);
    const assembly = createMapFeatureAssembly();
    const coverage = await this.bank.planPolygon(target, (pack) =>
      assembly.add(pack),
    );
    const missing = simpleQueryRegions(coverage.missing);
    if (missing.length > 16)
      throw new Error(
        "Couverture cartographique trop fragmentée : réduisez la zone (16 portions manquantes maximum).",
      );
    if (!missing.length && coverage.sources.length === 1)
      return {
        ...convertOsmMap(
          { elements: [] },
          { polygon, bounds, now: coverage.sources[0].createdAt ?? this.now() },
        ),
        coveragePolygons: target,
        features: assembly.values(),
      };
    const signal = AbortSignal.timeout(this.preparationTimeoutMs);
    if (missing.length) {
      signal.throwIfAborted();
      const regionBounds = geometryBounds(missing);
      const part = await this.extractRegions(
        polygon,
        regionBounds,
        signal,
        missing,
      );
      part.coveragePolygons = coverage.missing;
      if (this.directory && coverage.sources.length) {
        const partId = createHash("sha256")
          .update(JSON.stringify([key, regionBounds, part.coveragePolygons]))
          .digest("hex");
        const partFile = path.join(this.directory, `portion-${partId}.json`);
        await mkdir(this.directory, { recursive: true });
        await writeFile(partFile + ".tmp", JSON.stringify(part));
        await rename(partFile + ".tmp", partFile);
      }
      assembly.add(part);
    }
    const result = {
      ...convertOsmMap({ elements: [] }, { polygon, bounds, now: this.now() }),
      coveragePolygons: target,
      features: assembly.values(),
    };
    if (file) {
      await mkdir(this.directory, { recursive: true });
      await writeFile(file + ".tmp", JSON.stringify(result));
      await rename(file + ".tmp", file);
    }
    return result;
  }
  async extractRegions(polygon, bounds, signal, regions) {
    const query = buildOverpassMapQuery(regions, this.requestTimeoutMs);
    const endpoints = [
      ...new Set([this.endpoint, this.fallbackEndpoint].filter(Boolean)),
    ];
    const index = this.endpointIndex % endpoints.length;
    signal.throwIfAborted();
    try {
      const data = await this.extract(endpoints[index], query, signal);
      signal.throwIfAborted();
      return convertOsmMap(data, { polygon, bounds, now: this.now() });
    } catch (error) {
      if (error.providerCode)
        error.provider = index === 0 ? "principal" : "secours";
      this.endpointIndex = (index + 1) % endpoints.length;
      throw error;
    }
  }
  async extract(endpoint, query, signal) {
    this.policy.check();
    try {
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        headers: { "User-Agent": "RPG-GPS/1.0 (play-area map preparation)" },
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(this.requestTimeoutMs),
        ]),
      });
      if (!response.ok)
        throw Object.assign(
          new Error(
            `Le fournisseur OSM a refusé la demande (HTTP ${response.status}). Les données déjà en banque restent disponibles ; les surfaces manquantes ne sont pas téléchargées.`,
          ),
          {
            retryable: false,
            providerStatus: response.status,
            retryAfterMs: retryAfterMilliseconds(
              response.headers.get("Retry-After"),
              this.now(),
            ),
          },
        );
      // Borner la réponse avant JSON.parse, même si le fournisseur ignore maxsize.
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32 * 1024 * 1024) {
          await reader.cancel();
          throw new Error("Carte trop détaillée : réduisez la zone.");
        }
        chunks.push(value);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (data.remark) {
        const timeout = /timed out|timeout/i.test(data.remark);
        throw Object.assign(
          new Error(
            timeout
              ? "L’extraction OSM a expiré. Réessayez ou réduisez la zone."
              : "Extraction OSM incomplète : réduisez la zone.",
          ),
          {
            retryable: false,
            providerCode: timeout
              ? "map_provider_timeout"
              : "map_provider_incomplete",
          },
        );
      }
      this.policy.succeeded();
      return data;
    } catch (error) {
      error.providerCode ??= error.providerStatus
        ? "map_provider_http_error"
        : ["TimeoutError", "AbortError"].includes(error.name)
          ? "map_provider_timeout"
          : error.message === "fetch failed"
            ? "map_provider_unreachable"
            : "map_provider_invalid_response";
      if (error instanceof SyntaxError)
        error.message =
          "Réponse du fournisseur OSM illisible. Les données déjà en banque restent disponibles.";
      this.policy.failed(error);
      throw error;
    }
  }
}
