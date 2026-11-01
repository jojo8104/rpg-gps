import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { io } from "socket.io-client";
import { createRpgGpsServer } from "../server/server.js";
import { MultiplayerClient } from "../app/js/multiplayer-client.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";
import { Game } from "../app/js/core/game.js";
import { AutonomousGroup } from "../app/js/core/autonomous-group.js";
import { AutonomousMovementService } from "../app/js/core/autonomous-movement-service.js";

test("real clients: filtered initial state, 3-second deltas, command replies and resync", { timeout: 15000 }, async (context) => {
  const server = createRpgGpsServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  const clients = [0, 1].map(() => new MultiplayerClient({ storage: null,
    socketFactory: () => io(address, { transports: ["websocket"] }) }));
  const [host, guest] = clients;
  context.after(async () => {
    clients.forEach((client) => client.socket.close());
    await new Promise((resolve) => server.close(resolve));
  });
  await Promise.all(clients.map((client) => once(client.socket, "connect")));
  const created = await host.create("Hôte");
  await host.updateConfiguration({ maxPlayers: 2, positionMode: "simulation" });
  await guest.join(created.lobby.code, "Invité");
  for (const client of clients) { await client.selectHeroClass("warrior"); await client.setReady(true); }
  const started = await host.start();
  let id = 0;
  const game = new Game({ setup: createMultiplayerLaunch(started.lobby).setup,
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    locations: [{ id: "known", name: "Unchanged camp", type: "camp", source: "test", position: { latitude: 0, longitude: 0 } },
      { id: "unknown", name: "Secret camp", type: "camp", source: "test", position: { latitude: 1, longitude: 0 } }],
    idGenerator: (prefix) => `${prefix}-${++id}` });
  game.players.forEach((player) => {
    game.chooseHero(player.id, { name: player.name, classId: "warrior" }).updatePosition({ latitude: 0, longitude: 0 });
    player.discoverLocation("known");
  });
  game.start();
  for (const [groupId, latitude] of [["near", 0.0001], ["far", 0.01]]) {
    const group = new AutonomousGroup({ id: groupId, type: "army", owner: { kind: "independent", id: "neutral" }, position: { latitude, longitude: 0 } });
    new AutonomousMovementService().start(group, { destination: { latitude, longitude: 0.0001 }, speedMetersPerSecond: 0.2, now: Date.now() });
    game.autonomousGroups.push(group);
  }
  const packets = [];
  guest.socket.on("game:state", (packet) => packets.push({ at: Date.now(), packet }));
  const initial = new Promise((resolve) => {
    const off = guest.onGameState((snapshot) => { if (snapshot?.state) { off(); resolve(snapshot); } });
  });
  const boot = await host.bootstrapGame(game.toJSON());
  assert.equal(boot.game.state.autonomousGroups[0].id, "near");
  const initialState = await initial;
  assert.deepEqual(initialState.state.locations.map((l) => l.id), ["known", "unknown"]);
  assert.deepEqual(initialState.state.autonomousGroups.map((g) => g.id), ["near"]);
  const moved = await new Promise((resolve) => {
    const off = guest.onGameState((snapshot) => {
      if (snapshot.state.autonomousGroups[0]?.position.longitude > 0) { off(); resolve(snapshot); }
    });
  });
  assert.equal(packets.length, 2);
  assert.equal(packets[1].packet.sync.kind, "delta");
  // Le bootstrap est immédiat ; la cadence se mesure entre deux diffusions.
  await new Promise((resolve) => {
    const off = guest.onGameState(() => { off(); resolve(); });
  });
  assert.equal(packets[2].packet.sync.kind, "delta");
  assert.ok(packets[2].at - packets[1].at >= 2950);
  const encoded = JSON.stringify(packets[1].packet);
  assert.equal(encoded.includes("Unchanged camp"), false);
  assert.equal(encoded.includes('"locations"'), false);
  assert.equal(encoded.includes('"far"'), false);
  assert.ok(moved.revision > initialState.revision);
  const sync = await guest.requestGameState();
  assert.equal(sync.game.state.locations[0].id, "known");
  const result = await guest.sendGameCommand("discoverLocation", [{ playerId: game.players[1].id, locationId: "known", level: 3 }]);
  assert.equal(result.game.state.players.find((p) => p.id === game.players[1].id).locationKnowledge.known, 3);
  assert.doesNotThrow(() => Game.fromJSON(result.game.state));
});
