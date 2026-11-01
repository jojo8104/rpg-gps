import { MapLayers } from "./MapLayers.js";
import { heroSprite } from "./UnitRenderer.js";
import { armyBanner } from "./army-banner.js";

const CLASS_LABELS = {
  warrior: "Guerrier",
  ranger: "Éclaireur",
  mage: "Mage",
};

export class AlliedHeroRenderer {
  constructor(map, { onSelect = () => {}, billboards = null } = {}) {
    this.map = map;
    this.billboards = billboards;
    this.onSelect = onSelect;
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
        existing.ally = ally;
        existing.marker.setLatLng(target).setIcon(heroIcon(ally));
        this.#billboard(existing);
        existing.marker.setTooltipContent(label);
        existing.marker
          .getElement()
          ?.classList.toggle("is-offline", !ally.connected);
        return;
      }
      const marker = L.marker(target, {
        pane: MapLayers.UNITS,
        icon: heroIcon(ally),
        zIndexOffset: 900,
        opacity: this.billboards ? 0 : 1,
        interactive: !this.billboards,
        keyboard: !this.billboards,
      })
        .addTo(this.map)
        .bindTooltip(label, { direction: "top", offset: [0, -24] });
      const entry = { marker, ally };
      this.#billboard(entry);
      marker.on("click", () => this.#openSummary(entry));
      marker.getElement()?.classList.toggle("is-offline", !ally.connected);
      this.markers.set(ally.playerId, entry);
    });
    for (const [playerId, entry] of this.markers)
      if (!visibleIds.has(playerId)) {
        this.billboards?.remove(`remote-hero:${playerId}`);
        entry.marker.remove();
        this.markers.delete(playerId);
      }
  }

  #billboard(entry) {
    this.billboards?.set(`remote-hero:${entry.ally.playerId}`, {
      marker: entry.marker,
      kind: "hero",
      remote: true,
      offline: entry.ally.connected === false,
      teamColor: entry.ally.teamColor,
      classId: entry.ally.heroClassId,
      gender: entry.ally.heroGender,
      heading: entry.ally.heading ?? 0,
      html: heroIcon(entry.ally).options.html,
      label: tooltipLabel(entry.ally),
      onClick: () => this.#openSummary(entry),
    });
  }

  #openSummary(entry) {
    const ally = entry.ally;
    const content = document.createElement("article");
    content.className = `player-map-popup is-${escapeAttribute(ally.teamColor)}`;
    content.innerHTML = `<span>${escapeText(ally.relationLabel)}</span><h3>${escapeText(ally.name)}</h3><p>${escapeText(ally.summary)}</p>`;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Interagir";
    button.addEventListener("click", () => {
      entry.marker.closePopup();
      this.onSelect(ally.playerId);
    });
    content.append(button);
    entry.marker
      .bindPopup(content, { className: "rpg-player-popup", closeButton: true })
      .openPopup();
  }
}

function heroIcon(ally) {
  return L.divIcon({
    className: `rpg-marker-host rpg-hero-marker-host rpg-remote-hero-host is-${escapeAttribute(ally.teamColor)}`,
    html: `${armyBanner(ally.heroState?.units, ally.teamColor, ally.informationLevel ?? 1)}${heroSprite(ally.heroClassId, ally.heroGender)}<strong class="rpg-remote-hero-name">${escapeText(ally.name)}</strong>`,
    iconSize: [56, 70],
    iconAnchor: [28, 28],
  });
}

function tooltipLabel(ally) {
  const identity = `${ally.name} · ${CLASS_LABELS[ally.heroClassId] ?? ally.heroClassId}`;
  if (!ally.heroState || ally.informationLevel < 2) return ally.name;
  if (ally.informationLevel === 2)
    return `${identity} · niv. ${ally.heroState.level}`;
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
