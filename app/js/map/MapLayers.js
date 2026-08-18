export const MapLayers = Object.freeze({
  BASE_MAP: "baseMap",
  TERRAIN: "terrain",
  TERRITORIES: "territories",
  EXPLORATION: "exploration",
  LOCATIONS: "locations",
  UNITS: "units",
  EFFECTS: "effects",
});

export const MAP_LAYER_ORDER = Object.freeze([
  MapLayers.BASE_MAP,
  MapLayers.TERRAIN,
  MapLayers.TERRITORIES,
  MapLayers.EXPLORATION,
  MapLayers.LOCATIONS,
  MapLayers.UNITS,
  MapLayers.EFFECTS,
]);

export const MAP_LAYER_Z_INDEX = Object.freeze({
  [MapLayers.BASE_MAP]: 200,
  [MapLayers.TERRAIN]: 300,
  [MapLayers.TERRITORIES]: 350,
  [MapLayers.EXPLORATION]: 400,
  [MapLayers.LOCATIONS]: 500,
  [MapLayers.UNITS]: 600,
  [MapLayers.EFFECTS]: 650,
});

export function createMapPanes(map) {
  MAP_LAYER_ORDER.forEach((name) => {
    const pane = map.getPane(name) ?? map.createPane(name);
    pane.style.zIndex = String(MAP_LAYER_Z_INDEX[name]);
    pane.classList.add(`rpg-pane--${name}`);
  });
  return MapLayers;
}
