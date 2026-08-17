import assert from "node:assert/strict";
import test from "node:test";
import { BattleSite } from "../app/js/core/battle-site.js";

const center = { latitude: 48.8566, longitude: 2.3522 };
test("un champ de bataille est toujours visible aux participants et seulement à proximité pour les passants", () => {
  const site = new BattleSite({ id: "site", battleId: "battle", position: center, participantPlayerIds: ["p1"], visibilityRadius: 100 });
  assert.equal(site.isVisibleTo({ playerId: "p1", position: { latitude: 49, longitude: 2 } }), true);
  assert.equal(site.isVisibleTo({ playerId: "passerby", position: center }), true);
  assert.equal(site.isVisibleTo({ playerId: "passerby", position: { latitude: 49, longitude: 2 } }), false);
});

test("la recherche devient possible après Battle et le site expire", () => {
  let now = 0; const site = new BattleSite({ id: "site", battleId: "battle", position: center, participantPlayerIds: [], now: () => now });
  assert.equal(site.canSearch(center), false); site.finish({ ttlMs: 1000 });
  assert.equal(site.canSearch(center), true); now = 1000;
  assert.equal(site.isExpired(), true); assert.equal(site.isVisibleTo({ playerId: "p", position: center }), false);
});

test("butin, informations et survivants sont trois recherches indépendantes", () => {
  const site = new BattleSite({ id: "searchable", battleId: "battle", position: center, participantPlayerIds: ["p1"] });
  site.finish();
  assert.equal(site.search({ type: "loot", playerId: "p1", position: center }).success, true);
  assert.equal(site.search({ type: "information", playerId: "p1", position: center }).success, true);
  assert.equal(site.search({ type: "survivors", playerId: "p1", position: center }).success, true);
  assert.equal(site.search({ type: "loot", playerId: "p1", position: center }).reason, "already_searched");
  assert.deepEqual(site.toJSON().searches, { loot: ["p1"], information: ["p1"], survivors: ["p1"] });
});
