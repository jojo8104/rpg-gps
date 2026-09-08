import assert from "node:assert/strict";
import test from "node:test";
import { Location } from "../app/js/core/location.js";
import {
  applyMultiplayerWorldState,
  createMultiplayerWorldState,
} from "../app/js/core/multiplayer-world-state.js";
import { BattleEngine } from "../app/js/core/battle-engine.js";

function location(stock = 2) {
  return new Location({
    id: "shared-camp",
    name: "Camp commun",
    type: "camp",
    source: "test",
    position: { latitude: 48.85, longitude: 2.35 },
    resources: { stock: { wood: stock } },
    garrison: { units: [] },
  });
}

test("un instantané reconstruit les lieux communs sans dépendre du DOM", () => {
  const snapshot = createMultiplayerWorldState([location(7)]);
  const game = { locations: [location(1)] };
  const restored = applyMultiplayerWorldState(game, snapshot);
  assert.equal(restored[0] instanceof Location, true);
  assert.equal(game.locations[0].resources.stock.wood, 7);
  assert.notEqual(game.locations[0], snapshot.locations[0]);
});

test("un instantané refuse les identifiants de lieux dupliqués", () => {
  const snapshot = createMultiplayerWorldState([location(), location()]);
  assert.throws(
    () => applyMultiplayerWorldState({ locations: [] }, snapshot),
    /plusieurs fois/,
  );
});

test("le mode simulation transmet la position réellement affichée", () => {
  const snapshot = createMultiplayerWorldState(
    [location()],
    new Map([["shared-camp", [42, 17]]]),
  );
  assert.deepEqual(snapshot.locations[0].position, {
    latitude: 42,
    longitude: 17,
  });
});

test("quêtes, monde narratif et groupes autonomes sont reconstruits ensemble", () => {
  const snapshot = {
    ...createMultiplayerWorldState([location()]),
    worldState: { flags: { warning: true }, npcs: [] },
    availableQuests: [{ id: "quest-1", title: "Alerte" }],
    lastQuestResult: null,
    questDeadlines: { "quest-1": { expiresAt: 5000 } },
    evacuationStates: {},
    autonomousGroups: [{
      id: "column-1",
      type: "army",
      owner: { kind: "faction", id: "chaos" },
      position: { latitude: 48.851, longitude: 2.351 },
      army: { units: [] },
    }],
    autonomousGroupTraces: [],
    watchBeacons: [],
  };
  const game = {
    locations: [],
    scenario: null,
    worldState: null,
    availableQuests: [],
    lastQuestResult: null,
    questDeadlines: {},
    evacuationStates: {},
    autonomousGroups: [],
    autonomousGroupTraces: [],
    watchBeacons: [],
  };
  applyMultiplayerWorldState(game, snapshot);
  assert.equal(game.worldState.get("warning"), true);
  assert.equal(game.availableQuests[0].id, "quest-1");
  assert.equal(game.autonomousGroups[0].id, "column-1");
});

test("un combat actif conserve son temps, ses formations et ses ordres", () => {
  const battle = new BattleEngine({
    id: "battle-shared",
    teams: [
      {
        id: "heroes",
        heroes: [{ id: "hero-1", playerId: "p1" }],
        units: [{
          id: "unit-1",
          playerId: "p1",
          typeId: "militia",
          maxQuantity: 4,
          quantity: 4,
          attack: 2,
          defense: 1,
          speed: 1,
        }],
      },
      { id: "enemy", heroes: [{ id: "enemy-1", playerId: "enemy" }], units: [] },
    ],
  });
  battle.start();
  battle.tick(500);
  const serialized = battle.toJSON();
  serialized.teams[0].units[0].lane = 2;
  serialized.teams[0].units[0].targetId = "enemy-1";
  const game = { locations: [location()], scenario: null, battles: [] };
  applyMultiplayerWorldState(game, {
    ...createMultiplayerWorldState(game.locations),
    battles: [serialized],
  });
  assert.equal(game.battles[0].status, "active");
  assert.equal(game.battles[0].state.elapsedMs, 500);
  assert.equal(game.battles[0].teams[0].units[0].lane, 2);
  assert.equal(game.battles[0].teams[0].units[0].targetId, "enemy-1");
});
