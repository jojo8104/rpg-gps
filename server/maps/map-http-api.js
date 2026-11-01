import {
  isMapProviderFailure,
  mapProviderDiagnostic,
  mapErrorPayload,
} from "./map-provider-diagnostic.js";
import { mapBounds } from "./osm-map-service.js";

/** API de géographie ; extraction limitée aux zones enregistrées du jeu. */
export function createMapHttpApi({
  maps,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  isAllowedPolygon = () => false,
  onProviderError = (details) =>
    console.warn("[maps] provider failure", details),
} = {}) {
  const searchCache = new Map();
  let nextSearchAt = 0;
  return async function handle(request, response) {
    const url = new URL(request.url, "http://localhost");
    if (!["/api/maps/prepare", "/api/maps/search"].includes(url.pathname))
      return false;
    const send = (status, value, retryAfter) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      });
      response.end(JSON.stringify(value));
    };
    try {
      if (url.pathname === "/api/maps/prepare") {
        if (request.method !== "POST") {
          send(405, { error: "Utilisez POST." });
          return true;
        }
        let body = "";
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 20000) {
            send(413, { error: "Zone trop volumineuse." });
            return true;
          }
          body += chunk.toString("utf8");
        }
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          throw new TypeError("JSON invalide.");
        }
        mapBounds(payload?.polygon);
        if (!isAllowedPolygon(payload.polygon)) {
          send(403, {
            error:
              "Cette zone doit d’abord être enregistrée dans une partie ou Mes cartes.",
          });
          return true;
        }
        send(200, await maps.prepare(payload.polygon));
      } else {
        if (request.method !== "GET") {
          send(405, { error: "Utilisez GET." });
          return true;
        }
        const query = (url.searchParams.get("q") ?? "").trim();
        if (query.length < 3 || query.length > 200)
          throw new RangeError("Entrez un lieu de 3 à 200 caractères.");
        if (searchCache.has(query)) {
          send(200, searchCache.get(query));
          return true;
        }
        // Limite globale, sans autocomplétion : politique de l'instance publique.
        if (now() < nextSearchAt) {
          send(429, {
            error: "Patientez une seconde avant une nouvelle recherche.",
          });
          return true;
        }
        nextSearchAt = now() + 1100;
        const endpoint = new URL(
          process.env.RPG_GPS_GEOCODER_URL ||
            "https://nominatim.openstreetmap.org/search",
        );
        endpoint.search = new URLSearchParams({
          q: query,
          format: "jsonv2",
          limit: "5",
        }).toString();
        const upstream = await fetchImpl(endpoint, {
          headers: {
            "User-Agent": "RPG-GPS/1.0 (map location search)",
            "Accept-Language": "fr",
          },
          signal: AbortSignal.timeout(10000),
        });
        if (!upstream.ok) throw new Error("Recherche indisponible. Réessayez.");
        const results = (await upstream.json())
          .map((item) => ({
            label: item.display_name,
            latitude: Number(item.lat),
            longitude: Number(item.lon),
          }))
          .filter(
            (item) =>
              Number.isFinite(item.latitude) && Number.isFinite(item.longitude),
          );
        if (searchCache.size >= 100)
          searchCache.delete(searchCache.keys().next().value);
        searchCache.set(query, results);
        send(200, results);
      }
    } catch (error) {
      const operation =
        url.pathname === "/api/maps/prepare" ? "prepare" : "search";
      if (isMapProviderFailure(error))
        onProviderError(mapProviderDiagnostic(error, operation));
      const status =
        error.status ??
        (error instanceof TypeError || error instanceof RangeError ? 400 : 502);
      const networkFailure =
        error.message === "fetch failed" ||
        ["TimeoutError", "AbortError"].includes(error.name);
      send(
        networkFailure ? 502 : status,
        mapErrorPayload(
          error,
          operation === "prepare"
            ? "Extraction de la zone OSM"
            : "Recherche de lieu",
        ),
        error.retryAfter,
      );
    }
    return true;
  };
}
