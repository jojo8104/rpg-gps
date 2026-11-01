import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGameStartController } from "../app/js/controllers/game-start-controller.js";
import { composeScenario } from "../app/js/core/scenario-composer.js";
import { GameSetup } from "../app/js/core/game-setup.js";
import {
  createGameSession,
  createSessionContext,
  resetGameSession,
  adoptSessionGame,
} from "../app/js/session/game-session.js";

test("chaque session possède ses propres placements et références de partie", () => {
  const first = createGameSession();
  const second = createGameSession();
  first.manualSetupPlacements.set("capital", { id: "first" });
  first.enabledGpsLocationIds = new Set(["first"]);
  first.game = { id: "game-1" };
  assert.equal(second.manualSetupPlacements.size, 0);
  assert.equal(second.game, null);
  assert.equal(second.enabledGpsLocationIds, null);
});
test("les contrôleurs lisent et modifient la session courante", () => {
  const session = createGameSession();
  const context = createSessionContext(session);
  context.localPlayerId = "alice";
  assert.equal(session.localPlayerId, "alice");
  const game = { heroes: [{ id: "hero-a", playerId: "alice" }] };
  adoptSessionGame(session, game);
  assert.equal(context.game, game);
  assert.equal(context.hero, game.heroes[0]);
});
test("la restauration remplace les héros par ceux du nouveau moteur", () => {
  const session = createGameSession();
  session.localPlayerId = "alice";
  adoptSessionGame(session, { heroes: [{ id: "old", playerId: "alice" }] });
  const next = {
    heroes: [
      { id: "new", playerId: "alice" },
      { id: "enemy", playerId: "bandits" },
    ],
  };
  adoptSessionGame(session, next);
  assert.equal(session.hero, next.heroes[0]);
  assert.equal(session.enemyHero, next.heroes[1]);
});
test("un héros absent de la partie restaurée ne provient pas de la précédente", () => {
  const session = createGameSession();
  session.hero = { id: "old" };
  session.enemyHero = { id: "old-enemy" };
  adoptSessionGame(session, { heroes: [] });
  assert.equal(session.hero, null);
  assert.equal(session.enemyHero, null);
});
test("la remise à zéro efface les placements sans invalider les contrôleurs", () => {
  const session = createGameSession();
  const context = createSessionContext(session);
  session.currentEncounter = { id: "battle" };
  session.game = { id: "old" };
  session.validatedPlayArea = { id: "old-area" };
  session.manualSetupPlacements.set("capital", {});
  resetGameSession(session);
  assert.equal(context.game, null);
  assert.equal(context.currentEncounter, null);
  assert.equal(context.validatedPlayArea, null);
  assert.equal(context.manualSetupPlacements.size, 0);
  resetGameSession(session);
});
test("les dépendances externes conservent leurs accès vivants", () => {
  const session = createGameSession();
  let catalog = { id: "first" };
  const context = createSessionContext(session, {
    get data() {
      return catalog;
    },
    set data(value) {
      catalog = value;
    },
  });
  context.data = { id: "second" };
  assert.equal(context.data, catalog);
  resetGameSession(session);
  assert.equal(context.data.id, "second");
});
test("une dépendance ne peut pas masquer un champ de session", () => {
  assert.throws(
    () => createSessionContext(createGameSession(), { game: {} }),
    /réservée/,
  );
});

test("le lancement GPS remplace le contexte précédent avant de préparer le nouveau monde", () => {
  const read = (name) =>
    JSON.parse(
      readFileSync(new URL(`../data/${name}.json`, import.meta.url), "utf8"),
    );
  const session = createGameSession();
  session.game = { id: "previous" };
  session.currentEncounter = { id: "old-battle" };
  session.locationMessage = "old-message";
  session.manualSetupPlacements.set("old-placement", {});
  const noop = () => {};
  const element = () => ({
    hidden: false,
    classList: { add: noop, toggle: noop },
    querySelector: () => ({}),
    addEventListener: noop,
  });
  const resets = Object.fromEntries(
    [
      "gps",
      "mapInteractions",
      "locations",
      "locationActions",
      "logistics",
      "relay",
      "dialogues",
      "battles",
      "playerInteractions",
      "playerInterface",
      "heroAbilities",
      "quests",
    ].map((name) => [name, { reset: noop }]),
  );
  const dependencies = {
    ...resets,
    $: element,
    data: {
      scenario: composeScenario(
        composeScenario(read("scenarios/chaos"), read("scenarios/repression")),
        read("scenarios/granaries-of-the-king"),
      ),
      heroClasses: read("hero-classes"),
      heroAptitudes: read("hero-aptitudes"),
      unitDefinitions: read("units"),
      locations: [
        ...read("locations"),
        ...read("repression-locations"),
        ...read("granaries-locations"),
      ],
    },
    resetSession: () => resetGameSession(session),
    multiplayer: { begin: noop },
    setupView: {
      readPositionMode: () => "gps",
      readHeroChoice: () => ({ name: "Alice", classId: "warrior" }),
      readSetup: () =>
        new GameSetup({
          id: "next",
          name: "Nouvelle partie",
          mode: "quick",
          scenarioId: "chaos",
          playerCount: 2,
          participants: [
            { playerId: "local", name: "Alice" },
            { playerId: "bandits", name: "Bandits" },
          ],
          playArea: {
            id: "area",
            name: "Zone",
            polygon: [
              { latitude: 0, longitude: 0 },
              { latitude: 0, longitude: 1 },
              { latitude: 1, longitude: 0 },
            ],
          },
        }),
    },
    positioning: { reset: noop, locationPositions: new Map() },
    worldMap: {
      reset: noop,
      initialize: noop,
      invalidateSize: noop,
      view: { setAlliedHeroes: noop },
    },
    ui: {
      setup: element(),
      lobby: element(),
      game: element(),
      gpsSetup: element(),
    },
    field: { clearPlayArea: noop },
    scenarioWorld: {},
    rebuildLocationEngine: noop,
    playerMapIntel: () => [],
    renderGpsLocationButtons: noop,
    startGps: noop,
    render: noop,
  };
  const context = createSessionContext(session, dependencies);
  createGameStartController(context).buildWorld();
  assert.equal(session.game.setup.id, "next");
  assert.equal(session.mode, "gps");
  assert.equal(session.currentEncounter, null);
  assert.equal(session.locationMessage, "");
  assert.equal(session.manualSetupPlacements.size, 0);
  assert.equal(session.hero.playerId, "local");
  assert.equal(session.gpsSetupActive, true);
  assert.equal(context.game, session.game);
});
