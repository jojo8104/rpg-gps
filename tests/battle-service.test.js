import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const definition = { id: "militia", maxQuantity: 10, stats: { attack: 4, defense: 2, range: 1, speed: 2, healthPerSoldier: 8, combatHealthThreshold: 3 } };
const setup = { id: "s", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 2, playArea: { id: "a", name: "A", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] }, participants: [{ playerId: "p1", name: "A" }, { playerId: "p2", name: "B" }] };
const heroClasses = [{ id: "fighter", name: "Combattant", abilityIds: [] }];

test("une bataille applique les survivants et l'état ghost au monde", () => {
  let nextId = 1;
  const game = new Game({ setup, heroClasses, unitDefinitions: [definition], idGenerator: (prefix) => `${prefix}-${nextId++}` });
  const first = game.chooseHero("p1", { name: "A", classId: "fighter" });
  const second = game.chooseHero("p2", { name: "B", classId: "fighter" });
  game.start();
  const battle = game.createBattle({
    config: { grid: { width: 6, height: 3 } },
    teamParticipants: [{ id: "red", heroIds: [first.id], positions: { [first.id]: { x: 1, y: 1 } } }, { id: "blue", heroIds: [second.id], positions: { [second.id]: { x: 2, y: 1 } } }],
  });
  const firstBattleHero = battle.teams[0].heroes[0];
  firstBattleHero.attack = 1000;
  battle.attack(firstBattleHero.id, battle.teams[1].heroes[0].id);
  assert.equal(battle.status, "finished");
  game.resolveBattle(battle.id);
  assert.equal(game.getHero(second.id).state, "ghost");
  assert.equal(game.getHero(second.id).health, 0);
});

test("les unités de garnison sont les défenseurs persistants de la bataille", () => {
  let nextId = 1;
  const game = new Game({ setup, heroClasses, unitDefinitions: [definition], locations: [{ id: "fort", name: "Fort", type: "fort", source: "scenario", position: { latitude: 0, longitude: 0 }, ownerId: "p2", features: { capturable: true, garrison: true }, garrison: { units: [{ id: "fort-guard", ownerPlayerId: "p2", typeId: "militia", quantity: 6, rank: "soldier" }] } }], idGenerator: (prefix) => `${prefix}-${nextId++}` });
  const attacker = game.chooseHero("p1", { name: "A", classId: "fighter" }); game.chooseHero("p2", { name: "B", classId: "fighter" }); game.start();
  const battle = game.createBattle({ teamParticipants: [{ id: "attackers", heroIds: [attacker.id] }, { id: "defenders", heroIds: [], locationId: "fort" }], sourceLocationId: "fort", sourceEnemyTeamId: "defenders" });
  assert.equal(battle.teams[1].units[0].sourceId, "fort-guard");
  assert.equal(battle.teams[1].units[0].typeId, "militia");
  assert.deepEqual(battle.teams[1].units[0].tags, []);
  assert.equal(battle.teams[1].units[0].quantity, 6);
  assert.deepEqual(battle.teams[1].units[0].soldierHealth, [8, 8, 8, 8, 8, 8]);
  assert.equal(battle.teams[1].heroes[0].sourceId, "location-fort");
});
