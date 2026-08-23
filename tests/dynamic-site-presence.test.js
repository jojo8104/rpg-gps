import assert from "node:assert/strict";
import test from "node:test";
import { DynamicSitePresence } from "../app/js/core/dynamic-site-presence.js";

const distanceFn = (a, b) => Math.abs(a - b);
test("un site temporaire n'émet qu'une entrée et une sortie par approche", () => {
  const presence = new DynamicSitePresence({ distanceFn, exitMargin: 2 }); const sites = [{ id: "battlefield", position: 10, interactionRadius: 5 }];
  assert.deepEqual(presence.update({ position: 4, sites }), []);
  assert.deepEqual(presence.update({ position: 5, sites }), [{ type: "SiteEntered", siteId: "battlefield" }]);
  assert.deepEqual(presence.update({ position: 6, sites }), []);
  assert.deepEqual(presence.update({ position: 18, sites }), [{ type: "SiteExited", siteId: "battlefield", reason: "distance" }]);
});

test("la disparition d'un site éphémère émet une sortie", () => {
  const presence = new DynamicSitePresence({ distanceFn }); presence.update({ position: 10, sites: [{ id: "battlefield", position: 10, interactionRadius: 5 }] });
  assert.deepEqual(presence.update({ position: 10, sites: [] }), [{ type: "SiteExited", siteId: "battlefield", reason: "removed" }]);
});
