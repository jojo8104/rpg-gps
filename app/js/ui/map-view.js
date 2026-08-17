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
    if (real) {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20, attribution: "© OpenStreetMap" }).addTo(this.map);
      this.map.setView(initialPosition ? asLatLng(initialPosition) : [48.8566, 2.3522], 17);
    } else {
      this.map.fitBounds(SIMULATION_BOUNDS);
      L.rectangle(SIMULATION_BOUNDS, { color: "#54715a", weight: 1, fillColor: "#203b27", fillOpacity: 1 }).addTo(this.map);
    }
    this.map.on("click", ({ latlng }) => this.onMapClick(toPosition(latlng)));
    const legend = L.control({ position: "bottomleft" });
    legend.onAdd = () => { const element = L.DomUtil.create("div", "range-legend"); element.innerHTML = '<span class="is-detection">Détection</span><span class="is-interaction">Interaction</span>'; return element; };
    legend.addTo(this.map);
    this.locations = new Map();
    this.locationRanges = new Map();
    this.dynamicSites = new Map();
    this.hero = null;
    this.accuracy = null;
    this.playArea = null;
    this.draftArea = null;
    this.heatmap = L.layerGroup().addTo(this.map);
  }

  render({ heroPosition, accuracy = null, locations = [], playAreaPoints = [], dynamicSites = [], gridCells = [], heatmapVisible = true }) {
    locations.forEach((location) => this.#location(location));
    this.#removeMissing(this.locations, new Set(locations.map((item) => item.id)));
    this.#removeMissing(this.locationRanges, new Set(locations.map((item) => item.id)));
    this.#hero(heroPosition, accuracy);
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

  #hero(position, accuracy) {
    const latLng = asLatLng(position);
    if (this.hero === null) {
      this.hero = L.marker(latLng, { draggable: this.mode !== "gps", zIndexOffset: 1000, icon: L.divIcon({ className: "hero-marker", html: "♟", iconSize: [38, 38], iconAnchor: [19, 19] }) }).addTo(this.map);
      if (this.mode !== "gps") this.hero.on("dragend", () => this.onHeroMove(toPosition(this.hero.getLatLng())));
    } else this.hero.setLatLng(latLng);
    if (this.mode === "gps" && Number.isFinite(accuracy)) {
      if (this.accuracy === null) this.accuracy = L.circle(latLng, { radius: accuracy, color: "#62a8ff", fillOpacity: .08, weight: 1 }).addTo(this.map);
      else this.accuracy.setLatLng(latLng).setRadius(accuracy);
    }
  }

  #location(location) {
    const icon = L.divIcon({ className: `location-marker ${location.nearby ? "is-nearby" : ""}`, html: location.state === "UNKNOWN" ? "?" : "◆", iconSize: [34, 34], iconAnchor: [17, 17] });
    const marker = this.locations.get(location.id);
    if (!marker) {
      const created = L.marker(asLatLng(location.position), { icon, bubblingMouseEvents: false, keyboard: true, title: location.name }).addTo(this.map);
      created.on("click", (event) => { if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent); this.onLocationSelect(location.id); });
      this.locations.set(location.id, created);
    } else marker.setIcon(icon).setLatLng(asLatLng(location.position));
    const center = asLatLng(location.position);
    let ranges = this.locationRanges.get(location.id);
    if (!ranges) {
      ranges = L.layerGroup([
        L.circle(center, { radius: location.detectionRadius, color: "#62a8ff", weight: 1, opacity: .65, fillColor: "#62a8ff", fillOpacity: .06, interactive: false }),
        L.circle(center, { radius: location.interactionRadius, color: "#78e08f", weight: 2, opacity: .85, fillColor: "#78e08f", fillOpacity: .12, interactive: false }),
      ]).addTo(this.map);
      this.locationRanges.set(location.id, ranges);
    } else {
      const [detection, interaction] = ranges.getLayers();
      detection.setLatLng(center).setRadius(location.detectionRadius);
      interaction.setLatLng(center).setRadius(location.interactionRadius);
    }
  }

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
    });
  }

  #removeMissing(collection, ids) { for (const [id, layer] of collection) if (!ids.has(id)) { layer.remove(); collection.delete(id); } }
}

function asLatLng(position) { return Array.isArray(position) ? position : [position.latitude, position.longitude]; }
function toPosition(point) { return { latitude: point.lat, longitude: point.lng }; }
