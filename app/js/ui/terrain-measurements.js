import { distanceMeters } from "../core/geo.js";

/** Indications de dessin uniquement ; aucune validation de placement. */
export function measureTerrainOutline(points) {
  if (points.length < 3) return null;
  const south = Math.min(...points.map((p) => p.latitude));
  const north = Math.max(...points.map((p) => p.latitude));
  const west = Math.min(...points.map((p) => p.longitude));
  const east = Math.max(...points.map((p) => p.longitude));
  const latitude = (south + north) / 2;
  const longitude = (west + east) / 2;
  return {
    perimeter: points.reduce(
      (sum, point, index) =>
        sum + distanceMeters(point, points[(index + 1) % points.length]),
      0,
    ),
    width: distanceMeters(
      { latitude, longitude: west },
      { latitude, longitude: east },
    ),
    height: distanceMeters(
      { latitude: south, longitude },
      { latitude: north, longitude },
    ),
  };
}

export function formatTerrainOutline(points) {
  const measures = measureTerrainOutline(points);
  if (!measures) return "";
  const meters = (value) => Math.round(value).toLocaleString("fr-FR");
  return `Périmètre ≈ ${meters(measures.perimeter)} m · rectangle englobant ≈ ${meters(measures.width)} × ${meters(measures.height)} m (est–ouest × nord–sud)`;
}
