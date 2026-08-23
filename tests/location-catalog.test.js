import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Location } from "../app/js/core/location.js";

const definitions = JSON.parse(await readFile(new URL("../data/locations.json", import.meta.url), "utf8"));
const location = (id) => new Location(definitions.find((entry) => entry.id === id));

test("la carrière de pierre est une ressource neutre défendue", () => {
  const quarry = location("stone-quarry");
  assert.equal(quarry.ownerId, null);
  assert.equal(quarry.resources.production.stone, 5);
  assert.equal(quarry.garrison.units.length, 1);
  assert.equal(quarry.garrison.units[0].ownerPlayerId, "neutral");
});

test("la mine de fer est une ressource neutre non gardée", () => {
  const mine = location("iron-mine");
  assert.equal(mine.ownerId, null);
  assert.equal(mine.resources.production.iron, 4);
  assert.equal(mine.garrison.units.length, 0);
});

test("la mine d'or de la quête est occupée par une garnison du Chaos", () => {
  const mine = location("gold-mine");
  assert.equal(mine.ownerId, null);
  assert.equal(mine.features.capturable, true);
  assert.equal(mine.garrison.units.length, 1);
  assert.equal(mine.garrison.units[0].ownerPlayerId, "chaos");
});
