import assert from "node:assert/strict";
import test from "node:test";

import { Player } from "../app/js/core/player.js";

test("un joueur conserve ses héros et ses ressources", () => {
  const player = new Player({
    id: "player-1",
    name: "Ariane",
    resources: { gold: 20 },
  });

  assert.equal(player.addHero("hero-1"), true);
  assert.equal(player.addHero("hero-1"), false);
  assert.deepEqual(player.heroIds, ["hero-1"]);

  player.addResource("gold", 5);
  assert.equal(player.spendResource("gold", 18), true);
  assert.equal(player.getResourceAmount("gold"), 7);
  assert.equal(player.spendResource("gold", 8), false);
});

test("un joueur est sérialisable sans partager ses données internes", () => {
  const player = new Player({
    id: "player-1",
    name: "Ariane",
    heroIds: ["hero-1"],
    resources: { gold: 20 },
  });

  const data = player.toJSON();
  data.heroIds.push("hero-2");
  data.resources.gold = 0;

  assert.deepEqual(player.heroIds, ["hero-1"]);
  assert.equal(player.getResourceAmount("gold"), 20);
});
