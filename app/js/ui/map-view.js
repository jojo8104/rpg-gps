import { MapRenderer } from "../map/MapRenderer.js";
import { MapLayers, createMapPanes } from "../map/MapLayers.js";

const SIMULATION_BOUNDS = [[0, 0], [100, 100]];

export class MapView {
  constructor({ element, mode = "simulation", initialPosition = null, onHeroMove, onLocationSelect, onDynamicSiteSelect = () => {}, onMapClick = () => {} }) {
    this.mode = mode;
    this.onHeroMove = onHeroMove;
    this.onLocationSelect = onLocationSelect;
    this.onDynamicSiteSelect = onDynamicSiteSelect;
    this.onMapClick = onMapClick;
    const real = mode === "gps";
    this.map = L.map(element, real ? { zoomControl: true } : { crs: L.CRS.Simple, zoomControl: false, attributionControl: false, minZoom: -1, maxZoom: 2 });
    createMapPanes(this.map);
    if (real) {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { pane: MapLayers.BASE_MAP, maxZoom: 20, attribution: "© OpenStreetMap" }).addTo(this.map);
      this.map.setView(initialPosition ? asLatLng(initialPosition) : [48.8566, 2.3522], 17);
    } else {
      this.map.fitBounds(SIMULATION_BOUNDS);
      L.rectangle(SIMULATION_BOUNDS, { pane: MapLayers.BASE_MAP, className: "rpg-simulation-base", weight: 1, fillOpacity: 1 }).addTo(this.map);
    }
    this.map.on("click", ({ latlng }) => this.onMapClick(toPosition(latlng)));
    this.renderer = new MapRenderer({ map: this.map, mode, onHeroMove, onLocationSelect });
    const legend = L.control({ position: "bottomleft" });
    legend.onAdd = () => { const element = L.DomUtil.create("div", "range-legend"); element.innerHTML = '<span class="is-detection">Détection</span><span class="is-interaction">Interaction</span>'; return element; };
    legend.addTo(this.map);
    this.dynamicSites = new Map();
    this.playArea = null;
    this.draftArea = null;
    this.heatmap = L.layerGroup().addTo(this.map);
  }

  render({ heroPosition, heroHeading = null, accuracy = null, locations = [], playAreaPoints = [], dynamicSites = [], gridCells = [], heatmapVisible = true }) {
    this.renderer.render({ heroPosition, heroHeading, accuracy, locations });
    this.#area(playAreaPoints);
    dynamicSites.forEach((site) => this.#site(site));
    this.#removeMissing(this.dynamicSites, new Set(dynamicSites.map((item) => item.id)));
    this.#heatmap(gridCells, heatmapVisible);
  }

  setPlayArea(points) {
    if (this.playArea) this.playArea.remove();
    this.playArea = points.length >= 3 ? L.polygon(points.map(asLatLng), { color: "#78e08f", fillOpacity: .12 }).addTo(this.map) : null;
  }

  focus(position, zoom = this.mode === "gps" ? 18 : .5) { this.map.flyTo(asLatLng(position), zoom, { duration: .35 }); }
  setHeroHeading(heading) { this.renderer.setHeroHeading(heading); }

  #area(points) {
    if (this.draftArea) this.draftArea.remove();
    this.draftArea = points.length ? L.polyline(points.map(asLatLng), { color: "#f6d971", dashArray: "6 6" }).addTo(this.map) : null;
  }

  #site(site) {
    const marker = this.dynamicSites.get(site.id);
    const icon = L.divIcon({ className: `dynamic-marker is-${site.kind}`, html: site.kind === "loot" ? "💰" : "⚔", iconSize: [38, 38], iconAnchor: [19, 19] });
    if (!marker) {
      const created = L.marker(asLatLng(site.position), { icon, bubblingMouseEvents: false }).addTo(this.map).bindTooltip(site.kind === "loot" ? "Butin" : "Champ de bataille");
      created.on("click", (event) => { if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent); this.onDynamicSiteSelect(site.id); });
      this.dynamicSites.set(site.id, created);
    }
    else marker.setLatLng(asLatLng(site.position)).setIcon(icon);
  }

  #heatmap(cells, visible) {
    this.heatmap.clearLayers();
    if (!visible || cells.length === 0) return;
    const maximum = Math.max(1, ...cells.map((cell) => cell.activity));
    cells.forEach((cell) => {
      const intensity = cell.activity / maximum;
      const color = intensity === 0 ? "#5b7560" : intensity < .34 ? "#59b9ff" : intensity < .67 ? "#f6d971" : "#ff635e";
      L.rectangle(cell.bounds.map(asLatLng), { color, weight: 1, opacity: .7, fillColor: color, fillOpacity: intensity === 0 ? .035 : .15 + intensity * .45, interactive: false }).addTo(this.heatmap);
      if (cell.visits > 0) L.marker(asLatLng(cell.center), { interactive: false, icon: L.divIcon({ className: "heatmap-count", html: String(cell.visits), iconSize: [22, 18], iconAnchor: [11, 9] }) }).addTo(this.heatmap);
    });
  }

  #removeMissing(collection, ids) { for (const [id, layer] of collection) if (!ids.has(id)) { layer.remove(); collection.delete(id); } }
}

function asLatLng(position) { return Array.isArray(position) ? position : [position.latitude, position.longitude]; }
function toPosition(point) { return { latitude: point.lat, longitude: point.lng }; }
