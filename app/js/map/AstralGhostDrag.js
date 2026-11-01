import { projectCameraPoint, unprojectCameraPoint } from "./camera-geometry.js";
import { heroPoseStyle } from "./hero-sprite-atlas.js";
import { heroSprite } from "./UnitRenderer.js";

export function astralScreenPoint(map, position) {
  const point = map.latLngToContainerPoint(position);
  const frame = map.getCameraFrame?.();
  return frame ? projectCameraPoint(point, frame) : point;
}

/** Borne visuelle du geste dans le cercle officiel ; le serveur valide encore la cible. */
export function clampAstralPosition(map, center, position, radius) {
  if (map.distance(center, position) <= radius) return position;
  const start = map.project(center),
    end = map.project(position);
  let low = 0,
    high = 1;
  for (let step = 0; step < 32; step++) {
    const fraction = (low + high) / 2;
    const candidate = map.unproject(
      L.point({
        x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction,
      }),
    );
    if (map.distance(center, candidate) <= radius) low = fraction;
    else high = fraction;
  }
  return map.unproject(
    L.point({
      x: start.x + (end.x - start.x) * low,
      y: start.y + (end.y - start.y) * low,
    }),
  );
}

/** Poignée à l'écran : aucune modification de la position du héros réel. */
export class AstralGhostDrag {
  constructor(map, marker, bounds) {
    this.bounds = bounds;
    this.map = map;
    this.marker = marker;
    this.container = map.getContainer();
    this.element = document.createElement("div");
    this.element.className = "astral-ghost-handle astral-hero-marker";
    this.element.setAttribute(
      "aria-label",
      "Fantôme astral : maintenir et glisser vers une cible",
    );
    this.element.innerHTML = `${heroSprite("mage", bounds.gender)}<span class="astral-drag-hint">↔ Glisser</span>`;
    this.element
      .querySelectorAll(".rpg-hero-pose")
      .forEach((pose, step) =>
        Object.assign(
          pose.style,
          heroPoseStyle(4, step, "mage", bounds.gender),
        ),
      );
    this.container.append(this.element);
    this.handlers = {
      pointerdown: (event) => this.start(event),
      pointermove: (event) => this.move(event),
      pointerup: (event) => this.finish(event),
      pointercancel: (event) => this.finish(event),
      lostpointercapture: (event) => this.finish(event),
      click: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
    };
    for (const [type, handler] of Object.entries(this.handlers))
      this.element.addEventListener(type, handler);
    this.update = () => this.render();
    map.on("move zoom resize camerachange", this.update);
    this.render();
  }
  screen(event) {
    const bounds = this.container.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }
  start(event) {
    if (
      this.pointerId != null ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.map.stop?.();
    this.pointerId = event.pointerId;
    this.origin = this.marker.getLatLng();
    this.startPoint = this.screen(event);
    this.startAnchor = astralScreenPoint(this.map, this.origin);
    this.element.setPointerCapture(event.pointerId);
    this.element.classList.add("is-dragging");
    this.marker.fire("dragstart");
  }
  move(event) {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = this.screen(event);
    const anchor = {
      x: this.startAnchor.x + point.x - this.startPoint.x,
      y: this.startAnchor.y + point.y - this.startPoint.y,
    };
    const frame = this.map.getCameraFrame?.();
    const ground = frame ? unprojectCameraPoint(anchor, frame) : anchor;
    const proposed = this.map.containerPointToLatLng(L.point(ground));
    const bounded = this.bounds
      ? clampAstralPosition(
          this.map,
          this.bounds.center,
          proposed,
          this.bounds.radius,
        )
      : proposed;
    this.marker.setLatLng(bounded);
    this.dropPoint =
      this.bounds && this.map.distance(proposed, bounded) > 0.000001
        ? astralScreenPoint(this.map, bounded)
        : point;
    this.render();
  }
  finish(event) {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const cancelled =
      event.type === "pointercancel" || event.type === "lostpointercapture";
    if (cancelled) this.marker.setLatLng(this.origin);
    else this.move(event);
    this.pointerId = null;
    if (this.element.hasPointerCapture(event.pointerId))
      this.element.releasePointerCapture(event.pointerId);
    this.element.classList.remove("is-dragging");
    if (cancelled) this.marker.fire("astraldragcancel");
    else
      this.marker.fire("dragend", {
        dropPoint: this.dropPoint ?? this.screen(event),
      });
    this.render();
  }
  render() {
    if (this.bounds)
      this.marker.setLatLng(
        clampAstralPosition(
          this.map,
          this.bounds.center,
          this.marker.getLatLng(),
          this.bounds.radius,
        ),
      );
    const point = astralScreenPoint(this.map, this.marker.getLatLng());
    this.element.style.transform = `translate(${point.x}px, ${point.y}px)`;
  }
  dispose() {
    this.pointerId = null;
    this.map.off("move zoom resize camerachange", this.update);
    for (const [type, handler] of Object.entries(this.handlers))
      this.element.removeEventListener(type, handler);
    this.element.remove();
  }
}
