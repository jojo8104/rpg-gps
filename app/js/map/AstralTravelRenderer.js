import { MapLayers } from "./MapLayers.js";
import { heroPoseStyle } from "./hero-sprite-atlas.js";
import { heroSprite } from "./UnitRenderer.js";
import { AstralGhostDrag, astralScreenPoint } from "./AstralGhostDrag.js";

/** Effet visuel : le serveur décide des cibles, de la durée et des actions. */
export class AstralTravelRenderer {
  constructor(map, onTarget) {
    this.map = map;
    this.onTarget = onTarget;
    map.on("unload", () => this.clear());
  }
  clear() {
    clearTimeout(this.timer);
    this.ghostDrag?.dispose();
    this.ghostDrag = null;
    this.dragging = false;
    this.marker?.remove();
    this.circle?.remove();
    this.marker = this.circle = null;
  }
  render(travel, position, targets, gender = null) {
    this.targets = targets;
    if (!travel || Date.now() >= travel.expiresAt) return this.clear();
    const center = [
      position.latitude ?? position[0],
      position.longitude ?? position[1],
    ];
    if (this.activation !== travel.activatedAt) this.clear();
    this.activation = travel.activatedAt;
    if (!this.circle) {
      this.circle = L.circle(center, {
        pane: MapLayers.EXPLORATION,
        radius: travel.reachBonus,
        color: "#ff29ed",
        weight: 4,
        fillColor: "#b533ff",
        fillOpacity: 0.16,
        interactive: false,
      }).addTo(this.map);
      this.marker = L.marker(center, {
        pane: MapLayers.UNITS,
        draggable: false,
        opacity: this.map.getContainer ? 0 : 1,
        zIndexOffset: 2200,
        icon: L.divIcon({
          className: "astral-hero-marker",
          html: heroSprite("mage", gender),
          iconSize: [56, 72],
          iconAnchor: [28, 78],
        }),
      })
        .addTo(this.map)
        .bindTooltip("Projection astrale · glissez vers une cible", {
          direction: "top",
        });
      this.marker
        .getElement()
        ?.querySelectorAll(".rpg-hero-pose")
        .forEach((pose, step) =>
          Object.assign(pose.style, heroPoseStyle(4, step, "mage", gender)),
        );
      this.marker.on("dragstart", () => {
        this.dragging = true;
      });
      this.marker.on("astraldragcancel", () => {
        this.dragging = false;
      });
      this.marker.on("dragend", async (event = {}) => {
        this.dragging = false;
        if (this.busy || !this.marker) return;
        const dropped =
          event.dropPoint ??
          astralScreenPoint(this.map, this.marker.getLatLng());
        const closest = this.targets
          .map((target) => ({
            target,
            point: astralScreenPoint(
              this.map,
              Array.isArray(target.position)
                ? target.position
                : [target.position.latitude, target.position.longitude],
            ),
          }))
          .map((entry) => ({
            ...entry,
            distance: Math.hypot(
              dropped.x - entry.point.x,
              dropped.y - entry.point.y,
            ),
          }))
          .sort((a, b) => a.distance - b.distance)[0];
        if (!closest || closest.distance > 48) {
          this.marker.setLatLng(this.center);
          this.ghostDrag?.render();
          return;
        }
        this.busy = true;
        try {
          await this.onTarget(closest.target);
        } finally {
          this.busy = false;
          this.marker?.setLatLng(this.anchor ?? this.center);
          this.ghostDrag?.render();
        }
      });
      if (this.map.getContainer)
        this.ghostDrag = new AstralGhostDrag(this.map, this.marker, {
          gender,
          center,
          radius: travel.reachBonus,
        });
    }
    this.center = center;
    if (this.ghostDrag)
      this.ghostDrag.bounds = { center, radius: travel.reachBonus };
    this.circle.setLatLng(center).setRadius(travel.reachBonus);
    if (!this.dragging) {
      const anchor = travel.targetPosition;
      this.anchor = anchor ? [anchor.latitude, anchor.longitude] : center;
      this.marker.setLatLng(this.anchor);
      this.ghostDrag?.render();
    }
    this.ghostDrag?.render();
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.clear(),
      Math.max(0, travel.expiresAt - Date.now()),
    );
  }
}
