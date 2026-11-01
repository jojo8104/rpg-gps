import clipping from "polygon-clipping";

export function rectangleGeometry([s, w, n, e]) {
  return [
    [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  ];
}
export function playAreaGeometry(polygon) {
  const ring = polygon.map(({ latitude, longitude }) => [longitude, latitude]);
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
    ring.push([...ring[0]]);
  return [[ring]];
}
export function geometryBounds(geometry) {
  const points = geometry.flat(2);
  return [
    Math.min(...points.map((p) => p[1])),
    Math.min(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
  ];
}
export function geometryArea(geometry) {
  return geometry.reduce(
    (total, polygon) =>
      total +
      polygon.reduce((sum, ring, index) => {
        let twice = 0;
        for (let i = 0; i < ring.length - 1; i++)
          twice +=
            (ring[i][0] - ring[0][0]) * (ring[i + 1][1] - ring[0][1]) -
            (ring[i + 1][0] - ring[0][0]) * (ring[i][1] - ring[0][1]);
        return sum + ((index ? -1 : 1) * Math.abs(twice)) / 2;
      }, 0),
    0,
  );
}
export const packCoverage = (entry) =>
  entry.coveragePolygons ?? rectangleGeometry(entry.bounds);

/** Différence polygonale réelle, y compris concavités, trous et couvertures anciennes rectangulaires. */
export function planPolygonCoverage(target, entries) {
  let missing = target;
  const sources = [];
  for (const entry of [...entries].sort((a, b) => a.bytes - b.bytes)) {
    if (!missing.length) break;
    if (!clipping.intersection(missing, packCoverage(entry)).length) continue;
    sources.push(entry);
    missing = clipping.difference(missing, packCoverage(entry));
  }
  return { sources, missing };
}

/** Overpass accepte des contours simples. Découper les trous sans redemander leur intérieur. */
export function simpleQueryRegions(geometry) {
  const regions = [];
  for (const polygon of geometry) {
    if (polygon.length === 1) {
      regions.push(polygon);
      continue;
    }
    const bounds = geometryBounds([polygon]);
    const cuts = [
      ...new Set([
        bounds[1],
        bounds[3],
        ...polygon
          .slice(1)
          .flat()
          .map((p) => p[0]),
      ]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const pieces = clipping.intersection(
        [polygon],
        rectangleGeometry([bounds[0], cuts[i], bounds[2], cuts[i + 1]]),
      );
      for (const piece of pieces) {
        if (piece.length !== 1)
          throw new Error(
            "Couverture cartographique trop complexe : réduisez la zone.",
          );
        regions.push(piece);
      }
    }
  }
  return regions;
}
