/** Présentation des gisements ; aucune règle de découverte ou de production. */
export const RESOURCE_MARKERS = Object.freeze({
  stone: Object.freeze({
    label: "Pierre",
    icon: "assets/markers/map/resource-stone.png",
  }),
  wood: Object.freeze({
    label: "Bois",
    icon: "assets/markers/map/resource-wood.png",
  }),
  iron: Object.freeze({
    label: "Fer",
    icon: "assets/markers/map/resource-iron.png",
  }),
  gold: Object.freeze({
    label: "Or",
    icon: "assets/markers/map/resource-gold.png",
  }),
  "fertile-land": Object.freeze({
    label: "Terre fertile",
    icon: "assets/markers/map/resource-fertile-land.png",
  }),
});

/** Une cellule vide ou une ressource inconnue ne possède pas de marqueur. */
export function resourceMarkerPresentation(resourceId) {
  return Object.hasOwn(RESOURCE_MARKERS, resourceId)
    ? RESOURCE_MARKERS[resourceId]
    : null;
}
