import { heroPoseStyle } from "./hero-sprite-atlas.js";
import { MapLayers } from "./MapLayers.js";
import { armyBanner } from "./army-banner.js";
import { hasHeroMoved } from "./hero-motion.js";

export class UnitRenderer {
  constructor({ map, mode, onMove, billboards }) {
    this.map = map;
    this.mode = mode;
    this.onMove = onMove;
    this.billboards = billboards;
    this.heading = 0;
    this.marker = null;
    this.accuracy = null;
    this.animation = null;
    this.walking = false;
    map.on("unload", () => {
      cancelAnimationFrame(this.animation);
      clearTimeout(this.idleTimer);
    });
  }
  render(
    position,
    accuracy,
    heading,
    classId = this.classId ?? "warrior",
    armyUnits = this.armyUnits,
    gender = this.gender,
  ) {
    this.classId = classId;
    this.gender = gender;
    this.armyUnits = armyUnits;
    const target = asLatLng(position);
    if (!this.marker) {
      const icon = L.divIcon({
        className: "rpg-marker-host rpg-hero-marker-host",
        html: "",
        iconSize: [56, 56],
        iconAnchor: [28, 28],
      });
      this.marker = L.marker(target, {
        pane: MapLayers.UNITS,
        draggable: this.mode !== "gps",
        zIndexOffset: 1000,
        icon,
      }).addTo(this.map);
      this.lastTarget = target;
      if (this.mode !== "gps")
        this.marker.on("dragend", () =>
          this.onMove(toPosition(this.marker.getLatLng())),
        );
    } else this.#interpolateTo(target);
    this.setHeading(heading);
    if (this.mode === "gps" && Number.isFinite(accuracy)) {
      if (!this.accuracy)
        this.accuracy = L.circle(this.marker.getLatLng(), {
          pane: MapLayers.EXPLORATION,
          radius: accuracy,
          className: "rpg-gps-accuracy",
          interactive: false,
        }).addTo(this.map);
      else this.accuracy.setLatLng(this.marker.getLatLng()).setRadius(accuracy);
    }
  }
  setHeading(heading) {
    if (Number.isFinite(heading)) this.heading = heading;
    if (!this.marker) return;
    const direction = headingDirection(this.heading);
    this.billboards.set("hero", {
      marker: this.marker,
      kind: "hero",
      heading: this.heading,
      walking: this.walking,
      classId: this.classId,
      gender: this.gender,
      html: armyBanner(this.armyUnits) + heroSprite(this.classId, this.gender),
      label: `Héros orienté ${direction.label}`,
    });
  }
  #interpolateTo(target) {
    if (
      this.lastTarget?.[0] === target[0] &&
      this.lastTarget?.[1] === target[1]
    )
      return;
    if (hasHeroMoved(this.lastTarget, target, this.mode)) {
      clearTimeout(this.idleTimer);
      this.walking = true;
    }
    this.lastTarget = target;
    cancelAnimationFrame(this.animation);
    const start = this.marker.getLatLng();
    const began = performance.now();
    const duration = 650;
    const tick = (now) => {
      const t = Math.min(1, (now - began) / duration);
      const eased = 1 - (1 - t) ** 3;
      this.marker.setLatLng([
        start.lat + (target[0] - start.lat) * eased,
        start.lng + (target[1] - start.lng) * eased,
      ]);
      this.accuracy?.setLatLng(this.marker.getLatLng());
      this.billboards.render();
      if (t < 1) this.animation = requestAnimationFrame(tick);
      else if (this.walking) {
        this.idleTimer = setTimeout(() => {
          this.walking = false;
          this.setHeading(this.heading);
        }, 400);
      }
    };
    this.animation = requestAnimationFrame(tick);
  }
}
function asLatLng(value) {
  return Array.isArray(value) ? value : [value.latitude, value.longitude];
}
function toPosition(value) {
  return { latitude: value.lat, longitude: value.lng };
}

const DIRECTIONS = Object.freeze([
  { id: "n", angle: 0, label: "nord" },
  { id: "ne", angle: 45, label: "nord-est" },
  { id: "e", angle: 90, label: "est" },
  { id: "se", angle: 135, label: "sud-est" },
  { id: "s", angle: 180, label: "sud" },
  { id: "sw", angle: 225, label: "sud-ouest" },
  { id: "w", angle: 270, label: "ouest" },
  { id: "nw", angle: 315, label: "nord-ouest" },
]);

export function headingDirection(heading) {
  const normalized = ((heading % 360) + 360) % 360;
  return DIRECTIONS[Math.round(normalized / 45) % DIRECTIONS.length];
}

export function heroSprite(classId = "warrior", gender = null) {
  const poses = [0, 1, 2]
    .map((step) => {
      const style = Object.entries(heroPoseStyle(4, step, classId, gender))
        .map(
          ([key, value]) =>
            `${key.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase())}:${value}`,
        )
        .join(";");
      return `<span class="rpg-hero-pose" data-step="${step}" style='${style}'></span>`;
    })
    .join("");
  return `<span class="rpg-hero-foot-shadow" aria-hidden="true"></span><span class="rpg-hero-sprite" aria-hidden="true">${poses}</span>`;
}
