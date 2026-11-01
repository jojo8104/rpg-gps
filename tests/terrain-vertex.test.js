import test from "node:test";
import assert from "node:assert/strict";
import { createTerrainVertex } from "../app/js/ui/terrain-vertex.js";

function leaflet() {
  let options, handler, position;
  const marker = {
    addTo() {
      return this;
    },
    on(_event, callback) {
      handler = callback;
      return this;
    },
    getLatLng: () => position,
  };
  return {
    L: {
      divIcon: (data) => data,
      marker(_point, config) {
        options = config;
        return marker;
      },
      circleMarker(_point, config) {
        options = config;
        return marker;
      },
    },
    options: () => options,
    drag(to) {
      position = to;
      handler?.();
    },
  };
}
test("le relâchement déplace uniquement le point sélectionné du brouillon", () => {
  const mock = leaflet();
  const points = [
    { latitude: 1, longitude: 2 },
    { latitude: 3, longitude: 4 },
  ];
  let redraws = 0;
  createTerrainVertex(mock.L, {}, points[0], {
    editable: true,
    onMove: (position) => {
      Object.assign(points[0], position);
      redraws++;
    },
  });
  assert.equal(mock.options().draggable, true);
  assert.equal(mock.options().bubblingMouseEvents, false);
  mock.drag({ lat: 5, lng: 6 });
  assert.deepEqual(points, [
    { latitude: 5, longitude: 6 },
    { latitude: 3, longitude: 4 },
  ]);
  assert.equal(redraws, 1);
});
test("les exclusions sont déplaçables, mais le mode de consultation reste fixe", () => {
  const mock = leaflet();
  const point = { latitude: 1, longitude: 2 };
  createTerrainVertex(mock.L, {}, point, { editable: true, exclusion: true });
  assert.match(mock.options().icon.className, /exclusion/);
  createTerrainVertex(mock.L, {}, point, {
    editable: false,
    onMove: () => assert.fail("consultation"),
  });
  assert.equal(mock.options().draggable, undefined);
  mock.drag({ lat: 5, lng: 6 });
  assert.deepEqual(point, { latitude: 1, longitude: 2 });
});
