import { resourceMarkerPresentation } from "./resource-marker-catalog.js";
import { MapLayers } from "./MapLayers.js";

const SITE_LABELS = {
  treasure: "Trésor",
  artifact: "Artefact",
  dungeon: "Donjon",
};

/** Présentation exclusive des connaissances officielles ; aucune reconstruction du monde privé. */
export function explorationMapEntries(view, locations = []) {
  const visibleLocations = new Set(locations.map((location) => location.id));
  const entries = [];
  for (const cell of view?.cells ?? []) {
    const presentation = resourceMarkerPresentation(cell.resource);
    if (
      !presentation ||
      !validPosition(cell.position) ||
      (cell.campLocationId && visibleLocations.has(cell.campLocationId))
    )
      continue;
    entries.push({
      kind: "cell",
      id: cell.id,
      position: cell.position,
      label: presentation.label,
      icon: presentation.icon,
      description:
        "Gisement découvert. L’installation d’un camp ne crée pas immédiatement une exploitation.",
      action: "Préparer l’installation",
    });
  }
  for (const site of view?.sites ?? []) {
    // Les anciennes découvertes hébergées utilisent uniquement la fiche du lieu principal.
    if (
      site.hostLocationId ||
      site.status !== "active" ||
      !validPosition(site.position) ||
      !Object.hasOwn(SITE_LABELS, site.type)
    )
      continue;
    entries.push({
      kind: "site",
      id: site.id,
      position: site.position,
      label: SITE_LABELS[site.type],
      symbol:
        site.type === "dungeon" ? "⌂" : site.type === "artifact" ? "✦" : "◆",
      description:
        "Site découvert. Consultez la préparation et les résultats de vos expéditions.",
      action: "Préparer une expédition",
    });
  }
  return entries;
}

export class ExplorationRenderer {
  constructor(map) {
    this.map = map;
    this.markers = new Map();
  }
  render(view, { locations = [], onSelect = () => {} } = {}) {
    const entries = explorationMapEntries(view, locations);
    const ids = new Set(entries.map((entry) => `${entry.kind}:${entry.id}`));
    for (const [id, marker] of this.markers)
      if (!ids.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
    for (const entry of entries) {
      const id = `${entry.kind}:${entry.id}`;
      const position = [entry.position.latitude, entry.position.longitude];
      let marker = this.markers.get(id);
      if (!marker) {
        const icon = entry.icon
          ? L.icon({
              iconUrl: entry.icon,
              iconSize: [48, 48],
              iconAnchor: [24, 24],
            })
          : L.divIcon({
              className: "exploration-site-marker",
              html: entry.symbol,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            });
        marker = L.marker(position, {
          icon,
          pane: MapLayers.EXPLORATION,
          title: entry.label,
          keyboard: true,
        }).addTo(this.map);
        this.markers.set(id, marker);
      }
      marker.setLatLng(position);
      // Conserver une fiche ouverte pendant les actualisations de l’état officiel.
      if (marker.isPopupOpen?.()) continue;
      const doc = this.map.getContainer().ownerDocument;
      const sheet = doc.createElement("article");
      const heading = doc.createElement("h3");
      heading.textContent = entry.label;
      const description = doc.createElement("p");
      description.textContent = entry.description;
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = entry.action;
      button.onclick = () => {
        marker.closePopup();
        onSelect(entry);
      };
      sheet.append(heading, description, button);
      marker.bindPopup(sheet);
    }
  }
}
function validPosition(position) {
  return (
    Number.isFinite(position?.latitude) && Number.isFinite(position?.longitude)
  );
}
