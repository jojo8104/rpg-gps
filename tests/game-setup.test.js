import assert from "node:assert/strict";
import test from "node:test";
import { GameSetup } from "../app/js/core/game-setup.js";

const playArea = { id: "area-1", name: "Parc", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] };

test("le mode organizer permet sa configuration complète", () => {
  const setup = new GameSetup({ id: "setup-1", name: "Campagne", mode: "organizer", scenarioId: "chaos", playArea, teams: [{ id: "kingdom", name: "Royaume", factionId: "kingdom" }] });
  assert.equal(setup.rules.maxPlayers, 20);
  assert.equal(setup.locationSetup.generationMode, "manual");
  assert.equal(setup.registerPlayer({ playerId: "player-1", teamId: "kingdom" }), true);
  assert.equal(setup.registerPlayer({ playerId: "player-1", teamId: "kingdom" }), false);
});

test("une partie ne démarre qu'après validation du nombre de joueurs", () => {
  const setup = new GameSetup({ id: "setup-1", name: "Partie rapide", mode: "quick", scenarioId: "chaos", playArea });
  setup.setStatus("ready");
  assert.equal(setup.canStart, false);
  assert.throws(() => setup.setStatus("started"));
  setup.registerPlayer({ playerId: "player-1" });
  assert.equal(setup.canStart, true);
  setup.setStatus("started");
  assert.equal(setup.registerPlayer({ playerId: "player-2" }), false);
});

test("la densité calcule un nombre de lieux borné par la superficie", () => {
  const setup = new GameSetup({
    id: "setup-1", name: "Partie", mode: "custom", scenarioId: "chaos", playArea,
    rules: { timeLimitMinutes: 90 },
    locationSetup: { density: "high", minLocations: 3, maxLocations: 12 },
  });
  assert.equal(setup.rules.timeLimitMinutes, 90);
  assert.equal(setup.getGeneratedLocationCount(), 12);
});

test("la configuration avancée conserve une politique de portée", () => {
  const setup = new GameSetup({ id: "setup-ranges", name: "Portées", mode: "custom", scenarioId: "chaos", playArea, locationSetup: { rangePolicy: { mode: "fixed", maxInteractionMeters: 25, typeOverrides: { fort: { interactionRadius: 18 } } } } });
  assert.equal(setup.locationSetup.rangePolicy.mode, "fixed");
  assert.equal(setup.locationSetup.rangePolicy.maxInteractionMeters, 25);
  assert.equal(setup.locationSetup.rangePolicy.typeOverrides.fort.interactionRadius, 18);
});
