import {
  cameraDistance,
  normalizeYaw,
  clampPitch,
  unprojectCameraPoint,
  overviewZoom,
  twoPointerGesture,
  navigationBounds,
} from "./camera-geometry.js";

/** Caméra de présentation. La transformation CSS ne modifie pas les coordonnées. */
export class MapCamera {
  constructor(map, { mode, onHeroMove } = {}) {
    this.map = map;
    this.mode = mode;
    this.onHeroMove = onHeroMove;
    this.yaw = 0;
    this.pitch = 0;
    this.heading = 0;
    this.followHeading = false;
    this.enabled = false;
    this.polygon = [];
    this.points = new Map();
    this.gesture = null;
    this.previousMinZoom = map.getMinZoom();
    this.container = map.getContainer();
    this.world = L.DomUtil.create("div", "rpg-camera-world", this.container);
    this.world.append(map.getPane("mapPane"));
    this.originalMousePoint = map.mouseEventToContainerPoint;
    map.mouseEventToContainerPoint = (event) => {
      const point = this.originalMousePoint.call(map, event);
      return L.point(unprojectCameraPoint(point, this.frame()));
    };
    map.getCameraPixelBounds = (zoom) => this.renderBounds(zoom);
    map.getCameraFrame = () => this.frame();
    this.handlers = {
      pointerdown: (event) => this.pointerDown(event),
      pointermove: (event) => this.pointerMove(event),
      pointerup: (event) => this.pointerUp(event),
      pointercancel: (event) => this.pointerUp(event),
    };
    for (const [type, handler] of Object.entries(this.handlers))
      this.container.addEventListener(type, handler, { passive: false });
    this.preventClick = (event) => {
      if (performance.now() < (this.suppressClickUntil ?? 0)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    this.container.addEventListener("click", this.preventClick, true);
    this.update = () => {
      this.apply();
      this.updateLimits();
    };
    map.on("resize", this.update);
    this.zoomEnd = () => {
      if (
        this.enabled &&
        this.overview &&
        map.getZoom() <= map.getMinZoom() + 0.001
      )
        this.showOverview();
    };
    map.on("zoomend", this.zoomEnd);
    map.on("unload", () => this.dispose());
    this.control = this.createControls();
    this.apply();
  }
  frame() {
    return { size: this.map.getSize(), yaw: this.yaw, pitch: this.pitch };
  }
  sync({ setupActive, polygon }) {
    const enabled = !setupActive && polygon.length >= 3;
    const changed = JSON.stringify(polygon) !== JSON.stringify(this.polygon);
    if (enabled === this.enabled && !changed) return;
    this.polygon = polygon.map((p) => ({ ...p }));
    this.enabled = enabled;
    this.container.classList.toggle("map-camera-active", enabled);
    if (enabled) {
      this.map.dragging.disable();
      this.map.touchZoom.disable();
      this.control.addTo(this.map);
      const menu = document.querySelector("#landscape-tools");
      if (menu) {
        const controls = this.control.getContainer();
        menu.insertBefore(controls, menu.querySelector("#close-game-menu"));
        controls.classList.remove("leaflet-control");
      }
      this.updateLimits();
    } else {
      this.followHeading = false;
      this.yaw = 0;
      this.pitch = 0;
      this.map.dragging.enable();
      this.map.touchZoom.enable();
      this.map.setMinZoom(this.previousMinZoom);
      this.overview = null;
      this.control.remove();
    }
    this.apply();
  }
  set({ yaw = this.yaw, pitch = this.pitch }, manual = false) {
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
    const atOverview =
      this.overview && this.map.getZoom() <= this.map.getMinZoom() + 0.001;
    this.yaw = normalizeYaw(yaw);
    this.pitch = clampPitch(pitch);
    if (manual) {
      this.followHeading = false;
      this.map.fire("camerainteraction");
    }
    this.apply();
    this.updateLimits();
    if (atOverview) this.showOverview();
    this.map.fire("camerachange");
  }
  setHeading(heading) {
    if (!Number.isFinite(heading)) return;
    this.heading = normalizeYaw(heading);
    if (this.followHeading && this.enabled) this.set({ yaw: this.heading });
  }
  setFollowHeading(enabled) {
    this.followHeading = this.enabled && enabled;
    if (this.followHeading)
      this.set({ yaw: this.heading, pitch: this.pitch || 35 });
    this.apply();
    return this.followHeading;
  }
  apply() {
    const { size } = this.frame();
    this.world.style.transformOrigin = `${size.x / 2}px ${size.y / 2}px`;
    this.world.style.transform = `perspective(${cameraDistance(size)}px) rotateX(${this.pitch}deg) rotateZ(${-this.yaw}deg)`;
    this.container.classList.toggle("map-is-bearing", this.followHeading);
    this.container.style.setProperty(
      "--map-counter-bearing",
      `${this.heading}deg`,
    );
    if (this.rotationInput) {
      this.rotationInput.value = String(Math.round(this.yaw));
      this.tiltInput.value = String(Math.round(this.pitch));
      this.rotationOutput.textContent = `${Math.round(this.yaw)}°`;
      this.tiltOutput.textContent = `${Math.round(this.pitch)}°`;
    }
  }
  updateLimits() {
    if (!this.enabled || this.updatingLimits) return;
    this.updatingLimits = true;
    try {
      const points = this.polygon.map((p) =>
        this.map.project([p.latitude, p.longitude], 0),
      );
      const overview = overviewZoom(points, {
        ...this.frame(),
        maxZoom: this.map.getMaxZoom(),
      });
      if (!overview) return;
      this.overview = {
        zoom: overview.zoom,
        center: this.map.unproject(L.point(overview.center), 0),
      };
      const navigation = navigationBounds(points, this.frame(), overview.zoom);
      this.map.setMaxBounds(
        L.latLngBounds(
          navigation.map((point) => this.map.unproject(L.point(point), 0)),
        ),
      );
      this.map.setMinZoom(overview.zoom);
    } finally {
      this.updatingLimits = false;
    }
  }
  showOverview() {
    if (!this.overview || this.showingOverview) return;
    this.showingOverview = true;
    try {
      this.map.setView(this.overview.center, this.overview.zoom, {
        animate: false,
      });
    } finally {
      this.showingOverview = false;
    }
  }
  renderBounds(zoom) {
    const size = this.map.getSize();
    const corners = [
      [0, 0],
      [size.x, 0],
      [size.x, size.y],
      [0, size.y],
    ];
    return L.bounds(
      corners.map(([x, y]) =>
        this.map.project(
          this.map.containerPointToLatLng(
            L.point(unprojectCameraPoint({ x, y }, this.frame())),
          ),
          zoom,
        ),
      ),
    );
  }
  screenPoint(event) {
    const rect = this.container.getBoundingClientRect();
    return {
      x:
        ((event.clientX - rect.left) * this.container.clientWidth) / rect.width,
      y:
        ((event.clientY - rect.top) * this.container.clientHeight) /
        rect.height,
    };
  }
  pointerDown(event) {
    if (
      !this.enabled ||
      (event.pointerType === "mouse" && event.button !== 0) ||
      event.target.closest(".leaflet-control")
    )
      return;
    const hero = event.target.closest(".rpg-hero-marker-host");
    if (
      event.target.closest(".leaflet-marker-icon") &&
      !(hero && this.mode === "simulation")
    )
      return;
    this.map.stop();
    this.points.set(event.pointerId, this.screenPoint(event));
    this.container.setPointerCapture(event.pointerId);
    if (this.points.size === 1) {
      this.dragHero = Boolean(hero && this.mode === "simulation");
      this.startPoint = this.screenPoint(event);
      this.lastPoint = this.startPoint;
      this.moved = false;
      this.shiftRotate = event.shiftKey;
    }
    this.beginGesture();
  }
  beginGesture() {
    if (this.points.size < 2) {
      this.gesture = null;
      return;
    }
    const [first, second] = [...this.points.values()];
    this.gesture = {
      ...twoPointerGesture(first, second),
      yaw: this.yaw,
      pitch: this.pitch,
      zoom: this.map.getZoom(),
    };
  }
  pointerMove(event) {
    if (!this.points.has(event.pointerId)) return;
    event.preventDefault();
    const point = this.screenPoint(event);
    this.points.set(event.pointerId, point);
    if (this.points.size >= 2 && this.gesture) {
      const [first, second] = [...this.points.values()];
      const current = twoPointerGesture(first, second),
        start = this.gesture;
      if (!this.moved) {
        this.moved = true;
        this.map.fire("dragstart");
      }
      this.set(
        {
          yaw: start.yaw - (current.angle - start.angle),
          pitch: start.pitch - (current.center.y - start.center.y) * 0.15,
        },
        true,
      );
      const zoom = start.zoom + Math.log2(current.distance / start.distance);
      this.map.setZoom(
        Math.max(this.map.getMinZoom(), Math.min(this.map.getMaxZoom(), zoom)),
        { animate: false },
      );
      this.map.fire("moveend");
      return;
    }
    if (
      !this.moved &&
      Math.hypot(point.x - this.startPoint.x, point.y - this.startPoint.y) < 5
    )
      return;
    if (!this.moved) {
      this.moved = true;
      this.map.fire("dragstart");
    }
    if (this.shiftRotate)
      this.set(
        {
          yaw: this.yaw + (point.x - this.lastPoint.x) * 0.4,
          pitch: this.pitch - (point.y - this.lastPoint.y) * 0.3,
        },
        true,
      );
    else if (!this.dragHero) {
      const previous = unprojectCameraPoint(this.lastPoint, this.frame()),
        next = unprojectCameraPoint(point, this.frame());
      this.map.panBy([previous.x - next.x, previous.y - next.y], {
        animate: false,
      });
    }
    this.lastPoint = point;
  }
  pointerUp(event) {
    if (!this.points.has(event.pointerId)) return;
    if (this.moved) {
      this.suppressClickUntil = performance.now() + 350;
      if (
        event.type !== "pointercancel" &&
        this.dragHero &&
        this.points.size === 1
      ) {
        const point = unprojectCameraPoint(
          this.screenPoint(event),
          this.frame(),
        );
        const position = this.map.containerPointToLatLng(L.point(point));
        this.onHeroMove?.({ latitude: position.lat, longitude: position.lng });
      }
    }
    this.points.delete(event.pointerId);
    if (this.container.hasPointerCapture(event.pointerId))
      this.container.releasePointerCapture(event.pointerId);
    this.dragHero = false;
    if (this.points.size === 1) {
      this.lastPoint = [...this.points.values()][0];
      this.startPoint = this.lastPoint;
    }
    this.beginGesture();
  }
  createControls() {
    const control = L.control({ position: "bottomright" });
    control.onAdd = () => {
      const root = L.DomUtil.create("details", "rpg-camera-controls");
      root.innerHTML =
        '<summary>Caméra</summary><label>Rotation <output></output><input aria-label="Rotation de la carte" type="range" min="0" max="359" value="0"></label><label>Inclinaison <output></output><input aria-label="Inclinaison de la carte" type="range" min="0" max="50" value="0"></label><div><button type="button" data-north>Nord</button><button type="button" data-overview>Zone entière</button></div><small>Deux doigts : tourner, incliner et zoomer. Sur PC : Maj + glisser.</small>';
      L.DomEvent.disableClickPropagation(root);
      L.DomEvent.disableScrollPropagation(root);
      [this.rotationInput, this.tiltInput] = root.querySelectorAll("input");
      [this.rotationOutput, this.tiltOutput] = root.querySelectorAll("output");
      this.rotationInput.addEventListener("input", () =>
        this.set({ yaw: Number(this.rotationInput.value) }, true),
      );
      this.tiltInput.addEventListener("input", () =>
        this.set({ pitch: Number(this.tiltInput.value) }, true),
      );
      root
        .querySelector("[data-north]")
        .addEventListener("click", () => this.set({ yaw: 0, pitch: 0 }, true));
      root.querySelector("[data-overview]").addEventListener("click", () => {
        this.map.fire("camerainteraction");
        this.showOverview();
      });
      this.apply();
      return root;
    };
    return control;
  }
  dispose() {
    for (const [type, handler] of Object.entries(this.handlers))
      this.container.removeEventListener(type, handler);
    this.container.removeEventListener("click", this.preventClick, true);
    this.map.mouseEventToContainerPoint = this.originalMousePoint;
    delete this.map.getCameraPixelBounds;
    delete this.map.getCameraFrame;
    this.map.off("resize", this.update);
    this.map.off("zoomend", this.zoomEnd);
    this.container.classList.remove("map-camera-active", "map-is-bearing");
    this.world.remove();
    this.points.clear();
  }
}
