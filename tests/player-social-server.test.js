import assert from "node:assert/strict";
import test from "node:test";
import {
  installSnapshotReceiver,
  decodeResponse,
} from "./fixtures/snapshot-client.js";
import { io } from "socket.io-client";
import { createRpgGpsServer } from "../server/server.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";
import { Game } from "../app/js/core/game.js";

async function start(context, gameType = "cooperation") {
  const server = createRpgGpsServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  const clients = [
    io(address, { transports: ["websocket"] }),
    io(address, { transports: ["websocket"] }),
  ];
  clients.forEach(installSnapshotReceiver);
  context.after(async () => {
    clients.forEach((c) => c.close());
    await new Promise((resolve) => server.close(resolve));
  });
  await Promise.all(
    clients.map((c) => new Promise((resolve) => c.once("connect", resolve))),
  );
  const created = await request(clients[0], "lobby:create", {
    maxPlayers: 4,
    positionMode: "simulation",
    playerName: "Alice",
  });
  const joined = await request(clients[1], "lobby:join", {
    code: created.lobby.code,
    playerName: "Bastien",
  });
  const ids = [created.session.playerId, joined.session.playerId];
  await request(clients[0], "lobby:configure", { gameType });
  for (const c of clients) {
    await request(c, "lobby:hero-class", { heroClassId: "warrior" });
    await request(c, "lobby:ready", { ready: true });
  }
  const started = await request(clients[0], "lobby:start", {});
  assert.equal(started.ok, true);
  const launch = createMultiplayerLaunch(started.lobby);
  let id = 0;
  const game = new Game({
    setup: launch.setup,
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    idGenerator: (prefix) => `${prefix}-${++id}`,
  });
  game.players.forEach((p) => {
    const h = game.chooseHero(p.id, { name: p.name, classId: "warrior" });
    h.updatePosition({ latitude: 0, longitude: 0 });
    h.resources.gold = 10;
  });
  game.start();
  const boot = await request(clients[0], "game:bootstrap", {
    state: game.toJSON(),
  });
  assert.equal(boot.ok, true);
  return {
    clients,
    ids,
    game,
    tokens: [created.session.token, joined.session.token],
  };
}
function request(socket, event, payload) {
  return new Promise((resolve, reject) =>
    socket
      .timeout(3000)
      .emit(event, payload, (error, result) =>
        error ? reject(error) : resolve(decodeResponse(socket, result)),
      ),
  );
}
function command(client, input) {
  return request(client, "game:command", {
    command: "playerSocialCommand",
    args: [input],
  });
}
async function snapshot(client) {
  return (await request(client, "game:sync", {})).game.state;
}

test(
  "deux clients : demande, acceptation, partage de carte et échange confirmé",
  { timeout: 15000 },
  async (context) => {
    const {
      clients: [a, b],
      ids: [aid, bid],
    } = await start(context);
    let response = await command(a, {
      playerId: aid,
      action: "request",
      targetPlayerId: bid,
      kind: "talk",
    });
    assert.equal(response.ok, true);
    let s = (await snapshot(b)).playerSessions.at(-1);
    assert.equal(s.status, "pending");
    const spoof = await command(a, {
      playerId: bid,
      action: "accept",
      sessionId: s.id,
      revision: s.revision,
    });
    assert.equal(spoof.ok, false);
    response = await command(b, {
      playerId: bid,
      action: "accept",
      sessionId: s.id,
      revision: s.revision,
    });
    assert.equal(response.ok, true);
    s = response.game.state.playerSessions.at(-1);
    response = await command(a, {
      playerId: aid,
      action: "share-map",
      sessionId: s.id,
      revision: s.revision,
    });
    assert.equal(response.ok, true);
    await command(a, { playerId: aid, action: "cancel", sessionId: s.id });
    response = await command(a, {
      playerId: aid,
      action: "request",
      targetPlayerId: bid,
      kind: "trade",
    });
    s = response.game.state.playerSessions.at(-1);
    response = await command(b, {
      playerId: bid,
      action: "accept",
      sessionId: s.id,
      revision: s.revision,
    });
    s = response.game.state.playerSessions.at(-1);
    response = await command(a, {
      playerId: aid,
      action: "offer",
      sessionId: s.id,
      revision: s.revision,
      offer: [{ kind: "resource", id: "gold", quantity: 3 }],
    });
    s = response.game.state.playerSessions.at(-1);
    assert.equal(
      (await snapshot(b)).playerSessions.at(-1).offers[aid][0].quantity,
      3,
    );
    response = await command(a, {
      playerId: aid,
      action: "confirm",
      sessionId: s.id,
      revision: s.revision,
    });
    s = response.game.state.playerSessions.at(-1);
    response = await command(b, {
      playerId: bid,
      action: "confirm",
      sessionId: s.id,
      revision: s.revision,
    });
    assert.equal(response.ok, true);
    assert.equal(response.game.state.playerSessions.at(-1).status, "completed");
    assert.equal(
      response.game.state.heroes.find((h) => h.playerId === bid).resources.gold,
      13,
    );
    assert.equal(
      (await snapshot(a)).heroes.find((h) => h.playerId === aid).resources.gold,
      7,
    );
  },
);

test(
  "réseau : position ennemie filtrée dans les événements, réponses et reprise",
  { timeout: 15000 },
  async (context) => {
    const {
      clients: [a, b],
      ids: [aid, bid],
      tokens,
    } = await start(context, "duel");
    await request(a, "game:position", { latitude: 0, longitude: 0 });
    const response = await request(b, "game:position", {
      latitude: 0.01,
      longitude: 0,
    });
    assert.equal(response.ok, true);
    assert.equal(response.positions.positions, undefined);
    let visiblePositions;
    b.once("game:positions", (value) => {
      visiblePositions = value;
    });
    await request(b, "game:sync", {});
    assert.equal(
      visiblePositions.positions.some((p) => p.playerId === aid),
      false,
    );
    const state = await snapshot(a);
    assert.equal(
      state.heroes.some((h) => h.playerId === bid),
      false,
    );
    let resumedState;
    a.on("game:state", (value) => (resumedState = value.state));
    assert.equal(
      (await request(a, "lobby:resume", { token: tokens[0] })).ok,
      true,
    );
    assert.equal(
      resumedState.heroes.some((h) => h.playerId === bid),
      false,
    );
    const forbidden = await request(a, "game:command", {
      command: "createBattle",
      args: [
        {
          teamParticipants: [
            {
              id: "heroes",
              heroIds: visiblePositions.positions
                .filter((p) => p.playerId === bid)
                .map(() => "hero-2")
                .concat("hero-1"),
            },
            { id: "bandits", heroIds: ["hero-3"] },
          ],
        },
      ],
    });
    assert.equal(forbidden.ok, false);
  },
);
