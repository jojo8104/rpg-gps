import { MapLayers } from "./MapLayers.js";

export const FOG_VISION_RADIUS = Object.freeze({ simulation: 32, gps: 150 });

export class FogRenderer {
  constructor(map) {
    this.map = map;
    this.layers = L.layerGroup().addTo(map);
  }

  render({ heroPosition, gridCells = [], enabled = true }) {
    this.layers.clearLayers();
    if (!enabled) return;
    const center = Array.isArray(heroPosition)
      ? heroPosition
      : [heroPosition.latitude, heroPosition.longitude];
    const simulation = this.map.options.crs === L.CRS.Simple;
    const radius = simulation
      ? FOG_VISION_RADIUS.simulation
      : FOG_VISION_RADIUS.gps;
    const outer = simulation
      ? [
          [-1000, -1000],
          [-1000, 1000],
          [1000, 1000],
          [1000, -1000],
        ]
      : [
          [-89.9, -179.9],
          [-89.9, 179.9],
          [89.9, 179.9],
          [89.9, -179.9],
        ];

    L.polygon([outer, visionRing(center, radius, simulation)], {
      pane: MapLayers.EXPLORATION,
      className: "rpg-fog rpg-fog--out-of-sight",
      stroke: false,
      fillRule: "evenodd",
      interactive: false,
    }).addTo(this.layers);

    gridCells
      .filter(
        (cell) =>
          cell.visits === 0 &&
          !isInsideVision(cell.center, center, radius, simulation),
      )
      .forEach((cell) =>
        L.rectangle(cell.bounds.map(asLatLng), {
          pane: MapLayers.EXPLORATION,
          className: "rpg-fog rpg-fog--undiscovered",
          stroke: false,
          interactive: false,
        }).addTo(this.layers),
      );

    L.circle(center, {
      pane: MapLayers.EXPLORATION,
      radius,
      className: "rpg-exploration-edge",
      fill: false,
      interactive: false,
    }).addTo(this.layers);
  }
}

export function isInsideVision(position, center, radius, simulation = false) {
  const point = Array.isArray(position)
    ? position
    : [position.latitude, position.longitude];
  if (simulation)
    return Math.hypot(point[0] - center[0], point[1] - center[1]) <= radius;
  const latitudeMeters = (point[0] - center[0]) * 111_320;
  const longitudeMeters =
    (point[1] - center[1]) * 111_320 * Math.cos((center[0] * Math.PI) / 180);
  return Math.hypot(latitudeMeters, longitudeMeters) <= radius;
}

function visionRing(center, radius, simulation) {
  return Array.from({ length: 48 }, (_, index) => {
    const angle = (index / 48) * Math.PI * 2;
    if (simulation)
      return [
        center[0] + Math.sin(angle) * radius,
        center[1] + Math.cos(angle) * radius,
      ];
    const latitude = center[0] + (Math.sin(angle) * radius) / 111_320;
    const longitude =
      center[1] +
      (Math.cos(angle) * radius) /
        (111_320 * Math.max(0.01, Math.cos((center[0] * Math.PI) / 180)));
    return [latitude, longitude];
  });
}

function asLatLng(position) {
  return [position.latitude, position.longitude];
}
