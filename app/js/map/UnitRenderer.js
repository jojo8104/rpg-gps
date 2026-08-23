import { MapLayers } from "./MapLayers.js";

export class UnitRenderer {
  constructor({ map, mode, onMove }) { this.map = map; this.mode = mode; this.onMove = onMove; this.marker = null; this.accuracy = null; this.animation = null; }
  render(position, accuracy, heading) {
    const target = asLatLng(position);
    if (!this.marker) {
      const icon = L.divIcon({ className: "rpg-marker-host rpg-hero-marker-host", html: '<div class="rpg-hero"><span class="hero-direction"><svg viewBox="0 0 48 48"><path d="M24 4 39 17l-5 23-10 5-10-5-5-23Z"/><path d="m17 25 7-15 7 15-7 8Z"/></svg></span></div>', iconSize: [50, 50], iconAnchor: [25, 25] });
      this.marker = L.marker(target, { pane: MapLayers.UNITS, draggable: this.mode !== "gps", zIndexOffset: 1000, icon }).addTo(this.map);
      if (this.mode !== "gps") this.marker.on("dragend", () => this.onMove(toPosition(this.marker.getLatLng())));
    } else this.#interpolateTo(target);
    this.setHeading(heading);
    if (this.mode === "gps" && Number.isFinite(accuracy)) {
      if (!this.accuracy) this.accuracy = L.circle(target, { pane: MapLayers.EXPLORATION, radius: accuracy, className: "rpg-gps-accuracy", interactive: false }).addTo(this.map);
      else this.accuracy.setLatLng(target).setRadius(accuracy);
    }
  }
  setHeading(heading) { const direction = this.marker?.getElement()?.querySelector(".hero-direction"); if (direction && Number.isFinite(heading)) direction.style.transform = `rotate(${heading}deg)`; }
  #interpolateTo(target) {
    if (this.mode !== "gps" || !this.marker) { this.marker.setLatLng(target); return; }
    cancelAnimationFrame(this.animation); const start = this.marker.getLatLng(); const began = performance.now(); const duration = 650;
    const tick = (now) => { const t = Math.min(1, (now - began) / duration); const eased = 1 - (1 - t) ** 3; this.marker.setLatLng([start.lat + (target[0] - start.lat) * eased, start.lng + (target[1] - start.lng) * eased]); if (t < 1) this.animation = requestAnimationFrame(tick); };
    this.animation = requestAnimationFrame(tick);
  }
}
function asLatLng(value) { return Array.isArray(value) ? value : [value.latitude, value.longitude]; }
function toPosition(value) { return { latitude: value.lat, longitude: value.lng }; }
