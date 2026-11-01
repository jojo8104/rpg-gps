import { requireHeroGender } from "../../app/js/core/hero-gender.js";
import { SavedMapLibrary } from "./saved-map-library.js";
import { recordDashboardExploration } from "../monitoring/dashboard-perception.js";
import { consumeAstralInteraction } from "../../app/js/core/astral-interaction.js";
import { QUEST_COMMANDS } from "../../app/js/core/quest-system-policy.js";
import {
  captureWorldSample,
  WORLD_SAMPLE_INTERVAL_MS,
} from "../monitoring/world-sample.js";
import {
  dashboardParty,
  recordDashboardPosition,
} from "../monitoring/dashboard-state.js";
import {
  installRavitaillement,
  ravitaillementService,
} from "../quests/ravitaillement-integration.js";
import { alliedPlayers } from "../../app/js/core/player-social-service.js";
import { triggerAutonomousHeroAttacks } from "../../app/js/core/autonomous-hero-attacks.js";
import { projectPlayerPayload } from "../realtime/player-projection.js";
import { explorationPublicId } from "../realtime/exploration-projection.js";
import { discoverNearbyLocations } from "../../app/js/core/player-map-visibility.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PlayArea } from "../../app/js/core/play-area.js";
import { Location } from "../../app/js/core/location.js";
import { AutonomousGroup } from "../../app/js/core/autonomous-group.js";
import { AutonomousGroupTrace } from "../../app/js/core/autonomous-group-trace.js";
import { ScoutWatchBeacon } from "../../app/js/core/scout-watch-beacon.js";
import { WorldState } from "../../app/js/core/world-state.js";
import { BattleEngine } from "../../app/js/core/battle-engine.js";
import { BattleLoot } from "../../app/js/core/battle-loot.js";
import { BattleSite } from "../../app/js/core/battle-site.js";
import { Game } from "../../app/js/core/game.js";
import { initializeExploration } from "./initialize-exploration.js";
import {
  updatePartyPreparation,
  preparationProblems,
  preparationStepProblems,
} from "../../app/js/core/party-preparation.js";
import { getScenarioBundle, launchScenarios } from "./scenario-catalog.js";
import { createEditorGame } from "./editor-game.js";
import { validateLobbyPlayArea } from "./scenario-play-area.js";
import { selectedPreparationCatalog } from "../../app/js/core/preparation-location-selection.js";
import { createPreparedGame } from "./prepared-game.js";
import { createQrPrintDocument } from "./qr-print-document.js";
import { validatePosition, distanceMeters } from "../../app/js/core/geo.js";
import { LocationRangePolicy } from "../../app/js/core/location-range-policy.js";
import { LocationSpacingPolicy } from "../../app/js/core/location-spacing-policy.js";
import { createLocationInteractionPolicy } from "../../app/js/core/location-interaction-policy.js";
import { mapLocationDiscoverable } from "../../app/js/core/player-map-visibility.js";
import { HeroTraceService } from "../../app/js/core/hero-trace-service.js";

const CLIENT_GAME_COMMANDS = new Set([
  "foundResourceCamp", "sendCampInstallation", "claimCampInstallation",
  "resolveExceptionalExpedition", "claimExceptionalExpedition",
  "prepareExceptionalExpedition", "departExceptionalExpedition", "cancelExceptionalExpedition",
  "beginExteriorSearch", "prepareExteriorSearch", "validateExteriorSearch", "cancelExteriorSearch",
  "playerPlacementCommand",
  "questEngineCommand",
  "prepareTestQuest",
  "activateHeroDivination",
  "activateHeroAstralTravel",
  "selectHeroAstralTarget",
  "applyOfficerToUnit",
  "playerSocialCommand",
  "discoverLocation",
  "selectHeroLevelUp",
  "levelUpHero",
  "promoteUnit",
  "setArmyFormation",
  "placeScoutWatchBeacon",
  "startCurrentScenarioPlacements",
  "updateScenarioPosition",
  "placeScenarioLocation",
  "dispatchQuestEvent",
  "trainHeroAtLocation",
  "selectQuestChoice",
  "inspectTrailPoint",
  "acceptAvailableQuest",
  "abandonCurrentQuest",
  "buildCampImprovement",
  "levelUpCamp",
  "evolveCamp",
  "tradeAtLocation",
  "selectLocationChiefOption",
  "attemptLocationCapture",
  "recruitUnit",
  "completeHeroUnits",
  "healHeroUnits",
  "collectLocationResources",
  "collectLocationTaxes",
  "depositLocationResource",
  "depositLocationItem",
  "transferLocationResource",
  "transferLocationProduction",
  "preparePopulationPackages",
  "takeLocationPopulationPackage",
  "assignWagons",
  "returnWagons",
  "startLocationDismantling",
  "organizeLocationEvacuation",
  "settlePopulationPackage",
  "equipHeroItem",
  "unequipHeroItem",
  "reviveHeroAtBase",
  "garrisonUnit",
  "withdrawGarrisonUnit",
  "disbandUnit",
  "createTradingConvoy",
  "stopTradingConvoy",
  "createProspectingExpedition",
  "divineAtAcademy",
  "sendRelayMessage",
  "createBattle",
  "createPlayerEncounterBattle",
  "collectBattleLoot",
  "joinBattle",
  "updateBattleHeroPosition",
]);

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const POSITION_MODES = new Set(["gps", "simulation"]);
const SCENARIO_IDS = new Set(launchScenarios.map((scenario) => scenario.id));
const DIFFICULTIES = new Set(["easy", "normal", "hard"]);
const HERO_CLASS_IDS = new Set(["warrior", "ranger", "mage"]);

export class LobbyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LobbyError";
    this.code = code;
  }
}

export class LobbyService {
  #lobbies = new Map();
  #sessions = new Map();
  #manualSaves = new Map();
  #accounts = new Map();

  constructor({
    randomBytesFn = randomBytes,
    idFactory = randomUUID,
    now = Date.now,
    initialState = null,
    onStateChanged = () => {},
    onWorldSample = () => {},
    questSystemEnabled = true,
    questEngineEnabled = false,
  } = {}) {
    this.randomBytes = randomBytesFn;
    this.idFactory = idFactory;
    this.now = now;
    this.questSystemEnabled = questSystemEnabled !== false;
    this.questEngineEnabled = questEngineEnabled === true;
    this.savedMapLibrary = new SavedMapLibrary(initialState?.savedMaps ?? []);
    this.onStateChanged = onStateChanged;
    this.onWorldSample = onWorldSample;
    if (initialState) this.#restoreState(initialState);
  }

  listAccounts() {
    return [...this.#accounts.values()]
      .sort((first, second) => first.name.localeCompare(second.name, "fr"))
      .map((account) => ({
        id: account.id,
        name: account.name,
        available: account.connections.size === 0,
      }));
  }

  createAccount({ name }) {
    const valid = validName(name);
    if (
      [...this.#accounts.values()].some(
        (account) =>
          account.name.localeCompare(valid, "fr", { sensitivity: "base" }) ===
          0,
      )
    )
      throw new LobbyError(
        "account_name_taken",
        "Ce nom de joueur existe déjà.",
      );
    const account = {
      id: this.idFactory(),
      name: valid,
      connections: new Set(),
    };
    this.#accounts.set(account.id, account);
    this.#markChanged();
    return { id: account.id, name: account.name, available: true };
  }

  selectAccount({ accountId, connectionId }) {
    const account = this.#accounts.get(accountId);
    if (!account)
      throw new LobbyError("account_not_found", "Compte joueur introuvable.");
    if (account.connections.size > 0 && !account.connections.has(connectionId))
      throw new LobbyError(
        "account_in_use",
        `${account.name} est déjà connecté.`,
      );
    this.releaseAccount({ connectionId });
    account.connections.add(connectionId);
    return { id: account.id, name: account.name };
  }

  deleteAccount({ accountId, connectionId }) {
    const account = this.#requireAccount(accountId);
    if ([...account.connections].some((id) => id !== connectionId))
      throw new LobbyError(
        "account_in_use",
        "Ce joueur est connecté sur un autre appareil.",
      );
    if (
      [...this.#lobbies.values()].some((lobby) =>
        [...lobby.players.values()].some(
          (player) => player.accountId === accountId,
        ),
      )
    )
      throw new LobbyError(
        "account_in_lobby",
        "Quittez la partie avant d’effacer ce joueur.",
      );
    this.#accounts.delete(accountId);
    this.#markChanged();
  }

  releaseAccount({ connectionId }) {
    if (!connectionId) return;
    for (const account of this.#accounts.values())
      account.connections.delete(connectionId);
  }

  createLobby({
    playerName,
    connectionId,
    identityToken,
    accountId,
    maxPlayers = 1,
    positionMode = "gps",
  }) {
    const account = accountId ? this.#requireAccount(accountId) : null;
    const name = account?.name ?? validName(playerName);
    if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 4) {
      throw new LobbyError(
        "invalid_capacity",
        "Une partie accepte de un à quatre joueurs.",
      );
    }
    const code = this.#createCode();
    const lobby = {
      code,
      status: "waiting",
      maxPlayers,
      configuration: {
        positionMode: validChoice(
          positionMode,
          POSITION_MODES,
          "invalid_position_mode",
          "Choisissez GPS réel ou simulation.",
        ),
        gameType: "cooperation",
        scenarioId: "chaos",
        difficulty: "normal",
      },
      playArea: null,
      launch: null,
      resume: null,
      worldState: null,
      worldRevision: 0,
      game: null,
      gameRevision: 0,
      lastGameTickAt: null,
      lastWorldCycleAt: null,
      resolvedBattleIds: new Set(),
      lastGameFingerprint: null,
      heroTraceService: null,
      hostPlayerId: null,
      createdAt: this.now(),
      players: new Map(),
    };
    this.#lobbies.set(code, lobby);
    const result = this.#addPlayer(lobby, name, connectionId, {
      identityHash: identityTokenHash(identityToken),
      accountId: account?.id ?? null,
    });
    lobby.hostPlayerId = result.session.playerId;
    return this.#result(lobby, result.session);
  }

  startSolo({
    playerName,
    connectionId,
    identityToken,
    accountId,
    configuration,
    heroClassId,
    heroGender,
    playArea,
  }) {
    const result = this.createLobby({
      playerName,
      connectionId,
      identityToken,
      accountId,
      maxPlayers: 1,
      positionMode: configuration?.positionMode ?? "gps",
    });
    try {
      const token = result.session.token;
      this.updateConfiguration({
        token,
        configuration: {
          ...configuration,
          gameType: "cooperation",
          maxPlayers: 1,
        },
      });
      this.#lobbies.get(result.lobby.code).configuration.solo = true;
      this.selectHeroClass({ token, heroClassId, heroGender });
      if (
        this.#lobbies.get(result.lobby.code).configuration.positionMode ===
        "gps"
      )
        this.setPlayArea({ token, playArea });
      this.setReady({ token, ready: true });
      return { session: result.session, lobby: this.startLobby({ token }) };
    } catch (error) {
      this.leaveLobby({ token: result.session.token });
      throw error;
    }
  }

  joinLobby({ code, playerName, connectionId, identityToken, accountId }) {
    const lobby = this.#requireLobby(code);
    const account = accountId ? this.#requireAccount(accountId) : null;
    if (lobby.status !== "waiting")
      throw new LobbyError("already_started", "Cette partie a déjà commencé.");
    if (lobby.players.size >= lobby.maxPlayers)
      throw new LobbyError("lobby_full", "Cette partie est complète.");
    const identityHash = identityTokenHash(identityToken);
    const resumeSlot = lobby.resume?.slots.find(
      (slot) =>
        ((account && slot.accountId === account.id) ||
          (!account && slot.identityHash === identityHash)) &&
        !lobby.players.has(slot.playerId),
    );
    if (lobby.resume && !resumeSlot)
      throw new LobbyError(
        "resume_slot_not_found",
        "Aucun héros de cette sauvegarde n’est associé à cet appareil.",
      );
    return this.#result(
      lobby,
      this.#addPlayer(
        lobby,
        resumeSlot?.name ?? account?.name ?? validName(playerName),
        connectionId,
        {
          identityHash,
          accountId: account?.id ?? null,
          playerId: resumeSlot?.playerId,
          heroClassId: resumeSlot?.heroClassId,
          heroGender: resumeSlot?.heroGender,
        },
      ).session,
    );
  }

  retainedMapPolygons() {
    const areas = [...this.savedMapLibrary.entries.values()].map(
      (entry) => entry.playArea,
    );
    for (const lobby of this.#lobbies.values())
      areas.push(
        lobby.playArea,
        lobby.launch?.playArea,
        lobby.game?.setup?.playArea,
      );
    // Une partie sauvegardée reste un usage explicite, même sans connexion.
    for (const save of this.#manualSaves.values())
      areas.push(save.launch?.playArea, save.game?.setup?.playArea);
    return areas
      .filter(
        (area) => Array.isArray(area?.polygon) && area.polygon.length >= 3,
      )
      .map((area) => area.polygon);
  }

  listSavedMaps({ token }) {
    const { player } = this.#playerForToken(token);
    return this.savedMapLibrary.list(player);
  }

  saveMap({ token, name, playArea }) {
    const { player, lobby } = this.#playerForToken(token);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError(
        "host_only",
        "Seul l’organisateur peut sauvegarder une carte.",
      );
    const map = this.savedMapLibrary.save(
      player,
      { name, playArea },
      this.now(),
    );
    this.#markChanged();
    return map;
  }

  deleteSavedMap({ token, id }) {
    const { player } = this.#playerForToken(token);
    this.savedMapLibrary.delete(player, id);
    this.#markChanged();
    return { deleted: true };
  }

  listManualSaves({ token }) {
    const { lobby, player } = this.#playerForToken(token);
    this.#requireWaitingLobby(lobby);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError(
        "host_only",
        "Seul l’organisateur peut reprendre une partie.",
      );
    return [...this.#manualSaves.values()]
      .filter((save) =>
        player.accountId
          ? save.ownerAccountId === player.accountId
          : save.ownerIdentityHash === player.identityHash,
      )
      .sort((first, second) => second.savedAt - first.savedAt)
      .map(manualSaveSummary);
  }

  savedGameCatalog() {
    return [...this.#manualSaves.values()]
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((save) => ({
        ...manualSaveSummary(save),
        sizeBytes: Buffer.byteLength(JSON.stringify(save), "utf8"),
        ownerAccountId: this.#accounts.has(save.ownerAccountId)
          ? save.ownerAccountId
          : null,
        ownerName:
          this.#accounts.get(save.ownerAccountId)?.name ?? "Ancien compte",
      }));
  }

  loadSavedGameFromMenu({ saveId, accountId, connectionId }) {
    const save = this.#manualSaves.get(saveId);
    if (!save || !accountId || save.ownerAccountId !== accountId)
      throw new LobbyError(
        "save_not_found",
        "Sauvegarde indisponible pour ce compte.",
      );
    const account = this.selectAccount({ accountId, connectionId });
    const created = this.createLobby({
      accountId,
      connectionId,
      playerName: account.name,
    });
    try {
      return this.loadManualSave({ token: created.session.token, saveId });
    } catch (error) {
      this.deleteDashboardParty(created.lobby.code);
      throw error;
    }
  }

  dashboardDeleteSavedGame(id) {
    if (!this.#manualSaves.delete(id)) return false;
    this.#markChanged();
    return true;
  }

  loadManualSave({ token, saveId }) {
    const { lobby, player } = this.#playerForToken(token);
    this.#requireWaitingLobby(lobby);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError(
        "host_only",
        "Seul l’organisateur peut reprendre une partie.",
      );
    const save = this.#manualSaves.get(saveId);
    const ownsSave = player.accountId
      ? save?.ownerAccountId === player.accountId
      : player.identityHash && save?.ownerIdentityHash === player.identityHash;
    if (!save || !ownsSave)
      throw new LobbyError("save_not_found", "Sauvegarde introuvable.");
    const hostSlot = save.slots.find((slot) =>
      player.accountId
        ? slot.accountId === player.accountId
        : slot.identityHash === player.identityHash,
    );
    if (!hostSlot)
      throw new LobbyError(
        "resume_slot_not_found",
        "Votre héros est absent de cette sauvegarde.",
      );
    const previousPlayerId = player.id;
    lobby.players.delete(previousPlayerId);
    player.id = hostSlot.playerId;
    player.name = hostSlot.name;
    player.heroClassId = hostSlot.heroClassId;
    player.heroGender = hostSlot.heroGender ?? null;
    player.ready = false;
    lobby.players.set(player.id, player);
    for (const session of this.#sessions.values()) {
      if (session.code === lobby.code && session.playerId === previousPlayerId)
        session.playerId = player.id;
    }
    lobby.hostPlayerId = player.id;
    lobby.maxPlayers = save.slots.length;
    lobby.configuration = structuredClone(save.launch.configuration);
    lobby.playArea = save.launch.playArea
      ? structuredClone(save.launch.playArea)
      : null;
    lobby.resume = {
      saveId: save.id,
      name: save.name,
      savedAt: save.savedAt,
      game: structuredClone(save.game),
      launch: structuredClone(save.launch),
      slots: structuredClone(save.slots),
    };
    this.#markChanged();
    return this.#result(lobby, {
      code: lobby.code,
      playerId: player.id,
      token,
      accountId: player.accountId,
    });
  }

  saveAndEnd({ token, name }) {
    const { lobby, player } = this.#playerForToken(token);
    if (lobby.status !== "started" || !lobby.game)
      throw new LobbyError(
        "game_not_ready",
        "Aucune partie active à sauvegarder.",
      );
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError(
        "host_only",
        "Seul l’organisateur peut terminer la session.",
      );
    if (!player.accountId && !player.identityHash)
      throw new LobbyError(
        "identity_required",
        "Aucun compte joueur n’est associé à l’organisateur.",
      );
    const save = {
      id: this.idFactory(),
      name: validSaveName(name),
      savedAt: this.now(),
      ownerAccountId: player.accountId,
      ownerIdentityHash: player.identityHash,
      launch: structuredClone(lobby.launch),
      game: lobby.game.toJSON(),
      slots: [...lobby.players.values()].map((entry) => ({
        playerId: entry.id,
        name: entry.name,
        heroClassId: entry.heroClassId,
        heroGender: entry.heroGender ?? null,
        accountId: entry.accountId,
        identityHash: entry.identityHash,
      })),
    };
    this.#manualSaves.set(save.id, save);
    lobby.status = "ended";
    this.#markChanged();
    return {
      lobby: this.snapshot(lobby.code),
      save: manualSaveSummary(save),
      message: `${player.name} a sauvegardé la partie « ${save.name} ».`,
    };
  }

  destroyGame({ token }) {
    const { lobby, player } = this.#playerForToken(token);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError(
        "host_only",
        "Seul l’organisateur peut détruire la partie.",
      );
    if (lobby.status !== "started")
      throw new LobbyError(
        "game_not_ready",
        "Aucune partie active à détruire.",
      );
    lobby.status = "ended";
    this.#markChanged();
    return {
      lobby: this.snapshot(lobby.code),
      message: `${player.name} a quitté et détruit la partie sans sauvegarde.`,
    };
  }

  closeEndedLobby(code) {
    const lobby = this.#lobbies.get(code);
    if (lobby?.status !== "ended") return false;
    this.#lobbies.delete(code);
    for (const [hash, session] of this.#sessions) {
      if (session.code === code) this.#sessions.delete(hash);
    }
    this.#markChanged();
    return true;
  }

  resumeSession({ token, connectionId }) {
    const session = this.#requireSession(token);
    const lobby = this.#requireLobby(session.code);
    const player = lobby.players.get(session.playerId);
    if (!player)
      throw new LobbyError("session_expired", "Cette place n’existe plus.");
    if (connectionId) {
      if (lobby.status === "started") this.#checkActiveGameCapacity(lobby);
      player.connections.add(connectionId);
    }
    return this.#result(lobby, {
      ...session,
      token,
      accountId: player.accountId,
    });
  }

  setReady({ token, ready }) {
    const { lobby, player } = this.#playerForToken(token);
    if (lobby.status !== "waiting")
      throw new LobbyError("already_started", "Cette partie a déjà commencé.");
    if (
      ready &&
      !player.heroClassId &&
      !(
        player.id === lobby.hostPlayerId &&
        lobby.configuration.preparation?.organizerRole !== "advanced-player" &&
        lobby.configuration.preparation?.enabled
      )
    )
      throw new LobbyError(
        "hero_class_required",
        "Choisissez votre classe de héros avant d’être prêt.",
      );
    if (ready && lobby.configuration.positionMode === "gps" && !lobby.playArea)
      throw new LobbyError(
        "play_area_required",
        "L’organisateur doit valider la zone GPS avant que les joueurs soient prêts.",
      );
    player.ready = Boolean(ready);
    this.#markChanged();
    return this.snapshot(lobby.code);
  }

  updateConfiguration({ token, configuration = {} }) {
    const { lobby, player } = this.#playerForToken(token);
    this.#requireWaitingLobby(lobby);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError(
        "host_only",
        "Seul l’organisateur peut modifier la partie.",
      );

    const next = { ...lobby.configuration };
    if (Object.hasOwn(configuration, "gameType"))
      next.gameType = validChoice(
        configuration.gameType,
        new Set(["cooperation", "competition", "duel"]),
        "invalid_game_type",
        "Type de partie inconnu.",
      );
    if (next.gameType === "duel" && lobby.players.size > 2)
      throw new LobbyError(
        "invalid_capacity",
        "Un duel accueille exactement deux joueurs.",
      );
    if (Object.hasOwn(configuration, "positionMode")) {
      const previousMode = next.positionMode;
      next.positionMode = validChoice(
        configuration.positionMode,
        POSITION_MODES,
        "invalid_position_mode",
        "Mode de position inconnu.",
      );
      if (next.positionMode !== previousMode) lobby.playArea = null;
    }
    if (Object.hasOwn(configuration, "scenarioId")) {
      next.scenarioId = validChoice(
        configuration.scenarioId,
        SCENARIO_IDS,
        "invalid_scenario",
        "Scénario inconnu.",
      );
      if (
        next.scenarioId !== lobby.configuration.scenarioId &&
        next.preparation
      ) {
        next.preparation = {
          ...next.preparation,
          excludedQuestIds: [],
          locations: {},
        };
      }
    }
    if (Object.hasOwn(configuration, "difficulty"))
      next.difficulty = validChoice(
        configuration.difficulty,
        DIFFICULTIES,
        "invalid_difficulty",
        "Difficulté inconnue.",
      );
    if (Object.hasOwn(configuration, "travelPaceMode"))
      next.travelPaceMode = validChoice(
        configuration.travelPaceMode,
        new Set(["calm", "sport"]),
        "invalid_pace",
        "Rythme inconnu.",
      );
    if (Object.hasOwn(configuration, "maxPlayers")) {
      const capacity = Number(configuration.maxPlayers);
      if (
        !Number.isInteger(capacity) ||
        capacity < 1 ||
        capacity > 4 ||
        capacity < lobby.players.size
      )
        throw new LobbyError(
          "invalid_capacity",
          "La capacité doit être comprise entre le nombre de joueurs présents et quatre.",
        );
      lobby.maxPlayers = capacity;
    }

    if (next.gameType === "duel") lobby.maxPlayers = 2;
    if (
      next.preparation?.enabled &&
      (next.positionMode !== "gps" || next.gameType === "duel")
    )
      throw new LobbyError(
        "detailed_irl_only",
        "La préparation détaillée IRL exige le mode GPS et une aventure hors duel.",
      );
    if (
      next.positionMode === "gps" &&
      (next.scenarioId !== lobby.configuration.scenarioId ||
        next.positionMode !== lobby.configuration.positionMode ||
        !lobby.playArea)
    ) {
      const area = getScenarioBundle(next.scenarioId).playArea;
      if (area) {
        try {
          lobby.playArea = validateLobbyPlayArea(area, lobby.code);
        } catch (error) {
          throw new LobbyError(
            "invalid_play_area",
            `Terrain du scénario invalide : ${error.message}`,
          );
        }
      }
    }
    lobby.configuration = next;
    for (const entry of lobby.players.values()) entry.ready = false;
    this.#markChanged();
    return this.snapshot(lobby.code);
  }

  setPlayArea({ token, playArea }) {
    const { lobby, player } = this.#playerForToken(token);
    this.#requireWaitingLobby(lobby);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError(
        "host_only",
        "Seul l’organisateur peut définir la zone de jeu.",
      );
    if (lobby.configuration.positionMode !== "gps")
      throw new LobbyError(
        "gps_only",
        "Une zone personnalisée est réservée au mode GPS.",
      );
    if (
      !playArea ||
      !Array.isArray(playArea.polygon) ||
      playArea.polygon.length > 50
    )
      throw new LobbyError(
        "invalid_play_area",
        "La zone GPS doit contenir entre trois et cinquante points.",
      );
    try {
      lobby.playArea = validateLobbyPlayArea(playArea, lobby.code);
    } catch {
      throw new LobbyError(
        "invalid_play_area",
        "La zone GPS n’est pas un polygone valide.",
      );
    }
    for (const entry of lobby.players.values()) entry.ready = false;
    this.#markChanged();
    return this.snapshot(lobby.code);
  }

  configurePreparation({ token, change }) {
    const { lobby, player } = this.#playerForToken(token);
    this.#requireWaitingLobby(lobby);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError(
        "host_only",
        "Seul l’organisateur prépare la partie.",
      );
    if (
      lobby.configuration.positionMode !== "gps" ||
      lobby.configuration.gameType === "duel"
    )
      throw new LobbyError(
        "gps_only",
        "Ce parcours est réservé à la préparation détaillée IRL hors duel.",
      );
    try {
      lobby.configuration.preparation = updatePartyPreparation(
        lobby.configuration.preparation,
        change,
        getScenarioBundle(lobby.configuration.scenarioId).catalog,
        lobby.playArea,
        () => randomUUID(),
      );
      if (
        lobby.configuration.preparation.organizerRole !== "advanced-player" &&
        lobby.maxPlayers === 1
      )
        lobby.maxPlayers = 2;
    } catch (error) {
      throw new LobbyError("invalid_preparation", error.message);
    }
    for (const entry of lobby.players.values()) entry.ready = false;
    this.#markChanged();
    return this.snapshot(lobby.code);
  }

  installQrLocation({ token, qrId, position }) {
    const { lobby, player } = this.#playerForToken(token);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError(
        "host_only",
        "Seul l’organisateur peut installer un QR code.",
      );
    const preparation = lobby.configuration.preparation;
    if (lobby.status === "started" && preparation?.organizerRole === "absent")
      throw new LobbyError(
        "organizer_absent",
        "L’organisateur absent ne peut plus intervenir.",
      );
    const found = Object.entries(preparation?.locations ?? {}).find(
      ([, entry]) => entry.placement === "qr" && entry.qrId === qrId,
    );
    if (!found)
      throw new LobbyError(
        "unknown_qr",
        "Ce QR code n’appartient pas à cette partie.",
      );
    if (
      !Number.isFinite(position?.accuracy) ||
      position.accuracy < 0 ||
      position.accuracy > 50
    )
      throw new LobbyError(
        "gps_accuracy",
        "Attendez une précision GPS de 50 m ou moins.",
      );
    try {
      const next = updatePartyPreparation(
        preparation,
        { location: { id: found[0], position } },
        getScenarioBundle(lobby.configuration.scenarioId).catalog,
        lobby.playArea,
        () => randomUUID(),
      );
      if (lobby.game) {
        const id =
          lobby.game.scenarioLocationBindings.find(
            (b) => b.locationSlotId === found[0],
          )?.locationId ?? found[0];
        const location = lobby.game.getLocation(id);
        const spacing = new LocationSpacingPolicy({ setup: lobby.game.setup });
        if (
          !spacing.check(
            location,
            next.locations[found[0]].position,
            lobby.game.locations,
          ).success
        )
          throw new RangeError(
            "Ce lieu est trop proche d’un autre lieu du monde.",
          );
        location.position = { ...next.locations[found[0]].position };
        const placement = lobby.game.scenarioRuntime?.placements[found[0]];
        if (placement)
          placement.position = { ...next.locations[found[0]].position };
        lobby.game.eventLog.push({
          type: "organizer_qr_relocated",
          locationId: id,
          at: this.now(),
        });
        lobby.gameRevision++;
        discoverNearbyLocations(lobby.game);
      }
      lobby.configuration.preparation = next;
    } catch (error) {
      throw new LobbyError("invalid_installation", error.message);
    }
    if (lobby.status === "waiting")
      for (const entry of lobby.players.values()) entry.ready = false;
    this.#markChanged();
    return this.snapshot(lobby.code);
  }

  scanQrLocation({ token, qrId }) {
    const { lobby, player } = this.#playerForToken(token);
    const game = lobby.game;
    if (!game)
      throw new LobbyError(
        "game_not_ready",
        "La partie n’est pas encore ouverte.",
      );
    const location = game.locations.find(
      (l) => l.qr.enabled && l.qr.id === qrId,
    );
    const hero = game.heroes.find((h) => h.playerId === player.id);
    if (
      !location ||
      !hero ||
      !mapLocationDiscoverable(location, game, player.id)
    )
      throw new LobbyError(
        "qr_unavailable",
        "Ce lieu n’est pas accessible pour le moment.",
      );
    if (!player.position || this.now() - player.positionReceivedAt > 30_000)
      throw new LobbyError("gps_required", "Actualisez votre position GPS.");
    const policy = createLocationInteractionPolicy({
      game,
      hero,
      mode: "gps",
      rangePolicy: new LocationRangePolicy(
        game.setup.locationSetup.rangePolicy,
      ),
    });
    if (
      distanceMeters(player.position, location.position) >
      policy.rangesFor(location).interactionRadius
    )
      throw new LobbyError(
        "out_of_range",
        "Approchez-vous du lieu pour valider ce QR code.",
      );
    game.getPlayer(player.id).discoverLocation(location.id, 3);
    lobby.gameRevision++;
    this.#markChanged();
    return { locationId: location.id, name: location.name };
  }

  printPreparation({ token }) {
    const { lobby, player } = this.#playerForToken(token);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError(
        "host_only",
        "Seul l’organisateur peut imprimer les fiches.",
      );
    try {
      return {
        html: createQrPrintDocument(
          this.snapshot(lobby.code),
          getScenarioBundle(lobby.configuration.scenarioId).catalog,
        ),
      };
    } catch (error) {
      throw new LobbyError("print_not_ready", error.message);
    }
  }

  updatePlayerPosition({ token, position }) {
    const { lobby, player } = this.#playerForToken(token);
    if (lobby.status !== "started")
      throw new LobbyError("not_started", "La partie n’a pas commencé.");
    const receivedAt = this.now();
    if (
      player.positionReceivedAt !== null &&
      receivedAt - player.positionReceivedAt < 250
    )
      throw new LobbyError(
        "position_rate_limited",
        "Les positions sont envoyées trop rapidement.",
      );
    const latitude = finiteRange(position?.latitude, -90, 90);
    const longitude = finiteRange(position?.longitude, -180, 180);
    const accuracy = optionalRange(position?.accuracy, 0, 10_000);
    const heading = optionalRange(position?.heading, 0, 360);
    const concealmentMultiplier = optionalRange(
      position?.concealmentMultiplier,
      0.1,
      1,
    );
    player.position = {
      latitude,
      longitude,
      accuracy,
      heading,
      updatedAt: receivedAt,
    };
    player.positionReceivedAt = receivedAt;
    const authoritativeHero = lobby.game?.heroes.find(
      (hero) => hero.playerId === player.id,
    );
    if (authoritativeHero) {
      if (concealmentMultiplier !== null)
        authoritativeHero.classFeatureState.gpsConcealmentMultiplier =
          concealmentMultiplier;
      recordDashboardExploration(
        lobby,
        player.id,
        { latitude, longitude },
        receivedAt,
      );
      lobby.game.recordHeroTravel({
        heroId: authoritativeHero.id,
        position: { latitude, longitude },
        accuracy: accuracy ?? 0,
      });
      lobby.game.explorationDiscoveryService.inspectHeroPosition({ heroId: authoritativeHero.id, position: { latitude, longitude }, previousPosition: authoritativeHero.position, accuracy: accuracy ?? 0, at: receivedAt });
      authoritativeHero.updatePosition({
        latitude,
        longitude,
        ...(accuracy === null ? {} : { accuracy }),
      });
      lobby.game.playerPlacementService.recordPosition(
        lobby.game,
        player.id,
        { latitude, longitude },
        accuracy,
        receivedAt,
      );
      lobby.game.territoryService.recordPosition(
        lobby.game,
        player.id,
        { latitude, longitude },
        receivedAt,
        accuracy,
      );
      discoverNearbyLocations(lobby.game);
      if (this.questEngineEnabled) {
        const quests = ravitaillementService(lobby, this.now);
        quests?.dispatchOfficialEvent(
          {
            id: `position:${player.id}:${receivedAt}`,
            type: "PositionUpdated",
          },
          player.id,
        );
      }
      const bag =
        lobby.game.inventoryService.getHeroBagState(authoritativeHero);
      lobby.game.autonomousGroupTraces.push(
        ...lobby.heroTraceService.recordMovement({
          hero: authoritativeHero,
          position: { latitude, longitude },
          at: receivedAt,
          coordinateMode: lobby.game.coordinateMode,
          occupiedCargoSlots: bag.usedSlots,
          concealmentMultiplier:
            lobby.game.heroClassFeatureService.signatureMultiplier(
              authoritativeHero,
            ),
        }),
      );
      lobby.gameRevision += 1;
      lobby.lastGameFingerprint = JSON.stringify(lobby.game.toJSON());
    }
    this.#markChanged();
    return this.positionSnapshot(lobby.code);
  }

  positionSnapshot(code) {
    const lobby = this.#requireLobby(code);
    return {
      code: lobby.code,
      positions: [...lobby.players.values()].map((player) => {
        const hero = lobby.game?.heroes.find(
          (candidate) => candidate.playerId === player.id,
        );
        return {
          playerId: player.id,
          name: player.name,
          heroClassId: player.heroClassId,
          heroGender: player.heroGender ?? null,
          connected: player.connections.size > 0,
          position: player.position ? { ...player.position } : null,
          heroState: hero
            ? heroStateSummary(hero)
            : player.heroState
              ? structuredClone(player.heroState)
              : null,
        };
      }),
    };
  }

  updateHeroState({ token, heroState }) {
    const { lobby, player } = this.#playerForToken(token);
    if (lobby.status !== "started")
      throw new LobbyError("not_started", "La partie n’a pas commencé.");
    if (lobby.game)
      throw new LobbyError(
        "server_authoritative",
        "L’état du héros est calculé par le serveur.",
      );
    const receivedAt = this.now();
    if (
      player.heroStateReceivedAt !== null &&
      receivedAt - player.heroStateReceivedAt < 500
    )
      throw new LobbyError(
        "hero_state_rate_limited",
        "L’état du héros est envoyé trop rapidement.",
      );
    player.heroState = validHeroState(heroState, receivedAt);
    player.heroStateReceivedAt = receivedAt;
    this.#markChanged();
    return this.positionSnapshot(lobby.code);
  }

  updateWorldState({ token, baseRevision, worldState }) {
    const { lobby, player } = this.#playerForToken(token);
    if (lobby.status !== "started")
      throw new LobbyError("not_started", "La partie n’a pas commencé.");
    if (lobby.game)
      throw new LobbyError(
        "server_authoritative",
        "Le serveur possède désormais l’état officiel de la partie.",
      );
    if (!Number.isInteger(baseRevision) || baseRevision !== lobby.worldRevision)
      throw new LobbyError(
        "world_revision_conflict",
        "Le monde a changé sur un autre téléphone. Réessayez avec son état récent.",
      );
    lobby.worldState = validWorldState(worldState);
    lobby.worldRevision += 1;
    this.#markChanged();
    return this.worldSnapshot(lobby.code, player.id);
  }

  worldSnapshot(code, updatedByPlayerId = null) {
    const lobby = this.#requireLobby(code);
    return {
      code: lobby.code,
      revision: lobby.worldRevision,
      updatedByPlayerId,
      state: lobby.worldState ? structuredClone(lobby.worldState) : null,
    };
  }

  bootstrapGame({ token, snapshot }) {
    const { lobby, player } = this.#playerForToken(token);
    if (lobby.status !== "started")
      throw new LobbyError("not_started", "La partie n’a pas commencé.");
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError(
        "host_only_bootstrap",
        "Seul l’organisateur peut transmettre la configuration initiale.",
      );
    if (lobby.game) return this.gameSnapshot(lobby.code);
    let game;
    try {
      // Les cellules secrètes, découvertes et missions ne viennent jamais du navigateur.
      game = Game.fromJSON({ ...snapshot, explorationState: null, explorationView: null }, {
        now: this.now,
        questSystemEnabled: this.questSystemEnabled,
        tacticalBattles: true,
      });
      // Une configuration navigateur ne peut pas attribuer de territoire.
      game.territoryState = null;
    } catch {
      throw new LobbyError(
        "invalid_game_snapshot",
        "La configuration initiale de la partie est invalide.",
      );
    }
    const expectedPlayers = new Set(lobby.players.keys());
    for (const hero of game.heroes) {
      const owner = lobby.players.get(hero.playerId);
      if (owner)
        hero.gender = requireHeroGender(owner.heroGender, hero.classId);
    }
    const actualPlayers = new Set(
      game.players
        .map((entry) => entry.id)
        .filter((id) => expectedPlayers.has(id)),
    );
    if (
      game.status !== "started" ||
      actualPlayers.size !== expectedPlayers.size
    )
      throw new LobbyError(
        "invalid_game_snapshot",
        "Les joueurs du moteur ne correspondent pas au lobby.",
      );
    const hostKnowledge =
      game.getPlayer(lobby.hostPlayerId)?.locationKnowledge ?? {};
    for (const playerId of lobby.players.keys()) {
      const gamePlayer = game.getPlayer(playerId);
      if (!gamePlayer) continue;
      for (const [locationId, level] of Object.entries(hostKnowledge))
        gamePlayer.discoverLocation(locationId, level);
    }
    try {
      if (lobby.playArea) game.setup.playArea = new PlayArea(lobby.playArea);
      initializeExploration(game, { now: this.now });
    } catch (error) {
      throw new LobbyError("invalid_game_snapshot", `Le terrain ne peut pas être généré : ${error.message}`);
    }
    lobby.game = game;
    // Le client ne fournit jamais de progression au nouveau moteur.
    lobby.game.questEngineState = null;
    if (this.questEngineEnabled) installRavitaillement(lobby, this.now);
    discoverNearbyLocations(game);
    lobby.gameRevision = 1;
    lobby.lastGameTickAt = this.now();
    lobby.lastWorldCycleAt = this.now();
    lobby.heroTraceService = new HeroTraceService();
    lobby.lastGameFingerprint = JSON.stringify(game.toJSON());
    this.#markChanged();
    return this.gameSnapshot(lobby.code);
  }

  executeGameCommand({ token, command, args = [] }) {
    const { lobby, player } = this.#playerForToken(token);
    if (!lobby.game)
      throw new LobbyError(
        "game_not_ready",
        "Le moteur officiel n’est pas encore prêt.",
      );
    if (!CLIENT_GAME_COMMANDS.has(command) || !Array.isArray(args))
      throw new LobbyError("command_forbidden", "Commande de jeu interdite.");
    if (command === "playerPlacementCommand") {
      const intent = args[0];
      if (
        args.length !== 1 ||
        !intent ||
        typeof intent !== "object" ||
        Array.isArray(intent) ||
        Object.keys(intent).some(
          (key) => !["action", "slotId", "cellId", "playerId"].includes(key),
        ) ||
        (intent.playerId !== undefined && intent.playerId !== player.id)
      )
        throw new LobbyError(
          "command_forbidden",
          "Intention de placement invalide.",
        );
      const measurement = player.position;
      const fresh =
        measurement &&
        Number.isFinite(player.positionReceivedAt) &&
        this.now() - player.positionReceivedAt <= 30_000 &&
        (lobby.game.coordinateMode === "simulation" ||
          (Number.isFinite(measurement.accuracy) &&
            measurement.accuracy <= 50));
      args = [
        {
          action: intent.action,
          slotId: intent.slotId,
          cellId: intent.cellId,
          playerId: player.id,
          officialPosition: fresh
            ? {
                latitude: measurement.latitude,
                longitude: measurement.longitude,
              }
            : null,
        },
      ];
    }
    discoverNearbyLocations(lobby.game);
    if (command === "questEngineCommand") {
      if (
        !this.questEngineEnabled ||
        args.length !== 1 ||
        !["accept", "act", "abandon"].includes(args[0]?.type)
      )
        throw new LobbyError(
          "command_forbidden",
          "Commande du nouveau moteur interdite.",
        );
      const service = ravitaillementService(lobby, this.now);
      if (!service)
        throw new LobbyError(
          "quest_unavailable",
          "Les quêtes à actions ne sont pas disponibles dans ce monde.",
        );
      let result;
      try {
        result = service.command(player.id, structuredClone(args[0]));
        if (args[0].type === "accept" && result.success) {
          const dialogue = service.command(player.id, {
            type: "act",
            instanceId: result.instance.id,
            actionId: "receive-order",
          });
          result = {
            ...result,
            dialogue: dialogue.dialogue,
            actionId: "receive-order",
          };
        }
        service.dispatchOfficialEvent(
          {
            id: `command:${lobby.gameRevision + 1}:${player.id}`,
            type: "QuestCommandCompleted",
          },
          player.id,
        );
      } catch (error) {
        throw new LobbyError("command_rejected", error.message);
      }
      consumeAstralInteraction(lobby.game, player.id, command, args[0], result);
      discoverNearbyLocations(lobby.game);
      lobby.gameRevision += 1;
      lobby.lastGameFingerprint = JSON.stringify(lobby.game.toJSON());
      this.#markChanged();
      return { result, game: this.gameSnapshot(lobby.code) };
    }
    if (!lobby.game.questSystemEnabled && QUEST_COMMANDS.has(command))
      throw new LobbyError(
        "quest_system_disabled",
        "Les quêtes sont temporairement désactivées.",
      );
    if (
      command === "prepareTestQuest" &&
      (!lobby.configuration.solo || lobby.game.coordinateMode !== "simulation")
    )
      throw new LobbyError(
        "command_forbidden",
        "Les outils de quête nécessitent une partie solo de simulation.",
      );
    if (command === "playerSocialCommand") {
      if (args.length !== 1 || args[0]?.playerId !== player.id)
        throw new LobbyError(
          "command_forbidden",
          "Identité de joueur invalide.",
        );
      lobby.game.playerSocialService.refresh(
        lobby.game,
        new Set(
          [...lobby.players.values()]
            .filter((p) => p.connections.size)
            .map((p) => p.id),
        ),
      );
      if (
        args[0].action === "request" &&
        !lobby.players.get(args[0].targetPlayerId)?.connections.size
      )
        throw new LobbyError("command_rejected", "Ce joueur est déconnecté.");
    }
    if (command === "createBattle") {
      args[0] ??= {};
      args[0].config = { ...args[0].config, tactical: true };
      const sides = (args[0]?.teamParticipants ?? []).map((t) =>
        (t.heroIds ?? [])
          .map((id) => lobby.game.getHero(id))
          .filter((h) => h && lobby.players.has(h.playerId)),
      );
      if (
        !lobby.game.setup.rules.allowPvP &&
        sides.filter((side) => side.length).length > 1
      )
        throw new LobbyError("command_forbidden", "Le PvP est désactivé.");
      for (const side of sides)
        for (const first of side)
          for (const second of side)
            if (!alliedPlayers(lobby.game, first.playerId, second.playerId))
              throw new LobbyError(
                "command_forbidden",
                "Un ennemi ne peut pas rejoindre votre équipe.",
              );
      const attacker = lobby.game.heroes.find((h) => h.playerId === player.id);
      for (const target of sides.flat().filter((h) => h.playerId !== player.id))
        if (
          !lobby.players.get(target.playerId)?.connections.size ||
          !lobby.game.canEngageHeroes(attacker?.id, target.id)
        )
          throw new LobbyError(
            "command_forbidden",
            "Ce joueur n’est pas disponible à proximité.",
          );
    }
    authorizeGameCommand(lobby.game, player.id, command, args);
    if (command === "selectLocationChiefOption" && args[0]?.optionId?.startsWith("rumor-action:")) {
      const match = /^rumor-action:(listen|explain):(.+)$/.exec(args[0].optionId);
      const series = match && lobby.game.explorationState.clueSeries.find(entry => explorationPublicId(lobby.game, player.id, "series", entry.id) === match[2]);
      if (!series) throw new LobbyError("command_rejected", "Rumeur indisponible.");
      args = [{ ...args[0], optionId: `rumor-action:${match[1]}:${series.id}` }];
    }
    if (["prepareExceptionalExpedition", "departExceptionalExpedition", "cancelExceptionalExpedition", "resolveExceptionalExpedition", "claimExceptionalExpedition", "claimCampInstallation"].includes(command)) {
      const request = {...args[0]};
      if (command === "prepareExceptionalExpedition") {
        const site = lobby.game.explorationState.sites.find(s => explorationPublicId(lobby.game, player.id, "site", s.id) === request.siteId);
        if (!site) throw new LobbyError("command_rejected", "Site indisponible.");
        request.siteId = site.id;
      }
      if (request.expeditionId) {
        const mission = lobby.game.explorationState.expeditions.find(m => m.playerId === player.id && explorationPublicId(lobby.game, player.id, "expedition", m.id) === request.expeditionId);
        if (!mission) throw new LobbyError("command_rejected", "Expédition indisponible.");
        request.expeditionId = mission.id;
      }
      args = [request];
    }
    const privateClue = publicId => lobby.game.explorationState.clues.find(entry => explorationPublicId(lobby.game, player.id, "clue", entry.id) === publicId);
    if (["prepareExteriorSearch", "validateExteriorSearch", "cancelExteriorSearch"].includes(command)) {
      const search = lobby.game.explorationState.searches.find(entry => entry.playerId === player.id && explorationPublicId(lobby.game, player.id, "search", entry.id) === args[0]?.searchId);
      if (!search) throw new LobbyError("command_rejected", "Recherche indisponible.");
      const request = { ...args[0], searchId: search.id };
      if (request.preparation?.clueIds) request.preparation = { ...request.preparation, clueIds: request.preparation.clueIds.map(id => {
        const clue = privateClue(id);
        if (!clue) throw new LobbyError("command_rejected", "Indice indisponible.");
        return clue.id;
      }) };
      args = [request];
    }

    if (command === "depositLocationItem" && args[0]?.lootId?.startsWith("exploration-clue-")) {
      const clue = privateClue(args[0].lootId);
      const item = lobby.game.getHero(args[0].heroId)?.carriedLoot.find(entry => entry.itemId === clue?.id);
      if (!item) throw new LobbyError("command_rejected", "Indice indisponible.");
      args = [{ ...args[0], lootId: item.id }];
    }
    if (command === "collectBattleLoot" && args[0]?.selection) {
      const reward = lobby.game.battleLoot.find(entry => entry.battleId === args[0].battleId);
      args = [{ ...args[0], selection: Object.fromEntries(Object.entries(args[0].selection).map(([id, quantity]) => {
        if (!id.startsWith("exploration-clue-")) return [id, quantity];
        const clue = privateClue(id);
        const item = reward?.entries.find(entry => entry.itemId === clue?.id && entry.allocations[player.id] > 0);
        if (!item) throw new LobbyError("command_rejected", "Indice indisponible.");
        return [item.id, quantity];
      })) }];
    }
    if (command === "selectLocationChiefOption" && args[0]?.optionId?.startsWith("clue-action:")) {
      const match = /^clue-action:(take|sell):(.+)$/.exec(args[0].optionId);
      const clue = match && privateClue(match[2]);
      if (!clue) throw new LobbyError("command_rejected", "Indice indisponible.");
      args = [{ ...args[0], optionId: `clue-action:${match[1]}:${clue.id}` }];
    }
    const operation = lobby.game[command];
    if (typeof operation !== "function")
      throw new LobbyError("command_forbidden", "Commande de jeu interdite.");
    let result;
    try {
      lobby.game.activeQuestActorId =
        lobby.game.getPlayer(player.id)?.heroIds[0] ?? null;
      result = operation.apply(lobby.game, structuredClone(args));
    } catch (error) {
      throw new LobbyError(
        "command_rejected",
        error instanceof Error ? error.message : "Commande refusée.",
      );
    }
    consumeAstralInteraction(lobby.game, player.id, command, args[0], result);
    discoverNearbyLocations(lobby.game);
    lobby.gameRevision += 1;
    lobby.lastGameFingerprint = JSON.stringify(lobby.game.toJSON());
    this.#markChanged();
    return {
      result: serializableResult(result),
      game: this.gameSnapshot(lobby.code),
    };
  }

  executeBattleCommand({ token, battleId, command, args = [] }) {
    const { lobby, player } = this.#playerForToken(token);
    const battle = lobby.game?.battles.find((entry) => entry.id === battleId);
    if (!battle)
      throw new LobbyError("battle_not_found", "Le combat n’existe pas.");
    if (!Array.isArray(args))
      throw new LobbyError(
        "command_forbidden",
        "Commande de combat interdite.",
      );
    const team = battle.teams.find((entry) =>
      entry.heroes.some((hero) => hero.playerId === player.id),
    );
    if (!team)
      throw new LobbyError(
        "command_forbidden",
        "Vous ne participez pas à ce combat.",
      );
    let result;
    if (battle.duel) {
      try {
        if (battle.duel.mode === "DUEL") {
          if (
            (battle.duel.tactics && args[1] !== battle.duel.round) ||
            (args[1] !== undefined && args[1] !== battle.duel.round)
          )
            throw new LobbyError(
              "command_rejected",
              "Cette manche est terminée.",
            );
          if (command === "submitDuelChoice")
            result = battle.submitDuelChoice(
              team.id,
              structuredClone(args[0] ?? {}),
            );
          else if (command === "lockDuelChoice") {
            // Validate the final choice and lock it in the same server turn.
            if (args[0] !== undefined)
              battle.submitDuelChoice(team.id, structuredClone(args[0]));
            result = battle.lockDuelChoice(team.id, this.now());
          } else
            throw new LobbyError(
              "command_forbidden",
              "Commande de duel inconnue.",
            );
        }
      } catch (error) {
        if (error instanceof LobbyError) throw error;
        throw new LobbyError("command_rejected", error.message);
      }
    } else {
      throw new LobbyError(
        "command_forbidden",
        "Cette bataille ne dispose pas d’un état de duel.",
      );
    }
    lobby.gameRevision += 1;
    lobby.lastGameFingerprint = JSON.stringify(lobby.game.toJSON());
    this.#markChanged();
    return {
      result: serializableResult(result),
      game: this.gameSnapshot(lobby.code),
    };
  }

  projectForPlayer(token, payload) {
    if (!token) return payload;
    const { lobby, player } = this.#playerForToken(token);
    return projectPlayerPayload(payload, {
      playerId: player.id,
      lobby: this.snapshot(lobby.code),
      gameSnapshot: this.gameSnapshot(lobby.code),
      positions: this.positionSnapshot(lobby.code),
      now: this.now(),
    });
  }

  gameSnapshot(code) {
    const lobby = this.#requireLobby(code);
    return {
      code: lobby.code,
      revision: lobby.gameRevision,
      state: lobby.game?.toJSON() ?? null,
    };
  }

  advanceGames() {
    const now = this.now();
    const updates = [];
    for (const lobby of this.#lobbies.values()) {
      if (
        lobby.status !== "started" ||
        !lobby.game ||
        lobby.game.status !== "started"
      )
        continue;
      if (
        ![...lobby.players.values()].some((player) => player.connections.size)
      ) {
        // Le monde reste en pause ; la supervision continue à relever son état.
        lobby.lastGameTickAt = now;
        lobby.lastWorldCycleAt = now;
        this.#captureDashboardSample(lobby, now);
        continue;
      }
      lobby.lastGameTickAt = now;
      if (this.questEngineEnabled) installRavitaillement(lobby, this.now);
      for (const battle of lobby.game.battles) {
        if (battle.duel && battle.status !== "finished") {
          const humanPlayerIds = new Set(
            [...lobby.players.values()].map((participant) => participant.id),
          );
          const humanTeamIds = battle.teams
            .filter((team) =>
              team.heroes.some((hero) => humanPlayerIds.has(hero.playerId)),
            )
            .map((team) => team.id);
          battle.advanceDuel({ now, humanTeamIds });
        }
        if (
          battle.status === "finished" &&
          !lobby.resolvedBattleIds.has(battle.id)
        ) {
          lobby.game.resolveBattle(battle.id);
          lobby.resolvedBattleIds.add(battle.id);
          if (this.questEngineEnabled) {
            const quests = ravitaillementService(lobby, this.now);
            const playerIds = new Set(
              battle.teams.flatMap((team) =>
                team.heroes.map((hero) => hero.playerId),
              ),
            );
            for (const playerId of playerIds) {
              if (
                !lobby.game.heroes.some(
                  (hero) =>
                    hero.playerId === playerId && hero.state === "active",
                ) ||
                !lobby.game.getPlayer(playerId)
              )
                continue;
              quests?.dispatchOfficialEvent(
                {
                  id: `battle:${battle.id}:${playerId}`,
                  type: "BattleFinished",
                  battleId: battle.id,
                },
                playerId,
              );
            }
          }
        }
      }
      lobby.game.playerSocialService.refresh(
        lobby.game,
        new Set(
          [...lobby.players.values()]
            .filter((p) => p.connections.size)
            .map((p) => p.id),
        ),
      );
      lobby.game.update();
      // Sur la carte fictive, une position officielle reste valide tant que
      // le joueur connecté ne déplace pas son héros.
      if (lobby.game.coordinateMode === "simulation")
        for (const player of lobby.players.values()) {
          const hero = lobby.game.heroes.find((h) => h.playerId === player.id);
          if (player.connections.size && hero?.position)
            lobby.game.territoryService.recordPosition(
              lobby.game,
              player.id,
              hero.position,
              now,
            );
        }
      lobby.game.territoryService.update(
        lobby.game,
        now,
        new Set(
          [...lobby.players.values()]
            .filter((p) => p.connections.size)
            .map((p) => p.id),
        ),
      );
      triggerAutonomousHeroAttacks(lobby.game, new Set(lobby.players.keys()));
      discoverNearbyLocations(lobby.game);
      if (now - lobby.lastWorldCycleAt >= 10_000) {
        lobby.game.advanceCycle(1);
        lobby.lastWorldCycleAt = now;
      }
      this.#captureDashboardSample(lobby, now);
      const fingerprint = JSON.stringify(lobby.game.toJSON());
      if (fingerprint === lobby.lastGameFingerprint) continue;
      lobby.lastGameFingerprint = fingerprint;
      lobby.gameRevision += 1;
      updates.push(this.gameSnapshot(lobby.code));
    }
    if (updates.length > 0) this.#markChanged();
    return updates;
  }

  #captureDashboardSample(lobby, now) {
    if (now - (lobby.lastMonitoringAt ?? -Infinity) < WORLD_SAMPLE_INTERVAL_MS)
      return;
    const sample = captureWorldSample(lobby, now, lobby.lastMonitoringAt);
    if (this.onWorldSample(lobby.code, sample) !== false) {
      lobby.lastMonitoringAt = now;
      for (const player of lobby.players.values())
        if (player.connections.size && player.position)
          recordDashboardPosition(lobby, player, now);
    }
  }

  selectHeroClass({ token, heroClassId, heroGender }) {
    const { lobby, player } = this.#playerForToken(token);
    this.#requireWaitingLobby(lobby);
    if (lobby.resume)
      throw new LobbyError(
        "saved_hero_locked",
        "Le héros sauvegardé ne peut pas être modifié.",
      );
    const gender = requireHeroGender(heroGender, heroClassId);
    player.heroClassId = validChoice(
      heroClassId,
      HERO_CLASS_IDS,
      "invalid_hero_class",
      "Classe de héros inconnue.",
    );
    player.heroGender = gender;
    player.ready = false;
    this.#markChanged();
    return this.snapshot(lobby.code);
  }

  startLobby({ token }) {
    const { lobby, player } = this.#playerForToken(token);
    this.#requireWaitingLobby(lobby);
    this.#checkActiveGameCapacity(lobby);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError("host_only", "Seul l’organisateur peut démarrer.");
    if (lobby.configuration.gameType === "duel" && lobby.players.size !== 2)
      throw new LobbyError(
        "not_enough_players",
        "Un duel exige exactement deux joueurs.",
      );
    if (lobby.configuration.positionMode === "gps" && !lobby.playArea)
      throw new LobbyError(
        "play_area_required",
        "La zone GPS doit être validée avant le démarrage.",
      );
    if ([...lobby.players.values()].some((entry) => !entry.ready)) {
      throw new LobbyError(
        "players_not_ready",
        "Tous les joueurs doivent être prêts.",
      );
    }
    const preparation = lobby.configuration.preparation;
    const problems = preparationProblems(
      preparation,
      getScenarioBundle(lobby.configuration.scenarioId).catalog,
      lobby.playArea,
    );
    if (problems.length)
      throw new LobbyError("preparation_incomplete", problems.join(" "));
    if (
      [...lobby.players.values()].some(
        (entry) =>
          !entry.heroClassId &&
          !(
            preparation?.enabled &&
            entry.id === lobby.hostPlayerId &&
            preparation.organizerRole !== "advanced-player"
          ),
      )
    )
      throw new LobbyError(
        "hero_class_required",
        "Tous les joueurs doivent choisir une classe de héros.",
      );
    if (lobby.resume) {
      if (lobby.players.size !== lobby.resume.slots.length)
        throw new LobbyError(
          "players_missing",
          "Tous les héros sauvegardés doivent être repris avant de continuer.",
        );
      const resumedAt = this.now();
      lobby.launch = {
        ...structuredClone(lobby.resume.launch),
        id: `resume-${lobby.code}-${resumedAt}`,
        startedAt: resumedAt,
      };
      lobby.game = Game.fromJSON(lobby.resume.game, {
        now: this.now,
        questSystemEnabled: this.questSystemEnabled,
        tacticalBattles: true,
      });
      if (this.questEngineEnabled) installRavitaillement(lobby, this.now);
      lobby.gameRevision += 1;
      lobby.lastGameTickAt = resumedAt;
      lobby.lastWorldCycleAt = resumedAt;
      lobby.heroTraceService = new HeroTraceService();
      lobby.lastGameFingerprint = JSON.stringify(lobby.game.toJSON());
      lobby.status = "started";
      this.#markChanged();
      return this.snapshot(lobby.code);
    }
    const startedAt = this.now();
    lobby.launch = {
      id: `multiplayer-${lobby.code}-${startedAt}`,
      seed: `${lobby.code}-${startedAt}`,
      startedAt,
      serverCreatedGame: lobby.configuration.scenarioId !== "chaos",
      configuration: { ...lobby.configuration },
      playArea: lobby.playArea ? structuredClone(lobby.playArea) : null,
      players: [...lobby.players.values()].map((entry) => ({
        id: entry.id,
        name: entry.name,
        heroClassId: entry.heroClassId,
        heroGender: entry.heroGender ?? null,
      })),
    };
    lobby.status = "started";
    if (preparation?.enabled || lobby.configuration.scenarioId !== "chaos") {
      try {
        const createGame = preparation?.enabled
          ? createPreparedGame
          : createEditorGame;
        lobby.game = createGame(this.snapshot(lobby.code), {
          now: this.now,
          questSystemEnabled: this.questSystemEnabled,
        });
        if (this.questEngineEnabled) installRavitaillement(lobby, this.now);
        initializeExploration(lobby.game, { now: this.now });
        discoverNearbyLocations(lobby.game);
        lobby.gameRevision = 1;
        lobby.heroTraceService = new HeroTraceService();
        lobby.lastGameTickAt = startedAt;
        lobby.lastWorldCycleAt = startedAt;
        lobby.lastGameFingerprint = JSON.stringify(lobby.game.toJSON());
      } catch (error) {
        lobby.status = "waiting";
        lobby.launch = null;
        lobby.game = null;
        throw new LobbyError("preparation_launch_failed", error.message);
      }
    }
    this.#markChanged();
    return this.snapshot(lobby.code);
  }

  disconnect({ token, connectionId }) {
    const session = this.#session(token);
    if (!session) return null;
    const lobby = this.#lobbies.get(session.code);
    const player = lobby?.players.get(session.playerId);
    if (!player) return null;
    if (connectionId) player.connections.delete(connectionId);
    this.#markChanged();
    return this.snapshot(lobby.code);
  }

  leaveLobby({ token }) {
    const session = this.#requireSession(token);
    const lobby = this.#requireLobby(session.code);
    lobby.players.delete(session.playerId);
    this.#sessions.delete(tokenHash(token));
    if (lobby.players.size === 0) {
      this.#lobbies.delete(lobby.code);
      this.#markChanged();
      return null;
    }
    if (lobby.hostPlayerId === session.playerId) {
      lobby.hostPlayerId = lobby.players.keys().next().value;
    }
    this.#markChanged();
    return this.snapshot(lobby.code);
  }

  dashboardList() {
    return [...this.#lobbies.values()].map((lobby) => ({
      code: lobby.code,
      status: lobby.status,
      mode: lobby.game?.coordinateMode ?? lobby.configuration.positionMode,
      connected: [...lobby.players.values()].filter(
        (player) => player.connections.size,
      ).length,
      players: lobby.players.size,
      revision: lobby.gameRevision,
    }));
  }
  dashboardSavedMaps() {
    return [...this.savedMapLibrary.entries.values()].map(
      ({ owner, ...entry }) => structuredClone(entry),
    );
  }
  dashboardMapUsages() {
    const usages = this.dashboardSavedMaps().map((entry) => ({
      label: `Carte : ${entry.name}`,
      polygon: entry.playArea.polygon,
    }));
    for (const lobby of this.#lobbies.values())
      for (const area of [
        lobby.playArea,
        lobby.launch?.playArea,
        lobby.game?.setup?.playArea,
      ])
        if (area?.polygon?.length >= 3)
          usages.push({
            label: `Partie : ${lobby.code}`,
            polygon: area.polygon,
          });
    for (const save of this.#manualSaves.values())
      for (const area of [save.launch?.playArea, save.game?.setup?.playArea])
        if (area?.polygon?.length >= 3)
          usages.push({
            label: `Sauvegarde : ${save.name ?? save.id}`,
            polygon: area.polygon,
          });
    return usages;
  }
  dashboardDeleteSavedMap(id) {
    if (!this.savedMapLibrary.entries.delete(id)) return false;
    this.#markChanged();
    return true;
  }

  dashboardDetail(code) {
    const lobby = this.#lobbies.get(code);
    return lobby ? dashboardParty(lobby) : null;
  }

  deleteDashboardParty(code) {
    if (!this.#lobbies.has(code)) return false;
    this.#lobbies.delete(code);
    for (const [hash, session] of this.#sessions) {
      if (session.code === code) this.#sessions.delete(hash);
    }
    this.#markChanged();
    return true;
  }

  exportState() {
    return {
      version: 1,
      savedAt: this.now(),
      lobbies: [...this.#lobbies.values()].map((lobby) => ({
        code: lobby.code,
        status: lobby.status,
        maxPlayers: lobby.maxPlayers,
        configuration: structuredClone(lobby.configuration),
        playArea: lobby.playArea ? structuredClone(lobby.playArea) : null,
        launch: lobby.launch ? structuredClone(lobby.launch) : null,
        resume: lobby.resume ? structuredClone(lobby.resume) : null,
        worldState: lobby.worldState ? structuredClone(lobby.worldState) : null,
        worldRevision: lobby.worldRevision,
        game: lobby.game?.toJSON() ?? null,
        gameRevision: lobby.gameRevision,
        resolvedBattleIds: [...lobby.resolvedBattleIds],
        hostPlayerId: lobby.hostPlayerId,
        createdAt: lobby.createdAt,
        monitoringSamples: structuredClone(lobby.monitoringSamples ?? []),
        dashboardExploration: structuredClone(
          lobby.dashboardExploration ?? null,
        ),
        players: [...lobby.players.values()].map((player) => ({
          id: player.id,
          name: player.name,
          ready: player.ready,
          heroClassId: player.heroClassId,
          heroGender: player.heroGender ?? null,
          position: player.position ? structuredClone(player.position) : null,
          positionReceivedAt: player.positionReceivedAt,
          heroState: player.heroState
            ? structuredClone(player.heroState)
            : null,
          heroStateReceivedAt: player.heroStateReceivedAt,
          identityHash: player.identityHash,
          accountId: player.accountId,
        })),
      })),
      sessions: [...this.#sessions.entries()].map(([hash, session]) => ({
        hash,
        code: session.code,
        playerId: session.playerId,
      })),
      savedMaps: this.savedMapLibrary.toJSON(),
      manualSaves: [...this.#manualSaves.values()].map((save) =>
        structuredClone(save),
      ),
      accounts: [...this.#accounts.values()].map(({ id, name }) => ({
        id,
        name,
      })),
    };
  }

  snapshot(code) {
    const lobby = this.#requireLobby(code);
    return {
      code: lobby.code,
      status: lobby.status,
      maxPlayers: lobby.maxPlayers,
      configuration: { ...lobby.configuration },
      scenarios: structuredClone(launchScenarios),
      preparationCatalog: structuredClone(
        selectedPreparationCatalog(
          lobby.configuration.preparation,
          getScenarioBundle(lobby.configuration.scenarioId).catalog,
        ),
      ),
      preparationStepProblems: preparationStepProblems(
        lobby.configuration.preparation,
        getScenarioBundle(lobby.configuration.scenarioId).catalog,
        lobby.playArea,
      ),
      preparationProblems: preparationProblems(
        lobby.configuration.preparation,
        getScenarioBundle(lobby.configuration.scenarioId).catalog,
        lobby.playArea,
      ),
      playArea: lobby.playArea ? structuredClone(lobby.playArea) : null,
      launch: lobby.launch ? structuredClone(lobby.launch) : null,
      resume: lobby.resume
        ? {
            saveId: lobby.resume.saveId,
            name: lobby.resume.name,
            savedAt: lobby.resume.savedAt,
            slots: lobby.resume.slots.map((slot) => ({
              playerId: slot.playerId,
              name: slot.name,
              heroClassId: slot.heroClassId,
              heroGender: slot.heroGender ?? null,
              claimed: lobby.players.has(slot.playerId),
            })),
          }
        : null,
      hostPlayerId: lobby.hostPlayerId,
      players: [...lobby.players.values()].map((player) => ({
        id: player.id,
        name: player.name,
        ready: player.ready,
        heroClassId: player.heroClassId,
        heroGender: player.heroGender ?? null,
        connected: player.connections.size > 0,
        isHost: player.id === lobby.hostPlayerId,
      })),
    };
  }

  #addPlayer(
    lobby,
    name,
    connectionId,
    {
      identityHash = null,
      accountId = null,
      playerId = this.idFactory(),
      heroClassId = null,
      heroGender = null,
    } = {},
  ) {
    const token = this.randomBytes(32).toString("base64url");
    const player = {
      id: playerId,
      name,
      ready: false,
      heroClassId,
      heroGender,
      identityHash,
      accountId,
      position: null,
      positionReceivedAt: null,
      heroState: null,
      heroStateReceivedAt: null,
      connections: new Set(connectionId ? [connectionId] : []),
    };
    lobby.players.set(player.id, player);
    const session = { code: lobby.code, playerId: player.id };
    this.#sessions.set(tokenHash(token), session);
    return { session: { ...session, token, accountId: player.accountId } };
  }

  #result(lobby, session) {
    this.#markChanged();
    return { lobby: this.snapshot(lobby.code), session };
  }

  #restoreState(state) {
    if (!Array.isArray(state?.lobbies) || !Array.isArray(state?.sessions)) {
      throw new TypeError("Sauvegarde serveur invalide.");
    }
    const restoredAt = this.now();
    for (const source of state.lobbies) {
      if (
        !source ||
        typeof source.code !== "string" ||
        !Array.isArray(source.players)
      ) {
        throw new TypeError("Lobby sauvegardé invalide.");
      }
      const game = source.game
        ? Game.fromJSON(source.game, {
            now: this.now,
            questSystemEnabled: this.questSystemEnabled,
            tacticalBattles: true,
          })
        : null;
      const lobby = {
        code: source.code,
        status: source.status,
        maxPlayers: source.maxPlayers,
        configuration: structuredClone(source.configuration),
        playArea: source.playArea ? structuredClone(source.playArea) : null,
        launch: source.launch ? structuredClone(source.launch) : null,
        resume: source.resume ? structuredClone(source.resume) : null,
        worldState: source.worldState
          ? structuredClone(source.worldState)
          : null,
        worldRevision: source.worldRevision ?? 0,
        game,
        gameRevision: source.gameRevision ?? 0,
        lastGameTickAt: game ? restoredAt : null,
        lastWorldCycleAt: game ? restoredAt : null,
        resolvedBattleIds: new Set(source.resolvedBattleIds ?? []),
        lastGameFingerprint: game ? JSON.stringify(game.toJSON()) : null,
        heroTraceService: game ? new HeroTraceService() : null,
        hostPlayerId: source.hostPlayerId,
        createdAt: source.createdAt ?? restoredAt,
        monitoringSamples: (source.monitoringSamples ?? []).slice(-2000),
        dashboardExploration: structuredClone(
          source.dashboardExploration ?? null,
        ),
        players: new Map(
          source.players.map((player) => [
            player.id,
            {
              id: player.id,
              name: player.name,
              ready: Boolean(player.ready),
              heroClassId: player.heroClassId ?? null,
              heroGender: player.heroGender ?? null,
              position: player.position
                ? structuredClone(player.position)
                : null,
              positionReceivedAt: player.positionReceivedAt ?? null,
              heroState: player.heroState
                ? structuredClone(player.heroState)
                : null,
              heroStateReceivedAt: player.heroStateReceivedAt ?? null,
              identityHash: player.identityHash ?? null,
              accountId: player.accountId ?? null,
              connections: new Set(),
            },
          ]),
        ),
      };
      this.#lobbies.set(lobby.code, lobby);
    }
    for (const session of state.sessions) {
      const lobby = this.#lobbies.get(session?.code);
      if (
        typeof session?.hash === "string" &&
        lobby?.players.has(session.playerId)
      ) {
        this.#sessions.set(session.hash, {
          code: session.code,
          playerId: session.playerId,
        });
      }
    }
    for (const save of state.manualSaves ?? []) {
      if (save?.id && save?.game && Array.isArray(save.slots))
        this.#manualSaves.set(save.id, structuredClone(save));
    }
    for (const account of state.accounts ?? []) {
      if (account?.id && typeof account.name === "string")
        this.#accounts.set(account.id, {
          id: account.id,
          name: account.name,
          connections: new Set(),
        });
    }
  }

  #checkActiveGameCapacity(target) {
    if (
      [...target.players.values()].some((player) => player.connections.size) &&
      target.status === "started"
    )
      return;
    const active = [...this.#lobbies.values()].filter(
      (lobby) =>
        lobby !== target &&
        lobby.status === "started" &&
        [...lobby.players.values()].some((player) => player.connections.size),
    );
    if (active.length >= 2)
      throw new LobbyError(
        "server_capacity",
        "Deux parties sont déjà actives. Réessayez lorsqu’une place se libère.",
      );
  }

  #markChanged() {
    this.onStateChanged(this.exportState());
  }

  #playerForToken(token) {
    const session = this.#requireSession(token);
    const lobby = this.#requireLobby(session.code);
    const player = lobby.players.get(session.playerId);
    if (!player)
      throw new LobbyError("session_expired", "Cette place n’existe plus.");
    return { lobby, player };
  }

  #requireWaitingLobby(lobby) {
    if (lobby.status !== "waiting")
      throw new LobbyError("already_started", "Cette partie a déjà commencé.");
  }

  #requireAccount(accountId) {
    const account = this.#accounts.get(accountId);
    if (!account)
      throw new LobbyError(
        "account_required",
        "Choisissez d’abord votre compte joueur.",
      );
    return account;
  }

  #requireLobby(code) {
    const normalized =
      typeof code === "string" ? code.trim().toUpperCase() : "";
    const lobby = this.#lobbies.get(normalized);
    if (!lobby)
      throw new LobbyError("lobby_not_found", "Code de partie inconnu.");
    return lobby;
  }

  #requireSession(token) {
    const session = this.#session(token);
    if (!session)
      throw new LobbyError("session_expired", "La session a expiré.");
    return session;
  }

  #session(token) {
    if (typeof token !== "string" || token.length < 20) return null;
    return this.#sessions.get(tokenHash(token)) ?? null;
  }

  #createCode() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const bytes = this.randomBytes(5);
      const code = [...bytes]
        .map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
        .join("");
      if (!this.#lobbies.has(code)) return code;
    }
    throw new LobbyError(
      "code_unavailable",
      "Impossible de créer un code de partie.",
    );
  }
}

function validName(value) {
  if (typeof value !== "string")
    throw new LobbyError("invalid_name", "Le pseudonyme est requis.");
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 24) {
    throw new LobbyError(
      "invalid_name",
      "Le pseudonyme doit contenir entre 2 et 24 caractères.",
    );
  }
  return name;
}

function validChoice(value, choices, code, message) {
  if (typeof value !== "string" || !choices.has(value))
    throw new LobbyError(code, message);
  return value;
}

function finiteRange(value, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new LobbyError("invalid_position", "Position GPS invalide.");
  return value;
}

function optionalRange(value, minimum, maximum) {
  if (value === null || value === undefined) return null;
  return finiteRange(value, minimum, maximum);
}

function validHeroState(value, updatedAt) {
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw new LobbyError("invalid_hero_state", "État de héros invalide.");
  const units = Array.isArray(value.units) ? value.units : [];
  if (units.length > 50)
    throw new LobbyError("invalid_hero_state", "Armée de héros invalide.");
  return {
    health: finiteInteger(value.health, 0, 1_000_000),
    maxHealth: finiteInteger(value.maxHealth, 1, 1_000_000),
    level: finiteInteger(value.level, 1, 10_000),
    state: validChoice(
      value.state,
      new Set(["active", "ghost", "defeated", "captured"]),
      "invalid_hero_state",
      "État de héros invalide.",
    ),
    commandPoints: finiteInteger(value.commandPoints, 0, 1_000_000),
    maxCommandPoints: finiteInteger(value.maxCommandPoints, 0, 1_000_000),
    units: units.map((unit) => ({
      id: validIdentifier(unit?.id),
      typeId: validIdentifier(unit?.typeId),
      quantity: finiteInteger(unit?.quantity, 0, 1_000_000),
      combatantCount: finiteInteger(unit?.combatantCount, 0, 1_000_000),
    })),
    updatedAt,
  };
}

function heroStateSummary(hero) {
  return {
    health: hero.health,
    maxHealth: hero.maxHealth,
    level: hero.level,
    state: hero.state,
    commandPoints: hero.commandPoints,
    maxCommandPoints: hero.maxCommandPoints,
    units: hero.army.units.map((unit) => ({
      id: unit.id,
      typeId: unit.typeId,
      quantity: unit.quantity,
      combatantCount: unit.combatantCount,
    })),
    updatedAt: Date.now(),
  };
}

function validWorldState(value) {
  if (!value || !Array.isArray(value.locations))
    throw new LobbyError("invalid_world_state", "État du monde invalide.");
  if (value.locations.length < 1 || value.locations.length > 200)
    throw new LobbyError("invalid_world_state", "Nombre de lieux invalide.");
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new LobbyError("invalid_world_state", "État du monde invalide.");
  }
  if (Buffer.byteLength(encoded, "utf8") > 512_000)
    throw new LobbyError(
      "invalid_world_state",
      "État du monde trop volumineux.",
    );
  const ids = new Set();
  const locations = value.locations.map((location) => {
    const id = validIdentifier(location?.id);
    if (ids.has(id))
      throw new LobbyError(
        "invalid_world_state",
        "Lieu dupliqué dans le monde.",
      );
    ids.add(id);
    try {
      return new Location(location).toJSON();
    } catch {
      throw new LobbyError("invalid_world_state", "Données de lieu invalides.");
    }
  });
  try {
    const autonomousGroups = validObjectList(
      value.autonomousGroups,
      200,
      (entry) => new AutonomousGroup(entry).toJSON(),
    );
    const autonomousGroupTraces = validObjectList(
      value.autonomousGroupTraces,
      500,
      (entry) => new AutonomousGroupTrace(entry).toJSON(),
    );
    const watchBeacons = validObjectList(value.watchBeacons, 100, (entry) =>
      new ScoutWatchBeacon(entry).toJSON(),
    );
    const worldState = new WorldState(value.worldState ?? {}).toJSON();
    const battles = validObjectList(value.battles, 50, (entry) =>
      new BattleEngine(entry).toJSON(),
    );
    const battleLoot = validObjectList(value.battleLoot, 100, (entry) =>
      new BattleLoot(entry).toJSON(),
    );
    const battleSites = validObjectList(value.battleSites, 100, (entry) =>
      new BattleSite(entry).toJSON(),
    );
    return {
      locations,
      scenarioState: cloneRecord(value.scenarioState),
      scenarioRuntime: cloneRecord(value.scenarioRuntime),
      worldState,
      availableQuests: validObjectList(value.availableQuests, 100),
      lastQuestResult: cloneRecord(value.lastQuestResult),
      questDeadlines: cloneRecord(value.questDeadlines) ?? {},
      evacuationStates: cloneRecord(value.evacuationStates) ?? {},
      trailStates: cloneRecord(value.trailStates) ?? {},
      autonomousGroups,
      autonomousGroupTraces,
      watchBeacons,
      battles,
      battleReports: validObjectList(value.battleReports, 100),
      battleLoot,
      battleSites,
    };
  } catch (error) {
    if (error instanceof LobbyError) throw error;
    throw new LobbyError("invalid_world_state", "Données du monde invalides.");
  }
}

function validObjectList(value, maximum, normalize = structuredClone) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximum)
    throw new LobbyError("invalid_world_state", "Liste du monde invalide.");
  return value.map((entry) => {
    if (!entry || Array.isArray(entry) || typeof entry !== "object")
      throw new LobbyError("invalid_world_state", "Élément du monde invalide.");
    return normalize(entry);
  });
}

function cloneRecord(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) || typeof value !== "object")
    throw new LobbyError("invalid_world_state", "État du monde invalide.");
  return structuredClone(value);
}

function finiteInteger(value, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum)
    throw new LobbyError("invalid_hero_state", "État de héros invalide.");
  return value;
}

function validIdentifier(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new LobbyError("invalid_hero_state", "État de héros invalide.");
  return value;
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function identityTokenHash(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 200)
    return null;
  return tokenHash(token);
}

function validSaveName(value) {
  if (typeof value !== "string")
    throw new LobbyError("invalid_save_name", "Donnez un nom à la sauvegarde.");
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 50)
    throw new LobbyError(
      "invalid_save_name",
      "Le nom doit contenir entre 2 et 50 caractères.",
    );
  return name;
}

function manualSaveSummary(save) {
  return {
    id: save.id,
    name: save.name,
    savedAt: save.savedAt,
    scenarioId: save.launch?.configuration?.scenarioId ?? null,
    playerCount: save.slots.length,
    players: save.slots.map(({ name, heroClassId }) => ({ name, heroClassId })),
  };
}

function authorizeGameCommand(game, playerId, command, args) {
  const ownsHero = (heroId) => game.getHero(heroId)?.playerId === playerId;
  inspectAuthorityFields(args, ({ key, value }) => {
    if (key === "playerId" && value !== playerId)
      throw new LobbyError("command_forbidden", "Identité de joueur invalide.");
    if (key === "heroId" && !ownsHero(value))
      throw new LobbyError(
        "command_forbidden",
        "Ce héros ne vous appartient pas.",
      );
    if (key === "actorId" && !ownsHero(value))
      throw new LobbyError(
        "command_forbidden",
        "Ce héros ne vous appartient pas.",
      );
  });
  if (command === "createBattle") {
    const heroIds = (args[0]?.teamParticipants ?? []).flatMap(
      (team) => team.heroIds ?? [],
    );
    if (!heroIds.some(ownsHero))
      throw new LobbyError(
        "command_forbidden",
        "Vous devez participer au combat.",
      );
  }
  if (
    command === "createPlayerEncounterBattle" &&
    !ownsHero(args[0]?.attackerHeroId)
  )
    throw new LobbyError(
      "command_forbidden",
      "Vous devez être l’attaquant de ce combat.",
    );
}

function inspectAuthorityFields(value, visit) {
  if (Array.isArray(value)) {
    value.forEach((entry) => inspectAuthorityFields(entry, visit));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value).forEach(([key, entry]) => {
    visit({ key, value: entry });
    inspectAuthorityFields(entry, visit);
  });
}

function serializableResult(value) {
  if (value === undefined) return null;
  if (value && typeof value.toJSON === "function") return value.toJSON();
  try {
    return structuredClone(value);
  } catch {
    return null;
  }
}
