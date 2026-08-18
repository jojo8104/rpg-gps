import assert from "node:assert/strict";
import test from "node:test";

import { Player } from "../app/js/core/player.js";

test("un joueur conserve ses héros mais ne détient pas leurs ressources", () => {
  const player = new Player({
    id: "player-1",
    name: "Ariane",
  });

  assert.equal(player.addHero("hero-1"), true);
  assert.equal(player.addHero("hero-1"), false);
  assert.deepEqual(player.heroIds, ["hero-1"]);

  assert.equal("resources" in player, false);
  assert.equal(player.discoverLocation("village"), true);
  assert.equal(player.discoverLocation("village"), false);
  assert.equal(player.knowsLocation("village"), true);
});

test("un joueur est sérialisable sans partager ses données internes", () => {
  const player = new Player({
    id: "player-1",
    name: "Ariane",
    heroIds: ["hero-1"],
  });

  const data = player.toJSON();
  data.heroIds.push("hero-2");

  assert.deepEqual(player.heroIds, ["hero-1"]);
  assert.equal("resources" in data, false);
});

test("un joueur peut recevoir des informations de lieux sans doublon", () => {
  const player = new Player({ id: "player-1", name: "Ariane", discoveredLocationIds: ["fort"] });
  assert.deepEqual(player.receiveLocationInformation(["fort", "mine"]), ["mine"]);
  assert.deepEqual(player.discoveredLocationIds, ["fort", "mine"]);
});

test("la connaissance d'un lieu progresse sans pouvoir régresser", () => {
  const player = new Player({ id: "player-1", name: "Ariane" });
  assert.equal(player.discoverLocation("fort", 2), true);
  assert.equal(player.discoverLocation("fort", 1), false);
  assert.equal(player.discoverLocation("fort", 3), true);
  assert.equal(player.getLocationKnowledge("fort"), 3);
});
