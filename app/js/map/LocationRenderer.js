import { MapLayers } from "./MapLayers.js";

const SYMBOLS = Object.freeze({
  fort: shieldSvg(),
  village: houseSvg(),
  mine: mineSvg(),
  camp: campSvg(),
  quest: questSvg(),
});

export class LocationRenderer {
  constructor({ map, onSelect }) { this.map = map; this.onSelect = onSelect; this.layers = new Map(); }

  render(location) {
    const presentation = locationPresentation(location);
    const icon = L.divIcon({
      className: "rpg-marker-host",
      html: `<div class="rpg-location" data-type="${presentation.type}" data-owner="${presentation.owner}" data-status="${presentation.status}">${SYMBOLS[presentation.type] ?? SYMBOLS.quest}<span class="rpg-location__badge" aria-hidden="true">${presentation.badge}</span><span class="rpg-location__label">${escapeHtml(presentation.label)}</span></div>`,
      iconSize: [48, 58], iconAnchor: [24, 29],
    });
    let marker = this.layers.get(location.id);
    if (!marker) {
      marker = L.marker(asLatLng(location.position), { pane: MapLayers.LOCATIONS, icon, bubblingMouseEvents: false, keyboard: true, title: presentation.label }).addTo(this.map);
      marker.on("click", (event) => { if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent); this.onSelect(location.id); });
      this.layers.set(location.id, marker);
    } else marker.setLatLng(asLatLng(location.position)).setIcon(icon);
  }

  removeMissing(ids) { for (const [id, layer] of this.layers) if (!ids.has(id)) { layer.remove(); this.layers.delete(id); } }
}

export function locationPresentation(location) {
  const unknown = String(location.state).toLowerCase() === "unknown";
  const enemy = location.owner === "enemy";
  return {
    type: SYMBOLS[location.type] ? location.type : "quest",
    owner: enemy ? "enemy" : (location.owner ?? "neutral"),
    status: unknown ? "unknown" : location.nearby ? "active" : "discovered",
    label: unknown ? "Lieu inconnu" : location.name,
    badge: location.type === "quest" || location.objective ? "!" : enemy ? "⚔" : "",
  };
}

function asLatLng(value) { return Array.isArray(value) ? value : [value.latitude, value.longitude]; }
function escapeHtml(value) { const node = document.createElement("span"); node.textContent = value; return node.innerHTML; }
function svg(body) { return `<svg viewBox="0 0 48 48" aria-hidden="true"><path class="rpg-icon__back" d="M24 2 44 13v22L24 46 4 35V13Z"/><g class="rpg-icon__shape">${body}</g></svg>`; }
function shieldSvg() { return svg('<path d="M15 14h18v10c0 8-5 12-9 14-4-2-9-6-9-14Z"/><path d="M20 18h8M24 14v18"/>'); }
function houseSvg() { return svg('<path d="m13 24 11-10 11 10v12H13Z"/><path d="M20 36V26h8v10"/>'); }
function mineSvg() { return svg('<path d="M12 35h24L31 18H17Z"/><path d="M18 18h12M24 13v5M17 29h14"/>'); }
function campSvg() { return svg('<path d="m12 36 12-23 12 23ZM16 36l8-12 8 12"/><path d="m14 14 20 20M34 14 14 34"/>'); }
function questSvg() { return svg('<path d="M18 18c1-7 13-7 13 1 0 6-7 5-7 11M24 36h.01"/>'); }
