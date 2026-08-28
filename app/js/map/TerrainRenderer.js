import { MapLayers } from "./MapLayers.js";
export class TerrainRenderer {
  constructor(map) {
    this.group = L.layerGroup().addTo(map);
  }
  render(zones = []) {
    this.group.clearLayers();
    zones.forEach((zone) =>
      L.polygon(zone.points.map(asLatLng), {
        pane: MapLayers.TERRAIN,
        className: `rpg-terrain rpg-terrain--${zone.terrain}`,
        interactive: false,
      }).addTo(this.group),
    );
  }
}
function asLatLng(value) {
  return Array.isArray(value) ? value : [value.latitude, value.longitude];
}
