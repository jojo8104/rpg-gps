import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const setup = { id: "s", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 2, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "A" }, { playerId: "p2", name: "B" }], rules: { engagementRadiusMeters: 100, fleeConfirmations: 1, pursuitCooldownMinutes: 5 } };
const heroClasses = [{ id: "fighter", name: "Combattant", abilityIds: [], startingUnits: [{ typeId: "runner", quantity: 6 }] }];
const definition = { id: "runner", maxQuantity: 10, stats: { attack: 1, defense: 1, range: 1, speed: 1 } };

test("la fuite restitue les unités survivantes après la poursuite de fin de bataille", () => {
  let id = 1;
  const game = new Game({ setup, heroClasses, unitDefinitions: [definition], idGenerator: (prefix) => `${prefix}-${id++}` });
  const first = game.chooseHero("p1", { name: "A", classId: "fighter" });
  const second = game.chooseHero("p2", { name: "B", classId: "fighter" });
  first.updatePosition({ latitude: 48.8566, longitude: 2.35 }); second.updatePosition({ latitude: 48.8566, longitude: 2.3502 });
  game.start();
  const battle = game.engageHeroes({ initiatorHeroId: first.id, targetHeroId: second.id, battleConfig: { pursuitLossRate: 0.5 }, teams: [{ id: "red", heroIds: [first.id] }, { id: "blue", heroIds: [second.id] }] });
  const fleeingUnit = battle.teams[1].units[0];
  game.updateBattleHeroPosition({ battleId: battle.id, heroId: second.id, position: { latitude: 48.86, longitude: 2.35 } });
  assert.equal(fleeingUnit.quantity, 6);
  assert.equal(fleeingUnit.commandDisabled, true);
  assert.equal(fleeingUnit.currentOrder.type, "hold");
  assert.equal(battle.eventLog.some((event) => event.type === "flee_pursuit_resolved"), false);
  game.resolveBattle(battle.id);
  assert.equal(fleeingUnit.state, "fled");
  assert.equal(second.state, "active");
  assert.equal(second.army.units.length, 1);
  assert.equal(second.army.units[0].quantity, fleeingUnit.quantity);
});

function resolvePursuit({ winnerSpeed, loserSpeed }) {
  let id = 100;
  const game = new Game({ setup, heroClasses, unitDefinitions: [{ ...definition, stats: { ...definition.stats, damageMin: 1, damageMax: 1, healthPerSoldier: 10, combatHealthThreshold: 4 } }], idGenerator: (prefix) => `${prefix}-${id++}` });
  const winner = game.chooseHero("p1", { name: "Rapide", classId: "fighter" });
  const loser = game.chooseHero("p2", { name: "Fuyard", classId: "fighter" });
  winner.updatePosition({ latitude: 48.8566, longitude: 2.35 }); loser.updatePosition({ latitude: 48.8566, longitude: 2.3502 });
  game.start();
  const battle = game.engageHeroes({ initiatorHeroId: winner.id, targetHeroId: loser.id, teams: [{ id: "red", heroIds: [winner.id] }, { id: "blue", heroIds: [loser.id] }] });
  battle.teams[0].units[0].speed = winnerSpeed; battle.teams[1].units[0].speed = loserSpeed;
  const beforeHealth = battle.teams[1].units[0].soldierHealth.reduce((total, health) => total + health, 0);
  game.updateBattleHeroPosition({ battleId: battle.id, heroId: loser.id, position: { latitude: 48.86, longitude: 2.35 } });
  game.resolveBattle(battle.id);
  const report = battle.eventLog.find((event) => event.type === "flee_pursuit_resolved");
  const afterHealth = loser.army.units[0]?.soldierHealth.reduce((total, health) => total + health, 0) ?? 0;
  return { battle, report, beforeHealth, afterHealth, loser };
}

test("une armée gagnante plus lente ne reçoit aucune attaque gratuite", () => {
  const result = resolvePursuit({ winnerSpeed: 2, loserSpeed: 3 });
  assert.equal(result.report.rounds, 0); assert.equal(result.report.attacks, 0); assert.equal(result.afterHealth, result.beforeHealth);
  assert.equal(result.loser.army.units.length, 1);
});

test("une différence positive jusqu'à deux donne un round gratuit", () => {
  const result = resolvePursuit({ winnerSpeed: 5, loserSpeed: 3 });
  assert.equal(result.report.speedDifference, 2); assert.equal(result.report.rounds, 1); assert.equal(result.report.attacks, 1);
  assert.ok(result.afterHealth < result.beforeHealth); assert.equal(result.loser.army.units.length, 1);
});

test("une différence supérieure à deux donne deux rounds gratuits", () => {
  const result = resolvePursuit({ winnerSpeed: 6, loserSpeed: 3 });
  assert.equal(result.report.speedDifference, 3); assert.equal(result.report.rounds, 2); assert.equal(result.report.attacks, 2);
  assert.ok(result.afterHealth < result.beforeHealth); assert.equal(result.loser.army.units.length, 1);
});
