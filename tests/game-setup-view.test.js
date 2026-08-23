import assert from "node:assert/strict";
import test from "node:test";
import { GameSetup } from "../app/js/core/game-setup.js";
import { createAutomaticHeroChoice, createQuickGameSetup, isLocationPlacementAllowed } from "../app/js/ui/game-setup-view.js";
import { PlayArea } from "../app/js/core/play-area.js";

test("le setup rapide transforme les choix de l'interface en GameSetup valide", () => {
  const setup = createQuickGameSetup({ name: " Sortie au parc ", scenarioId: "chaos" });
  assert.ok(setup instanceof GameSetup);
  assert.equal(setup.name, "Sortie au parc");
  assert.equal(setup.mode, "quick");
  assert.equal(setup.playerCount, 2);
  assert.deepEqual(setup.participants.map(({ playerId }) => playerId), ["local", "bandits"]);
  assert.equal(setup.rules.enableContentment, false);
});

test("le setup rapide transmet les règles expertes", () => {
  const setup = createQuickGameSetup({ name: "Expert", scenarioId: "chaos", expertRules: true });
  assert.equal(setup.rules.enableContentment, true);
  assert.equal(setup.rules.locationMode, "expert");
});

test("le setup rapide rejette un nom de partie vide", () => {
  assert.throws(() => createQuickGameSetup({ name: "  ", scenarioId: "chaos" }), /nom de la partie/i);
});

test("le setup génère un héros jouable sans formulaire dédié", () => {
  assert.deepEqual(createAutomaticHeroChoice(), { name: "Aldric", classId: "warrior", appearanceId: "knight" });
});

test("un lieu ne peut être placé que dans une zone validée", () => {
  const area = new PlayArea({ id: "area", name: "Zone", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] });
  assert.equal(isLocationPlacementAllowed({ playArea: null, position: { latitude: .1, longitude: .1 } }), false);
  assert.equal(isLocationPlacementAllowed({ playArea: area, position: { latitude: .1, longitude: .1 } }), true);
  assert.equal(isLocationPlacementAllowed({ playArea: area, position: { latitude: 2, longitude: 2 } }), false);
});
