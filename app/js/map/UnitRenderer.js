import { MapLayers } from "./MapLayers.js";

export class UnitRenderer {
  constructor({ map, mode, onMove }) { this.map = map; this.mode = mode; this.onMove = onMove; this.marker = null; this.accuracy = null; this.animation = null; }
  render(position, accuracy, heading) {
    const target = asLatLng(position);
    if (!this.marker) {
      const icon = L.divIcon({ className: "rpg-marker-host rpg-hero-marker-host", html: heroSprite(), iconSize: [56, 56], iconAnchor: [28, 28] });
      this.marker = L.marker(target, { pane: MapLayers.UNITS, draggable: this.mode !== "gps", zIndexOffset: 1000, icon }).addTo(this.map);
      if (this.mode !== "gps") this.marker.on("dragend", () => this.onMove(toPosition(this.marker.getLatLng())));
    } else this.#interpolateTo(target);
    this.setHeading(heading);
    if (this.mode === "gps" && Number.isFinite(accuracy)) {
      if (!this.accuracy) this.accuracy = L.circle(target, { pane: MapLayers.EXPLORATION, radius: accuracy, className: "rpg-gps-accuracy", interactive: false }).addTo(this.map);
      else this.accuracy.setLatLng(target).setRadius(accuracy);
    }
  }
  setHeading(heading) {
    const hero = this.marker?.getElement()?.querySelector(".rpg-hero");
    if (!hero || !Number.isFinite(heading)) return;
    const direction = headingDirection(heading);
    hero.dataset.direction = direction.id;
    hero.style.setProperty("--hero-direction-angle", `${direction.angle}deg`);
    hero.setAttribute("aria-label", `Héros orienté ${direction.label}`);
  }
  #interpolateTo(target) {
    if (this.mode !== "gps" || !this.marker) { this.marker.setLatLng(target); return; }
    cancelAnimationFrame(this.animation); const start = this.marker.getLatLng(); const began = performance.now(); const duration = 650;
    const tick = (now) => { const t = Math.min(1, (now - began) / duration); const eased = 1 - (1 - t) ** 3; this.marker.setLatLng([start.lat + (target[0] - start.lat) * eased, start.lng + (target[1] - start.lng) * eased]); if (t < 1) this.animation = requestAnimationFrame(tick); };
    this.animation = requestAnimationFrame(tick);
  }
}
function asLatLng(value) { return Array.isArray(value) ? value : [value.latitude, value.longitude]; }
function toPosition(value) { return { latitude: value.lat, longitude: value.lng }; }

const DIRECTIONS = Object.freeze([
  { id: "n", angle: 0, label: "nord" }, { id: "ne", angle: 45, label: "nord-est" },
  { id: "e", angle: 90, label: "est" }, { id: "se", angle: 135, label: "sud-est" },
  { id: "s", angle: 180, label: "sud" }, { id: "sw", angle: 225, label: "sud-ouest" },
  { id: "w", angle: 270, label: "ouest" }, { id: "nw", angle: 315, label: "nord-ouest" },
]);

export function headingDirection(heading) {
  const normalized = ((heading % 360) + 360) % 360;
  return DIRECTIONS[Math.round(normalized / 45) % DIRECTIONS.length];
}

function heroSprite() {
  return '<div class="rpg-hero" data-direction="n" role="img" aria-label="Héros orienté nord"><span class="hero-direction"><svg viewBox="0 0 56 56" aria-hidden="true"><ellipse class="rpg-hero__shadow" cx="28" cy="32" rx="17" ry="13"/><g class="rpg-hero__sprite"><path class="rpg-hero__cloak" d="M18 39 21 22 28 16 35 22 38 39 28 47Z"/><circle class="rpg-hero__head" cx="28" cy="17" r="7"/><path class="rpg-hero__face" d="m24 13 4-7 4 7-4 3Z"/><path class="rpg-hero__shoulders" d="M16 29 22 22h12l6 7-5 5-7-4-7 4Z"/><path class="rpg-hero__weapon" d="m36 25 9-13 2 2-8 14 4 3-2 2-7-6Z"/><circle class="rpg-hero__hand" cx="37" cy="27" r="2"/></g></svg></span></div>';
}
