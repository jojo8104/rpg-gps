import test from "node:test";
import assert from "node:assert/strict";
import { AstralGhostDrag, clampAstralPosition } from "../app/js/map/AstralGhostDrag.js";
import { projectCameraPoint, unprojectCameraPoint } from "../app/js/map/camera-geometry.js";

for (const pointerType of ["mouse", "touch"]) {
  test(`glissement ${pointerType} : suivi continu sur carte tournée et capture du pointeur`, () => {
    const previousL = globalThis.L;
    globalThis.L = { point: point => point };
    const events = [], captures = [], drops = [];
    const frame = { size: { x: 800, y: 600 }, yaw: 90, pitch: 35 };
    const marker = { position: { x: 400, y: 300 }, getLatLng() { return this.position; }, setLatLng(p) { this.position = p; }, fire(type, data) { events.push(type); if (data) drops.push(data.dropPoint); } };
    const drag = Object.create(AstralGhostDrag.prototype);
    Object.assign(drag, {
      marker, map: { getCameraFrame: () => frame, latLngToContainerPoint: p => p, containerPointToLatLng: p => p },
      container: { getBoundingClientRect: () => ({ left: 10, top: 20 }) },
      element: { style: {}, classList: { add() {}, remove() {} }, setPointerCapture: id => captures.push(id), hasPointerCapture: () => true, releasePointerCapture: id => captures.push(-id) },
    });
    const event = (type, x, y, id = 7) => ({ type, pointerType, pointerId: id, button: 0, clientX: x + 10, clientY: y + 20, preventDefault() {}, stopPropagation() {} });
    try {
      drag.start(event("pointerdown", 410, 250));
      drag.move(event("pointermove", 490, 280));
      const expected = unprojectCameraPoint({ x: 480, y: 330 }, frame);
      assert.ok(Math.abs(marker.position.x - expected.x) < 0.00001);
      assert.ok(Math.abs(marker.position.y - expected.y) < 0.00001);
      const projected = projectCameraPoint(marker.position, frame);
      assert.ok(Math.abs(projected.x - 480) < 0.00001);
      const unchanged = marker.position;
      drag.move(event("pointermove", 100, 100, 99));
      assert.equal(marker.position, unchanged);
      drag.finish(event("pointerup", 490, 280));
      assert.deepEqual(events, ["dragstart", "dragend"]);
      assert.deepEqual(captures, [7, -7]);
      assert.deepEqual(drops, [{ x: 490, y: 280 }]);
      assert.equal(drag.pointerId, null);
      drag.start(event("pointerdown", 490, 280));
      const origin = marker.position;
      drag.move(event("pointermove", 570, 330));
      drag.finish(event("pointercancel", 570, 330));
      assert.deepEqual(marker.position, origin);
      assert.equal(events.at(-1), "astraldragcancel");
    } finally { globalThis.L = previousL; }
  });
}

for (const mode of ["simulation", "gps"]) {
  test(`le fantôme reste dans le cercle astral en ${mode}`, async () => {
    const { distanceMeters } = await import("../app/js/core/geo.js");
    const previousL = globalThis.L;
    globalThis.L = { point: value => value };
    const center = mode === "gps" ? { latitude: 48.8566, longitude: 2.35 } : { latitude: 0, longitude: 0 };
    const target = { latitude: center.latitude + (mode === "gps" ? 0.01 : 100), longitude: center.longitude + (mode === "gps" ? 0.01 : 100) };
    const map = {
      project: p => ({ x: p.longitude, y: p.latitude }),
      unproject: p => ({ longitude: p.x, latitude: p.y }),
      distance: mode === "gps" ? distanceMeters : (a,b) => Math.hypot(a.latitude-b.latitude,a.longitude-b.longitude),
    };
    try {
      const bounded = clampAstralPosition(map, center, target, 15);
      assert.ok(map.distance(center, bounded) <= 15);
      assert.ok(map.distance(center, bounded) > 14.999);
      assert.equal(clampAstralPosition(map, center, center, 15), center);
      const otherDirection = clampAstralPosition(map, center, {latitude:center.latitude-(mode === "gps" ? 0.01 : 100),longitude:center.longitude}, 15);
      assert.ok(map.distance(center, otherDirection) <= 15);
    } finally { globalThis.L = previousL; }
  });
}

test("un geste hors du cercle borne aussi le point de relâchement", () => {
  const previousL=globalThis.L; globalThis.L={point:p=>p};
  const drag=Object.create(AstralGhostDrag.prototype);
  const marker={position:{x:0,y:0},getLatLng(){return this.position;},setLatLng(p){this.position=p;}};
  Object.assign(drag,{pointerId:1,marker,bounds:{center:{x:0,y:0},radius:15},startAnchor:{x:0,y:0},startPoint:{x:0,y:0},screen:()=>({x:100,y:0}),element:{style:{}},map:{project:p=>p,unproject:p=>p,distance:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),containerPointToLatLng:p=>p,latLngToContainerPoint:p=>p}});
  try {
    drag.move({pointerId:1,preventDefault(){},stopPropagation(){}});
    assert.ok(marker.position.x <=15 && marker.position.x>14.999);
    assert.deepEqual(drag.dropPoint,marker.position);
  } finally {globalThis.L=previousL;}
});
