import { retireInteriorExceptionalSites } from "../app/js/core/exploration-exterior-migration.js";
import assert from "node:assert/strict";
import test from "node:test";
import { ExplorationState } from "../app/js/core/exploration-state.js";
import { Game } from "../app/js/core/game.js";
import { createMultiplayerWorldState } from "../app/js/core/multiplayer-world-state.js";
import { explorationSnapshot } from "./fixtures/exploration-state.js";
import { socialGame } from "./fixtures/player-social-game.js";

const jsonRoundTrip = (value) => JSON.parse(JSON.stringify(value));

test("l’état complet conserve indices, connaissances, échéances, missions et issues en JSON", () => {
  const state = new ExplorationState(explorationSnapshot());
  const snapshot = state.toJSON();
  assert.deepEqual(
    new ExplorationState(jsonRoundTrip(snapshot)).toJSON(),
    snapshot,
  );
  assert.equal(snapshot.generation.seed, "private-seed-8d3");
  assert.deepEqual(
    snapshot.clueSeries[0].fragments.map((f) => f.id),
    ["first", "second"],
  );
  assert.equal(Object.hasOwn(snapshot.clues[2], "authentic"), false);
  assert.equal(snapshot.clues[1].status, "archived");
  assert.equal(snapshot.searches[0].cooldownUntil, 61000);
  assert.equal(snapshot.searches[0].discretionPenaltyUntil, 61000);
  assert.equal(snapshot.expeditions[0].scores.narrative, 12);
  assert.deepEqual(snapshot.expeditions[1].processedEventIds, [
    "dungeon-result",
  ]);
  assert.equal(snapshot.expeditions[1].result.heroDamage, 12);
  assert.equal(snapshot.sites[1].status, "won");
  assert.equal(snapshot.sites[2].status, "disappeared");
  assert.equal(snapshot.cells[3].resource, "fertile-land");
});

test("les copies d’entrée et de sortie ne partagent pas les objets du modèle", () => {
  const input = explorationSnapshot();
  const state = new ExplorationState(input);
  input.clueSeries[0].fragments[0].text = "Écrasé";
  input.expeditions[1].result.heroDamage = 999;
  const output = state.toJSON();
  output.clueSeries[0].fragments[0].text = "Écrasé aussi";
  output.expeditions[1].result.heroDamage = 888;
  assert.notEqual(state.clueSeries[0].fragments[0].text, "Écrasé");
  assert.notEqual(state.clueSeries[0].fragments[0].text, "Écrasé aussi");
  assert.equal(state.expeditions[1].result.heroDamage, 12);
});

test("une ancienne sauvegarde reçoit un état vide sans recréer ou résoudre de contenu", () => {
  const { game } = socialGame();
  const legacy = game.toJSON();
  delete legacy.explorationState;
  const restored = Game.fromJSON(jsonRoundTrip(legacy), { now: () => 900000 });
  assert.deepEqual(
    restored.explorationState.toJSON(),
    new ExplorationState().toJSON(),
  );
  const actual = restored.toJSON();
  delete actual.explorationState;
  assert.deepEqual(actual, legacy);
});

test("Game conserve les tirages et conséquences sans rejouer une mission à la reprise", () => {
  const { game } = socialGame();
  game.explorationState = new ExplorationState(explorationSnapshot());
  const before = jsonRoundTrip(game.toJSON());
  const restored = Game.fromJSON(before, { now: () => 5000000 });
  assert.equal(retireInteriorExceptionalSites(before.explorationState), 1);
  assert.deepEqual(jsonRoundTrip(restored.toJSON()), before);
  assert.notEqual(restored.explorationState, game.explorationState);
  assert.deepEqual(
    restored.heroes.map((hero) => hero.toJSON()),
    before.heroes,
  );
  assert.equal(
    Object.hasOwn(createMultiplayerWorldState(game), "explorationState"),
    false,
  );
});

test("les données invalides sont rejetées, y compris après mutation du modèle", () => {
  const invalid = [
    (s) => {
      s.version = 2;
    },
    (s) => {
      s.version = 0;
    },
    (s) => {
      s.cells.push(s.cells[0]);
    },
    (s) => {
      s.cells[1].row = 0;
      s.cells[1].column = 0;
    },
    (s) => {
      s.cells[0].resource = "silver";
    },
    (s) => {
      s.cells[0].row = -1;
    },
    (s) => {
      s.grid = null;
    },
    (s) => {
      s.grid.cellSizeMeters = 0;
    },
    (s) => {
      s.sites[0].cellId = "missing";
    },
    (s) => {
      s.sites[1].resolution = null;
    },
    (s) => {
      s.sites[0].requirements.expedition = 0;
    },
    (s) => {
      s.clueSeries[0].fragments = [];
    },
    (s) => {
      s.clueSeries[0].fragments = [1, 2, 3, 4].map((id) => ({
        id: String(id),
        text: "texte",
      }));
    },
    (s) => {
      s.clues[0].text = "bonus de recherche aussi";
    },
    (s) => {
      s.clues[2].seriesId = "treasure-series";
    },
    (s) => {
      s.clues[0].fragmentId = "missing";
    },
    (s) => {
      s.clues[0].siteId = "lost-artifact";
    },
    (s) => {
      s.discoveries.push(s.discoveries[0]);
    },
    (s) => {
      s.discoveries[0].targetId = "missing";
    },
    (s) => {
      s.searches[0].cooldownUntil = 1;
    },
    (s) => {
      s.searches[0].preparation.resources.wood = -2;
    },
    (s) => {
      s.searches[0].preparation.clueIds = ["missing"];
    },
    (s) => {
      s.searches[1].result = null;
    },
    (s) => {
      s.expeditions[0].heroId = "hero-a";
    },
    (s) => {
      s.expeditions[0].kind = "artifact";
    },
    (s) => {
      s.expeditions[0].preparation.volunteers[0].quantity = 1.5;
    },
    (s) => {
      s.expeditions[1].completedAt = null;
    },
    (s) => {
      s.expeditions[1].result.damage = NaN;
    },
    (s) => {
      s.expeditions[1].result.extra = new Map();
    },
    (s) => {
      s.expeditions[1].result.extra = new Date();
    },
    (s) => {
      s.expeditions[1].result.extra = () => {};
    },
    (s) => {
      s.expeditions[1].result.self = s.expeditions[1].result;
    },
  ];
  for (const mutate of invalid) {
    const snapshot = explorationSnapshot();
    mutate(snapshot);
    assert.throws(
      () => new ExplorationState(snapshot),
      undefined,
      mutate.toString(),
    );
  }
  const state = new ExplorationState(explorationSnapshot());
  state.cells[0].resource = "silver";
  assert.throws(() => state.toJSON(), /contenu naturel/);
});

test("les découvertes sont distinctes par joueur et les seuils non décidés restent nuls", () => {
  const snapshot = explorationSnapshot();
  snapshot.discoveries.push({ ...snapshot.discoveries[0], playerId: "b" });
  const state = new ExplorationState(snapshot);
  assert.equal(
    state.discoveries.filter((entry) => entry.targetId === "hidden-treasure")
      .length,
    2,
  );
  assert.deepEqual(state.sites[2].requirements, {
    expedition: null,
    power: null,
  });
  assert.equal(state.sites[2].rewards, null);
  assert.equal(state.expeditions[2].scores.expedition, null);
});
