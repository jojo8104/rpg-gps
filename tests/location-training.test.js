import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import heroAptitudes from "../data/hero-aptitudes.json" with { type: "json" };

const setup = {
  id: "training", name: "Formation", mode: "quick", scenarioId: "training", playerCount: 1,
  participants: [{ playerId: "p1", name: "P1", color: "blue" }],
  rules: { maxHeroesPerPlayer: 1, locationMode: "expert" },
  playArea: { id: "area", name: "Zone", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] },
};
const classes = [{
  id: "mage", name: "Mage", abilityIds: [], aptitudeIds: ["offensive_magic", "protective_magic"], commonAptitudeIds: ["tactics"],
  baseStats: { attack: 2, defense: 2, morale: 3, mobility: 2, command: 3, health: 20 }, growthWeights: { attack: 3, defense: 2, morale: 4, mobility: 2, command: 5, health: 3 },
}];

test("chaque école forme un héros une seule fois et l'académie est réservée aux mages", () => {
  const game = new Game({ setup, heroClasses: classes, heroAptitudes, locations: [{
    id: "school", name: "Écoles", type: "camp", source: "test", position: { latitude: 0, longitude: 0 },
    ownerId: "p1", population: 8, infrastructure: { military_school: 1, magic_academy: 1 }, resources: { stock: {} },
  }] });
  const hero = game.chooseHero("p1", { name: "Mage", classId: "mage" });
  const first = game.trainHeroAtLocation({ heroId: hero.id, locationId: "school" });
  assert.equal(first.results.length, 2);
  assert.deepEqual(hero.statGrowth, { attack: 2, defense: 2, morale: 0, mobility: 0, command: 0, health: 0 });
  assert.deepEqual(Object.keys(hero.aptitudeRanks), ["offensive_magic", "protective_magic"]);
  assert.equal(game.trainHeroAtLocation({ heroId: hero.id, locationId: "school" }).success, false);
});
