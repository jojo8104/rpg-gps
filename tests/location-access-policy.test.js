import assert from "node:assert/strict";
import test from "node:test";
import { Location } from "../app/js/core/location.js";
import { LocationAccessPolicy, LOCATION_RELATIONS } from "../app/js/core/location-access-policy.js";

const policy = new LocationAccessPolicy({ participants: [
  { playerId: "p1", teamId: "blue" }, { playerId: "p2", teamId: "blue" }, { playerId: "p3", teamId: "red" },
] });
const location = (ownerId, features = {}) => new Location({ id: `place-${ownerId ?? "neutral"}`, name: "Lieu", type: "village", source: "scenario", position: { latitude: 0, longitude: 0 }, ownerId, features });

test("la relation au lieu distingue possession, alliance, neutralité et ennemi", () => {
  assert.equal(policy.getRelation("p1", location("p1")), LOCATION_RELATIONS.OWNED);
  assert.equal(policy.getRelation("p1", location("p2")), LOCATION_RELATIONS.ALLIED);
  assert.equal(policy.getRelation("p1", location(null)), LOCATION_RELATIONS.NEUTRAL);
  assert.equal(policy.getRelation("p1", location("p3")), LOCATION_RELATIONS.ENEMY);
});

test("seuls le propriétaire et ses alliés défendent une localisation", () => {
  const alliedLocation = location("p1");
  assert.equal(policy.isDefender("p1", alliedLocation), true);
  assert.equal(policy.isDefender("p2", alliedLocation), true);
  assert.equal(policy.isDefender("p3", alliedLocation), false);
  assert.equal(policy.isDefender("p1", location(null)), false);
});

test("les actions économiques sont interdites chez l'ennemi", () => {
  const enemyMine = location("p3", { resourceProduction: true, recruitment: true, garrison: true, battle: true });
  assert.equal(policy.can("p1", enemyMine, "collect"), false);
  assert.equal(policy.can("p1", enemyMine, "recruit"), false);
  assert.equal(policy.can("p1", enemyMine, "deposit"), false);
  assert.equal(policy.can("p1", enemyMine, "attack"), true);
});

test("une garnison possédée ou neutre peut être renforcée, jamais une garnison alliée ou ennemie", () => {
  const owned = location("p1", { garrison: true }); const allied = location("p2", { garrison: true }); const neutral = location(null, { garrison: true }); const enemy = location("p3", { garrison: true });
  assert.equal(policy.can("p1", owned, "garrison"), true);
  assert.equal(policy.can("p1", neutral, "garrison"), true);
  assert.equal(policy.can("p1", allied, "garrison"), false);
  assert.equal(policy.can("p1", enemy, "garrison"), false);
  assert.equal(policy.can("p1", allied, "withdrawGarrison"), true);
});
