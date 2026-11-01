import test from "node:test";
import assert from "node:assert/strict";
import {
  territoryOverlayGeometry,
  roundedPath,
} from "../app/js/map/territory-border-geometry.js";
import {
  territoryOverlayMarkup,
  TerritoryRenderer,
} from "../app/js/map/TerritoryRenderer.js";
const square = (x, y, size, teamId = "green") => {
  const points = [
    { latitude: y, longitude: x },
    { latitude: y, longitude: x + size },
    { latitude: y + size, longitude: x + size },
    { latitude: y + size, longitude: x },
  ];
  return points.map((point, index) => ({
    teamId,
    otherTeamId: null,
    points: [point, points[(index + 1) % 4]],
  }));
};
test("les segments désordonnés deviennent un contour fermé avec quatre coins arrondis", () => {
  const edges = square(0, 0, 10);
  const geometry = territoryOverlayGeometry(
    [edges[2], edges[0], edges[3], edges[1]],
    true,
  );
  assert.equal(geometry.groups[0].paths.length, 1);
  const path = geometry.groups[0].paths[0];
  assert.equal((path.match(/Q/g) ?? []).length, 4);
  assert.ok(path.endsWith("Z"));
  assert.equal(
    roundedPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]),
    "M0,0 L10,0",
  );
});
test("le dégradé est limité à l’intérieur, y compris les trous, et le centre n’est pas rempli", () => {
  const geometry = territoryOverlayGeometry(
    [...square(0, 0, 20), ...square(5, 5, 5)],
    true,
  );
  const markup = territoryOverlayMarkup(geometry);
  assert.equal(geometry.groups[0].paths.length, 2);
  assert.match(markup, /clip-rule="evenodd"/);
  assert.match(markup, /clip-path="url/);
  assert.match(markup, /feGaussianBlur/);
  assert.match(markup, /fill="none"/);
  assert.match(markup, /rpg-territory-surveillance/);
});
test("le renderer réutilise son affichage inchangé et supprime les frontières absentes", () => {
  const previousL = globalThis.L,
    previousDocument = globalThis.document;
  let overlays = 0,
    clears = 0;
  globalThis.document = {
    createElementNS: () => ({ setAttribute() {}, innerHTML: "" }),
  };
  globalThis.L = {
    CRS: { Simple: {} },
    layerGroup: () => ({
      addTo() {
        return this;
      },
      clearLayers() {
        clears++;
      },
    }),
    svgOverlay: (svg, bounds, options) => {
      overlays++;
      assert.equal(options.interactive, false);
      return { addTo() {} };
    },
  };
  try {
    const renderer = new TerritoryRenderer({ options: {} });
    const territory = { edges: square(0, 0, 10) };
    renderer.render(territory);
    renderer.render(territory);
    assert.equal(overlays, 1);
    renderer.render(null);
    assert.equal(clears, 2);
  } finally {
    globalThis.L = previousL;
    globalThis.document = previousDocument;
  }
});
