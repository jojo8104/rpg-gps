import assert from "node:assert/strict";
import test from "node:test";
import { io as createClient } from "socket.io-client";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { createRpgGpsServer } from "../server/server.js";
import { explorationProjectionFixture } from "./fixtures/exploration-projection.js";
import {
  installSnapshotReceiver,
  decodeResponse,
} from "./fixtures/snapshot-client.js";

test(
  "deux sockets reçoivent leurs seuls indices dans les événements, synchronisations et accusés",
  { timeout: 20000 },
  async (context) => {
    let id = 0,
      random = 0;
    const service = new LobbyService({
      idFactory: () => ["a", "b"][id++] ?? `player-${id}`,
      randomBytesFn: (size) => Buffer.alloc(size, ++random),
      now: () => 4000,
    });
    const host = service.createLobby({
      playerName: "Alice",
      positionMode: "simulation",
      maxPlayers: 4,
    });
    const guest = service.joinLobby({
      code: host.lobby.code,
      playerName: "Bob",
    });
    for (const token of [host.session.token, guest.session.token]) {
      service.selectHeroClass({ token, heroClassId: "warrior" });
      service.setReady({ token, ready: true });
    }
    service.startLobby({ token: host.session.token });
    const { state } = explorationProjectionFixture({ allied: true });
    const initialState = service.exportState();
    initialState.lobbies[0].game = state;
    initialState.lobbies[0].gameRevision = 1;
    const official = new LobbyService({ now: () => 4000, initialState });
    const server = createRpgGpsServer({
      lobbyService: official,
      now: () => 4000,
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = `http://127.0.0.1:${server.address().port}`;
    const clients = [host, guest].map(() =>
      createClient(address, { transports: ["websocket"], autoConnect: false }),
    );
    context.after(async () => {
      clients.forEach((client) => client.close());
      await new Promise((resolve) => server.close(resolve));
    });
    const wires = [[], []];
    const snapshots = [[], []];
    for (const [index, client] of clients.entries()) {
      installSnapshotReceiver(client);
      client.prependAny((event, packet) =>
        wires[index].push(JSON.stringify({ event, packet })),
      );
      client.on("game:state", (packet) => snapshots[index].push(packet));
      const connected = new Promise((resolve, reject) => {
        client.once("connect", resolve);
        client.once("connect_error", reject);
      });
      client.connect();
      await connected;
      const request = (event, payload) =>
        new Promise((resolve) =>
          client.emit(event, payload, (reply) => {
            wires[index].push(JSON.stringify(reply));
            resolve(decodeResponse(client, reply));
          }),
        );
      const resumed = await request("lobby:resume", {
        token: [host, guest][index].session.token,
      });
      assert.equal(resumed.ok, true);
      const synced = await request("game:sync", {});
      assert.equal(synced.ok, true);
      assert.equal(
        synced.game.state.explorationView.playerId,
        ["a", "b"][index],
      );
      const command = await request("game:command", {
        command: "discoverLocation",
        args: [{ playerId: ["a", "b"][index], locationId: "mine-a" }],
      });
      assert.equal(command.ok, true);
      assert.equal(
        command.game.state.explorationView.playerId,
        ["a", "b"][index],
      );
      assert.ok(snapshots[index].length > 0);
    }
    const firstText = state.explorationState.clueSeries[0].fragments[0].text;
    const secondText = state.explorationState.clueSeries[0].fragments[1].text;
    assert.ok(wires[0].join("").includes(firstText));
    assert.equal(wires[0].join("").includes(secondText), false);
    assert.ok(wires[1].join("").includes(secondText));
    assert.equal(wires[1].join("").includes(firstText), false);
    for (const wire of wires)
      for (const secret of [
        "explorationState",
        "private-seed-8d3",
        "hidden-treasure",
        "treasure-series",
        "future-secret-loot",
        "0.123456789",
        "authentic",
      ])
        assert.equal(wire.join("").includes(secret), false, secret);
  },
);
