import { coordinates } from "./map-geometry.js";
import {
  fogMaskGeometry,
  fogOverlayMarkup,
  boundsForPoints,
} from "../app/js/map/FogRenderer.js";
import { territoryColor } from "../app/js/map/TerritoryRenderer.js";
function ring(center, radius, simulation) {
  const y = simulation ? radius : radius / 111320,
    x = simulation
      ? radius
      : y / Math.max(0.01, Math.cos((center.latitude * Math.PI) / 180));
  return Array.from({ length: 65 }, (_, i) => [
    center.latitude + Math.sin((i * Math.PI) / 32) * y,
    center.longitude + Math.cos((i * Math.PI) / 32) * x,
  ]);
}
/** Dessine seulement les perceptions et frontières transmises par le serveur. */
export function renderObservationLayers({
  map,
  layers,
  party,
  history,
  percent,
  playerId,
  vision,
  fog,
  borders,
}) {
  if (borders) {
    const teams = new Map();
    for (const edge of party.territory?.edges ?? []) {
      if (!teams.has(edge.teamId)) teams.set(edge.teamId, []);
      teams.get(edge.teamId).push(edge.points.map(coordinates));
    }
    for (const [team, lines] of teams) {
      const label = document.createElement("span");
      label.textContent =
        party.teams?.find((entry) => entry.id === team)?.name ?? team;
      L.polyline(lines, {
        color: territoryColor(team),
        weight: 3,
        opacity: 0.85,
      })
        .bindTooltip(label)
        .addTo(layers);
    }
  }
  const perception = party.perception?.players?.[playerId];
  if (!perception) return;
  const index = Math.max(
      0,
      Math.ceil((history.length * Number(percent)) / 100) - 1,
    ),
    sample = history[index];
  const historicalHero = sample?.heroes?.find((h) => h.playerId === playerId);
  const center =
    Number(percent) < 100 ? historicalHero?.position : perception.position;
  if (!center) return;
  const simulation =
    (party.coordinateMode ?? party.configuration.positionMode) === "simulation";
  const radius =
    (historicalHero?.visionRadius ?? perception.visionRadius) *
    (simulation ? 32 / 150 : 1);
  const area = party.playArea?.polygon ?? [],
    revealedZones = Number(percent) === 100 ? perception.revealedZones : [];
  if (fog && area.length > 2) {
    const at = Number(percent) === 100 ? Infinity : (sample?.at ?? 0);
    const cells = (party.perception.cells ?? []).map((cell) => ({
      ...cell,
      explored:
        perception.exploredCellTimes[cell.id] != null &&
        perception.exploredCellTimes[cell.id] <= at,
    }));
    const bounds = boundsForPoints(area);
    const mask = fogMaskGeometry({
      cells,
      center,
      radius,
      simulation,
      zoneBounds: bounds,
      playAreaPoints: area,
      revealedZones,
    });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 1024 1024");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.innerHTML = fogOverlayMarkup(mask).replaceAll(
      "assets/effects/fog-cloud.png",
      "/app/assets/effects/fog-cloud.png",
    );
    L.svgOverlay(svg, bounds.map(coordinates), {
      interactive: false,
      opacity: 0.65,
    }).addTo(layers);
  }
  if (vision) {
    L.polygon(ring(center, radius, simulation), {
      color: "#72e2cf",
      weight: 2,
      fillOpacity: 0.06,
      interactive: false,
    }).addTo(layers);
    for (const zone of revealedZones ?? [])
      if (zone.center && zone.radius)
        L.polygon(ring(zone.center, zone.radius, simulation), {
          color: "#b9a0ee",
          weight: 1,
          dashArray: "4 4",
          fillOpacity: 0.04,
          interactive: false,
        }).addTo(layers);
  }
}
