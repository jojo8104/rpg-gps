import test from "node:test";
import assert from "node:assert/strict";
import { AstralTravelRenderer } from "../app/js/map/AstralTravelRenderer.js";

test("rendu astral : double déplaçable, coordonnées normalisées, cible confirmée et retrait", async () => {
  const previousL = globalThis.L;
  const point = coordinates => {
    assert.ok(Array.isArray(coordinates), "Leaflet reçoit des coordonnées latitude/longitude normalisées");
    return { x: coordinates[0], y: coordinates[1], distanceTo(other) { return Math.hypot(this.x - other.x, this.y - other.y); } };
  };
  const layer = (position, options) => ({
    position, options, events: {}, removed: false,
    addTo() { return this; }, bindTooltip() { return this; }, getElement() { return null; },
    setLatLng(value) { this.position = value; return this; },
    getLatLng() { return this.position; }, setRadius(value) { this.radius = value; return this; },
    on(type, callback) { this.events[type] = callback; return this; }, remove() { this.removed = true; },
  });
  globalThis.L = { marker: layer, circle: layer, divIcon: value => value };
  const targets = [];
  const renderer = new AstralTravelRenderer({ on() {}, latLngToContainerPoint: point }, async target => targets.push(target));
  try {
    const now = Date.now();
    const travel = { activatedAt: now, expiresAt: now + 10000, reachBonus: 15 };
    const target = { kind: "location", targetId: "village", position: { latitude: 8, longitude: 8 } };
    renderer.render(travel, [0, 0], [target]);
    const marker = renderer.marker, circle = renderer.circle;
    assert.equal(marker.options.draggable, false);
    assert.equal(circle.radius, 15);
    assert.equal(circle.options.color, "#ff29ed");
    marker.setLatLng([8, 8]);
    await marker.events.dragend();
    assert.deepEqual(targets, [target]);
    marker.setLatLng([200, 200]);
    await marker.events.dragend({ dropPoint: { x: 8, y: 8 } });
    assert.equal(targets.length, 2);
    marker.setLatLng([200, 200]);
    await marker.events.dragend();
    assert.equal(targets.length, 2);
    assert.deepEqual(marker.position, [0, 0]);
    renderer.render(null, [0, 0], []);
    assert.equal(marker.removed, true);
    assert.equal(circle.removed, true);
    assert.equal(renderer.marker, null);
  } finally { renderer.clear(); globalThis.L = previousL; }
});
