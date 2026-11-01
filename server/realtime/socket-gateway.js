import {
  QUEST_SYSTEM_ENABLED,
  QUEST_ENGINE_ENABLED,
} from "../../app/js/core/quest-system-policy.js";
import { Server } from "socket.io";
import { LobbyError, LobbyService } from "../lobby/lobby-service.js";
import { SnapshotStream, SIMULATION_TICK_MS } from "./snapshot-stream.js";

const STATE_EVENTS = new Set([
  "game:state",
  "game:positions",
  "game:world-state",
]);

export function attachSocketGateway(
  httpServer,
  {
    lobbyService = new LobbyService({
      questSystemEnabled: QUEST_SYSTEM_ENABLED,
      questEngineEnabled: QUEST_ENGINE_ENABLED,
    }),
  } = {},
) {
  const io = new Server(httpServer, {
    serveClient: true,
    maxHttpBufferSize: 2_000_000,
    cors: { origin: false },
  });

  io.on("connection", (socket) => {
    const emit = socket.emit.bind(socket);
    const streams = new Map();
    const streamFor = (event) => {
      if (!streams.has(event)) streams.set(event, new SnapshotStream());
      return streams.get(event);
    };
    const project = (payload) =>
      lobbyService.projectForPlayer(socket.data.sessionToken, payload);
    socket.data.resetSnapshots = () => streams.clear();
    socket.data.flushSnapshots = () => {
      for (const [event, stream] of streams) {
        const packet = stream.flush(project);
        if (packet) emit(event, packet);
      }
    };
    socket.data.sendFullSnapshot = (event, payload) => {
      const packet = streamFor(event).encode(project(payload), { full: true });
      emit(event, packet);
    };
    socket.emit = (event, payload) => {
      if (!STATE_EVENTS.has(event)) return emit(event, project(payload));
      const stream = streamFor(event);
      stream.queue(payload);
      const packet = stream.flush(project);
      if (packet) emit(event, packet);
      return socket;
    };
    const reply = (acknowledge, operation) =>
      answer(acknowledge, () => {
        const result = project(operation());
        // Commands respond immediately, using the same ordered baseline as events.
        if (result.game)
          result.game = streamFor("game:state").encode(result.game, {
            reply: true,
          });
        // GPS acknowledgements must not bypass the automatic broadcast interval.
        for (const key of ["positions", "players", "world"])
          if (result[key]?.code)
            result[key] = {
              code: result[key].code,
              revision: result[key].revision,
            };
        return result;
      });
    socket.emit("account:state", lobbyService.listAccounts());
    socket.on("account:list", (_payload, acknowledge) =>
      reply(acknowledge, () => ({ accounts: lobbyService.listAccounts() })),
    );
    socket.on("account:create", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const account = lobbyService.createAccount({ name: payload?.name });
        io.emit("account:state", lobbyService.listAccounts());
        return { account };
      }),
    );
    socket.on("account:delete", (payload, acknowledge) =>
      reply(acknowledge, () => {
        lobbyService.deleteAccount({
          accountId: payload?.accountId,
          connectionId: socket.id,
        });
        if (socket.data.accountId === payload?.accountId)
          delete socket.data.accountId;
        io.emit("account:state", lobbyService.listAccounts());
        return { deleted: true };
      }),
    );
    socket.on("account:select", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const account = lobbyService.selectAccount({
          accountId: payload?.accountId,
          connectionId: socket.id,
        });
        socket.data.accountId = account.id;
        io.emit("account:state", lobbyService.listAccounts());
        return { account };
      }),
    );
    socket.on("lobby:create", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const result = lobbyService.createLobby({
          ...payload,
          accountId: socket.data.accountId,
          connectionId: socket.id,
        });
        bindSession(socket, result.session);
        socket.join(room(result.lobby.code));
        publish(io, result.lobby);
        return result;
      }),
    );
    socket.on("lobby:solo", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const result = lobbyService.startSolo({
          ...payload,
          accountId: socket.data.accountId,
          connectionId: socket.id,
        });
        if (socket.data.lobbyCode) socket.leave(room(socket.data.lobbyCode));
        bindSession(socket, result.session);
        socket.join(room(result.lobby.code));
        publish(io, result.lobby);
        return result;
      }),
    );
    socket.on("lobby:join", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const result = lobbyService.joinLobby({
          ...payload,
          accountId: socket.data.accountId,
          connectionId: socket.id,
        });
        bindSession(socket, result.session);
        socket.join(room(result.lobby.code));
        publish(io, result.lobby);
        return result;
      }),
    );
    socket.on("lobby:resume", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const result = lobbyService.resumeSession({
          token: payload?.token,
          connectionId: socket.id,
        });
        if (result.session.accountId)
          lobbyService.selectAccount({
            accountId: result.session.accountId,
            connectionId: socket.id,
          });
        bindSession(socket, result.session);
        socket.join(room(result.lobby.code));
        publish(io, result.lobby);
        if (result.lobby.status === "started")
          socket.emit(
            "game:positions",
            lobbyService.positionSnapshot(result.lobby.code),
          );
        if (result.lobby.status === "started")
          socket.emit(
            "game:world-state",
            lobbyService.worldSnapshot(result.lobby.code),
          );
        if (result.lobby.status === "started")
          socket.emit(
            "game:state",
            lobbyService.gameSnapshot(result.lobby.code),
          );
        return result;
      }),
    );
    socket.on("lobby:ready", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const lobby = lobbyService.setReady({
          token: socket.data.sessionToken,
          ready: payload?.ready,
        });
        publish(io, lobby);
        return { lobby };
      }),
    );
    socket.on("lobby:configure", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const lobby = lobbyService.updateConfiguration({
          token: socket.data.sessionToken,
          configuration: payload,
        });
        publish(io, lobby);
        return { lobby };
      }),
    );
    socket.on("lobby:hero-class", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const lobby = lobbyService.selectHeroClass({
          token: socket.data.sessionToken,
          heroClassId: payload?.heroClassId,
          heroGender: payload?.heroGender,
        });
        publish(io, lobby);
        return { lobby };
      }),
    );
    socket.on("lobby:play-area", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const lobby = lobbyService.setPlayArea({
          token: socket.data.sessionToken,
          playArea: payload,
        });
        publish(io, lobby);
        return { lobby };
      }),
    );
    for (const [event, method, field] of [
      ["lobby:preparation", "configurePreparation", "change"],
      ["lobby:qr-install", "installQrLocation", null],
    ])
      socket.on(event, (payload, acknowledge) =>
        reply(acknowledge, () => {
          const lobby = lobbyService[method]({
            token: socket.data.sessionToken,
            ...(field
              ? { [field]: payload }
              : { qrId: payload?.qrId, position: payload?.position }),
          });
          publish(io, lobby);
          if (lobby.status === "started")
            emitRoom(
              io,
              lobbyService,
              lobby.code,
              "game:state",
              lobbyService.gameSnapshot(lobby.code),
            );
          return { lobby };
        }),
      );
    socket.on("lobby:qr-print", (_payload, acknowledge) =>
      reply(acknowledge, () =>
        lobbyService.printPreparation({ token: socket.data.sessionToken }),
      ),
    );
    socket.on("game:qr-scan", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const result = lobbyService.scanQrLocation({
          token: socket.data.sessionToken,
          qrId: payload?.qrId,
        });
        emitRoom(
          io,
          lobbyService,
          socket.data.lobbyCode,
          "game:state",
          lobbyService.gameSnapshot(socket.data.lobbyCode),
        );
        return result;
      }),
    );
    socket.on("map:list", (_payload, acknowledge) =>
      reply(acknowledge, () => ({
        maps: lobbyService.listSavedMaps({ token: socket.data.sessionToken }),
      })),
    );
    socket.on("map:save", (payload, acknowledge) =>
      reply(acknowledge, () => ({
        map: lobbyService.saveMap({
          token: socket.data.sessionToken,
          name: payload?.name,
          playArea: payload?.playArea,
        }),
      })),
    );
    socket.on("map:delete", (payload, acknowledge) =>
      reply(acknowledge, () =>
        lobbyService.deleteSavedMap({
          token: socket.data.sessionToken,
          id: payload?.id,
        }),
      ),
    );
    socket.on("save:catalog", (_payload, acknowledge) =>
      reply(acknowledge, () => ({ saves: lobbyService.savedGameCatalog() })),
    );
    socket.on("save:open", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const result = lobbyService.loadSavedGameFromMenu({
          saveId: payload?.saveId,
          accountId: socket.data.accountId,
          connectionId: socket.id,
        });
        if (socket.data.lobbyCode) socket.leave(room(socket.data.lobbyCode));
        bindSession(socket, result.session);
        socket.join(room(result.lobby.code));
        publish(io, result.lobby);
        return result;
      }),
    );
    socket.on("save:list", (_payload, acknowledge) =>
      reply(acknowledge, () => ({
        saves: lobbyService.listManualSaves({
          token: socket.data.sessionToken,
        }),
      })),
    );
    socket.on("save:load", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const result = lobbyService.loadManualSave({
          token: socket.data.sessionToken,
          saveId: payload?.saveId,
        });
        bindSession(socket, result.session);
        publish(io, result.lobby);
        return result;
      }),
    );
    socket.on("lobby:start", (_payload, acknowledge) =>
      reply(acknowledge, () => {
        const lobby = lobbyService.startLobby({
          token: socket.data.sessionToken,
        });
        publish(io, lobby);
        emitRoom(
          io,
          lobbyService,
          lobby.code,
          "game:positions",
          lobbyService.positionSnapshot(lobby.code),
        );
        const game = lobbyService.gameSnapshot(lobby.code);
        if (game.state)
          emitRoom(io, lobbyService, lobby.code, "game:state", game);
        return { lobby };
      }),
    );
    socket.on("game:position", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const positions = lobbyService.updatePlayerPosition({
          token: socket.data.sessionToken,
          position: payload,
        });
        emitRoom(io, lobbyService, positions.code, "game:positions", positions);
        const game = lobbyService.gameSnapshot(positions.code);
        if (game.state)
          emitRoom(io, lobbyService, positions.code, "game:state", game);
        return { positions };
      }),
    );
    socket.on("game:hero-state", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const players = lobbyService.updateHeroState({
          token: socket.data.sessionToken,
          heroState: payload,
        });
        emitRoom(io, lobbyService, players.code, "game:positions", players);
        return { players };
      }),
    );
    socket.on("game:world-state", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const world = lobbyService.updateWorldState({
          token: socket.data.sessionToken,
          baseRevision: payload?.baseRevision,
          worldState: payload?.state,
        });
        emitRoom(io, lobbyService, world.code, "game:world-state", world);
        return { world };
      }),
    );
    socket.on("game:bootstrap", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const game = lobbyService.bootstrapGame({
          token: socket.data.sessionToken,
          snapshot: payload?.state,
        });
        emitRoom(io, lobbyService, game.code, "game:state", game);
        return { game };
      }),
    );
    socket.on("game:command", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const outcome = lobbyService.executeGameCommand({
          token: socket.data.sessionToken,
          command: payload?.command,
          args: payload?.args,
        });
        emitRoom(
          io,
          lobbyService,
          outcome.game.code,
          "game:state",
          outcome.game,
        );
        return outcome;
      }),
    );
    socket.on("game:sync", (_payload, acknowledge) =>
      reply(acknowledge, () => {
        const code = socket.data.lobbyCode;
        const game = lobbyService.gameSnapshot(code);
        socket.data.sendFullSnapshot("game:state", game);
        socket.data.sendFullSnapshot(
          "game:positions",
          lobbyService.positionSnapshot(code),
        );
        socket.data.sendFullSnapshot(
          "game:world-state",
          lobbyService.worldSnapshot(code),
        );
        return { game };
      }),
    );
    socket.on("battle:command", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const outcome = lobbyService.executeBattleCommand({
          token: socket.data.sessionToken,
          battleId: payload?.battleId,
          command: payload?.command,
          args: payload?.args,
        });
        emitRoom(
          io,
          lobbyService,
          outcome.game.code,
          "game:state",
          outcome.game,
        );
        return outcome;
      }),
    );
    socket.on("game:save-and-end", (payload, acknowledge) =>
      reply(acknowledge, () => {
        const result = lobbyService.saveAndEnd({
          token: socket.data.sessionToken,
          name: payload?.name,
        });
        publish(io, result.lobby);
        emitRoom(io, lobbyService, result.lobby.code, "game:saved", {
          save: result.save,
          message: result.message,
        });
        for (const client of io.sockets.sockets.values()) {
          if (client.data.lobbyCode === result.lobby.code) clearSession(client);
        }
        lobbyService.closeEndedLobby(result.lobby.code);
        return result;
      }),
    );
    socket.on("game:destroy", (_payload, acknowledge) =>
      reply(acknowledge, () => {
        const result = lobbyService.destroyGame({
          token: socket.data.sessionToken,
        });
        emitRoom(io, lobbyService, result.lobby.code, "game:ended", {
          message: result.message,
        });
        for (const client of io.sockets.sockets.values()) {
          if (client.data.lobbyCode !== result.lobby.code) continue;
          clearSession(client);
          client.leave(room(result.lobby.code));
        }
        lobbyService.closeEndedLobby(result.lobby.code);
        return { destroyed: true };
      }),
    );
    socket.on("lobby:leave", (_payload, acknowledge) =>
      reply(acknowledge, () => {
        const code = socket.data.lobbyCode;
        const lobby = lobbyService.leaveLobby({
          token: socket.data.sessionToken,
        });
        socket.leave(room(code));
        clearSession(socket);
        if (lobby) publish(io, lobby);
        return { lobby: null };
      }),
    );
    socket.on("disconnect", () => {
      const lobby = lobbyService.disconnect({
        token: socket.data.sessionToken,
        connectionId: socket.id,
      });
      if (lobby) {
        publish(io, lobby);
        if (lobby.status === "started")
          emitRoom(
            io,
            lobbyService,
            lobby.code,
            "game:positions",
            lobbyService.positionSnapshot(lobby.code),
          );
      }
      lobbyService.releaseAccount({ connectionId: socket.id });
      io.emit("account:state", lobbyService.listAccounts());
    });
  });

  const authorityTimer = setInterval(() => {
    lobbyService.advanceGames();
    const snapshots = new Map();
    for (const socket of io.sockets.sockets.values()) {
      const code = socket.data.lobbyCode;
      if (code) {
        if (!snapshots.has(code))
          snapshots.set(code, {
            game: lobbyService.gameSnapshot(code),
            positions: lobbyService.positionSnapshot(code),
          });
        const { game, positions } = snapshots.get(code);
        if (game.state) {
          // Re-project even an idle world: visibility can expire with time.
          socket.emit("game:state", game);
          socket.emit("game:positions", positions);
        }
      }
      socket.data.flushSnapshots?.();
    }
  }, SIMULATION_TICK_MS);
  authorityTimer.unref?.();
  httpServer.once("close", () => clearInterval(authorityTimer));

  io.closeDashboardParty = (code) => {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.lobbyCode !== code) continue;
      clearSession(socket);
      socket.leave(room(code));
      socket.emit("game:saved", {
        save: null,
        message: "Cette partie a été effacée par l’administrateur.",
      });
    }
  };
  return io;
}

function answer(acknowledge, operation) {
  if (typeof acknowledge !== "function") return;
  try {
    acknowledge({ ok: true, ...operation() });
  } catch (error) {
    const known = error instanceof LobbyError;
    acknowledge({
      ok: false,
      error: {
        code: known ? error.code : "internal_error",
        message: known
          ? error.message
          : "Le serveur n’a pas pu traiter la demande.",
      },
    });
  }
}

function bindSession(socket, session) {
  socket.data.resetSnapshots?.();
  socket.data.sessionToken = session.token;
  socket.data.lobbyCode = session.code;
  socket.data.playerId = session.playerId;
  if (session.accountId) socket.data.accountId = session.accountId;
}

function clearSession(socket) {
  socket.data.resetSnapshots?.();
  delete socket.data.sessionToken;
  delete socket.data.lobbyCode;
  delete socket.data.playerId;
}

function publish(io, lobby) {
  io.to(room(lobby.code)).emit("lobby:state", lobby);
}

function room(code) {
  return `lobby:${code}`;
}

function emitRoom(io, lobbyService, code, event, payload) {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.rooms.has(room(code))) socket.emit(event, payload);
  }
}
