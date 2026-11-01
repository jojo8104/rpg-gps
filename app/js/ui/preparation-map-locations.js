/** Repères des placements déjà enregistrés ; aucune validation métier locale. */
export function showPreparationLocations(
  map,
  leaflet,
  catalog,
  preparation,
  currentId,
) {
  let timeout;
  const closeName = () => {
    clearTimeout(timeout);
    map.closePopup();
  };
  const icons = { village: "⌂", fort: "⚑", capital: "♜", resource: "◆" };
  for (const definition of catalog.locations) {
    const entry = preparation.locations?.[definition.id];
    if (!entry?.position || definition.id === currentId) continue;
    const point = [entry.position.latitude, entry.position.longitude];
    const circle = leaflet
      .circle(point, {
        radius: definition.interactionRadius,
        color: "#79531d",
        fillColor: "#b48836",
        fillOpacity: 0.18,
        bubblingMouseEvents: false,
      })
      .addTo(map);
    const marker = leaflet
      .marker(point, {
        icon: leaflet.divIcon({
          className: "preparation-existing-marker",
          html: icons[definition.type] ?? "◆",
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
        bubblingMouseEvents: false,
      })
      .addTo(map);
    for (const layer of [circle, marker])
      layer.on("click", () => {
        closeName();
        const label = document.createElement("span");
        label.textContent = definition.name;
        leaflet
          .popup({ closeButton: false, autoPan: false })
          .setLatLng(point)
          .setContent(label)
          .openOn(map);
        timeout = setTimeout(closeName, 2000);
      });
  }
  map.on("click movestart zoomstart", closeName);
  return () => {
    closeName();
    map.off("click movestart zoomstart", closeName);
  };
}
