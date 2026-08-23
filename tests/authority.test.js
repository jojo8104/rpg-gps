import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const setup = { id: "authority", name: "Autorite", mode: "quick", scenarioId: "chaos", playerCount: 1, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "A" }] };
const heroClasses = [{ id: "warrior", name: "Guerrier", authorityBonus: 2, abilityIds: [], startingUnits: [] }];
const unitDefinitions = [{ id: "militia", authorityCost: 1, stats: { attack: 1, defense: 1, speed: 1, range: 1, morale: 1, healthPerSoldier: 10, combatHealthThreshold: 4 }, costs: {} }];

test("l'autorite additionne la base, la classe et les niveaux du heros", () => {
  const game = new Game({ setup, heroClasses, unitDefinitions });
  const hero = game.chooseHero("p1", { name: "A", classId: "warrior" });
  assert.deepEqual(game.getHeroAuthority(hero.id), { used: 0, maximum: 5, remaining: 5 });
  hero.setLevel(4);
  assert.deepEqual(game.getHeroAuthority(hero.id), { used: 0, maximum: 8, remaining: 8 });
});

test("les promotions manuelles respectent l'autorite disponible", () => {
  const game = new Game({ setup, heroClasses, unitDefinitions });
  const hero = game.chooseHero("p1", { name: "A", classId: "warrior" });
  hero.addUnit({ id: "u1", ownerPlayerId: "p1", typeId: "militia", quantity: 6, experience: 100 });
  hero.addUnit({ id: "u2", ownerPlayerId: "p1", typeId: "militia", quantity: 6, experience: 100 });
  assert.deepEqual(game.getHeroAuthority(hero.id), { used: 4, maximum: 5, remaining: 1 });
  assert.equal(game.promoteUnit({ heroId: hero.id, unitId: "u1" }).success, true);
  const blocked = game.promoteUnit({ heroId: hero.id, unitId: "u2" });
  assert.equal(blocked.success, false); assert.equal(blocked.reason, "insufficient_authority");
});
