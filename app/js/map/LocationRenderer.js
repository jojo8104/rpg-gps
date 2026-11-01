import { MapLayers } from "./MapLayers.js";

const MARKER_ART = Object.freeze({
  town: "assets/markers/map/village.png",
  fort: "assets/markers/map/fort.png",
  village: "assets/markers/map/village.png",
  mine: "assets/markers/map/mine.png",
  camp: "assets/markers/map/camp.png",
  capital: "assets/markers/map/capital.png",
  quarry: "assets/markers/map/quarry.png",
  "lumber-camp": "assets/markers/map/lumber-camp.png",
  quest: "assets/markers/map/quest.png",
  clue: "assets/markers/map/footprints.svg",
});

export class LocationRenderer {
  constructor({ map, onSelect, billboards }) {
    this.map = map;
    this.onSelect = onSelect;
    this.billboards = billboards;
    this.layers = new Map();
    this.ranges = new Map();
  }

  render(location) {
    const presentation = locationPresentation(location);
    const radius = location.interactionRadius ?? location.radius;
    const color =
      presentation.owner === "enemy"
        ? "#ed7373"
        : presentation.owner === "ally"
          ? "#68bcec"
          : "#d6b35c";
    if (Number.isFinite(radius) && radius > 0) {
      let range = this.ranges.get(location.id);
      if (!range) {
        range = L.circle(asLatLng(location.position), {
          pane: MapLayers.TERRITORIES,
          radius,
          color,
          fillColor: color,
          fillOpacity: 0.18,
          opacity: 0.55,
          weight: 1,
          interactive: false,
        }).addTo(this.map);
        this.ranges.set(location.id, range);
      } else
        range
          .setLatLng(asLatLng(location.position))
          .setRadius(radius)
          .setStyle({ color, fillColor: color });
    } else {
      this.ranges.get(location.id)?.remove();
      this.ranges.delete(location.id);
    }
    const icon = L.divIcon({
      className: "rpg-marker-host",
      html: `<div class="rpg-location rpg-location-ground" data-type="${presentation.type}" data-owner="${presentation.owner}" data-status="${presentation.status}"><span class="rpg-location__ring" aria-hidden="true"></span><span class="rpg-location__frame"></span></div>`,
      iconSize: [64, 76],
      iconAnchor: [32, 38],
    });
    let marker = this.layers.get(location.id);
    if (!marker) {
      marker = L.marker(asLatLng(location.position), {
        pane: MapLayers.LOCATIONS,
        icon,
        bubblingMouseEvents: false,
        keyboard: true,
        title: presentation.label,
      }).addTo(this.map);
      marker.on("click", (event) => {
        if (event.originalEvent)
          L.DomEvent.stopPropagation(event.originalEvent);
        this.onSelect(location.id);
      });
      this.layers.set(location.id, marker);
    } else marker.setLatLng(asLatLng(location.position)).setIcon(icon);
    this.billboards.set(`location:${location.id}`, {
      marker,
      kind: "location",
      label: presentation.label,
      html: `<span class="rpg-place-illustration" data-status="${presentation.status}"><img src="${escapeHtml(location.visual?.icon ?? MARKER_ART[presentation.art])}" alt="" draggable="false"><span class="rpg-location__badge">${presentation.badge}</span><span class="rpg-location__label">${escapeHtml(presentation.label)}</span></span>`,
      onClick: () => this.onSelect(location.id),
    });
  }

  removeMissing(ids) {
    for (const [id, layer] of this.layers)
      if (!ids.has(id)) {
        layer.remove();
        this.billboards.remove(`location:${id}`);
        this.ranges.get(id)?.remove();
        this.ranges.delete(id);
        this.layers.delete(id);
      }
  }
}

export function locationMarkerSvg(type) {
  const shapes = {
    fort: '<path d="M12 27V12h5v4h6v-4h5v15M9 27h22M16 27v-7h8v7"/>',
    village: '<path d="m8 21 7-7 7 7v8H8ZM20 18l5-5 7 7v9H20M12 29v-5h5v5"/>',
    mine: '<path d="m10 30 7-18M30 30 23 12M14 22h12M8 30h24"/><path d="m12 11 5 3M28 11l-5 3"/>',
    camp: '<path d="m7 29 13-20 13 20ZM20 9v20M14 29l6-9 6 9"/>',
    capital:
      '<path d="M7 31V15h5v-5h5v5h6v-5h5v5h5v16M5 31h30M15 31v-8h10v8"/>',
    quarry: '<path d="M7 30h26M9 30l4-7h7l4-7h8M11 23h9M18 16h14M25 9h7v7"/>',
    "lumber-camp":
      '<path d="m7 29 13-18 13 18ZM20 11v18M11 29h18M12 9l16 18M28 9 12 18"/>',
    quest: '<path d="M14 13c1-5 13-5 13 2 0 5-7 5-7 10M20 31v1"/>',
  };
  return `<svg viewBox="0 0 40 40" focusable="false"><g>${shapes[type] ?? (type === "town" ? shapes.village : shapes.quest)}</g></svg>`;
}

export function locationPresentation(location) {
  const unknown = String(location.state).toLowerCase() === "unknown";
  const enemy = location.owner === "enemy";
  return {
    type: MARKER_ART[location.type] ? location.type : "quest",
    art: location.roles?.includes("clue")
      ? "clue"
      : MARKER_ART[location.type]
        ? location.type
        : "quest",
    owner: enemy ? "enemy" : (location.owner ?? "neutral"),
    status: unknown ? "unknown" : location.nearby ? "active" : "discovered",
    label: unknown ? "Lieu inconnu" : location.name,
    badge:
      location.questMarker === "combat"
        ? "⚔"
        : location.questMarker === "objective"
          ? "●"
          : "",
  };
}

function asLatLng(value) {
  return Array.isArray(value) ? value : [value.latitude, value.longitude];
}
function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}
