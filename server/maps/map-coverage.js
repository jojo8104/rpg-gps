export function intersection(a, b) {
  const bounds = [
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.min(a[2], b[2]),
    Math.min(a[3], b[3]),
  ];
  return bounds[0] < bounds[2] && bounds[1] < bounds[3] ? bounds : null;
}

/** Différence exacte de deux rectangles WGS84, sans agrandir les trous. */
export function subtractRectangle(bounds, covered) {
  const overlap = intersection(bounds, covered);
  if (!overlap) return [bounds];
  const [south, west, north, east] = bounds;
  const [s, w, n, e] = overlap;
  return [
    [south, west, s, east],
    [n, west, north, east],
    [s, west, n, w],
    [s, e, n, east],
  ].filter((rect) => rect[0] < rect[2] && rect[1] < rect[3]);
}
const area = (bounds) =>
  bounds ? (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]) : 0;

/** Ne retient une source que si elle apporte de la surface encore manquante. */
export function planMapCoverage(bounds, entries) {
  let missing = [bounds];
  const sources = [];
  const candidates = entries
    .filter((entry) => intersection(bounds, entry.bounds))
    .sort(
      (a, b) =>
        area(intersection(bounds, b.bounds)) -
          area(intersection(bounds, a.bounds)) || a.bytes - b.bytes,
    );
  for (const entry of candidates) {
    if (!missing.some((rect) => intersection(rect, entry.bounds))) continue;
    sources.push(entry);
    missing = missing.flatMap((rect) => subtractRectangle(rect, entry.bounds));
    if (!missing.length) break;
  }
  return { sources, missing };
}

/** Déduplication des géométries complètes OSM ; ne modifie pas les anneaux ni les îlots. */
export function createMapFeatureAssembly() {
  const features = new Map();
  let bytes = 0;
  return {
    add(pack) {
      for (const feature of pack.features) {
        if (features.has(feature.id)) continue;
        bytes += Buffer.byteLength(JSON.stringify(feature));
        if (bytes > 32 * 1024 * 1024)
          throw new Error("Carte trop détaillée : réduisez la zone.");
        features.set(feature.id, feature);
      }
    },
    values: () => [...features.values()],
  };
}
