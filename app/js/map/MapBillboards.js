import { projectCameraPoint } from "./camera-geometry.js";
import { heroPoseStyle } from "./hero-sprite-atlas.js";
import { caravanPoseStyle } from "./caravan-sprite.js";
import { autonomousGroupPoseStyle } from "./autonomous-group-sprite.js";
import { locationCameraLayout } from "./location-camera-layout.js";

export function markerZoomScale(zoom, simulation = false) {
  return Math.max(
    0.28,
    Math.min(1.6, 2 ** ((zoom - (simulation ? 1.5 : 18)) / 2)),
  );
}

export function heroViewFrame(heading, yaw) {
  return Math.round(((((heading - yaw) % 360) + 360) % 360) / 45) % 8;
}

/** Illustrations face à l'écran, ancrées aux positions officielles des marqueurs. */
export class MapBillboards {
  constructor(map) {
    this.map = map;
    this.entries = new Map();
    this.root = L.DomUtil.create(
      "div",
      "rpg-map-billboards",
      map.getContainer(),
    );
    this.heroesRoot = L.DomUtil.create(
      "div",
      "rpg-map-billboards rpg-map-heroes",
      map.getContainer(),
    );
    this.update = () => this.render();
    map.on("move zoom resize camerachange", this.update);
    map.on("unload", () => this.dispose());
  }
  set(id, options) {
    let entry = this.entries.get(id);
    if (!entry) {
      const element = document.createElement(
        options.onClick ? "button" : "div",
      );
      if (options.onClick) {
        element.type = "button";
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          options.onClick();
        });
      }
      element.className = `rpg-billboard leaflet-marker-icon is-${options.kind}${options.kind === "hero" ? (options.remote ? " rpg-remote-hero-host" : " rpg-hero-marker-host") : ""}`;
      (options.kind === "hero" ? this.heroesRoot : this.root).append(element);
      entry = { element };
      this.entries.set(id, entry);
    }
    if (entry.html !== options.html) {
      entry.element.innerHTML = options.html;
      entry.direction = undefined;
    }
    Object.assign(entry, options);
    this.renderEntry(entry);
  }
  remove(id) {
    this.entries.get(id)?.element.remove();
    this.entries.delete(id);
  }
  render() {
    for (const entry of this.entries.values()) this.renderEntry(entry);
  }
  renderEntry(entry) {
    const frame = this.map.getCameraFrame?.() ?? {
      size: this.map.getSize(),
      yaw: 0,
      pitch: 0,
    };
    const anchor = this.map.latLngToContainerPoint(entry.marker.getLatLng());
    let point = projectCameraPoint(anchor, frame);
    const scale = markerZoomScale(
      this.map.getZoom(),
      this.map.options.crs === L.CRS.Simple,
    );
    if (entry.kind === "location") {
      const layout = locationCameraLayout(anchor, frame, scale);
      point = layout.point;
      entry.element.style.setProperty("--place-label-y", layout.labelY + "px");
      entry.element.style.setProperty("--place-label-x", layout.labelX + "px");
    }
    entry.element.style.transform = `translate(${point.x}px, ${point.y}px) scale(${scale})`;
    entry.element.style.zIndex = String(Math.round(point.y));
    entry.element.hidden = !point.visible;
    if (entry.remote) {
      entry.element.classList.toggle("is-offline", entry.offline === true);
      entry.element.classList.toggle("is-red", entry.teamColor === "red");
      entry.element.classList.toggle("is-green", entry.teamColor === "green");
    }
    const ground = entry.marker
      .getElement()
      ?.querySelector(".rpg-location-ground");
    if (ground) ground.style.scale = String(scale);
    if (entry.label) entry.element.setAttribute("aria-label", entry.label);
    if (
      entry.kind === "hero" ||
      entry.kind === "caravan" ||
      entry.kind === "group"
    ) {
      const direction = heroViewFrame(entry.heading ?? 0, frame.yaw);
      entry.element.classList.toggle("is-walking", entry.walking === true);
      entry.element.style.setProperty(
        "--hero-shadow-flatten",
        String(Math.cos((frame.pitch * Math.PI) / 180)),
      );
      const poseKey = `${direction}:${entry.spriteKind ?? entry.classId ?? "warrior"}:${entry.gender ?? ""}`;
      if (entry.direction !== poseKey) {
        entry.element
          .querySelectorAll(".rpg-hero-pose")
          .forEach((pose, step) =>
            Object.assign(
              pose.style,
              entry.kind === "group"
                ? autonomousGroupPoseStyle(entry.spriteKind, direction, step)
                : entry.kind === "caravan"
                  ? caravanPoseStyle(direction, step)
                  : heroPoseStyle(direction, step, entry.classId, entry.gender),
            ),
          );
        entry.direction = poseKey;
      }
    }
  }
  dispose() {
    this.map.off("move zoom resize camerachange", this.update);
    this.entries.clear();
    this.root.remove();
    this.heroesRoot.remove();
  }
}
