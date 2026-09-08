import { PlayArea } from "../core/play-area.js";

export class LobbyTerrainView {
  constructor(root, { onSave } = {}) {
    this.root = root;
    this.onSave = onSave;
    this.map = null;
    this.areaLayer = null;
    this.pointLayers = [];
    this.points = [];
    this.isHost = false;
    this.savedSignature = "";
  }

  initialize() {
    this.button("#lobby-terrain-open").addEventListener("click", () =>
      this.openMap(),
    );
    this.button("#lobby-terrain-locate").addEventListener("click", () =>
      this.locate(),
    );
    this.button("#lobby-terrain-undo").addEventListener("click", () => {
      this.points.pop();
      this.draw();
    });
    this.button("#lobby-terrain-clear").addEventListener("click", () => {
      this.points = [];
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
    this.isHost = currentPlayer?.isHost === true;
    const saved = lobby.playArea?.polygon ?? [];
    const signature = JSON.stringify(saved);
    if (signature !== this.savedSignature) {
      this.savedSignature = signature;
      this.points = saved.map(copyPoint);
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
        ? `Zone validée · ${saved.length} points. Toute modification annulera l’état prêt.`
        : this.isHost
          ? "Tracez au moins trois points sur la carte, puis validez la zone."
          : "L’organisateur doit encore définir la zone GPS.",
    );
  }

  openMap() {
    const container = this.root.querySelector("#lobby-terrain-map");
    container.hidden = false;
    this.root.querySelector("#lobby-terrain-edit-actions").hidden = !this.isHost;
    this.ensureMap();
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
    this.map.on("click", ({ latlng }) => {
      if (!this.isHost || this.points.length >= 50) return;
      this.points.push({ latitude: latlng.lat, longitude: latlng.lng });
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
      });
      if (area.getAreaSquareMeters() <= 0)
        throw new Error("La zone doit avoir une surface positive.");
      this.setBusy(true);
      await this.onSave?.(area.toJSON());
    } catch (error) {
      this.setStatus(error.message);
    } finally {
      this.setBusy(false);
    }
  }

  draw() {
    if (!this.map) return;
    this.areaLayer?.remove();
    this.pointLayers.forEach((layer) => layer.remove());
    this.pointLayers = this.points.map((point) =>
      L.circleMarker(asLatLng(point), {
        radius: 6,
        color: "#ffe083",
        fillColor: "#17351d",
        fillOpacity: 1,
      }).addTo(this.map),
    );
    this.areaLayer =
      this.points.length >= 3
        ? L.polygon(this.points.map(asLatLng), {
            color: "#78e08f",
            fillOpacity: 0.18,
          }).addTo(this.map)
        : this.points.length === 2
          ? L.polyline(this.points.map(asLatLng), { color: "#78e08f" }).addTo(
              this.map,
            )
          : null;
    this.button("#lobby-terrain-undo").disabled = this.points.length === 0;
    this.button("#lobby-terrain-clear").disabled = this.points.length === 0;
    this.button("#lobby-terrain-save").disabled = this.points.length < 3;
    if (this.isHost)
      this.setStatus(
        `${this.points.length} point(s) placé(s)${this.points.length < 3 ? " · minimum 3" : " · zone prête à valider"}.`,
      );
  }

  setBusy(busy) {
    this.button("#lobby-terrain-save").disabled =
      busy || this.points.length < 3;
  }

  setStatus(message) {
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
