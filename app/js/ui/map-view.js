import { MapRenderer } from "../map/MapRenderer.js";
import { MapLayers, createMapPanes } from "../map/MapLayers.js";

const SIMULATION_BOUNDS = [[0, 0], [100, 100]];

export class MapView {
  constructor({ element, mode = "simulation", initialPosition = null, onHeroMove, onLocationSelect, onDynamicSiteSelect = () => {}, onTraceSelect = () => {}, onMapClick = () => {} }) {
    this.mode = mode;
    this.onHeroMove = onHeroMove;
    this.onLocationSelect = onLocationSelect;
    this.onDynamicSiteSelect = onDynamicSiteSelect;
    this.onTraceSelect = onTraceSelect;
    this.onMapClick = onMapClick;
    this.heroHeading = 0;
    this.bearingEnabled = false;
    const real = mode === "gps";
    this.map = L.map(element, real ? { zoomControl: true } : { crs: L.CRS.Simple, zoomControl: false, attributionControl: false, minZoom: -1, maxZoom: 2 });
    createMapPanes(this.map);
    if (real) {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { pane: MapLayers.BASE_MAP, maxZoom: 20, keepBuffer: 6, attribution: "© OpenStreetMap" }).addTo(this.map);
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
    this.questTraces = new Map();
    this.autonomousGroups = new Map();
    this.playArea = null;
    this.draftArea = null;
    this.heatmap = L.layerGroup().addTo(this.map);
  }

  render({ heroPosition, heroHeading = null, accuracy = null, locations = [], autonomousGroups = [], playAreaPoints = [], dynamicSites = [], questTraces = [], gridCells = [], heatmapVisible = true }) {
    this.renderer.render({ heroPosition, heroHeading, accuracy, locations });
    this.#area(playAreaPoints);
    dynamicSites.forEach((site) => this.#site(site));
    this.#removeMissing(this.dynamicSites, new Set(dynamicSites.map((item) => item.id)));
    questTraces.forEach((trace) => this.#trace(trace));
    this.#removeMissing(this.questTraces, new Set(questTraces.map((item) => item.id)));
    autonomousGroups.forEach((group) => this.#autonomousGroup(group));
    this.#removeMissing(this.autonomousGroups, new Set(autonomousGroups.map((item) => item.id)));
    this.#heatmap(gridCells, heatmapVisible);
  }

  #trace(trace) {
    const center = asLatLng(trace.position); const entry = this.questTraces.get(trace.id);
    const footprints = '<svg viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(-24 24 24)"><path d="M14 7c4 0 6 4 6 9s-2 9-6 9-6-4-6-9 2-9 6-9Zm-2 20h5l2 10c1 4-8 6-9 2l2-12Z"/><path d="M34 17c4 0 6 4 6 9s-2 9-6 9-6-4-6-9 2-9 6-9Zm-2 20h5l1 7H30l2-7Z"/></g></svg>';
    const icon = L.divIcon({ className: "quest-trace-marker", html: `<span>${footprints}</span>`, iconSize: [52, 52], iconAnchor: [26, 26] });
    if (!entry) {
      const marker = L.marker(center, { pane: MapLayers.EFFECTS, zIndexOffset: 2400, icon, title: "Trace à examiner" }).addTo(this.map).bindTooltip("Trace à examiner");
      marker.on("click", (event) => { if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent); this.onTraceSelect(trace.id); });
      this.questTraces.set(trace.id, { marker });
    } else entry.marker.setLatLng(center).setIcon(icon);
  }

  #autonomousGroup(group) {
    const center = asLatLng(group.position); const entry = this.autonomousGroups.get(group.id);
    const symbol = group.type === "army" || group.type === "rogue" ? "⚔" : group.type === "convoy" ? "▣" : group.type === "messenger" ? "➤" : "⌖";
    const icon = L.divIcon({ className: `autonomous-group-marker is-${group.type} is-${group.factionId ?? "independent"}`, html: `<span>${symbol}</span><small>${group.soldiers || ""}</small>`, iconSize: [46, 46], iconAnchor: [23, 23] });
    const label = `${group.type === "army" ? "Armée" : "Groupe"} ${group.factionId === "chaos" ? "du Chaos" : "autonome"}`;
    if (!entry) {
      const marker = L.marker(center, { pane: MapLayers.UNITS, zIndexOffset: 900, icon, title: label, interactive: true }).addTo(this.map).bindTooltip(`${label} · ${group.soldiers} soldats`);
      this.autonomousGroups.set(group.id, { marker });
    } else entry.marker.setLatLng(center).setIcon(icon).setTooltipContent(`${label} · ${group.soldiers} soldats`);
  }

  setPlayArea(points) {
    if (this.playArea) this.playArea.remove();
    this.playArea = points.length >= 3 ? L.polygon(points.map(asLatLng), { color: "#78e08f", fillOpacity: .12 }).addTo(this.map) : null;
  }

  focus(position, zoom = this.mode === "gps" ? 18 : .5) { this.map.flyTo(asLatLng(position), zoom, { duration: .35 }); }
  follow(position) { this.map.panTo(asLatLng(position), { animate: false }); }
  setHeroHeading(heading) { this.heroHeading = Number.isFinite(heading) ? heading : 0; this.renderer.setHeroHeading(this.heroHeading); this.#applyBearing(); }

  setBearingEnabled(enabled) { this.bearingEnabled = this.mode === "gps" && enabled === true; this.#applyBearing(); return this.bearingEnabled; }
  toggleBearing() { return this.setBearingEnabled(!this.bearingEnabled); }

  #applyBearing() {
    const container = this.map.getContainer(); const size = this.map.getSize(); const mapPane = this.map.getPane("mapPane");
    container.classList.toggle("map-is-bearing", this.bearingEnabled);
    container.style.setProperty("--map-counter-bearing", `${this.bearingEnabled ? this.heroHeading : 0}deg`);
    mapPane.style.transformOrigin = `${size.x / 2}px ${size.y / 2}px`;
    mapPane.style.rotate = `${this.bearingEnabled ? -this.heroHeading : 0}deg`;
  }

  #area(points) {
    if (this.draftArea) this.draftArea.remove();
    this.draftArea = points.length ? L.polyline(points.map(asLatLng), { color: "#f6d971", dashArray: "6 6" }).addTo(this.map) : null;
  }

  #site(site) {
    const entry = this.dynamicSites.get(site.id); const center = asLatLng(site.position); const presentation = dynamicSitePresentation(site); const iconSize = presentation.iconSize;
    const icon = L.divIcon({ className: `dynamic-marker is-${site.kind}${site.visited ? " is-visited" : ""}`, html: `<span>${site.kind === "loot" ? "💰" : "⚔"}</span>`, iconSize: [iconSize, iconSize], iconAnchor: [iconSize / 2, iconSize / 2] });
    if (!entry) {
      const radius = L.circle(center, { pane: presentation.pane, radius: presentation.interactionRadius, className: `dynamic-site-radius is-${site.kind}`, interactive: false }).addTo(this.map);
      const marker = L.marker(center, { pane: presentation.pane, zIndexOffset: presentation.zIndexOffset, icon, bubblingMouseEvents: false, keyboard: true, title: site.kind === "loot" ? "Butin" : "Champ de bataille" }).addTo(this.map).bindTooltip(site.kind === "loot" ? "Butin" : "Champ de bataille");
      marker.on("click", (event) => { if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent); this.onDynamicSiteSelect(site.id); });
      this.dynamicSites.set(site.id, { marker, radius });
    } else { entry.marker.setLatLng(center).setIcon(icon); entry.radius.setLatLng(center).setRadius(site.interactionRadius); }
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

  #removeMissing(collection, ids) { for (const [id, layer] of collection) if (!ids.has(id)) { if (layer.marker) { layer.marker.remove(); layer.radius?.remove(); } else layer.remove(); collection.delete(id); } }
}

export function dynamicSitePresentation(site) { return { iconSize: site.kind === "battlefield" ? 64 : 52, interactionRadius: site.interactionRadius, pane: MapLayers.EFFECTS, zIndexOffset: 2500 }; }

function asLatLng(position) { return Array.isArray(position) ? position : [position.latitude, position.longitude]; }
function toPosition(point) { return { latitude: point.lat, longitude: point.lng }; }
