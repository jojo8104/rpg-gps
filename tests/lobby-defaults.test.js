import test from "node:test";
import assert from "node:assert/strict";
import { LobbyService } from "../server/lobby/lobby-service.js";

test("une nouvelle partie utilise un joueur et GPS réel", () => {
  const service = new LobbyService();
  const host = service.createLobby({ playerName: "Alice" });
  assert.equal(host.lobby.maxPlayers, 1);
  assert.equal(host.lobby.configuration.positionMode, "gps");
  service.selectHeroClass({
    token: host.session.token,
    heroClassId: "warrior",
  });
  assert.throws(
    () => service.setReady({ token: host.session.token, ready: true }),
    { code: "play_area_required" },
  );
  assert.throws(
    () => service.joinLobby({ code: host.lobby.code, playerName: "Bob" }),
    { code: "lobby_full" },
  );
  service.updateConfiguration({
    token: host.session.token,
    configuration: { maxPlayers: 2, positionMode: "simulation" },
  });
  assert.equal(
    service.joinLobby({ code: host.lobby.code, playerName: "Bob" }).lobby
      .players.length,
    2,
  );
  assert.equal(
    service.setReady({ token: host.session.token, ready: true }).configuration
      .positionMode,
    "simulation",
  );
});

test("une partie test demande explicitement la simulation", () => {
  const service = new LobbyService();
  const result = service.startSolo({
    playerName: "Alice",
    heroClassId: "warrior",
    configuration: { positionMode: "simulation" },
  });
  assert.equal(result.lobby.maxPlayers, 1);
  assert.equal(result.lobby.configuration.positionMode, "simulation");
  assert.equal(result.lobby.status, "started");
});
