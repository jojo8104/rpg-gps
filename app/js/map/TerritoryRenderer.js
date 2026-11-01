import { MapLayers } from "./MapLayers.js";
import { territoryOverlayGeometry } from "./territory-border-geometry.js";

const COLORS = ["#53c997", "#e77b66", "#65aee9", "#cda258", "#b98be0"];
export function territoryColor(teamId) {
  let hash = 0;
  for (const character of teamId)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

/** Contours arrondis avec halo intérieur ; aucune règle territoriale locale. */
export class TerritoryRenderer {
  constructor(map) {
    this.map = map;
    this.layer = L.layerGroup().addTo(map);
    this.signature = null;
  }
  render(territory) {
    const edges = territory?.edges ?? [];
    const signature = JSON.stringify(edges);
    if (signature === this.signature) return;
    this.signature = signature;
    this.layer.clearLayers();
    const geometry = territoryOverlayGeometry(
      edges,
      this.map.options?.crs === L.CRS?.Simple,
    );
    if (!geometry) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${geometry.width} ${geometry.height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = territoryOverlayMarkup(geometry);
    L.svgOverlay(svg, geometry.bounds, {
      pane: MapLayers.TERRITORIES,
      interactive: false,
      className: "rpg-territory-overlay",
    }).addTo(this.layer);
  }
}

export function territoryOverlayMarkup(geometry) {
  return geometry.groups
    .map(({ teamId, paths }, index) => {
      const color = territoryColor(teamId);
      const path = paths.join(" ");
      const clip = `territory-interior-${index}`,
        blur = `territory-blur-${index}`;
      return `<defs><clipPath id="${clip}"><path d="${path}" clip-rule="evenodd"/></clipPath>
      <filter id="${blur}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter></defs>
      <g clip-path="url(#${clip})">
        <path d="${path}" fill="none" stroke="${color}" stroke-width="30" opacity="0.32" filter="url(#${blur})"/>
        <path d="${path}" fill="none" stroke="${color}" stroke-width="12" opacity="0.12"/>
      </g>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" style="color:${color}" class="rpg-territory-border"/>
      <path d="${path}" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.55" vector-effect="non-scaling-stroke"/>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="6" opacity="0.65" stroke-dasharray="4 16" stroke-linecap="round" vector-effect="non-scaling-stroke" class="rpg-territory-surveillance"/>`;
    })
    .join("");
}
