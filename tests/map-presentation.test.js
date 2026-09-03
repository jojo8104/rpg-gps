import test from "node:test";
import assert from "node:assert/strict";
import { MAP_LAYER_ORDER, MAP_LAYER_Z_INDEX } from "../app/js/map/MapLayers.js";
import { zoomLevel } from "../app/js/map/MapRenderer.js";
import {
  locationMarkerSvg,
  locationPresentation,
} from "../app/js/map/LocationRenderer.js";
import { dynamicSitePresentation, endpointTraces } from "../app/js/ui/map-view.js";
import { headingDirection } from "../app/js/map/UnitRenderer.js";
import {
  FOG_CLOUD_ASSET,
  FOG_VISION_RADIUS,
  boundsForCells,
  fogMaskGeometry,
  fogOverlayMarkup,
  isInsideVision,
} from "../app/js/map/FogRenderer.js";
import { compactLocationDescription } from "../app/js/ui/world-view.js";

test("les panes cartographiques ont un ordre explicite et strict", () => {
  const values = MAP_LAYER_ORDER.map((name) => MAP_LAYER_Z_INDEX[name]);
  assert.deepEqual(
    [...values].sort((a, b) => a - b),
    values,
  );
  assert.equal(new Set(values).size, values.length);
});

test("la densité visuelle dépend du zoom sans dépendre du DOM", () => {
  assert.equal(zoomLevel(13), "far");
  assert.equal(zoomLevel(15), "medium");
  assert.equal(zoomLevel(18), "near");
  assert.equal(zoomLevel(-1), "far");
  assert.equal(zoomLevel(0.5), "medium");
  assert.equal(zoomLevel(2), "near");
});

test("le renderer déduit le langage visuel depuis les données métier", () => {
  const enemy = locationPresentation({
    type: "camp",
    owner: "enemy",
    state: "DISCOVERED",
    name: "Camp",
    nearby: true,
  });
  assert.equal(enemy.owner, "enemy");
  assert.equal(enemy.status, "active");
  assert.equal(enemy.badge, "⚔");
  const conquered = locationPresentation({
    type: "camp",
    owner: "ally",
    state: "DISCOVERED",
    name: "Camp conquis",
    nearby: true,
  });
  assert.equal(conquered.owner, "ally");
  assert.equal(conquered.badge, "");
});

test("chaque type de lieu possède un symbole vectoriel pour le zoom sémantique", () => {
  [
    "fort",
    "village",
    "mine",
    "camp",
    "capital",
    "quarry",
    "lumber-camp",
    "quest",
  ].forEach((type) => {
    const marker = locationMarkerSvg(type);
    assert.match(marker, /^<svg/);
    assert.match(marker, /<path/);
  });
});

test("une trace de bataille n'expose aucun rayon d'interaction", () => {
  const site = dynamicSitePresentation({
    kind: "battlefield",
    interactionRadius: 100,
  });
  assert.equal(site.iconSize, 52);
  assert.equal(site.interactionRadius, 0);
  assert.equal(site.pane, "effects");
  assert.ok(site.zIndexOffset > 1000);
});

test("une piste affiche un pas au départ, des pointillés puis un pas à l'arrivée", () => {
  const traces = [
    { id: "middle", groupId: "hero:h1", createdAt: 2 },
    { id: "end", groupId: "hero:h1", createdAt: 3 },
    { id: "start", groupId: "hero:h1", createdAt: 1 },
  ];
  assert.deepEqual(
    endpointTraces(traces).map((trace) => trace.id),
    ["start", "end"],
  );
});

test("le sprite du héros choisit une des huit directions de boussole", () => {
  assert.equal(headingDirection(0).id, "n");
  assert.equal(headingDirection(44).id, "ne");
  assert.equal(headingDirection(91).id, "e");
  assert.equal(headingDirection(181).id, "s");
  assert.equal(headingDirection(359).id, "n");
});

test("le brouillard distingue la vision courante des zones éloignées", () => {
  const center = [0, 0];
  assert.equal(
    isInsideVision([10, 10], center, FOG_VISION_RADIUS.simulation, true),
    true,
  );
  assert.equal(
    isInsideVision([40, 0], center, FOG_VISION_RADIUS.simulation, true),
    false,
  );
  assert.equal(
    isInsideVision(
      { latitude: 48, longitude: 2 },
      [48, 2],
      FOG_VISION_RADIUS.gps,
    ),
    true,
  );
  assert.equal(
    isInsideVision(
      { latitude: 48.002, longitude: 2 },
      [48, 2],
      FOG_VISION_RADIUS.gps,
    ),
    false,
  );
});

test("le brouillard utilise un seul calque texturé et un masque", () => {
  assert.equal(FOG_CLOUD_ASSET, "assets/effects/fog-cloud.png");
  const cells = Array.from({ length: 4 }, (_, index) => {
    const row = Math.floor(index / 2);
    const column = index % 2;
    return {
      id: String(index),
      row,
      column,
      visits: index === 0 ? 1 : 0,
      bounds: [
        { latitude: row, longitude: column },
        { latitude: row + 1, longitude: column + 1 },
      ],
    };
  });
  const zoneBounds = boundsForCells(cells);
  assert.deepEqual(zoneBounds, [
    { latitude: 0, longitude: 0 },
    { latitude: 2, longitude: 2 },
  ]);
  const geometry = fogMaskGeometry({
    cells,
    center: { latitude: 1, longitude: 1 },
    radius: 0.25,
    simulation: true,
    zoneBounds,
  });
  assert.match(geometry.discoveredPath, /^M0 512h512v512h-512Z$/);
  assert.equal(geometry.vision.cx, 512);
  assert.equal(geometry.vision.cy, 512);
  const markup = fogOverlayMarkup(geometry);
  assert.equal((markup.match(/<image /g) ?? []).length, 1);
  assert.match(markup, /fill="#c7ced0"/);
  assert.match(markup, /<mask id="rpg-fog-mask">/);
  assert.match(markup, /<ellipse[^>]+fill="black"/);
  assert.match(markup, /<path[^>]+fill="black"/);
  assert.match(markup, /<clipPath id="rpg-play-area-clip">/);
});

test("le contour du brouillard suit le polygone réel de la zone de jeu", () => {
  const cells = [{
    id: "cell",
    visits: 0,
    bounds: [
      { latitude: 0, longitude: 0 },
      { latitude: 2, longitude: 2 },
    ],
  }];
  const geometry = fogMaskGeometry({
    cells,
    center: { latitude: 0.5, longitude: 0.5 },
    radius: 0.1,
    simulation: true,
    zoneBounds: [
      { latitude: 0, longitude: 0 },
      { latitude: 2, longitude: 2 },
    ],
    playAreaPoints: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 2 },
      { latitude: 2, longitude: 1 },
    ],
  });
  assert.equal(geometry.playAreaPath, "M0 1024 L1024 1024 L512 0 Z");
});

test("la fiche détaillée raccourcit uniquement les descriptions trop longues", () => {
  assert.equal(
    compactLocationDescription("Description courte."),
    "Description courte.",
  );
  const result = compactLocationDescription(
    "Un très ancien village entouré de collines et traversé par une route marchande utilisée depuis plusieurs générations.",
    55,
  );
  assert.ok(result.length <= 55);
  assert.match(result, /…$/);
});
