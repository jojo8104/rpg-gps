import { createMapPackageClient } from "./map-package-client.js";
import { mapPackageKey } from "./map-package.js";
import { createGeographyLayer } from "./GeographyRenderer.js";
import { createMapPreparationControls } from "./MapPreparationControls.js";

/** Possède uniquement le fond et sa transition préparation/jeu. */
export class GameMapBackground {
  constructor({
    map,
    mode,
    preparationLayer,
    client = createMapPackageClient(),
    createLayer = createGeographyLayer,
    createSearch = createMapPreparationControls,
    schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  }) {
    this.map = map;
    this.mode = mode;
    this.preparationLayer = preparationLayer;
    this.client = client;
    this.createLayer = createLayer;
    this.schedule = schedule;
    this.key = null;
    this.revision = 0;
    this.layer = null;
    this.disposed = false;
    this.status = L.control({ position: "topright" });
    this.status.onAdd = () => {
      this.element = L.DomUtil.create("div", "rpg-map-download");
      this.element.setAttribute("role", "status");
      this.element.setAttribute("aria-live", "polite");
      L.DomEvent.disableClickPropagation(this.element);
      return this.element;
    };
    if (mode === "gps") this.search = createSearch(map);
    map.on("unload", () => {
      this.disposed = true;
      this.revision++;
    });
  }
  classicMapButton(revision) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Continuer avec la carte OSM";
    button.addEventListener("click", () => {
      if (this.disposed || revision !== this.revision) return;
      this.revision++;
      this.layer?.remove();
      this.layer = null;
      this.preparationLayer.addTo(this.map);
      this.status.remove();
    });
    return button;
  }
  sync({ setupActive = true, polygon = [] }) {
    if (setupActive || polygon.length < 3) {
      if (this.key !== null) {
        this.key = null;
        this.revision++;
        this.layer?.remove();
        this.layer = null;
        this.preparationLayer.addTo(this.map);
        this.status.remove();
        this.map.setMaxBounds(null);
        this.search?.addTo(this.map);
      }
      return;
    }
    const key = `${this.mode}:${mapPackageKey(polygon)}`;
    if (this.key === key) return;
    this.key = key;
    const revision = ++this.revision;
    this.search?.remove();
    this.layer?.remove();
    this.layer = null;
    // Conserver un fond visible pendant le téléchargement.
    this.preparationLayer.addTo(this.map);
    this.status.addTo(this.map);
    this.element.textContent =
      "Préparation de la carte 2D… jusqu’à 2 minutes si OSM est lent. Le fond actuel reste disponible.";
    if (this.mode === "gps")
      this.element.append(this.classicMapButton(revision));
    // La caméra définit une marge de navigation adaptée au viewport et au relief visuel.
    this.map.setMaxBounds(null);
    const task =
      this.mode === "gps"
        ? this.client.prepare(polygon)
        : Promise.resolve({ version: 1, features: [], cached: false });
    task
      .then((data) => {
        if (this.disposed || revision !== this.revision) return;
        this.layer = this.createLayer(this.map, data, {
          fictional: this.mode === "simulation",
          clipPolygon: this.mode === "gps" ? polygon : null,
        }).addTo(this.map);
        this.preparationLayer.remove();
        this.element.textContent =
          this.mode === "simulation"
            ? "Carte fictive 2D"
            : "Carte 2D chargée depuis le serveur";
        // Message accessible, sans masquer durablement la carte.
        this.schedule(() => {
          if (!this.disposed && revision === this.revision)
            this.status.remove();
        }, 5000);
      })
      .catch((error) => {
        if (this.disposed || revision !== this.revision) return;
        this.element.replaceChildren(document.createTextNode(error.message));
        const retry = document.createElement("button");
        retry.type = "button";
        retry.textContent = "Réessayer";
        retry.addEventListener("click", () => {
          this.key = null;
          this.sync({ setupActive: false, polygon });
        });
        this.element.append(retry);
        if (this.mode === "gps")
          this.element.append(this.classicMapButton(revision));
      });
  }
}
