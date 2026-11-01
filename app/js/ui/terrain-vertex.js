/** Poignée d’édition du brouillon ; aucune position officielle n’est modifiée ici. */
export function createTerrainVertex(
  L,
  map,
  point,
  { editable, exclusion = false, onMove } = {},
) {
  if (!editable)
    return L.circleMarker([point.latitude, point.longitude], {
      radius: 6,
      color: exclusion ? "#cc4444" : "#ffe083",
      fillColor: "#17351d",
      fillOpacity: 1,
    }).addTo(map);
  const marker = L.marker([point.latitude, point.longitude], {
    draggable: true,
    bubblingMouseEvents: false,
    title: exclusion
      ? "Déplacer un point de l’exclusion"
      : "Déplacer un point du contour",
    icon: L.divIcon({
      className: `terrain-vertex${exclusion ? " terrain-vertex--exclusion" : ""}`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      html: '<span aria-hidden="true"></span>',
    }),
  }).addTo(map);
  marker.on("dragend", () => {
    const position = marker.getLatLng();
    onMove?.({ latitude: position.lat, longitude: position.lng });
  });
  return marker;
}
