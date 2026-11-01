import test from "node:test";
import assert from "node:assert/strict";
import { createRpgGpsServer } from "../server/server.js";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { io as createClient } from "socket.io-client";
import { once } from "node:events";
import {
  dashboardParty,
  recordDashboardPosition,
} from "../server/monitoring/dashboard-state.js";

test("la supervision borne ses positions et ne modifie pas le jeu", () => {
  const lobby = {
    code: "TEST",
    status: "started",
    configuration: { positionMode: "simulation" },
    players: new Map(),
    game: null,
  };
  const player = {
    id: "p",
    name: "Joueur",
    connections: new Set(),
    position: { latitude: 22, longitude: 23 },
  };
  lobby.players.set(player.id, player);
  for (let at = 0; at < 2100; at++) recordDashboardPosition(lobby, player, at);
  assert.equal(lobby.monitoringSamples.length, 2000);
  const before = structuredClone(lobby);
  const detail = dashboardParty(lobby);
  assert.deepEqual(lobby, before);
  assert.equal(detail.active, false);
  assert.deepEqual(detail.heatmap, []); // Pas de PlayArea : aucune grille inventée.
  detail.samples[0].position.latitude = 99;
  assert.equal(lobby.monitoringSamples[0].position.latitude, 22);
});

test("le tableau protège la consultation et la suppression sans connecter de joueur", async (t) => {
  const lobbies = new LobbyService();
  const first = lobbies.createLobby({
    maxPlayers: 4,
    positionMode: "simulation",
    playerName: "Premier",
    connectionId: "one",
  });
  const second = lobbies.createLobby({
    maxPlayers: 4,
    positionMode: "simulation",
    playerName: "Second",
    connectionId: "two",
  });
  const server = createRpgGpsServer({
    lobbyService: lobbies,
    dashboardToken: "test-key",
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let client;
  t.after(() => {
    client?.close();
    return new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: "Bearer test-key" };
  assert.equal((await fetch(`${base}/api/dashboard/parties`)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/api/dashboard/parties`, {
        headers: { Authorization: "Bearer wrong" },
      })
    ).status,
    401,
  );
  assert.equal(
    (await fetch(`${base}/api/dashboard/parties`, { headers, method: "POST" }))
      .status,
    405,
  );
  const list = await (
    await fetch(`${base}/api/dashboard/parties`, { headers })
  ).json();
  assert.equal(list.parties.length, 2);
  const before = lobbies.exportState();
  const detail = await (
    await fetch(`${base}/api/dashboard/party?code=${first.lobby.code}`, {
      headers,
    })
  ).json();
  assert.equal(detail.party.code, first.lobby.code);
  assert.equal(detail.party.players.length, 1);
  const body = JSON.stringify(detail);
  assert.equal(body.includes(first.session.token), false);
  assert.equal(body.includes("identityHash"), false);
  assert.equal(body.includes("accountId"), false);
  assert.deepEqual(lobbies.exportState().lobbies, before.lobbies);
  assert.equal(
    (await fetch(`${base}/api/dashboard/party?code=MISSING`, { headers }))
      .status,
    404,
  );
  assert.equal((await fetch(`${base}/dashboard/`)).status, 200);
  const deleteUrl = `${base}/api/dashboard/party?code=${first.lobby.code}`;
  assert.equal((await fetch(deleteUrl, { method: "DELETE" })).status, 401);
  assert.equal(
    (await fetch(deleteUrl, { method: "DELETE", headers })).status,
    400,
  );
  assert.ok(lobbies.dashboardDetail(first.lobby.code));
  const confirmed = { ...headers, "X-Dashboard-Confirm": first.lobby.code };
  client = createClient(base, {
    transports: ["websocket"],
    autoConnect: false,
  });
  const connected = once(client, "connect", {
    signal: AbortSignal.timeout(3000),
  });
  client.connect();
  await connected;
  const resumed = await client
    .timeout(3000)
    .emitWithAck("lobby:resume", { token: first.session.token });
  assert.equal(resumed.ok, true);
  const closed = once(client, "game:saved", {
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(
    (await fetch(deleteUrl, { method: "DELETE", headers: confirmed })).status,
    200,
  );
  const [notice] = await closed;
  assert.match(notice.message, /effacée/);
  assert.equal(notice.save, null);
  assert.equal(lobbies.dashboardDetail(first.lobby.code), null);
  assert.ok(lobbies.dashboardDetail(second.lobby.code));
  assert.throws(() =>
    lobbies.resumeSession({ token: first.session.token, connectionId: "back" }),
  );
  const restored = new LobbyService({ initialState: lobbies.exportState() });
  assert.equal(restored.dashboardDetail(first.lobby.code), null);
  assert.ok(restored.dashboardDetail(second.lobby.code));
  assert.equal(
    (await fetch(deleteUrl, { method: "DELETE", headers: confirmed })).status,
    404,
  );
});
