import { ExplorationRenderer } from "./ExplorationRenderer.js";
import { createMapPanes } from "./MapLayers.js";
import { LocationRenderer } from "./LocationRenderer.js";
import { UnitRenderer } from "./UnitRenderer.js";
import { TerrainRenderer } from "./TerrainRenderer.js";
import { FogRenderer } from "./FogRenderer.js";
import { MapEffectsRenderer } from "./MapEffectsRenderer.js";
import { MapBillboards } from "./MapBillboards.js";
import { TerritoryRenderer } from "./TerritoryRenderer.js";

export class MapRenderer {
  constructor({ map, mode, onHeroMove, onLocationSelect }) {
    this.map = map;
    this.mode = mode;
    createMapPanes(map);
    this.billboards = new MapBillboards(map);
    this.locations = new LocationRenderer({
      map,
      onSelect: onLocationSelect,
      billboards: this.billboards,
    });
    this.exploration = new ExplorationRenderer(map);
    this.units = new UnitRenderer({
      map,
      mode,
      onMove: onHeroMove,
      billboards: this.billboards,
    });
    this.terrain = new TerrainRenderer(map);
    this.territories = new TerritoryRenderer(map);
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
    heroClassId,
    heroGender,
    heroArmyUnits,
    accuracy,
    visionRadius,
    fogEnabled = true,
    playAreaPoints = [],
    revealedZones = [],
    locations,
    gridCells = [],
    territory = null,
    explorationView = null,
    onExplorationSelect = () => {},
  }) {
    const ids = new Set(locations.map((item) => item.id));
    locations.forEach((item) =>
      this.locations.render({
        ...item,
        owner: ownerFor(item),
      }),
    );
    this.locations.removeMissing(ids);
    this.exploration.render(explorationView, {
      locations,
      onSelect: onExplorationSelect,
    });
    this.units.render(
      heroPosition,
      accuracy,
      heroHeading,
      heroClassId,
      heroArmyUnits,
      heroGender,
    );
    // Terrain and exploration overlays come only from real game state.
    this.terrain.render([]);
    this.territories.render(territory);
    this.fog.render({
      heroPosition,
      gridCells,
      visionRadius,
      revealedZones,
      enabled: fogEnabled,
      playAreaPoints,
    });
    this.effects.render([]);
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
