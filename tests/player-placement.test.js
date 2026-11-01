import test from "node:test";
import assert from "node:assert/strict";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { Game } from "../app/js/core/game.js";
import { PlayerPlacementService } from "../app/js/core/player-placement-service.js";
import { WorldState } from "../app/js/core/world-state.js";
import { preparationCatalog } from "../server/lobby/preparation-catalog.js";
import { updatePartyPreparation } from "../app/js/core/party-preparation.js";

const area = {
  id: "area",
  name: "Terrain",
  polygon: [
    { latitude: 48.84, longitude: 2.32 },
    { latitude: 48.84, longitude: 2.4 },
    { latitude: 48.9, longitude: 2.4 },
    { latitude: 48.9, longitude: 2.32 },
  ],
};
function party(mode) {
  let now = 1000;
  const service = new LobbyService({
    now: () => now,
    questSystemEnabled: false,
  });
  const host = service.createLobby({
    playerName: "Organisateur",
    maxPlayers: 2,
  });
  const token = host.session.token;
  service.setPlayArea({ token, playArea: area });
  service.configurePreparation({
    token,
    change: {
      location: {
        id: "supply-fort",
        placement: mode,
        ...(mode === "player-walk" ? { walkingDistanceMeters: 10 } : {}),
      },
    },
  });
  service.selectHeroClass({ token, heroClassId: "warrior" });
  service.setReady({ token, ready: true });
  service.startLobby({ token });
  return {
    service,
    token,
    host,
    state: () => service.gameSnapshot(host.lobby.code).state,
    advance: (ms = 10000) => (now += ms),
    position: (position) => service.updatePlayerPosition({ token, position }),
    command: (action, fields = {}) =>
      service.executeGameCommand({
        token,
        command: "playerPlacementCommand",
        args: [{ action, ...fields }],
      }).result,
  };
}
test("la configuration accepte les placements différés et borne la distance", () => {
  assert.ok(
    !preparationCatalog.locations
      .find((l) => l.id === "capital")
      .placementOptions.includes("player-walk"),
  );
  assert.ok(
    preparationCatalog.locations
      .find((l) => l.id === "supply-fort")
      .placementOptions.includes("validated-cell"),
  );
  const config = updatePartyPreparation(
    null,
    { location: { id: "supply-fort", placement: "player-walk" } },
    preparationCatalog,
    area,
  );
  assert.equal(config.locations["supply-fort"].walkingDistanceMeters, 300);
  for (const distance of [0, 10001, "300", NaN])
    assert.throws(() =>
      updatePartyPreparation(
        config,
        { location: { id: "supply-fort", walkingDistanceMeters: distance } },
        preparationCatalog,
        area,
      ),
    );
  const switched = updatePartyPreparation(
    config,
    { location: { id: "supply-fort", placement: "validated-cell" } },
    preparationCatalog,
    area,
  );
  assert.equal(
    switched.locations["supply-fort"].walkingDistanceMeters,
    undefined,
  );
});
test("le serveur suit la marche, refuse les coordonnées fournies et place une seule fois", () => {
  const p = party("player-walk");
  const publicOptions = p.service.projectForPlayer(
    p.token,
    p.service.executeGameCommand({
      token: p.token,
      command: "playerPlacementCommand",
      args: [{ action: "options" }],
    }),
  );
  assert.equal(publicOptions.result.pendingLocations[0].id, "supply-fort");
  assert.equal(
    p.state().scenarioRuntime.placements["supply-fort"].status,
    "player-pending",
  );
  assert.equal(
    p.command("start-walk", { slotId: "supply-fort" }).reason,
    "fresh_position_required",
  );
  assert.throws(
    () =>
      p.command("place-walk", {
        slotId: "supply-fort",
        position: { latitude: 48.88, longitude: 2.38 },
      }),
    { code: "command_forbidden" },
  );
  assert.throws(() => p.command("options", { playerId: "someone-else" }), {
    code: "command_forbidden",
  });
  p.position({ latitude: 48.85, longitude: 2.33, accuracy: 5 });
  assert.equal(
    p.command("start-walk", { slotId: "supply-fort" }).success,
    true,
  );
  assert.equal(
    p.command("place-walk", { slotId: "supply-fort" }).reason,
    "walking_distance_required",
  );
  p.advance();
  p.position({ latitude: 48.8502, longitude: 2.33, accuracy: 5 });
  const result = p.command("place-walk", { slotId: "supply-fort" });
  assert.equal(result.success, true);
  assert.deepEqual(
    p.state().scenarioRuntime.placements["supply-fort"].position,
    { latitude: 48.8502, longitude: 2.33 },
  );
  assert.equal(
    p.command("place-walk", { slotId: "supply-fort" }).reason,
    "placement_unavailable",
  );
});
test("les mesures imprécises, périmées et les sauts ne débloquent pas la marche", () => {
  const p = party("player-walk");
  p.position({ latitude: 48.85, longitude: 2.33 });
  assert.equal(
    p.command("start-walk", { slotId: "supply-fort" }).reason,
    "fresh_position_required",
  );
  p.advance();
  p.position({ latitude: 48.85, longitude: 2.33, accuracy: 5 });
  p.command("start-walk", { slotId: "supply-fort" });
  p.advance();
  p.position({ latitude: 48.88, longitude: 2.38, accuracy: 5 });
  assert.equal(p.command("options").pendingLocations[0].walk.distanceMeters, 0);
  p.advance();
  p.position({ latitude: 48.8802, longitude: 2.38, accuracy: 200 });
  assert.equal(p.command("options").pendingLocations[0].walk.distanceMeters, 0);
  p.advance(31000);
  assert.equal(
    p.command("place-walk", { slotId: "supply-fort" }).reason,
    "fresh_position_required",
  );
});
test("repérage officiel, consommation unique et reprise persistante", () => {
  const p = party("validated-cell");
  p.position({ latitude: 48.85, longitude: 2.33, accuracy: 5 });
  const started = p.command("start-survey");
  assert.equal(started.success, true);
  assert.equal(started.mission.status, "active");
  assert.equal(
    p.command("complete-survey").reason,
    "survey_target_not_reached",
  );
  p.advance();
  p.position({ ...started.mission.cell.center, accuracy: 5 });
  const completed = p.command("complete-survey");
  assert.equal(completed.success, true);
  assert.equal(completed.cells.length, 1);
  assert.equal(p.command("complete-survey").reason, "survey_not_active");
  const snapshot = p.state();
  const restored = Game.fromJSON(snapshot);
  assert.deepEqual(
    restored.worldState.get("playerPlacement"),
    snapshot.worldState.flags.playerPlacement,
  );
  const projected = p.service.projectForPlayer(
    p.token,
    p.service.gameSnapshot(p.host.lobby.code),
  );
  assert.equal(projected.state.worldState.flags.playerPlacement, undefined);
  assert.equal(
    p.command("place-cell", {
      slotId: "supply-fort",
      cellId: completed.cells[0].id,
    }).success,
    true,
  );
  assert.equal(p.command("options").cells.length, 0);
  assert.equal(
    p.command("place-cell", {
      slotId: "supply-fort",
      cellId: completed.cells[0].id,
    }).reason,
    "placement_unavailable",
  );
});
test("le stock appartient à l’équipe et un refus ne consomme pas la case", () => {
  const service = new PlayerPlacementService();
  const cell = {
    id: "1:2",
    center: { latitude: 2, longitude: 3 },
    bounds: [],
    teamId: "blue",
    usedBy: null,
  };
  const game = {
    coordinateMode: "simulation",
    status: "started",
    worldState: new WorldState({
      flags: {
        playerPlacement: { walks: {}, missions: {}, cells: { "1:2": cell } },
      },
    }),
    territoryService: {
      teamFor: (_game, id) => (id === "enemy" ? "red" : "blue"),
    },
    heroes: ["p1", "p2", "enemy"].map((playerId) => ({
      playerId,
      state: "active",
    })),
    scenarioRuntime: {
      placements: {
        site: {
          locationId: "site",
          strategy: "validated-cell",
          status: "player-pending",
          world: { visibility: "known" },
        },
      },
    },
    setup: { playArea: { allowsPlacement: () => true } },
    now: () => 1000,
    getLocation: () => ({ id: "site", name: "Site" }),
    updateLocationPosition: () => ({
      success: false,
      reason: "location_too_close",
    }),
  };
  assert.equal(service.options(game, "p2").cells.length, 1);
  assert.equal(service.options(game, "enemy").cells.length, 0);
  assert.equal(
    service.command(
      game,
      {
        playerId: "enemy",
        action: "place-cell",
        slotId: "site",
        cellId: cell.id,
      },
      cell.center,
    ).reason,
    "cell_unavailable",
  );
  assert.equal(
    service.command(
      game,
      { playerId: "p2", action: "place-cell", slotId: "site", cellId: cell.id },
      cell.center,
    ).reason,
    "location_too_close",
  );
  assert.equal(service.options(game, "p1").cells.length, 1);
});

test("la simulation suit les mêmes intentions avec la distance de test", () => {
  const service = new PlayerPlacementService();
  const game = {
    coordinateMode: "simulation",
    status: "started",
    worldState: new WorldState(),
    territoryService: { teamFor: () => "blue" },
    heroes: [{ playerId: "p1", state: "active" }],
    scenarioRuntime: {
      placements: {
        site: {
          locationId: "site",
          strategy: "player-walk",
          status: "player-pending",
          walkingDistanceMeters: 20,
          world: { visibility: "known" },
        },
      },
    },
    setup: {
      playArea: { allowsPlacement: (p) => p.latitude >= 0 },
      locationSetup: {},
    },
    now: () => 1000,
    getLocation: () => ({ id: "site", name: "Site" }),
    eventLog: [],
    updateLocationPosition: ({ position }) => ({ success: true, position }),
  };
  const action = (action) =>
    service.command(
      game,
      { playerId: "p1", action, slotId: "site" },
      { latitude: 2, longitude: 0 },
    );
  assert.equal(action("start-walk").success, true);
  service.recordPosition(game, "p1", { latitude: 3, longitude: 0 }, null, 2000);
  assert.equal(action("place-walk").reason, "walking_distance_required");
  service.recordPosition(game, "p1", { latitude: 4, longitude: 0 }, null, 3000);
  assert.equal(action("place-walk").success, true);
  assert.equal(game.scenarioRuntime.placements.site.status, "placed");
  assert.equal(action("place-walk").reason, "placement_unavailable");
});
