import test from "node:test";
import assert from "node:assert/strict";
import { TerritoryService } from "../app/js/core/territory-service.js";
import { WorldState } from "../app/js/core/world-state.js";
import { PlayArea } from "../app/js/core/play-area.js";

const service = new TerritoryService();
function fixture(mode = "simulation") {
  const game = {
    coordinateMode: mode,
    status: "started",
    eventLog: [],
    territoryState: null,
    setup: {
      participants: [
        { playerId: "a", teamId: "green" },
        { playerId: "ally", teamId: "green" },
        { playerId: "b", teamId: "red" },
      ],
      teams: [
        { id: "green", factionId: "kingdom" },
        { id: "red", factionId: "chaos" },
      ],
      playArea: new PlayArea({
        id: "territory",
        name: "Terrain",
        polygon: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 48 },
          { latitude: 12, longitude: 48 },
          { latitude: 12, longitude: 0 },
        ],
      }),
    },
    worldState: new WorldState({ flags: { territory: { enabled: true } } }),
    locations: [
      {
        id: "capital-a",
        type: "capital",
        ownerId: "a",
        state: "active",
        position: { latitude: 5.5, longitude: 8.5 },
      },
      {
        id: "capital-b",
        type: "capital",
        ownerId: "b",
        state: "active",
        position: { latitude: 5.5, longitude: 20.5 },
      },
    ],
    heroes: [
      { playerId: "a", state: "active" },
      { playerId: "ally", state: "active" },
      { playerId: "b", state: "active" },
    ],
    finish(reason) {
      this.status = "finished";
      this.finishReason = reason;
    },
  };
  service.update(game, 0);
  return game;
}
const owner = (game, id) =>
  game.territoryState.view.cells.find((cell) => cell.id === id)?.teamId;
const position = (column) => ({ latitude: 5.5, longitude: column + 0.5 });
function hold(game, playerId, column, start, end) {
  for (let at = start; at <= end; at += 5000) {
    service.recordPosition(game, playerId, position(column), at, 5);
    service.update(game, at);
  }
}

test("les influences adverses se partagent sur la médiane et les alliés fusionnent sans frontière interne", () => {
  const game = fixture();
  assert.equal(owner(game, "5:13"), "green");
  assert.equal(owner(game, "5:14"), null);
  assert.equal(owner(game, "5:15"), "red");
  game.locations[1].ownerId = "ally";
  service.update(game, 1000);
  assert.equal(owner(game, "5:14"), "green");
  assert.ok(
    game.territoryState.view.edges.every(
      (edge) => edge.otherTeamId !== "green",
    ),
  );
  assert.ok(game.territoryState.view.occupation.green > 0);
});

test("une minute est exigée ; les conquêtes isolées reviennent au neutre après deux minutes", () => {
  const game = fixture();
  hold(game, "a", 35, 0, 55000);
  assert.equal(owner(game, "5:35"), null);
  hold(game, "a", 35, 60000, 60000);
  assert.equal(owner(game, "5:35"), "green");
  service.update(game, 179999);
  assert.equal(owner(game, "5:35"), "green");
  service.update(game, 180000);
  assert.equal(owner(game, "5:35"), null);
  assert.ok(game.eventLog.some((event) => event.type === "territory_lost"));
});

test("une conquête raccordée à la base reste acquise et ne capture pas le bâtiment", () => {
  const game = fixture();
  hold(game, "a", 14, 0, 60000);
  assert.equal(owner(game, "5:14"), "green");
  service.update(game, 500000);
  assert.equal(owner(game, "5:14"), "green");
  assert.equal(game.locations[1].ownerId, "b");
});

test("une présence adverse simultanée bloque la capture et un départ ou trou de mesures remet le délai à zéro", () => {
  const game = fixture();
  for (let at = 0; at <= 70000; at += 5000) {
    service.recordPosition(game, "a", position(35), at);
    service.recordPosition(game, "b", position(35), at);
    service.update(game, at);
  }
  assert.equal(owner(game, "5:35"), null);
  hold(game, "a", 35, 100000, 140000);
  service.recordPosition(game, "a", position(36), 145000);
  service.update(game, 145000);
  hold(game, "a", 35, 150000, 200000);
  assert.equal(owner(game, "5:35"), null);
  service.recordPosition(game, "a", position(35), 230000);
  service.update(game, 230000);
  assert.equal(owner(game, "5:35"), null);
});

test("un GPS absent ou imprécis et une déconnexion ne peuvent pas conquérir", () => {
  const game = fixture("gps");
  service.recordPosition(game, "a", position(35), 0, null);
  assert.deepEqual(game.territoryState.presence, {});
  service.recordPosition(game, "a", position(35), 1000, 100);
  assert.deepEqual(game.territoryState.presence, {});
  service.recordPosition(game, "a", position(35), 2000, 5);
  service.update(game, 2000, new Set());
  assert.deepEqual(game.territoryState.presence, {});
});

test("l’état sérialisé conserve les conquêtes et la victoire par taux est configurable", () => {
  const game = fixture();
  hold(game, "a", 35, 0, 60000);
  game.territoryState = JSON.parse(JSON.stringify(game.territoryState));
  service.update(game, 65000);
  assert.equal(owner(game, "5:35"), "green");
  game.worldState.set("territory.victoryOccupationRatio", 0.01);
  service.update(game, 70000);
  assert.equal(game.finishReason, "territory_occupation");
  assert.equal(game.worldState.get("territory.winnerTeamId"), "green");
});

test("les lieux en attente et les exclusions ne créent pas d’influence", () => {
  const game = fixture();
  game.scenarioRuntime = {
    placements: { capital: { locationId: "capital-a", status: "waiting" } },
  };
  service.update(game, 1000);
  assert.equal(owner(game, "5:8"), null);
  game.setup.playArea.excludedPolygons = [
    [
      { latitude: 4, longitude: 7 },
      { latitude: 4, longitude: 10 },
      { latitude: 7, longitude: 10 },
      { latitude: 7, longitude: 7 },
    ],
  ];
  service.update(game, 2000);
  assert.equal(owner(game, "5:8"), undefined);
});
