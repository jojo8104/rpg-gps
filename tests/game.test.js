import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const setup = {
  id: "setup-1", name: "Partie", mode: "quick", scenarioId: "chaos", playerCount: 2,
  playArea: { id: "area-1", name: "Parc", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] },
  participants: [{ playerId: "player-1", name: "Ariane" }, { playerId: "player-2", name: "Bastien" }],
  rules: { timeLimitMinutes: 30 },
};
const heroClasses = [{ id: "warrior", name: "Guerrier", abilityIds: ["shield_wall"] }];

test("une partie crée ses joueurs et démarre après le choix des héros", () => {
  let currentTime = 1_000;
  let nextId = 1;
  const game = new Game({ setup, heroClasses, now: () => currentTime, idGenerator: (prefix) => `${prefix}-${nextId++}` });
  assert.equal(game.players.length, 2);
  game.chooseHero("player-1", { name: "Aldric", classId: "warrior" });
  game.chooseHero("player-2", { name: "Nora", classId: "warrior" });
  assert.equal(game.start(), true);
  assert.equal(game.status, "started");
  currentTime += 10 * 60_000;
  assert.equal(game.getRemainingTimeMilliseconds(), 20 * 60_000);
  assert.equal(game.getHero("hero-1").abilityIds[0], "shield_wall");
});

test("une partie se termine lorsque sa limite de temps est atteinte", () => {
  let currentTime = 0;
  const game = new Game({ setup: { ...setup, playerCount: 1, participants: [setup.participants[0]], rules: { timeLimitMinutes: 1 } }, heroClasses, now: () => currentTime, idGenerator: () => "hero-1" });
  game.chooseHero("player-1", { name: "Aldric", classId: "warrior" });
  game.start();
  currentTime = 60_000;
  game.update();
  assert.equal(game.status, "finished");
  assert.equal(game.finishReason, "time_limit");
});
