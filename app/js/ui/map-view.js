/**
 * Façade Leaflet utilisée par le contrôleur navigateur.
 * Elle maintient les couches visuelles et remonte les interactions, sans appliquer
 * de règle de proximité, de scénario ou de combat.
 */
import { MapRenderer } from "../map/MapRenderer.js";
import { MapLayers, createMapPanes } from "../map/MapLayers.js";

const SIMULATION_BOUNDS = [
  [-89, -179],
  [89, 179],
];

export class MapView {
  constructor({
    element,
    mode = "simulation",
    initialPosition = null,
    onHeroMove,
    onLocationSelect,
    onTraceSelect = () => {},
    onAutonomousGroupSelect = () => {},
    onMapClick = () => {},
  }) {
    this.mode = mode;
    this.onHeroMove = onHeroMove;
    this.onLocationSelect = onLocationSelect;
    this.onTraceSelect = onTraceSelect;
    this.onAutonomousGroupSelect = onAutonomousGroupSelect;
    this.onMapClick = onMapClick;
    this.heroHeading = 0;
    this.bearingEnabled = false;
    const real = mode === "gps";
    this.map = L.map(
      element,
      real
        ? { zoomControl: true }
        : {
            crs: L.CRS.Simple,
            zoomControl: false,
            attributionControl: false,
            minZoom: -1,
            maxZoom: 2,
          },
    );
    createMapPanes(this.map);
    if (real) {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        pane: MapLayers.BASE_MAP,
        maxZoom: 20,
        keepBuffer: 6,
        attribution: "© OpenStreetMap",
      }).addTo(this.map);
      this.map.setView(
        initialPosition ? asLatLng(initialPosition) : [48.8566, 2.3522],
        17,
      );
    } else {
      this.map.fitBounds(SIMULATION_BOUNDS);
      L.rectangle(SIMULATION_BOUNDS, {
        pane: MapLayers.BASE_MAP,
        className: "rpg-simulation-base",
        weight: 1,
        fillOpacity: 1,
      }).addTo(this.map);
    }
    this.map.on("click", ({ latlng }) => this.onMapClick(toPosition(latlng)));
    this.map.on("move zoom resize", () => {
      if (this.bearingEnabled) this.#applyBearing();
    });
    this.renderer = new MapRenderer({
      map: this.map,
      mode,
      onHeroMove,
      onLocationSelect,
    });
    const legend = L.control({ position: "bottomleft" });
    legend.onAdd = () => {
      const element = L.DomUtil.create("div", "range-legend");
      element.innerHTML =
        '<span class="is-detection">Détection</span><span class="is-interaction">Interaction</span>';
      return element;
    };
    legend.addTo(this.map);
    this.dynamicSites = new Map();
    this.questTraces = new Map();
    this.autonomousTraces = new Map();
    this.autonomousTraceLines = new Map();
    this.autonomousGroups = new Map();
    this.watchBeacons = new Map();
    this.watchTargets = new Map();
    this.playArea = null;
    this.draftArea = null;
    this.exclusionAreas = L.layerGroup().addTo(this.map);
    this.exclusionDraft = null;
    this.heatmap = L.layerGroup().addTo(this.map);
  }

  // Synchronise les couches à partir d'un instantané déjà filtré par le moteur.
  render({
    heroPosition,
    heroHeading = null,
    accuracy = null,
    visionRadius = null,
    fogEnabled = true,
    locations = [],
    autonomousGroups = [],
    divinationTargets = [],
    revealedZones = [],
    watchBeacons = [],
    autonomousTraces = [],
    playAreaPoints = [],
    excludedPolygons = [],
    exclusionDraftPoints = [],
    dynamicSites = [],
    questTraces = [],
    gridCells = [],
    heatmapVisible = true,
  }) {
    this.renderer.render({
      heroPosition,
      heroHeading,
      accuracy,
      visionRadius,
      fogEnabled,
      playAreaPoints,
      revealedZones,
      locations,
      gridCells,
    });
    this.#area(playAreaPoints);
    this.#exclusions(excludedPolygons, exclusionDraftPoints);
    dynamicSites.forEach((site) => this.#site(site));
    this.#removeMissing(
      this.dynamicSites,
      new Set(dynamicSites.map((item) => item.id)),
    );
    questTraces.forEach((trace) => this.#trace(trace));
    this.#removeMissing(
      this.questTraces,
      new Set(questTraces.map((item) => item.id)),
    );
    const traceEndpoints = endpointTraces(autonomousTraces);
    traceEndpoints.forEach((trace) => this.#autonomousTrace(trace));
    this.#removeMissing(
      this.autonomousTraces,
      new Set(traceEndpoints.map((item) => item.id)),
    );
    this.#autonomousTracePaths(autonomousTraces);
    autonomousGroups.forEach((group) => this.#autonomousGroup(group));
    this.#removeMissing(
      this.autonomousGroups,
      new Set(autonomousGroups.map((item) => item.id)),
    );
    watchBeacons.forEach((beacon) => this.#watchBeacon(beacon));
    this.#removeMissing(
      this.watchBeacons,
      new Set(watchBeacons.map((item) => item.id)),
    );
    const watchTargets = [
      ...watchBeacons.flatMap((beacon) =>
        beacon.visibleTargets.map((target) => ({
          ...target,
          watchTargetId: `${beacon.id}:${target.key}`,
        })),
      ),
      ...divinationTargets.map((target) => ({
        ...target,
        watchTargetId: `divination:${target.key}`,
        revealedByDivination: true,
      })),
    ];
    watchTargets.forEach((target) => this.#watchTarget(target));
    this.#removeMissing(
      this.watchTargets,
      new Set(watchTargets.map((target) => target.watchTargetId)),
    );
    this.#heatmap(gridCells, heatmapVisible);
  }

  #watchBeacon(beacon) {
    const center = asLatLng(beacon.position);
    const entry = this.watchBeacons.get(beacon.id);
    const icon = L.divIcon({
      className: "watch-beacon-marker",
      html: '<span aria-hidden="true">⌖</span>',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    if (!entry) {
      const radius = L.circle(center, {
        pane: MapLayers.EXPLORATION,
        radius: beacon.radius,
        color: "#64d8ff",
        weight: 2,
        dashArray: "6 5",
        fillColor: "#45bfe8",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(this.map);
      const marker = L.marker(center, {
        pane: MapLayers.EFFECTS,
        zIndexOffset: 700,
        icon,
        interactive: false,
        title: "Balise de vigie",
      })
        .addTo(this.map)
        .bindTooltip(
          `Balise de vigie · rayon ${Math.round(beacon.radius)}${this.mode === "gps" ? " m" : ""}`,
        );
      this.watchBeacons.set(beacon.id, { marker, radius });
    } else {
      entry.marker.setLatLng(center).setIcon(icon);
      entry.radius.setLatLng(center).setRadius(beacon.radius);
    }
  }

  #watchTarget(target) {
    const center = asLatLng(target.position);
    const entry = this.watchTargets.get(target.watchTargetId);
    const heroTarget = target.kind === "hero";
    const icon = L.divIcon({
      className: `watch-target-marker is-${heroTarget ? "hero" : "group"}`,
      html: `<span aria-hidden="true">${heroTarget ? "●" : "⚔"}</span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    const label = heroTarget
      ? (target.name ?? "Joueur détecté")
      : `Groupe détecté${target.soldiers ? ` · ${target.soldiers}` : ""}`;
    if (!entry) {
      const marker = L.marker(center, {
        pane: MapLayers.UNITS,
        zIndexOffset: 1100,
        icon,
        interactive: false,
        title: label,
      })
        .addTo(this.map)
        .bindTooltip(label);
      this.watchTargets.set(target.watchTargetId, { marker });
    } else
      entry.marker.setLatLng(center).setIcon(icon).setTooltipContent(label);
  }

  // Fabriques Leaflet privées pour les entités dynamiques.
  #autonomousTrace(trace) {
    const center = asLatLng(trace.position);
    const entry = this.autonomousTraces.get(trace.id);
    const feet =
      '<svg viewBox="0 0 28 28" aria-hidden="true"><ellipse cx="9" cy="8" rx="4" ry="7"/><ellipse cx="19" cy="20" rx="4" ry="7"/></svg>';
    const icon = L.divIcon({
      className: `autonomous-trace-marker is-${trace.color ?? "gray"}`,
      html: `<span style="rotate:${trace.directionDegrees ?? 0}deg">${feet}</span>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    if (!entry) {
      const marker = L.marker(center, {
        pane: MapLayers.EFFECTS,
        zIndexOffset: 300,
        icon,
        interactive: false,
        title: "Trace de passage",
      }).addTo(this.map);
      this.autonomousTraces.set(trace.id, { marker });
    } else entry.marker.setLatLng(center).setIcon(icon);
  }

  #autonomousTracePaths(traces) {
    const groups = new Map();
    for (const trace of traces) {
      if (!groups.has(trace.groupId)) groups.set(trace.groupId, []);
      groups.get(trace.groupId).push(trace);
    }
    for (const [groupId, entries] of groups) {
      const points = entries
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((trace) => asLatLng(trace.position));
      const color = entries.at(-1)?.color ?? "gray";
      const existing = this.autonomousTraceLines.get(groupId);
      if (existing) existing.setLatLngs(points);
      else
        this.autonomousTraceLines.set(
          groupId,
          L.polyline(points, {
            pane: MapLayers.EFFECTS,
            className: `autonomous-trace-path is-${color}`,
            interactive: false,
            weight: 3,
            dashArray: "2 8",
            opacity: 0.8,
          }).addTo(this.map),
        );
    }
    for (const [groupId, line] of this.autonomousTraceLines)
      if (!groups.has(groupId)) {
        line.remove();
        this.autonomousTraceLines.delete(groupId);
      }
  }

  #trace(trace) {
    const center = asLatLng(trace.position);
    const entry = this.questTraces.get(trace.id);
    const footprints =
      '<svg viewBox="0 0 48 48" aria-hidden="true"><g transform="rotate(-24 24 24)"><path d="M14 7c4 0 6 4 6 9s-2 9-6 9-6-4-6-9 2-9 6-9Zm-2 20h5l2 10c1 4-8 6-9 2l2-12Z"/><path d="M34 17c4 0 6 4 6 9s-2 9-6 9-6-4-6-9 2-9 6-9Zm-2 20h5l1 7H30l2-7Z"/></g></svg>';
    const icon = L.divIcon({
      className: "quest-trace-marker",
      html: `<span>${footprints}</span>`,
      iconSize: [52, 52],
      iconAnchor: [26, 26],
    });
    if (!entry) {
      const marker = L.marker(center, {
        pane: MapLayers.EFFECTS,
        zIndexOffset: 2400,
        icon,
        title: "Trace à examiner",
      })
        .addTo(this.map)
        .bindTooltip("Trace à examiner");
      marker.on("click", (event) => {
        if (event.originalEvent)
          L.DomEvent.stopPropagation(event.originalEvent);
        this.onTraceSelect(trace.id);
      });
      this.questTraces.set(trace.id, { marker });
    } else entry.marker.setLatLng(center).setIcon(icon);
  }

  #autonomousGroup(group) {
    const center = asLatLng(group.position);
    const entry = this.autonomousGroups.get(group.id);
    const symbol =
      group.type === "army" || group.type === "rogue"
        ? "⚔"
        : group.type === "convoy"
          ? "▣"
          : group.type === "messenger"
            ? "➤"
            : "⌖";
    const icon = L.divIcon({
      className: `autonomous-group-marker is-${group.type} is-${group.factionId ?? "independent"}`,
      html: `<span>${symbol}</span><small>${group.soldiers || ""}</small>`,
      iconSize: [46, 46],
      iconAnchor: [23, 23],
    });
    const label = `${group.type === "army" ? "Armée" : "Groupe"} ${group.factionId === "chaos" ? "du Chaos" : "autonome"}`;
    if (!entry) {
      const marker = L.marker(center, {
        pane: MapLayers.UNITS,
        zIndexOffset: 900,
        icon,
        title: label,
        interactive: true,
      })
        .addTo(this.map)
        .bindTooltip(`${label} · ${group.soldiers} soldats`);
      marker.on("click", (event) => {
        if (event.originalEvent)
          L.DomEvent.stopPropagation(event.originalEvent);
        this.onAutonomousGroupSelect(group.id);
      });
      this.autonomousGroups.set(group.id, { marker });
    } else
      entry.marker
        .setLatLng(center)
        .setIcon(icon)
        .setTooltipContent(`${label} · ${group.soldiers} soldats`);
  }

  // Commandes de caméra et de zone exposées à main.js.
  setPlayArea(points) {
    if (this.playArea) this.playArea.remove();
    this.playArea =
      points.length >= 3
        ? L.polygon(points.map(asLatLng), {
            color: "#78e08f",
            fillOpacity: 0.12,
          }).addTo(this.map)
        : null;
  }

  setExclusionAreas(polygons) {
    this.#exclusions(polygons, []);
  }

  focus(position, zoom = this.mode === "gps" ? 18 : 0.5) {
    this.map.flyTo(asLatLng(position), zoom, { duration: 0.35 });
  }
  follow(position) {
    this.map.panTo(asLatLng(position), { animate: false });
  }
  setHeroHeading(heading) {
    this.heroHeading = Number.isFinite(heading) ? heading : 0;
    this.renderer.setHeroHeading(this.heroHeading);
    this.#applyBearing();
  }

  setBearingEnabled(enabled) {
    this.bearingEnabled = this.mode === "gps" && enabled === true;
    this.#applyBearing();
    return this.bearingEnabled;
  }
  toggleBearing() {
    return this.setBearingEnabled(!this.bearingEnabled);
  }

  #applyBearing() {
    const container = this.map.getContainer();
    const size = this.map.getSize();
    const mapPane = this.map.getPane("mapPane");
    const panePosition = L.DomUtil.getPosition(mapPane) ?? L.point(0, 0);
    const bearing = this.bearingEnabled ? -this.heroHeading : 0;
    container.classList.toggle("map-is-bearing", this.bearingEnabled);
    container.style.setProperty(
      "--map-counter-bearing",
      `${this.bearingEnabled ? this.heroHeading : 0}deg`,
    );
    // Leaflet translates mapPane while panning. Compensate that translation so
    // rotation stays centered on the viewport and every GPS layer remains aligned.
    // Translation and rotation must live in the same transform: using the separate
    // CSS `rotate` property changes the coordinate system of Leaflet's translation
    // on some mobile browsers, which makes markers appear to slide over the tiles.
    mapPane.style.transformOrigin = `${size.x / 2 - panePosition.x}px ${size.y / 2 - panePosition.y}px`;
    mapPane.style.rotate = "";
    mapPane.style.transform = `translate3d(${panePosition.x}px, ${panePosition.y}px, 0px) rotate(${bearing}deg)`;
  }

  #area(points) {
    if (this.draftArea) this.draftArea.remove();
    this.draftArea = points.length
      ? L.polyline(points.map(asLatLng), {
          color: "#f6d971",
          dashArray: "6 6",
        }).addTo(this.map)
      : null;
  }

  #exclusions(polygons, draftPoints) {
    this.exclusionAreas.clearLayers();
    polygons.forEach((points) => {
      const layer = L.polygon(points.map(asLatLng), {
        color: "#b32323",
        weight: 3,
        dashArray: "8 5",
        fillColor: "#d52d2d",
        fillOpacity: 0.28,
        className: "rpg-exclusion-zone",
      }).addTo(this.exclusionAreas);
      this.#applyExclusionHatch(layer);
    });
    if (this.exclusionDraft) this.exclusionDraft.remove();
    this.exclusionDraft = draftPoints.length
      ? L.polyline(draftPoints.map(asLatLng), {
          color: "#ff4d4d",
          weight: 4,
          dashArray: "5 5",
        }).addTo(this.map)
      : null;
  }

  #applyExclusionHatch(layer) {
    const element = layer.getElement();
    const svg = element?.ownerSVGElement;
    if (!element || !svg) return;
    const patternId = "rpg-exclusion-hatch";
    if (!svg.querySelector(`#${patternId}`)) {
      const namespace = "http://www.w3.org/2000/svg";
      const defs = document.createElementNS(namespace, "defs");
      const pattern = document.createElementNS(namespace, "pattern");
      pattern.setAttribute("id", patternId);
      pattern.setAttribute("width", "10");
      pattern.setAttribute("height", "10");
      pattern.setAttribute("patternUnits", "userSpaceOnUse");
      pattern.setAttribute("patternTransform", "rotate(35)");
      const background = document.createElementNS(namespace, "rect");
      background.setAttribute("width", "10");
      background.setAttribute("height", "10");
      background.setAttribute("fill", "#d52d2d");
      background.setAttribute("fill-opacity", "0.18");
      const stripe = document.createElementNS(namespace, "line");
      stripe.setAttribute("x1", "0");
      stripe.setAttribute("y1", "0");
      stripe.setAttribute("x2", "0");
      stripe.setAttribute("y2", "10");
      stripe.setAttribute("stroke", "#c51f1f");
      stripe.setAttribute("stroke-width", "4");
      pattern.append(background, stripe);
      defs.append(pattern);
      svg.prepend(defs);
    }
    element.setAttribute("fill", `url(#${patternId})`);
    element.setAttribute("fill-opacity", "1");
  }

  #site(site) {
    const entry = this.dynamicSites.get(site.id);
    const center = asLatLng(site.position);
    const presentation = dynamicSitePresentation(site);
    const iconSize = presentation.iconSize;
    const icon = L.divIcon({
      className: "dynamic-marker is-battlefield",
      html: "<span>⚔</span>",
      iconSize: [iconSize, iconSize],
      iconAnchor: [iconSize / 2, iconSize / 2],
    });
    if (!entry) {
      const marker = L.marker(center, {
        pane: presentation.pane,
        zIndexOffset: presentation.zIndexOffset,
        icon,
        interactive: false,
        keyboard: false,
        title: "Trace d’un champ de bataille",
      })
        .addTo(this.map)
        .bindTooltip("Trace d’un champ de bataille");
      this.dynamicSites.set(site.id, { marker });
    } else entry.marker.setLatLng(center).setIcon(icon);
  }

  #heatmap(cells, visible) {
    this.heatmap.clearLayers();
    if (!visible || cells.length === 0) return;
    const maximum = Math.max(1, ...cells.map((cell) => cell.activity));
    cells.forEach((cell) => {
      const intensity = cell.activity / maximum;
      const signal = cell.questSignal ?? 0;
      const color =
        signal > 0
          ? signal >= 0.99
            ? "#d06cff"
            : "#7159d9"
          : intensity === 0
            ? "#5b7560"
            : intensity < 0.34
              ? "#59b9ff"
              : intensity < 0.67
                ? "#f6d971"
                : "#ff635e";
      L.rectangle(cell.bounds.map(asLatLng), {
        color,
        weight: signal > 0 ? 2 : 1,
        opacity: 0.48,
        fillColor: color,
        fillOpacity:
          signal > 0
            ? 0.12 + signal * 0.28
            : intensity === 0
              ? 0.035
              : 0.08 + intensity * 0.28,
        interactive: false,
      }).addTo(this.heatmap);
      if (cell.visits > 0)
        L.marker(asLatLng(cell.center), {
          interactive: false,
          icon: L.divIcon({
            className: "heatmap-count",
            html: `<span>${cell.visits}</span>`,
            iconSize: [22, 18],
            iconAnchor: [11, 9],
          }),
        }).addTo(this.heatmap);
    });
  }

  #removeMissing(collection, ids) {
    for (const [id, layer] of collection)
      if (!ids.has(id)) {
        if (layer.marker) {
          layer.marker.remove();
          layer.radius?.remove();
        } else layer.remove();
        collection.delete(id);
      }
  }
}

export function dynamicSitePresentation() {
  return {
    iconSize: 52,
    interactionRadius: 0,
    pane: MapLayers.EFFECTS,
    zIndexOffset: 2500,
  };
}

export function endpointTraces(traces) {
  const groups = new Map();
  traces.forEach((trace) => {
    if (!groups.has(trace.groupId)) groups.set(trace.groupId, []);
    groups.get(trace.groupId).push(trace);
  });
  return [...groups.values()].flatMap((entries) => {
    const ordered = entries.sort((left, right) => left.createdAt - right.createdAt);
    return ordered.length === 1 ? ordered : [ordered[0], ordered.at(-1)];
  });
}

function asLatLng(position) {
  return Array.isArray(position)
    ? position
    : [position.latitude, position.longitude];
}
function toPosition(point) {
  return { latitude: point.lat, longitude: point.lng };
}
