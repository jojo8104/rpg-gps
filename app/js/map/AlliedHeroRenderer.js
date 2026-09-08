import { MapLayers } from "./MapLayers.js";

const CLASS_LABELS = {
  warrior: "Guerrier",
  ranger: "Éclaireur",
  mage: "Mage",
};

export class AlliedHeroRenderer {
  constructor(map) {
    this.map = map;
    this.markers = new Map();
  }

  render(allies) {
    const visibleIds = new Set();
    allies.forEach((ally) => {
      if (!ally.position) return;
      visibleIds.add(ally.playerId);
      const target = [ally.position.latitude, ally.position.longitude];
      const label = tooltipLabel(ally);
      const existing = this.markers.get(ally.playerId);
      if (existing) {
        existing.setLatLng(target).setTooltipContent(label);
        existing.getElement()?.classList.toggle("is-offline", !ally.connected);
        return;
      }
      const icon = L.divIcon({
        className: "rpg-ally-marker-host",
        html: `<span class="rpg-ally-marker" data-class="${escapeAttribute(ally.heroClassId)}"><span class="rpg-ally-marker__initial">${escapeText(initial(ally.name))}</span><span class="rpg-ally-marker__name">${escapeText(ally.name)}</span></span>`,
        iconSize: [48, 58],
        iconAnchor: [24, 29],
      });
      const marker = L.marker(target, {
        pane: MapLayers.UNITS,
        icon,
        zIndexOffset: 900,
      })
        .addTo(this.map)
        .bindTooltip(label, { direction: "top", offset: [0, -24] });
      marker.getElement()?.classList.toggle("is-offline", !ally.connected);
      this.markers.set(ally.playerId, marker);
    });
    for (const [playerId, marker] of this.markers)
      if (!visibleIds.has(playerId)) {
        marker.remove();
        this.markers.delete(playerId);
      }
  }
}

function initial(name) {
  return typeof name === "string" && name.trim() ? name.trim()[0] : "?";
}

function tooltipLabel(ally) {
  const identity = `${ally.name} · ${CLASS_LABELS[ally.heroClassId] ?? ally.heroClassId}`;
  if (!ally.heroState) return identity;
  const soldiers = ally.heroState.units.reduce(
    (total, unit) => total + unit.combatantCount,
    0,
  );
  return `${identity} · niv. ${ally.heroState.level} · ${ally.heroState.health}/${ally.heroState.maxHealth} PV · ${soldiers} soldats`;
}

function escapeText(value) {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

function escapeAttribute(value) {
  return String(value ?? "unknown").replace(/[^a-z0-9_-]/gi, "");
}
