import { MapLayers } from "./MapLayers.js";
export class MapEffectsRenderer {
  constructor(map) {
    this.map = map;
    this.effects = new Map();
  }
  render(locations) {
    const dangerIds = new Set(
      locations
        .filter((item) => item.relation === "enemy")
        .map((item) => item.id),
    );
    locations.forEach((item) => {
      if (!dangerIds.has(item.id)) return;
      const position = Array.isArray(item.position)
        ? item.position
        : [item.position.latitude, item.position.longitude];
      const effect = this.effects.get(item.id);
      if (effect) effect.setLatLng(position);
      else
        this.effects.set(
          item.id,
          L.circleMarker(position, {
            pane: MapLayers.EFFECTS,
            radius: 28,
            className: "rpg-danger-effect",
            interactive: false,
          }).addTo(this.map),
        );
    });
    for (const [id, effect] of this.effects)
      if (!dangerIds.has(id)) {
        effect.remove();
        this.effects.delete(id);
      }
  }
}
