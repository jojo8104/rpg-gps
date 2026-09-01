import { MapLayers } from "./MapLayers.js";

export const FOG_VISION_RADIUS = Object.freeze({ simulation: 32, gps: 150 });
export const FOG_CLOUD_ASSET = "assets/effects/fog-cloud.png";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const OVERLAY_SIZE = 1024;

export class FogRenderer {
  constructor(map) {
    this.map = map;
    this.layer = null;
    this.outsideLayer = null;
  }

  render({ heroPosition, gridCells = [], enabled = true, visionRadius = null }) {
    this.layer?.remove();
    this.outsideLayer?.remove();
    this.layer = null;
    this.outsideLayer = null;
    if (!enabled || gridCells.length === 0) return;

    const simulation = this.map.options.crs === L.CRS.Simple;
    const center = Array.isArray(heroPosition)
      ? { latitude: heroPosition[0], longitude: heroPosition[1] }
      : heroPosition;
    const gpsRadius =
      Number.isFinite(visionRadius) && visionRadius > 0
        ? visionRadius
        : FOG_VISION_RADIUS.gps;
    const radius = simulation
      ? gpsRadius * (FOG_VISION_RADIUS.simulation / FOG_VISION_RADIUS.gps)
      : gpsRadius;
    const zoneBounds = boundsForCells(gridCells);
    this.outsideLayer = L.polygon(
      [outsideBounds(simulation), zoneRing(zoneBounds)],
      {
        pane: MapLayers.EXPLORATION,
        className: "rpg-fog-outside",
        stroke: false,
        fillRule: "evenodd",
        interactive: false,
      },
    ).addTo(this.map);
    const mask = fogMaskGeometry({
      cells: gridCells,
      center,
      radius,
      simulation,
      zoneBounds,
    });
    const svg = document.createElementNS(SVG_NAMESPACE, "svg");
    svg.setAttribute("viewBox", `0 0 ${OVERLAY_SIZE} ${OVERLAY_SIZE}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = fogOverlayMarkup(mask);
    this.layer = L.svgOverlay(svg, zoneBounds.map(asLatLng), {
      pane: MapLayers.EXPLORATION,
      className: "rpg-fog-overlay",
      interactive: false,
    }).addTo(this.map);
  }
}

export function boundsForCells(cells) {
  return [
    {
      latitude: Math.min(...cells.map((cell) => cell.bounds[0].latitude)),
      longitude: Math.min(...cells.map((cell) => cell.bounds[0].longitude)),
    },
    {
      latitude: Math.max(...cells.map((cell) => cell.bounds[1].latitude)),
      longitude: Math.max(...cells.map((cell) => cell.bounds[1].longitude)),
    },
  ];
}

export function fogMaskGeometry({ cells, center, radius, simulation = false, zoneBounds = boundsForCells(cells) }) {
  const [southWest, northEast] = zoneBounds;
  const width = northEast.longitude - southWest.longitude;
  const height = northEast.latitude - southWest.latitude;
  const project = (position) => ({
    x: ((position.longitude - southWest.longitude) / width) * OVERLAY_SIZE,
    y: ((northEast.latitude - position.latitude) / height) * OVERLAY_SIZE,
  });
  const discoveredPath = cells
    .filter((cell) => cell.visits > 0)
    .map((cell) => {
      const topLeft = project({ latitude: cell.bounds[1].latitude, longitude: cell.bounds[0].longitude });
      const bottomRight = project({ latitude: cell.bounds[0].latitude, longitude: cell.bounds[1].longitude });
      return rectanglePath(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    })
    .join(" ");
  const projectedCenter = project(center);
  const latitudeRadius = simulation ? radius : radius / 111_320;
  const longitudeRadius = simulation
    ? radius
    : radius / (111_320 * Math.max(0.01, Math.cos((center.latitude * Math.PI) / 180)));
  return {
    discoveredPath,
    vision: {
      cx: projectedCenter.x,
      cy: projectedCenter.y,
      rx: (longitudeRadius / width) * OVERLAY_SIZE,
      ry: (latitudeRadius / height) * OVERLAY_SIZE,
    },
  };
}

export function fogOverlayMarkup({ discoveredPath, vision }) {
  return `<defs>
    <pattern id="rpg-fog-texture" width="320" height="320" patternUnits="userSpaceOnUse" patternTransform="rotate(-4)">
      <image href="${FOG_CLOUD_ASSET}" x="-26" y="-26" width="372" height="372" preserveAspectRatio="xMidYMid slice"/>
    </pattern>
    <mask id="rpg-fog-mask">
      <rect width="${OVERLAY_SIZE}" height="${OVERLAY_SIZE}" fill="white"/>
      ${discoveredPath ? `<path d="${discoveredPath}" fill="black"/>` : ""}
      <ellipse cx="${number(vision.cx)}" cy="${number(vision.cy)}" rx="${number(vision.rx)}" ry="${number(vision.ry)}" fill="black"/>
    </mask>
  </defs>
  <rect width="${OVERLAY_SIZE}" height="${OVERLAY_SIZE}" fill="#c7ced0" mask="url(#rpg-fog-mask)"/>
  <rect width="${OVERLAY_SIZE}" height="${OVERLAY_SIZE}" fill="url(#rpg-fog-texture)" mask="url(#rpg-fog-mask)"/>`;
}

export function isInsideVision(position, center, radius, simulation = false) {
  const point = Array.isArray(position) ? position : [position.latitude, position.longitude];
  if (simulation) return Math.hypot(point[0] - center[0], point[1] - center[1]) <= radius;
  const latitudeMeters = (point[0] - center[0]) * 111_320;
  const longitudeMeters = (point[1] - center[1]) * 111_320 * Math.cos((center[0] * Math.PI) / 180);
  return Math.hypot(latitudeMeters, longitudeMeters) <= radius;
}

function rectanglePath(x, y, width, height) {
  return `M${number(x)} ${number(y)}h${number(width)}v${number(height)}h-${number(width)}Z`;
}

function number(value) {
  return Number(value.toFixed(3));
}

function asLatLng(position) {
  return [position.latitude, position.longitude];
}

function zoneRing([southWest, northEast]) {
  return [
    [southWest.latitude, southWest.longitude],
    [southWest.latitude, northEast.longitude],
    [northEast.latitude, northEast.longitude],
    [northEast.latitude, southWest.longitude],
  ];
}

function outsideBounds(simulation) {
  return simulation
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
}
