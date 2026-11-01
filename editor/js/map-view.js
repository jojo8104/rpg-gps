const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const coords = (p) => [p.latitude, p.longitude];
const position = (p) => ({
  latitude: Number(p.lat.toFixed(7)),
  longitude: Number(p.lng.toFixed(7)),
});
// Leaflet assure la présentation ; le serveur reste responsable des placements.
export function createMapView({
  canvas,
  getProject,
  getSelection,
  select,
  changed,
  notify,
  leaflet = globalThis.L,
}) {
  if (!leaflet)
    throw new Error(
      "Leaflet indisponible : rechargez avec une connexion réseau.",
    );
  const view = getProject().editor.map;
  const map = leaflet.map(canvas.querySelector("#editor-leaflet-map"), {
    center: coords(view),
    zoom: view.zoom,
    minZoom: 3,
    maxZoom: 19,
    zoomControl: false,
    doubleClickZoom: false,
  });
  const background = leaflet
    .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
    .addTo(map);
  const layers = leaflet.layerGroup().addTo(map);
  leaflet.control.scale({ imperial: false }).addTo(map);
  let mode = null,
    polygon = [],
    syncing = false;
  map.on("moveend", () => {
    const c = map.getCenter();
    Object.assign(getProject().editor.map, {
      latitude: c.lat,
      longitude: c.lng,
      zoom: map.getZoom(),
    });
    document.querySelector("#map-latitude").value = c.lat.toFixed(6);
    document.querySelector("#map-longitude").value = c.lng.toFixed(6);
    document.querySelector("#map-zoom-label").textContent = map.getZoom();
    if (!syncing) changed(false);
  });
  function place(id, p) {
    const project = getProject(),
      location = project.world.locations.find((l) => l.id === id),
      slot = project.world.locationSlots.find((s) => s.id === id);
    if (!location || !slot) return;
    location.position = position(p);
    slot.defaultPlacement = {
      strategy: "fixed",
      position: { ...location.position },
    };
    changed(true);
  }
  map.on("click", (event) => {
    if (mode) {
      polygon.push(position(event.latlng));
      render();
      return;
    }
    const selected = getSelection();
    if (selected?.kind === "location") place(selected.id, event.latlng);
  });
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      mode = null;
      polygon = [];
      render();
    }
  });
  function render() {
    const project = getProject(),
      area = project.world.playArea,
      selected = getSelection(),
      view = project.editor.map;
    syncing = true;
    map.invalidateSize({ pan: false });
    const c = map.getCenter();
    if (
      Math.abs(c.lat - view.latitude) > 1e-8 ||
      Math.abs(c.lng - view.longitude) > 1e-8 ||
      map.getZoom() !== view.zoom
    )
      map.setView(coords(view), view.zoom, { animate: false });
    syncing = false;
    document.querySelector("#map-zoom-label").textContent = map.getZoom();
    document.querySelector("#map-summary").textContent = area
      ? `${area.name} · ${area.polygon.length} sommets · ${area.excludedPolygons?.length ?? 0} exclusion(s)`
      : "Tracez une play area pour préparer votre scénario.";
    document.querySelector("#finish-polygon").hidden = !mode;
    document
      .querySelector("#area-tool")
      .classList.toggle("primary", mode === "area");
    document
      .querySelector("#exclusion-tool")
      .classList.toggle("primary", mode === "exclusion");
    document.querySelector("#map-note").textContent = mode
      ? "Cliquez pour tracer les sommets, puis Terminer le tracé. Échap pour annuler."
      : selected?.kind === "location"
        ? "Cliquez pour placer ce lieu ; glissez son marqueur pour l’ajuster."
        : "Déplacez et zoomez la carte ; Play area permet de tracer le terrain.";
    layers.clearLayers();
    if (area) {
      leaflet
        .polygon(area.polygon.map(coords), {
          color: "#a7dd6f",
          fillOpacity: 0.12,
          interactive: false,
        })
        .addTo(layers);
      for (const entries of area.excludedPolygons ?? [])
        leaflet
          .polygon(entries.map(coords), {
            color: "#e59d98",
            fillOpacity: 0.25,
            dashArray: "5 4",
            interactive: false,
          })
          .addTo(layers);
    }
    if (polygon.length) {
      leaflet
        .polyline(polygon.map(coords), {
          color: "#c8ec9e",
          dashArray: "5 3",
          interactive: false,
        })
        .addTo(layers);
      for (const p of polygon)
        leaflet
          .circleMarker(coords(p), {
            radius: 4,
            color: "#c8ec9e",
            interactive: false,
          })
          .addTo(layers);
    }
    for (const location of project.world.locations.filter((l) => l.position)) {
      leaflet
        .circle(coords(location.position), {
          radius: location.interactionRadius ?? 25,
          color: "#8ab2c8",
          fillOpacity: 0.08,
          weight: 1,
          interactive: false,
        })
        .addTo(layers);
      const marker = leaflet
        .marker(coords(location.position), {
          draggable: !mode,
          bubblingMouseEvents: false,
          title: location.name,
          icon: leaflet.divIcon({
            className: "editor-place-marker",
            html: `<span class="${selected?.id === location.id ? "selected" : ""}">◇</span>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
        })
        .addTo(layers);
      marker.bindTooltip(escape(location.name), { direction: "right" });
      marker.on("click", () => {
        if (!mode) select({ kind: "location", id: location.id });
      });
      marker.on("dragend", () => place(location.id, marker.getLatLng()));
    }
  }
  return {
    render,
    zoom(delta) {
      map.setZoom(Math.max(3, Math.min(19, map.getZoom() + delta)));
    },
    center(latitude, longitude) {
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 85 ||
        Math.abs(longitude) > 180
      )
        return notify("Coordonnées invalides.", true);
      map.setView([latitude, longitude], map.getZoom());
    },
    fit() {
      const p = getProject(),
        points = [
          ...(p.world.playArea?.polygon ?? []),
          ...p.world.locations.filter((l) => l.position).map((l) => l.position),
        ];
      if (points.length)
        map.fitBounds(leaflet.latLngBounds(points.map(coords)), {
          padding: [50, 70],
          maxZoom: 19,
          animate: false,
        });
    },
    tiles(value) {
      if (value && !map.hasLayer(background)) background.addTo(map);
      else if (!value && map.hasLayer(background)) map.removeLayer(background);
    },
    startPolygon(kind) {
      if (kind === "exclusion" && !getProject().world.playArea)
        return notify("Tracez d’abord la play area.", true);
      mode = mode === kind ? null : kind;
      polygon = [];
      render();
    },
    finishPolygon() {
      if (polygon.length < 3)
        return notify("Ajoutez au moins trois sommets.", true);
      if (mode === "area")
        getProject().world.playArea = {
          id: "terrain-quete",
          name: "Terrain de la quête",
          polygon: structuredClone(polygon),
          excludedPolygons: [],
        };
      else if (mode === "exclusion") {
        getProject().world.playArea.excludedPolygons ??= [];
        getProject().world.playArea.excludedPolygons.push(
          structuredClone(polygon),
        );
      }
      mode = null;
      polygon = [];
      changed(true);
      render();
    },
  };
}
