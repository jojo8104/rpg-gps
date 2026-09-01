import assert from "node:assert/strict";
import test from "node:test";
import { GameSetup } from "../app/js/core/game-setup.js";
import {
  createAutomaticHeroChoice,
  createQuickGameSetup,
} from "../app/js/ui/game-setup-view.js";

test("le setup rapide transforme les choix de l'interface en GameSetup valide", () => {
  const setup = createQuickGameSetup({
    name: " Sortie au parc ",
    scenarioId: "chaos",
  });
  assert.ok(setup instanceof GameSetup);
  assert.equal(setup.name, "Sortie au parc");
  assert.equal(setup.mode, "quick");
  assert.equal(setup.playerCount, 2);
  assert.deepEqual(
    setup.participants.map(({ playerId }) => playerId),
    ["local", "bandits"],
  );
  assert.equal(setup.rules.enableContentment, false);
});

test("le setup rapide transmet les règles expertes", () => {
  const setup = createQuickGameSetup({
    name: "Expert",
    scenarioId: "chaos",
    expertRules: true,
  });
  assert.equal(setup.rules.enableContentment, true);
  assert.equal(setup.rules.locationMode, "expert");
});

test("le setup rapide conserve la densité de sites choisie", () => {
  const setup = createQuickGameSetup({ siteDensity: "high" });
  assert.equal(setup.locationSetup.density, "high");
});

test("le setup ami est une partie solo qui n'attend aucun héros adverse", () => {
  const setup = createQuickGameSetup({
    name: "RPG GPS — Survie",
    scenarioId: "verdant-frontier",
    solo: true,
  });
  assert.equal(setup.playerCount, 1);
  assert.deepEqual(
    setup.participants.map(({ playerId }) => playerId),
    ["local"],
  );
});

test("le setup rapide rejette un nom de partie vide", () => {
  assert.throws(
    () => createQuickGameSetup({ name: "  ", scenarioId: "chaos" }),
    /nom de la partie/i,
  );
});

test("le setup génère un héros jouable sans formulaire dédié", () => {
  assert.deepEqual(createAutomaticHeroChoice(), {
    name: "Aldric",
    classId: "warrior",
    appearanceId: "knight",
  });
});

test("le choix de classe prépare le héros correspondant", () => {
  assert.deepEqual(createAutomaticHeroChoice("ranger"), {
    name: "Sylve",
    classId: "ranger",
    appearanceId: "ranger",
  });
  assert.equal(createAutomaticHeroChoice("mage").classId, "mage");
});
