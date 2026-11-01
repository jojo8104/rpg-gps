import { createTerrainVertex } from "./terrain-vertex.js";
import { createTerrainMapWindow } from "./terrain-map-window.js";
import { PlayArea } from "../core/play-area.js";
import { PlayAreaGrid } from "../core/play-area-grid.js";
import { createMapPreparationControls } from "../map/MapPreparationControls.js";
import { formatTerrainOutline } from "./terrain-measurements.js";
import { mountSavedMapLibrary } from "./saved-map-library-view.js";

export class LobbyTerrainView {
  constructor(root, { onSave, client } = {}) {
    this.root = root;
    this.onSave = onSave;
    this.client = client;
    this.map = null;
    this.areaLayer = null;
    this.pointLayers = [];
    this.points = [];
    this.excludedPolygons = [];
    this.exclusionDraft = null;
    this.overlayLayers = [];
    this.isHost = false;
    this.savedSignature = "";
  }

  initialize() {
    this.mapWindow = createTerrainMapWindow(this.root, {
      onResize: () => this.map?.invalidateSize(),
    });
    if (this.client)
      this.library = mountSavedMapLibrary({
        window: this.mapWindow,
        client: this.client,
        canEdit: () => this.isHost,
        getArea: () => {
          if (this.exclusionDraft !== null)
            throw new Error(
              "Terminez le tracé de l’exclusion avant de sauvegarder la carte.",
            );
          return new PlayArea({
            id: "saved-area",
            name: "Carte",
            polygon: this.points,
            excludedPolygons: this.excludedPolygons,
          }).toJSON();
        },
        selectArea: (area) => {
          if (!this.isHost) return;
          this.points = area.polygon.map(copyPoint);
          this.excludedPolygons = (area.excludedPolygons ?? []).map((polygon) =>
            polygon.map(copyPoint),
          );
          this.exclusionDraft = null;
          this.draw();
          this.map?.fitBounds(this.points.map(asLatLng), { padding: [20, 20] });
        },
      });
    this.button("#lobby-exclusion-start").addEventListener("click", () => {
      this.exclusionDraft = [];
      this.draw();
    });
    this.button("#lobby-exclusion-finish").addEventListener("click", () => {
      try {
        new PlayArea({
          id: "preview",
          name: "Zone",
          polygon: this.points,
          excludedPolygons: [...this.excludedPolygons, this.exclusionDraft],
        });
        this.excludedPolygons.push(this.exclusionDraft);
        this.exclusionDraft = null;
        this.draw();
      } catch (error) {
        this.setStatus(error.message);
      }
    });
    this.button("#lobby-exclusion-clear").addEventListener("click", () => {
      this.excludedPolygons = [];
      this.exclusionDraft = null;
      this.draw();
    });
    this.button("#lobby-terrain-open").addEventListener("click", () =>
      this.openMap(),
    );
    this.button("#lobby-terrain-locate").addEventListener("click", () =>
      this.locate(),
    );
    this.button("#lobby-terrain-undo").addEventListener("click", () => {
      if (this.exclusionDraft) this.exclusionDraft.pop();
      else this.points.pop();
      this.draw();
    });
    this.button("#lobby-terrain-clear").addEventListener("click", () => {
      this.points = [];
      this.excludedPolygons = [];
      this.exclusionDraft = null;
      this.draw();
    });
    this.button("#lobby-terrain-save").addEventListener("click", () =>
      this.save(),
    );
  }

  render(lobby, currentPlayer) {
    const gps = lobby.configuration?.positionMode === "gps";
    this.root.hidden = !gps;
    if (!gps) return;
    this.isHost =
      currentPlayer?.isHost === true &&
      lobby.status === "waiting" &&
      !lobby.resume;
    const saved = lobby.playArea?.polygon ?? [];
    const signature = JSON.stringify(lobby.playArea ?? null);
    if (signature !== this.savedSignature) {
      this.savedSignature = signature;
      this.points = saved.map(copyPoint);
      this.excludedPolygons = (lobby.playArea?.excludedPolygons ?? []).map(
        (polygon) => polygon.map(copyPoint),
      );
      this.exclusionDraft = null;
      this.draw();
    }
    const hasArea = saved.length >= 3;
    this.button("#lobby-terrain-open").textContent = this.isHost
      ? hasArea
        ? "Modifier la zone"
        : "Tracer la zone"
      : "Voir la zone";
    this.button("#lobby-terrain-open").disabled = !this.isHost && !hasArea;
    this.button("#lobby-terrain-locate").hidden = !this.isHost;
    this.root.querySelector("#lobby-terrain-edit-actions").hidden =
      !this.isHost || this.root.querySelector("#lobby-terrain-map").hidden;
    this.setStatus(
      hasArea
        ? `Zone validée · ${Math.round(new PlayArea(lobby.playArea).getAreaSquareMeters()).toLocaleString("fr-FR")} m² · ${formatTerrainOutline(saved)} · ${this.excludedPolygons.length} exclusion(s).`
        : this.isHost
          ? "Tracez au moins trois points sur la carte, puis validez la zone."
          : "L’organisateur doit encore définir la zone GPS.",
    );
    if (this.map) this.draw();
  }

  openMap() {
    this.mapWindow?.open();
    const container = this.root.querySelector("#lobby-terrain-map");
    container.hidden = false;
    this.root.querySelector("#lobby-terrain-edit-actions").hidden =
      !this.isHost;
    this.ensureMap();
    if (!this.map) return;
    setTimeout(() => {
      this.map.invalidateSize();
      if (this.points.length >= 3)
        this.map.fitBounds(this.points.map(asLatLng), { padding: [20, 20] });
    }, 0);
  }

  ensureMap() {
    if (this.map) return;
    if (typeof globalThis.L !== "object") {
      this.setStatus("La carte OpenStreetMap n’est pas disponible.");
      return;
    }
    this.map = L.map(this.root.querySelector("#lobby-terrain-map"), {
      zoomControl: true,
    }).setView([48.8566, 2.3522], 13);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(this.map);
    createMapPreparationControls(this.map, {
      container: this.root.querySelector("#lobby-terrain-position-controls"),
      leadingControl: this.button("#lobby-terrain-locate"),
    });
    this.map.on("click", ({ latlng }) => {
      const target = this.exclusionDraft ?? this.points;
      if (!this.isHost || target.length >= 50) return;
      target.push({ latitude: latlng.lat, longitude: latlng.lng });
      this.draw();
    });
    this.draw();
  }

  locate() {
    this.openMap();
    if (!navigator.geolocation) {
      this.setStatus("La géolocalisation n’est pas disponible.");
      return;
    }
    this.setStatus("Recherche de votre position…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.map?.setView([coords.latitude, coords.longitude], 17);
        this.setStatus("Touchez la carte pour poser les sommets de la zone.");
      },
      () => this.setStatus("Position refusée ou indisponible."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async save() {
    try {
      const area = new PlayArea({
        id: "lobby-area-preview",
        name: "Zone GPS multijoueur",
        polygon: this.points,
        excludedPolygons: this.excludedPolygons,
      });
      if (area.getAreaSquareMeters() <= 0)
        throw new Error("La zone doit avoir une surface positive.");
      this.setBusy(true);
      await this.onSave?.(area.toJSON());
      this.mapWindow?.close();
    } catch (error) {
      this.setStatus(error.message);
    } finally {
      this.setBusy(false);
    }
  }

  draw() {
    if (!this.map) return;
    this.areaLayer?.remove();
    this.overlayLayers.forEach((layer) => layer.remove());
    this.overlayLayers = [];
    this.pointLayers.forEach((layer) => layer.remove());
    this.pointLayers = [];
    const addVertices = (points, exclusion = false) =>
      points.forEach((point) =>
        this.pointLayers.push(
          createTerrainVertex(L, this.map, point, {
            editable: this.isHost,
            exclusion,
            onMove: (position) => {
              Object.assign(point, position);
              this.draw();
            },
          }),
        ),
      );
    addVertices(this.points);
    this.excludedPolygons.forEach((polygon) => addVertices(polygon, true));
    if (this.exclusionDraft) addVertices(this.exclusionDraft, true);
    this.areaLayer =
      this.points.length >= 3
        ? L.polygon(this.points.map(asLatLng), {
            color: "#c69b38",
            fillOpacity: 0.18,
          }).addTo(this.map)
        : this.points.length === 2
          ? L.polyline(this.points.map(asLatLng), { color: "#c69b38" }).addTo(
              this.map,
            )
          : null;
    let areaText = "";
    if (this.points.length >= 3) {
      try {
        const area = new PlayArea({
          id: "preview",
          name: "Zone",
          polygon: this.points,
          excludedPolygons: this.excludedPolygons,
        });
        areaText = ` · ${Math.round(area.getAreaSquareMeters()).toLocaleString("fr-FR")} m²`;
        areaText += ` · ${formatTerrainOutline(this.points)}`;
        const grid = new PlayAreaGrid({ playArea: area, cellSizeMeters: 100 });
        for (const cell of grid.cells)
          this.overlayLayers.push(
            L.rectangle(cell.bounds.map(asLatLng), {
              color: "#f4e0ac",
              weight: 1,
              fill: false,
              interactive: false,
            }).addTo(this.map),
          );
        areaText += " · quadrillage 100 m";
      } catch (error) {
        areaText += ` · ${error.message}`;
      }
    }
    for (const polygon of [
      ...this.excludedPolygons,
      ...(this.exclusionDraft?.length ? [this.exclusionDraft] : []),
    ]) {
      this.overlayLayers.push(
        L.polygon(polygon.map(asLatLng), {
          color: "#cc4444",
          fillOpacity: 0.3,
        }).addTo(this.map),
      );
    }
    this.button("#lobby-exclusion-start").disabled =
      this.points.length < 3 || this.exclusionDraft !== null;
    this.button("#lobby-exclusion-finish").disabled =
      !this.exclusionDraft || this.exclusionDraft.length < 3;
    this.button("#lobby-terrain-undo").disabled =
      (this.exclusionDraft ?? this.points).length === 0;
    this.button("#lobby-terrain-clear").disabled = this.points.length === 0;
    this.button("#lobby-terrain-save").disabled =
      this.points.length < 3 || this.exclusionDraft !== null;
    if (this.isHost)
      this.setStatus(
        `${this.points.length} point(s)${areaText}${this.exclusionDraft !== null ? " · Tracé d’exclusion : touchez la carte puis fermez l’exclusion." : this.points.length < 3 ? " · minimum 3" : " · zone prête à valider"}`,
      );
  }

  setBusy(busy) {
    this.button("#lobby-terrain-save").disabled =
      busy || this.points.length < 3;
  }

  closeMap() {
    this.mapWindow?.close();
  }

  setStatus(message) {
    this.mapWindow?.setStatus(message);
    this.root.querySelector("#lobby-terrain-status").textContent = message;
  }

  button(selector) {
    return this.root.querySelector(selector);
  }
}

function asLatLng(point) {
  return [point.latitude, point.longitude];
}

function copyPoint(point) {
  return { latitude: point.latitude, longitude: point.longitude };
}
