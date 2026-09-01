import { createMapPanes } from "./MapLayers.js";
import { LocationRenderer } from "./LocationRenderer.js";
import { UnitRenderer } from "./UnitRenderer.js";
import { TerrainRenderer } from "./TerrainRenderer.js";
import { FogRenderer } from "./FogRenderer.js";
import { MapEffectsRenderer } from "./MapEffectsRenderer.js";

export class MapRenderer {
  constructor({ map, mode, onHeroMove, onLocationSelect }) {
    this.map = map;
    this.mode = mode;
    createMapPanes(map);
    this.locations = new LocationRenderer({ map, onSelect: onLocationSelect });
    this.units = new UnitRenderer({ map, mode, onMove: onHeroMove });
    this.terrain = new TerrainRenderer(map);
    this.fog = new FogRenderer(map);
    this.effects = new MapEffectsRenderer(map);
    const updateZoom = () => {
      map.getContainer().dataset.zoomLevel = zoomLevel(map.getZoom());
    };
    map.on("zoomend", updateZoom);
    updateZoom();
  }
  render({
    heroPosition,
    heroHeading,
    accuracy,
    visionRadius,
    revealedZones = [],
    locations,
    gridCells = [],
  }) {
    const ids = new Set(locations.map((item) => item.id));
    locations.forEach((item) =>
      this.locations.render({
        ...item,
        owner: ownerFor(item),
        objective: item.type === "quest" || item.type === "mine",
      }),
    );
    this.locations.removeMissing(ids);
    this.units.render(heroPosition, accuracy, heroHeading);
    // Terrain and exploration overlays come only from real game state.
    this.terrain.render([]);
    this.fog.render({ heroPosition, gridCells, visionRadius, revealedZones });
    this.effects.render(locations);
  }
  setHeroHeading(heading) {
    this.units.setHeading(heading);
  }
}
export function zoomLevel(zoom) {
  if (zoom > 3) return zoom >= 17 ? "near" : zoom >= 14 ? "medium" : "far";
  return zoom >= 1.2 ? "near" : zoom >= 0 ? "medium" : "far";
}
function ownerFor(location) {
  if (location.relation === "enemy") return "enemy";
  if (location.relation === "owned" || location.relation === "allied")
    return "ally";
  return "neutral";
}
