import test from "node:test";
import assert from "node:assert/strict";
import { selectedPreparationLocationIds } from "../app/js/core/preparation-location-selection.js";
import { selectPreparedWorld } from "../server/lobby/prepared-world-selection.js";
import { Game } from "../app/js/core/game.js";
import {
  preparationCatalog,
  preparationGameData,
  preparationBindings,
} from "../server/lobby/preparation-catalog.js";

test("un lieu partagé reste tant qu’une quête retenue en a besoin", () => {
  const catalog = {
    quests: [
      { id: "a", locationIds: ["shared", "a-only"] },
      { id: "b", locationIds: ["shared"] },
    ],
    locations: [
      { id: "shared" },
      { id: "a-only" },
      { id: "world" },
      { id: "start", permanent: true },
    ],
  };
  assert.deepEqual(
    [...selectedPreparationLocationIds({ excludedQuestIds: ["a"] }, catalog)],
    ["shared", "world", "start"],
  );
  assert.deepEqual(
    [
      ...selectedPreparationLocationIds(
        { excludedQuestIds: ["a", "b"] },
        catalog,
      ),
    ],
    ["world", "start"],
  );
});

test("le scénario ne crée que les dix lieux initiaux, même si toutes les quêtes sont retenues", () => {
  const selected = selectPreparedWorld(preparationGameData, preparationBindings, preparationCatalog, { excludedQuestIds: [], locations: {} });
  assert.equal(selected.locations.length, 10);
  assert.equal(selected.locations.filter(location => location.type === "capital").length, 1);
  assert.equal(selected.locations.filter(location => location.type === "village").length, 4);
  assert.equal(selected.locations.filter(location => location.type === "fort").length, 1);
  assert.deepEqual(selected.locations.filter(location => location.type === "fort").map(location => location.id), ["supply-fort"]);
  assert.equal(selected.locations.filter(location => ["mine", "quarry", "lumber-camp"].includes(location.type)).length, 4);
  assert.ok(!selected.locations.some(location => ["gold-mine", "bandit-camp", "fort-nord", "village-vert", "evacuation-camp", "royal-gold-mine"].includes(location.id)));
  const game = new Game({ ...preparationGameData,
    scenarioLocationBindings: preparationBindings,
    setup: { id: "minimal", name: "Minimal", mode: "quick", scenarioId: "chaos", playerCount: 1,
      participants: [{ playerId: "p", name: "Joueur" }], playArea: { id: "area", name: "Zone", polygon: [
        { latitude: 48, longitude: 2 }, { latitude: 48, longitude: 3 },
        { latitude: 49, longitude: 3 }, { latitude: 49, longitude: 2 } ] } },
    scenarioStartsActive: false,
  });
  assert.equal(game.locations.length, 10);
  assert.equal(Game.fromJSON(game.toJSON()).locations.length, 10);
});

test("une ancienne préparation ne réintroduit pas de lieu retiré par ses placements", () => {
  const selected = selectPreparedWorld(
    preparationGameData,
    preparationBindings,
    preparationCatalog,
    {
      excludedQuestIds: ["missing-prospectors"],
      locations: { "gold-mine": { placement: "qr", qrId: "old" } },
    },
  );
  assert.deepEqual(selected.preparation.locations, {});
  assert.ok(!selected.locations.some((l) => l.id === "gold-mine"));
  assert.ok(!selected.bindings.some((b) => b.locationSlotId === "gold-mine"));
  assert.ok(preparationGameData.locations.some((l) => l.id === "gold-mine"));
});

test("les lieux économiques utilisés par une quête restent avec leurs réglages après son retrait", () => {
  const selected = selectPreparedWorld(preparationGameData, preparationBindings,
    preparationCatalog, { excludedQuestIds: ["royal-fort-supply"], locations: {
      "capital-resource-gold-village": { placement: "qr", qrId: "village-world" },
    } });
  assert.equal(selected.preparation.locations["capital-resource-gold-village"].qrId, "village-world");
  for (const resource of ["gold", "iron", "wood", "stone"])
    assert.ok(selected.locations.some((l) => l.id === `capital-resource-${resource}-village`));
});
