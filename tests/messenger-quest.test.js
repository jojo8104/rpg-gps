import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Game } from "../app/js/core/game.js";

const scenario = JSON.parse(readFileSync(new URL("../data/scenarios/chaos.json", import.meta.url), "utf8"));
const locations = JSON.parse(readFileSync(new URL("../data/locations.json", import.meta.url), "utf8"));
const heroClasses = JSON.parse(readFileSync(new URL("../data/hero-classes.json", import.meta.url), "utf8"));
const unitDefinitions = JSON.parse(readFileSync(new URL("../data/units.json", import.meta.url), "utf8"));
const specialLocationIds = { refuge: "fort-nord", capital: "royal-capital", "royal-camp": "village-vert", "prospectors-battlefield": "prospector-battlefield" };
const bindings = scenario.locationSlots.map(({ id }) => ({ locationSlotId: id, locationId: specialLocationIds[id] ?? id }));

function createGame(now) {
  const game = new Game({
    setup: { id: "messenger", name: "Messager", mode: "quick", scenarioId: "chaos", playerCount: 1, playArea: { id: "area", name: "Zone", polygon: [{ latitude: -89, longitude: -179 }, { latitude: -89, longitude: 179 }, { latitude: 89, longitude: 179 }, { latitude: 89, longitude: -179 }] }, participants: [{ playerId: "local", name: "Joueur" }] },
    scenario, locations, heroClasses, unitDefinitions, scenarioLocationBindings: bindings, coordinateMode: "simulation", scenarioStartsActive: false, now,
  });
  game.chooseHero("local", { name: "Messager", classId: "warrior" }); game.start();
  game.configureQuestSequence([{ id: "royal-messenger", title: "Le Messager", description: "Livrer le pli.", startPhaseId: "receive-fort-message", phaseIds: ["receive-fort-message", "deliver-fort-message", "messenger-failed"] }]);
  game.offerQuest({ id: "royal-messenger", title: "Le Messager", description: "Livrer le pli.", startPhaseId: "receive-fort-message" }); game.acceptAvailableQuest("royal-messenger");
  return game;
}

test("le message révèle le fortin opposé et démarre un délai de trois minutes en simulation", () => {
  let time = 1_000; const game = createGame(() => time);
  const result = game.dispatchQuestEvent({ type: "InteractionCompleted", interactionId: "take-sealed-message", locationId: "supply-fort" });
  assert.equal(result.nextPhaseId, "deliver-fort-message");
  assert.equal(game.getPlayer("local").knowsLocation("opposite-fort"), true);
  assert.equal(game.questDeadlines["fort-message-delivery"].expiresAt, 181_000);
  assert.equal(game.getHero(game.getPlayer("local").heroIds[0]).carriedLoot.some((item) => item.itemId === "sealed_fort_message"), true);
});

test("livrer à temps dépose le pli et termine la quête", () => {
  let time = 1_000; const game = createGame(() => time); const hero = game.getHero(game.getPlayer("local").heroIds[0]);
  game.dispatchQuestEvent({ type: "InteractionCompleted", interactionId: "take-sealed-message", locationId: "supply-fort" }); time = 120_000;
  const result = game.dispatchQuestEvent({ type: "InteractionCompleted", interactionId: "deliver-sealed-message", locationId: "opposite-fort" });
  assert.equal(result.phaseCompleted, true); assert.equal(game.questDeadlines["fort-message-delivery"].completedAt, time);
  assert.equal(hero.carriedLoot.some((item) => item.itemId === "sealed_fort_message"), false);
  assert.equal(game.getLocation("opposite-fort").storedItems.some((item) => item.itemId === "sealed_fort_message"), true);
});

test("l'expiration du délai échoue la quête et détruit le pli", () => {
  let time = 1_000; const game = createGame(() => time); const hero = game.getHero(game.getPlayer("local").heroIds[0]);
  game.dispatchQuestEvent({ type: "InteractionCompleted", interactionId: "take-sealed-message", locationId: "supply-fort" }); time = 181_000; game.update();
  assert.equal(game.getActiveQuest(), null);
  assert.equal(game.questDeadlines["fort-message-delivery"].failedAt, time);
  assert.equal(game.getLastQuestResult().outcome, "deadline_expired");
  assert.equal(hero.carriedLoot.some((item) => item.itemId === "sealed_fort_message"), false);
});
