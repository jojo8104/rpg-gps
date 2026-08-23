import test from "node:test";
import assert from "node:assert/strict";
import { MAP_LAYER_ORDER, MAP_LAYER_Z_INDEX } from "../app/js/map/MapLayers.js";
import { zoomLevel } from "../app/js/map/MapRenderer.js";
import { locationMarkerSvg, locationPresentation } from "../app/js/map/LocationRenderer.js";
import { dynamicSitePresentation } from "../app/js/ui/map-view.js";
import { headingDirection } from "../app/js/map/UnitRenderer.js";

test("les panes cartographiques ont un ordre explicite et strict", () => {
  const values = MAP_LAYER_ORDER.map((name) => MAP_LAYER_Z_INDEX[name]);
  assert.deepEqual([...values].sort((a, b) => a - b), values);
  assert.equal(new Set(values).size, values.length);
});

test("la densité visuelle dépend du zoom sans dépendre du DOM", () => {
  assert.equal(zoomLevel(13), "far"); assert.equal(zoomLevel(15), "medium"); assert.equal(zoomLevel(18), "near");
  assert.equal(zoomLevel(-1), "far"); assert.equal(zoomLevel(.5), "medium"); assert.equal(zoomLevel(2), "near");
});

test("le renderer déduit le langage visuel depuis les données métier", () => {
  const enemy = locationPresentation({ type: "camp", owner: "enemy", state: "DISCOVERED", name: "Camp", nearby: true });
  assert.equal(enemy.owner, "enemy"); assert.equal(enemy.status, "active"); assert.equal(enemy.badge, "⚔");
  const conquered = locationPresentation({ type: "camp", owner: "ally", state: "DISCOVERED", name: "Camp conquis", nearby: true });
  assert.equal(conquered.owner, "ally"); assert.equal(conquered.badge, "");
});

test("chaque type de lieu possède un symbole vectoriel pour le zoom sémantique", () => {
  ["fort", "village", "mine", "camp", "capital", "quarry", "lumber-camp", "quest"].forEach((type) => {
    const marker = locationMarkerSvg(type); assert.match(marker, /^<svg/); assert.match(marker, /<path/);
  });
});

test("un champ de bataille réserve une grande cible tactile au-dessus du héros", () => {
  const site = dynamicSitePresentation({ kind: "battlefield", interactionRadius: 100 });
  assert.equal(site.iconSize, 64); assert.equal(site.interactionRadius, 100);
  assert.equal(site.pane, "effects"); assert.ok(site.zIndexOffset > 1000);
});

test("le sprite du héros choisit une des huit directions de boussole", () => {
  assert.equal(headingDirection(0).id, "n");
  assert.equal(headingDirection(44).id, "ne");
  assert.equal(headingDirection(91).id, "e");
  assert.equal(headingDirection(181).id, "s");
  assert.equal(headingDirection(359).id, "n");
});
