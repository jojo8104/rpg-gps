import { Server } from "socket.io";
import { LobbyError, LobbyService } from "../lobby/lobby-service.js";

export function attachSocketGateway(
  httpServer,
  { lobbyService = new LobbyService() } = {},
) {
  const io = new Server(httpServer, {
    serveClient: true,
    maxHttpBufferSize: 2_000_000,
    cors: { origin: false },
  });

  io.on("connection", (socket) => {
    socket.emit("account:state", lobbyService.listAccounts());
    socket.on("account:list", (_payload, acknowledge) =>
      answer(acknowledge, () => ({ accounts: lobbyService.listAccounts() })),
    );
    socket.on("account:create", (payload, acknowledge) =>
      answer(acknowledge, () => {
        const account = lobbyService.createAccount({ name: payload?.name });
        io.emit("account:state", lobbyService.listAccounts());
        return { account };
      }),
    );
    socket.on("account:select", (payload, acknowledge) =>
      answer(acknowledge, () => {
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
      answer(acknowledge, () => {
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
    socket.on("lobby:join", (payload, acknowledge) =>
      answer(acknowledge, () => {
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
      answer(acknowledge, () => {
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
          socket.emit("game:state", lobbyService.gameSnapshot(result.lobby.code));
        return result;
      }),
    );
    socket.on("lobby:ready", (payload, acknowledge) =>
      answer(acknowledge, () => {
        const lobby = lobbyService.setReady({
          token: socket.data.sessionToken,
          ready: payload?.ready,
        });
        publish(io, lobby);
        return { lobby };
      }),
    );
    socket.on("lobby:configure", (payload, acknowledge) =>
      answer(acknowledge, () => {
        const lobby = lobbyService.updateConfiguration({
          token: socket.data.sessionToken,
          configuration: payload,
        });
        publish(io, lobby);
        return { lobby };
      }),
    );
    socket.on("lobby:hero-class", (payload, acknowledge) =>
      answer(acknowledge, () => {
        const lobby = lobbyService.selectHeroClass({
          token: socket.data.sessionToken,
          heroClassId: payload?.heroClassId,
        });
        publish(io, lobby);
        return { lobby };
      }),
    );
    socket.on("lobby:play-area", (payload, acknowledge) =>
      answer(acknowledge, () => {
        const lobby = lobbyService.setPlayArea({
          token: socket.data.sessionToken,
          playArea: payload,
        });
        publish(io, lobby);
        return { lobby };
      }),
    );
    socket.on("save:list", (_payload, acknowledge) =>
      answer(acknowledge, () => ({
        saves: lobbyService.listManualSaves({ token: socket.data.sessionToken }),
      })),
    );
    socket.on("save:load", (payload, acknowledge) =>
      answer(acknowledge, () => {
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
      answer(acknowledge, () => {
        const lobby = lobbyService.startLobby({
          token: socket.data.sessionToken,
        });
        publish(io, lobby);
        io.to(room(lobby.code)).emit(
          "game:positions",
          lobbyService.positionSnapshot(lobby.code),
        );
        return { lobby };
      }),
    );
    socket.on("game:position", (payload, acknowledge) =>
      answer(acknowledge, () => {
        const positions = lobbyService.updatePlayerPosition({
          token: socket.data.sessionToken,
          position: payload,
        });
        io.to(room(positions.code)).emit("game:positions", positions);
        const game = lobbyService.gameSnapshot(positions.code);
        if (game.state) io.to(room(positions.code)).emit("game:state", game);
        return { positions };
      }),
    );
    socket.on("game:hero-state", (payload, acknowledge) =>
      answer(acknowledge, () => {
        const players = lobbyService.updateHeroState({
          token: socket.data.sessionToken,
          heroState: payload,
        });
        io.to(room(players.code)).emit("game:positions", players);
        return { players };
      }),
    );
    socket.on("game:world-state", (payload, acknowledge) =>
      answer(acknowledge, () => {
        const world = lobbyService.updateWorldState({
          token: socket.data.sessionToken,
          baseRevision: payload?.baseRevision,
          worldState: payload?.state,
        });
        io.to(room(world.code)).emit("game:world-state", world);
        return { world };
      }),
    );
    socket.on("game:bootstrap", (payload, acknowledge) =>
      answer(acknowledge, () => {
        const game = lobbyService.bootstrapGame({
          token: socket.data.sessionToken,
          snapshot: payload?.state,
        });
        io.to(room(game.code)).emit("game:state", game);
        return { game };
      }),
    );
    socket.on("game:command", (payload, acknowledge) =>
      answer(acknowledge, () => {
        const outcome = lobbyService.executeGameCommand({
          token: socket.data.sessionToken,
          command: payload?.command,
          args: payload?.args,
        });
        io.to(room(outcome.game.code)).emit("game:state", outcome.game);
        return outcome;
      }),
    );
    socket.on("game:sync", (_payload, acknowledge) =>
      answer(acknowledge, () => {
        const code = socket.data.lobbyCode;
        const game = lobbyService.gameSnapshot(code);
        socket.emit("game:state", game);
        return { game };
      }),
    );
    socket.on("battle:command", (payload, acknowledge) =>
      answer(acknowledge, () => {
        const outcome = lobbyService.executeBattleCommand({
          token: socket.data.sessionToken,
          battleId: payload?.battleId,
          command: payload?.command,
          args: payload?.args,
        });
        io.to(room(outcome.game.code)).emit("game:state", outcome.game);
        return outcome;
      }),
    );
    socket.on("game:save-and-end", (payload, acknowledge) =>
      answer(acknowledge, () => {
        const result = lobbyService.saveAndEnd({
          token: socket.data.sessionToken,
          name: payload?.name,
        });
        publish(io, result.lobby);
        io.to(room(result.lobby.code)).emit("game:saved", {
          save: result.save,
          message: result.message,
        });
        lobbyService.closeEndedLobby(result.lobby.code);
        return result;
      }),
    );
    socket.on("lobby:leave", (_payload, acknowledge) =>
      answer(acknowledge, () => {
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
          io.to(room(lobby.code)).emit(
            "game:positions",
            lobbyService.positionSnapshot(lobby.code),
          );
      }
      lobbyService.releaseAccount({ connectionId: socket.id });
      io.emit("account:state", lobbyService.listAccounts());
    });
  });

  const authorityTimer = setInterval(() => {
    for (const game of lobbyService.advanceGames())
      io.to(room(game.code)).emit("game:state", game);
  }, 500);
  authorityTimer.unref?.();
  httpServer.once("close", () => clearInterval(authorityTimer));

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
  socket.data.sessionToken = session.token;
  socket.data.lobbyCode = session.code;
  socket.data.playerId = session.playerId;
  if (session.accountId) socket.data.accountId = session.accountId;
}

function clearSession(socket) {
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
