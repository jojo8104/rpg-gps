import assert from "node:assert/strict";
import test from "node:test";
import { explorationWorld } from "./fixtures/exploration-world.js";
import { Game } from "../app/js/core/game.js";
import { createExplorationProjection } from "../server/realtime/exploration-projection.js";
import { ExplorationDiscoveryService } from "../app/js/core/exploration-discovery-service.js";
import { LobbyService } from "../server/lobby/lobby-service.js";

for (const mode of ["gps", "simulation"])
  test(`prospection ${mode} : toutes les cases du segment, influence exclue, aucun producteur créé`, () => {
    const f = explorationWorld({ mode });
    const group = {
      owner: { kind: "player", id: "a" },
      mission: { phase: "exploring", discoveries: [] },
    };
    const before = f.game.locations.map((location) => location.toJSON());
    const segment = {
      from: f.at(2, 0).center,
      to: f.at(2, 6).center,
      toAt: 2000,
    };
    const found = f.game.explorationDiscoveryService.inspectProspectingSegment(
      group,
      segment,
    );
    assert.ok(found.includes(f.at(2, 2).id));
    assert.ok(found.includes(f.at(2, 5).id));
    assert.ok(found.includes("outside"));
    assert.ok(!found.includes(f.at(2, 1).id));
    assert.ok(!found.includes("hosted"));
    assert.deepEqual(
      f.game.locations.map((location) => location.toJSON()),
      before,
    );
    assert.deepEqual(f.game.itemAcquisitionService.state.rewards, []);
    assert.deepEqual(
      f.game.explorationDiscoveryService.inspectProspectingSegment(
        group,
        segment,
      ),
      [],
    );
    const packet = createExplorationProjection(f.game.toJSON(), "a", {
      now: 2000,
    }).view;
    assert.equal(packet.cells.length, 6);
    assert.equal(
      packet.cells.filter((cell) => cell.resource === "none").length,
      2,
    );
    assert.equal(packet.sites.length, 1);
    assert.equal(
      createExplorationProjection(f.game.toJSON(), "b", { now: 2000 }).view
        .cells.length,
      0,
    );
  });

test("spécialistes transportés : métier adapté, tirage strict, sans répétition après sauvegarde", () => {
  const f = explorationWorld();
  f.hero.resources.specialist_lumberjack = 1;
  let rolls = 0;
  f.game.explorationDiscoveryService.random = () => {
    rolls++;
    return 0.49;
  };
  const inspect = (position) =>
    f.game.explorationDiscoveryService.inspectHeroPosition({
      heroId: f.hero.id,
      position,
    });
  assert.deepEqual(inspect(f.at(2, 2).center), []);
  assert.equal(rolls, 0);
  assert.deepEqual(inspect(f.at(2, 3).center), [f.at(2, 3).id]);
  assert.equal(rolls, 1);
  inspect(f.at(2, 3).center);
  assert.equal(rolls, 1);
  const restored = Game.fromJSON(f.game.toJSON());
  restored.explorationDiscoveryService.random = () => {
    throw Error("Pas de nouveau tirage");
  };
  assert.deepEqual(
    restored.explorationDiscoveryService.inspectHeroPosition({
      heroId: f.hero.id,
      position: f.at(2, 3).center,
    }),
    [],
  );
  assert.equal(restored.explorationState.discoveryAttempts.length, 1);
});

test("échec mémorisé par joueur et spécialité ; plusieurs exemplaires ne donnent pas plusieurs essais", () => {
  const f = explorationWorld();
  f.hero.resources.specialist_geologist = 3;
  let rolls = 0;
  f.game.explorationDiscoveryService.random = () => {
    rolls++;
    return 0.5;
  };
  for (let i = 0; i < 5; i++)
    f.game.explorationDiscoveryService.inspectHeroPosition({
      heroId: f.hero.id,
      position: f.at(2, 2).center,
    });
  assert.equal(rolls, 1);
  assert.equal(f.game.explorationState.discoveries.length, 0);
  const restored = Game.fromJSON(f.game.toJSON());
  restored.explorationDiscoveryService.random = () => {
    throw Error("Échec conservé");
  };
  assert.deepEqual(
    restored.explorationDiscoveryService.inspectHeroPosition({
      heroId: f.hero.id,
      position: f.at(2, 2).center,
    }),
    [],
  );
  f.hero.resources.specialist_miner = 1;
  f.game.explorationDiscoveryService.random = () => 0;
  assert.equal(
    f.game.explorationDiscoveryService.inspectHeroPosition({
      heroId: f.hero.id,
      position: f.at(2, 2).center,
    }).length,
    1,
  );
  const own = createExplorationProjection(f.game.toJSON(), "a");
  assert.equal(
    own.sanitize(f.game.explorationState.discoveryAttempts[0]),
    undefined,
  );
  assert.ok(!JSON.stringify(own.view).includes('"roll"'));
});

test("sans spécialiste, hors zone, héros inactif ou GPS imprécis : aucun essai", () => {
  const f = explorationWorld();
  f.game.explorationDiscoveryService.random = () => {
    throw Error("Aucun tirage");
  };
  const inspect = (request) =>
    f.game.explorationDiscoveryService.inspectHeroPosition({
      heroId: f.hero.id,
      position: f.at(2, 2).center,
      ...request,
    });
  inspect({});
  f.hero.resources.specialist_geologist = 1;
  inspect({ accuracy: 51 });
  inspect({ position: { latitude: 50, longitude: 50 } });
  inspect({ previousPosition: { latitude: 1, longitude: 1 } });
  f.hero.state = "ghost";
  inspect({});
  assert.deepEqual(f.game.explorationState.discoveryAttempts, []);
});

test("raccordement réel à la mission autonome et retour sans installation automatique", () => {
  const f = explorationWorld({ mode: "simulation" });
  const result = f.game.createProspectingExpedition({
    playerId: "a",
    heroId: f.hero.id,
    originLocationId: f.location.id,
    specialistId: "specialist_geologist",
  });
  assert.equal(result.success, true);
  const group = f.game.getAutonomousGroup(result.groupId);
  group.mission.waypoints = [f.at(2, 0).center, f.at(2, 6).center];
  for (let i = 0; i < 20 && group.status !== "completed"; i++) {
    f.game.advanceAutonomousGroups(f.game.now());
    if (group.movement)
      f.advance(Math.max(1, group.movement.arrivesAt - f.game.now()));
  }
  assert.ok(
    f.game.explorationState.discoveries.some(
      (entry) => entry.targetId === f.at(2, 2).id,
    ),
  );
  assert.equal(f.game.locations.length, 1);
  assert.equal(group.status, "completed");
});

test("les positions GPS validées exécutent la découverte côté serveur, sans essai commandé par le navigateur", () => {
  const f = explorationWorld();
  f.hero.resources.specialist_geologist = 1;
  let index = 0,
    now = 2000;
  const lobby = new LobbyService({
    idFactory: () => ["a", "b"][index++] ?? `id-${index}`,
    now: () => now,
  });
  const host = lobby.createLobby({
    playerName: "Alice",
    positionMode: "gps",
    maxPlayers: 4,
  });
  lobby.joinLobby({ code: host.lobby.code, playerName: "Bob" });
  const saved = lobby.exportState();
  saved.lobbies[0].game = f.game.toJSON();
  saved.lobbies[0].status = "started";
  const official = new LobbyService({ initialState: saved, now: () => now });
  const send = (accuracy) =>
    official.updatePlayerPosition({
      token: host.session.token,
      position: {
        ...f.at(2, 2).center,
        accuracy,
        roll: 0,
        specialistId: "forged",
      },
    });
  send(51);
  assert.equal(
    official.gameSnapshot(host.lobby.code).state.explorationState
      .discoveryAttempts.length,
    0,
  );
  now += 1000;
  send(3);
  let state = official.gameSnapshot(host.lobby.code).state;
  assert.equal(state.explorationState.discoveryAttempts.length, 1);
  assert.equal(
    state.explorationState.discoveryAttempts[0].specialistId,
    "specialist_geologist",
  );
  now += 1000;
  send(3);
  state = official.gameSnapshot(host.lobby.code).state;
  assert.equal(state.explorationState.discoveryAttempts.length, 1);
  const packet = official.projectForPlayer(host.session.token, {
    game: { state },
  });
  assert.ok(!JSON.stringify(packet).includes('"discoveryAttempts"'));
});
