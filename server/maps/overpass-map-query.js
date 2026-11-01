import { geometryBounds } from "./polygon-coverage.js";

/** Une union de toutes les surfaces absentes, dans un unique POST Overpass. */
export function buildOverpassMapQuery(regions, requestTimeoutMs) {
  if (!regions.length || regions.length > 16)
    throw new RangeError(
      "Choisissez une zone demandant de 1 à 16 portions manquantes.",
    );
  const selectors = [
    ["way", "[highway]"],
    ["way", "[building]"],
    ["relation", "[building]"],
    ["way", "[waterway]"],
    ["relation", "[waterway=riverbank]"],
    ...[
      '[natural~"^(water|wood|grassland)$"]',
      '[landuse~"^(forest|grass|meadow|reservoir|recreation_ground|village_green)$"]',
      "[leisure=park]",
    ].flatMap((selector) => [
      ["way", selector],
      ["relation", selector],
    ]),
  ];
  const clauses = regions.flatMap((region) => {
    const bounds = geometryBounds([region]);
    const polygon = region[0]
      .slice(0, -1)
      .map(([lng, lat]) => `${lat} ${lng}`)
      .join(" ");
    const filter = `(${bounds.join(",")})(poly:"${polygon}")`;
    return selectors.map(([type, selector]) => `${type}${selector}${filter};`);
  });
  const timeout = Math.max(1, Math.floor(requestTimeoutMs / 1000) - 5);
  const query = `[out:json][timeout:${timeout}][maxsize:33554432];(${clauses.join("")});out geom;`;
  if (Buffer.byteLength(query) > 128 * 1024)
    throw new RangeError(
      "Contour cartographique trop complexe : réduisez la zone (requête limitée à 128 Kio).",
    );
  return query;
}
