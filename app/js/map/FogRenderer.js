import { MapLayers } from "./MapLayers.js";
export class FogRenderer {
  constructor(map) { this.map = map; this.layer = null; }
  render({ heroPosition, enabled = true }) {
    this.layer?.remove(); this.layer = null; if (!enabled) return;
    const center = Array.isArray(heroPosition) ? heroPosition : [heroPosition.latitude, heroPosition.longitude];
    this.layer = L.circle(center, { pane: MapLayers.EXPLORATION, radius: this.map.options.crs === L.CRS.Simple ? 32 : 150, className: "rpg-exploration-edge", interactive: false }).addTo(this.map);
  }
}
