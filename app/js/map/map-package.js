/** Contrat géographique versionné, distinct de l'état du jeu. Coordonnées WGS84. */
export const MAP_PACKAGE_VERSION = 1;

export function mapPackageKey(polygon) {
  return `v${MAP_PACKAGE_VERSION}:${JSON.stringify(polygon.map((point) => [point.latitude, point.longitude]))}`;
}

/** Même contour, quel que soit le premier sommet ou le sens du tracé. Sans arrondi GPS. */
export function equivalentMapPackageKeys(polygon) {
  const points = polygon.map(({ latitude, longitude }) => ({
    latitude,
    longitude,
  }));
  if (
    points.length > 1 &&
    mapPackageKey([points[0]]) === mapPackageKey([points.at(-1)])
  )
    points.pop();
  const keys = new Set();
  for (const ring of [points, [...points].reverse()]) {
    for (let i = 0; i < ring.length; i++) {
      const rotated = [...ring.slice(i), ...ring.slice(0, i)];
      keys.add(mapPackageKey(rotated));
      keys.add(mapPackageKey([...rotated, rotated[0]]));
    }
  }
  return [...keys];
}

export function isMapPackage(value) {
  const point = (p) =>
    Array.isArray(p) &&
    p.length === 2 &&
    Number.isFinite(p[0]) &&
    Math.abs(p[0]) <= 180 &&
    Number.isFinite(p[1]) &&
    Math.abs(p[1]) <= 90;
  const line = (points) =>
    Array.isArray(points) && points.length >= 2 && points.every(point);
  return (
    value?.version === MAP_PACKAGE_VERSION &&
    typeof value.key === "string" &&
    Array.isArray(value.bounds) &&
    value.bounds.length === 4 &&
    value.bounds.every(Number.isFinite) &&
    (value.coveragePolygons === undefined ||
      (Array.isArray(value.coveragePolygons) &&
        value.coveragePolygons.length > 0 &&
        value.coveragePolygons.every(
          (polygon) =>
            Array.isArray(polygon) &&
            polygon.length > 0 &&
            polygon.every(
              (ring) =>
                line(ring) &&
                ring.length >= 4 &&
                JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1)),
            ),
        ))) &&
    value.bounds[0] < value.bounds[2] &&
    value.bounds[1] < value.bounds[3] &&
    Math.abs(value.bounds[0]) <= 90 &&
    Math.abs(value.bounds[2]) <= 90 &&
    Math.abs(value.bounds[1]) <= 180 &&
    Math.abs(value.bounds[3]) <= 180 &&
    Array.isArray(value.features) &&
    value.features.every(
      (feature) =>
        ["road", "waterway", "water", "forest", "grass", "building"].includes(
          feature?.kind,
        ) &&
        (feature.geometry?.type === "LineString"
          ? line(feature.geometry.coordinates)
          : feature.geometry?.type === "Polygon" &&
            Array.isArray(feature.geometry.coordinates) &&
            feature.geometry.coordinates.length > 0 &&
            feature.geometry.coordinates.every(
              (ring) =>
                line(ring) &&
                ring.length >= 4 &&
                JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1)),
            )),
    )
  );
}
