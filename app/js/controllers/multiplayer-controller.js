import { createSavedGameMenu } from "../ui/saved-game-menu.js";
import { MultiplayerClient } from "../multiplayer-client.js";
import { LobbyView } from "../ui/lobby-view.js";
import { Game } from "../core/game.js";
import { createMultiplayerLaunch } from "../core/multiplayer-launch.js";
import {
  applyMultiplayerWorldState,
  createMultiplayerWorldState,
  multiplayerWorldFingerprint,
} from "../core/multiplayer-world-state.js";
import { SERVER_GAME_COMMANDS } from "./server-game-commands.js";
import { createSoloLaunch } from "../core/solo-launch.js";

// Possède la session réseau. Le transport reste dans MultiplayerClient et les
// règles restent dans Game ; main fournit les raccords vers les autres écrans.
export function createMultiplayerController({
  lobbyElement,
  getSession,
  adoptGame,
  rebuildWorld,
  onRender,
  onPositions,
  onResume,
  onSolo,
  onLaunch,
  onSaved,
  onUnavailable,
  onLog,
  onQrLocation,
  commandFeedback,
  createClient = () => new MultiplayerClient(),
  createLobby = (element, client, callbacks) =>
    new LobbyView(element, client, callbacks),
  restoreGame = (snapshot) => Game.fromJSON(snapshot),
  applyWorldState = applyMultiplayerWorldState,
  createWorldState = createMultiplayerWorldState,
  fingerprint = multiplayerWorldFingerprint,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer),
  onError = (message, error) => console.error(message, error),
}) {
  let heroClasses = [];
  let savedGameMenu = null;
  let afterSavedGameLoaded = () => {};
  let client = null,
    lobby = null,
    initialized = false,
    epoch = 0;
  let positions = [],
    active = false,
    isHost = false,
    resuming = false;
  let authoritative = false,
    bootstrapping = false,
    worldReady = false;
  let pendingWorld = null,
    pendingGame = null,
    pendingLaunch = null;
  let lastFingerprint = null,
    publishTimer = null,
    retryTimer = null;
  const unsubscribe = [];
  let officialGame = null;
  const pendingCommands = new Map();
  let preparingSolo = false;
  function reset({ keepPending = false } = {}) {
    epoch++;
    commandFeedback?.reset();
    officialGame = null;
    pendingCommands.clear();
    cancel(publishTimer);
    cancel(retryTimer);
    publishTimer = retryTimer = null;
    active = isHost = resuming = authoritative = bootstrapping = false;
    lastFingerprint = null;
    if (!keepPending) {
      positions = [];
      pendingWorld = pendingGame = pendingLaunch = null;
      worldReady = false;
    }
  }
  function begin(launch) {
    reset({ keepPending: Boolean(launch) });
    active = Boolean(launch);
    isHost = Boolean(launch?.isHost);
    resuming = Boolean(launch?.resumesSavedGame || launch?.prepared);
  }
  function initialize() {
    if (initialized) return;
    initialized = true;
    try {
      client = createClient();
      unsubscribe.push(
        client.onPositions((snapshot) => {
          positions = snapshot?.positions ?? [];
          if (active) onPositions();
        }),
      );
      unsubscribe.push(
        client.onWorldState((snapshot) => {
          if (!snapshot?.state) return;
          pendingWorld = snapshot.state;
          worldReady = true;
          if (active && getSession().ready) applyWorld(snapshot.state);
        }),
      );
      unsubscribe.push(
        client.onGameState((snapshot) => {
          if (!snapshot?.state) return;
          pendingGame = snapshot.state;
          if (active && getSession().ready && applyGame(snapshot.state))
            onResume();
        }),
      );
      lobby = createLobby(lobbyElement, client, {
        onQrLocation,
        onSolo: () => {
          reset();
          onSolo();
        },
        onStart: ({ lobby: room, playerId }) => {
          if (preparingSolo) return;
          pendingLaunch = {
            ...createMultiplayerLaunch(room),
            localPlayerId: playerId,
            isHost: room.hostPlayerId === playerId,
          };
          onLaunch(pendingLaunch, room);
        },
      });
      lobby.setHeroClasses?.(heroClasses);
      lobby.initialize();
      unsubscribe.push(
        client.onGameSaved((notice) => {
          reset();
          onSaved(notice);
          lobby.showChoice();
        }),
      );
    } catch (error) {
      onUnavailable(error);
    }
  }
  async function prepareSolo({ setup, heroChoice, positionMode }) {
    if (!client)
      throw new Error("Le serveur est requis pour démarrer une partie.");
    reset();
    preparingSolo = true;
    try {
      const result = await client.createSolo({
        playerName: heroChoice.name,
        heroClassId: heroChoice.classId,
        heroGender: heroChoice.gender,
        configuration: {
          positionMode,
          scenarioId: setup.scenarioId,
          difficulty: "normal",
          travelPaceMode: setup.rules.travelPaceMode,
        },
        playArea: setup.playArea.toJSON(),
      });
      reset();
      return createSoloLaunch({
        lobby: result.lobby,
        playerId: result.session.playerId,
        setup,
        heroChoice,
        positionMode,
      });
    } finally {
      preparingSolo = false;
    }
  }
  function updatePositions(locations) {
    const { mode, locationPositions } = getSession();
    locationPositions.clear();
    for (const location of locations)
      locationPositions.set(
        location.id,
        mode === "gps"
          ? { ...location.position }
          : [location.position.latitude, location.position.longitude],
      );
  }
  function applyWorld(snapshot, { renderNow = true } = {}) {
    if (authoritative) return false;
    const nextFingerprint = fingerprint(snapshot);
    if (nextFingerprint === lastFingerprint) return false;
    try {
      updatePositions(applyWorldState(getSession().game, snapshot));
      const battleViewChanged = rebuildWorld();
      lastFingerprint = nextFingerprint;
      if (renderNow) onRender({ authoritative: false, battleViewChanged });
      return true;
    } catch (error) {
      onError("État multijoueur des lieux refusé.", error);
      return false;
    }
  }
  function commandingGame(target) {
    const sessionEpoch = epoch;
    return new Proxy(target, {
      get(object, property, receiver) {
        const current =
          sessionEpoch === epoch ? (officialGame ?? object) : object;
        const value = Reflect.get(current, property, current);
        if (
          typeof value === "function" &&
          SERVER_GAME_COMMANDS.has(property) &&
          sessionEpoch !== epoch
        ) {
          return () => {
            throw new Error("Cette partie n’est plus active.");
          };
        }
        if (
          typeof value !== "function" ||
          !SERVER_GAME_COMMANDS.has(property) ||
          !authoritative
        )
          return typeof value === "function" ? value.bind(current) : value;
        return (...args) => {
          if (sessionEpoch !== epoch)
            throw new Error("Cette partie n’est plus active.");
          return sendCommand(property, args);
        };
      },
    });
  }
  function applyGame(snapshot, { renderNow = true } = {}) {
    try {
      const restored = restoreGame(snapshot);
      officialGame = restored;
      authoritative = bootstrapping = true;
      cancel(publishTimer);
      cancel(retryTimer);
      publishTimer = retryTimer = null;
      adoptGame(commandingGame(restored));
      updatePositions(restored.locations);
      const battleViewChanged = rebuildWorld();
      if (renderNow) onRender({ authoritative: true, battleViewChanged });
      return true;
    } catch (error) {
      onError("État officiel du serveur refusé.", error);
      return false;
    }
  }
  async function bootstrap() {
    if (!active || !isHost || bootstrapping || !client) return;
    bootstrapping = true;
    const sessionEpoch = epoch;
    const { game, locationPositions } = getSession();
    const snapshot = game.toJSON();
    snapshot.locations = createWorldState(game, locationPositions).locations;
    try {
      await client.bootstrapGame(snapshot);
    } catch (error) {
      if (sessionEpoch === epoch) {
        bootstrapping = false;
        onLog(`Moteur serveur indisponible : ${error.message}`);
      }
    }
  }
  function queuePublish() {
    const { game, locationPositions } = getSession();
    if (
      !active ||
      !client ||
      !game ||
      bootstrapping ||
      game.status !== "started" ||
      (!worldReady && !isHost)
    )
      return;
    if (
      fingerprint(createWorldState(game, locationPositions)) === lastFingerprint
    )
      return;
    cancel(publishTimer);
    const sessionEpoch = epoch;
    publishTimer = schedule(() => {
      publishTimer = null;
      if (sessionEpoch !== epoch || !active || bootstrapping) return;
      const { game, locationPositions } = getSession();
      const snapshot = createWorldState(game, locationPositions),
        nextFingerprint = fingerprint(snapshot);
      if (nextFingerprint === lastFingerprint) return;
      lastFingerprint = nextFingerprint;
      client.sendWorldState(snapshot).catch(() => {
        if (sessionEpoch !== epoch || !active || bootstrapping) return;
        if (lastFingerprint === nextFingerprint) lastFingerprint = null;
        cancel(retryTimer);
        retryTimer = schedule(() => {
          retryTimer = null;
          if (sessionEpoch === epoch) queuePublish();
        }, 1000);
      });
    }, 250);
  }
  async function execute(command, input, isCurrent = () => true) {
    return sendCommand(command, [input], isCurrent);
  }
  function sendCommand(command, args, isCurrent = () => true) {
    if (!active || !authoritative || !client)
      return Promise.reject(
        new Error("Le moteur serveur n’est pas encore prêt."),
      );
    const key = JSON.stringify([command, args]);
    if (pendingCommands.has(key)) return pendingCommands.get(key);
    const sessionEpoch = epoch;
    const feedback = commandFeedback?.begin(command, args);
    const request = (async () => {
      try {
        const response = await client.sendGameCommand(command, args);
        if (sessionEpoch !== epoch || !isCurrent()) return null;
        if (response.game?.state && !applyGame(response.game.state))
          throw new Error("La réponse du serveur ne peut pas être appliquée.");
        feedback?.finish(response.result);
        if (command === "createBattle")
          return (
            officialGame?.battles?.find(
              (battle) => battle.id === response.result?.id,
            ) ?? response.result
          );
        return response.result;
      } catch (error) {
        if (sessionEpoch !== epoch || !isCurrent()) return null;
        feedback?.finish({ success: false, unconfirmed: true });
        onLog(`Action non confirmée : ${error.message}`);
        void client.requestGameState().catch(() => {});
        throw error;
      } finally {
        feedback?.finish(null);
        if (sessionEpoch === epoch) pendingCommands.delete(key);
      }
    })();
    pendingCommands.set(key, request);
    return request;
  }
  return {
    initialize,
    setHeroClasses(classes) {
      heroClasses = classes;
      lobby?.setHeroClasses?.(classes);
    },
    begin,
    reset,
    applyWorld,
    applyGame,
    bootstrap,
    prepareSolo,
    queuePublish,
    execute,
    resume() {
      return lobby?.resumeCurrent();
    },
    showSavedGames(onLoaded) {
      if (!client || !lobby) return;
      afterSavedGameLoaded = onLoaded;
      savedGameMenu ??= createSavedGameMenu({
        client,
        onLoaded(result) {
          lobby.selectedAccount = client.selectedAccount;
          lobby.playerId = result.session.playerId;
          lobby.adventure = null;
          lobby.roomPage = "players";
          lobby.renderLobby(result.lobby);
          afterSavedGameLoaded?.();
        },
      });
      return savedGameMenu.open();
    },
    showNewGame() {
      lobby?.showChoice();
    },
    saveAndEnd(name) {
      if (!active || !isHost || !client) return Promise.resolve(false);
      return client.saveAndEnd(name);
    },
    destroyGame() {
      if (!active || !isHost || !client) return Promise.resolve(false);
      return client.destroyGame();
    },
    dispose() {
      reset();
      unsubscribe.splice(0).forEach((stop) => stop?.());
      initialized = false;
    },
    get client() {
      return client;
    },
    get positions() {
      return positions;
    },
    get active() {
      return active;
    },
    get isHost() {
      return isHost;
    },
    get resuming() {
      return resuming;
    },
    get authoritative() {
      return authoritative;
    },
    get bootstrapping() {
      return bootstrapping;
    },
    get pendingWorld() {
      return pendingWorld;
    },
    get pendingGame() {
      return pendingGame;
    },
    get pendingLaunch() {
      return pendingLaunch;
    },
    get worldReady() {
      return worldReady;
    },
  };
}
