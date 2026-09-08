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
import { HeroTraceService } from "../../app/js/core/hero-trace-service.js";

const CLIENT_GAME_COMMANDS = new Set([
  "discoverLocation", "selectHeroLevelUp", "levelUpHero", "promoteUnit",
  "placeScoutWatchBeacon", "startCurrentScenarioPlacements",
  "updateScenarioPosition", "placeScenarioLocation",
  "dispatchQuestEvent", "trainHeroAtLocation", "selectQuestChoice",
  "inspectTrailPoint", "acceptAvailableQuest", "abandonCurrentQuest",
  "buildCampImprovement", "levelUpCamp", "evolveCamp",
  "selectLocationChiefOption", "attemptLocationCapture", "recruitUnit",
  "completeHeroUnits", "healHeroUnits", "collectLocationResources",
  "depositLocationResource", "depositLocationItem", "transferLocationResource",
  "transferLocationProduction", "preparePopulationPackages",
  "takeLocationPopulationPackage", "assignWagons", "returnWagons",
  "startLocationDismantling", "organizeLocationEvacuation",
  "settlePopulationPackage", "equipHeroItem", "unequipHeroItem",
  "reviveHeroAtBase", "garrisonUnit", "withdrawGarrisonUnit", "disbandUnit",
  "createBattle", "collectBattleLoot", "surrenderBattle", "fleeBattleHero",
  "joinBattle", "updateBattleHeroPosition",
]);

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const POSITION_MODES = new Set(["gps", "simulation"]);
const SCENARIO_IDS = new Set([
  "chaos",
  "repression",
  "granaries_of_the_king",
]);
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
  } = {}) {
    this.randomBytes = randomBytesFn;
    this.idFactory = idFactory;
    this.now = now;
    this.onStateChanged = onStateChanged;
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
    if ([...this.#accounts.values()].some(
      (account) => account.name.localeCompare(valid, "fr", { sensitivity: "base" }) === 0,
    ))
      throw new LobbyError("account_name_taken", "Ce nom de joueur existe déjà.");
    const account = { id: this.idFactory(), name: valid, connections: new Set() };
    this.#accounts.set(account.id, account);
    this.#markChanged();
    return { id: account.id, name: account.name, available: true };
  }

  selectAccount({ accountId, connectionId }) {
    const account = this.#accounts.get(accountId);
    if (!account)
      throw new LobbyError("account_not_found", "Compte joueur introuvable.");
    if (account.connections.size > 0 && !account.connections.has(connectionId))
      throw new LobbyError("account_in_use", `${account.name} est déjà connecté.`);
    this.releaseAccount({ connectionId });
    account.connections.add(connectionId);
    return { id: account.id, name: account.name };
  }

  releaseAccount({ connectionId }) {
    if (!connectionId) return;
    for (const account of this.#accounts.values())
      account.connections.delete(connectionId);
  }

  createLobby({ playerName, connectionId, identityToken, accountId, maxPlayers = 4 }) {
    const account = accountId ? this.#requireAccount(accountId) : null;
    const name = account?.name ?? validName(playerName);
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4) {
      throw new LobbyError(
        "invalid_capacity",
        "Une partie accepte de deux à quatre joueurs.",
      );
    }
    const code = this.#createCode();
    const lobby = {
      code,
      status: "waiting",
      maxPlayers,
      configuration: {
        positionMode: "simulation",
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
      this.#addPlayer(lobby, resumeSlot?.name ?? account?.name ?? validName(playerName), connectionId, {
        identityHash,
        accountId: account?.id ?? null,
        playerId: resumeSlot?.playerId,
        heroClassId: resumeSlot?.heroClassId,
      }).session,
    );
  }

  listManualSaves({ token }) {
    const { lobby, player } = this.#playerForToken(token);
    this.#requireWaitingLobby(lobby);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError("host_only", "Seul l’organisateur peut reprendre une partie.");
    return [...this.#manualSaves.values()]
      .filter((save) =>
        player.accountId
          ? save.ownerAccountId === player.accountId
          : save.ownerIdentityHash === player.identityHash,
      )
      .sort((first, second) => second.savedAt - first.savedAt)
      .map(manualSaveSummary);
  }

  loadManualSave({ token, saveId }) {
    const { lobby, player } = this.#playerForToken(token);
    this.#requireWaitingLobby(lobby);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError("host_only", "Seul l’organisateur peut reprendre une partie.");
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
      throw new LobbyError("resume_slot_not_found", "Votre héros est absent de cette sauvegarde.");
    const previousPlayerId = player.id;
    lobby.players.delete(previousPlayerId);
    player.id = hostSlot.playerId;
    player.name = hostSlot.name;
    player.heroClassId = hostSlot.heroClassId;
    player.ready = false;
    lobby.players.set(player.id, player);
    for (const session of this.#sessions.values()) {
      if (session.code === lobby.code && session.playerId === previousPlayerId)
        session.playerId = player.id;
    }
    lobby.hostPlayerId = player.id;
    lobby.maxPlayers = save.slots.length;
    lobby.configuration = structuredClone(save.launch.configuration);
    lobby.playArea = save.launch.playArea ? structuredClone(save.launch.playArea) : null;
    lobby.resume = {
      saveId: save.id,
      name: save.name,
      savedAt: save.savedAt,
      game: structuredClone(save.game),
      launch: structuredClone(save.launch),
      slots: structuredClone(save.slots),
    };
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
      throw new LobbyError("game_not_ready", "Aucune partie active à sauvegarder.");
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError("host_only", "Seul l’organisateur peut terminer la session.");
    if (!player.accountId && !player.identityHash)
      throw new LobbyError("identity_required", "Aucun compte joueur n’est associé à l’organisateur.");
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
    if (connectionId) player.connections.add(connectionId);
    return this.#result(lobby, { ...session, token, accountId: player.accountId });
  }

  setReady({ token, ready }) {
    const { lobby, player } = this.#playerForToken(token);
    if (lobby.status !== "waiting")
      throw new LobbyError("already_started", "Cette partie a déjà commencé.");
    if (ready && !player.heroClassId)
      throw new LobbyError(
        "hero_class_required",
        "Choisissez votre classe de héros avant d’être prêt.",
      );
    if (
      ready &&
      lobby.configuration.positionMode === "gps" &&
      !lobby.playArea
    )
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
    if (Object.hasOwn(configuration, "scenarioId"))
      next.scenarioId = validChoice(
        configuration.scenarioId,
        SCENARIO_IDS,
        "invalid_scenario",
        "Scénario inconnu.",
      );
    if (Object.hasOwn(configuration, "difficulty"))
      next.difficulty = validChoice(
        configuration.difficulty,
        DIFFICULTIES,
        "invalid_difficulty",
        "Difficulté inconnue.",
      );
    if (Object.hasOwn(configuration, "maxPlayers")) {
      const capacity = Number(configuration.maxPlayers);
      if (
        !Number.isInteger(capacity) ||
        capacity < 2 ||
        capacity > 4 ||
        capacity < lobby.players.size
      )
        throw new LobbyError(
          "invalid_capacity",
          "La capacité doit être comprise entre le nombre de joueurs présents et quatre.",
        );
      lobby.maxPlayers = capacity;
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
      const validated = new PlayArea({
        id: `lobby-area-${lobby.code}`,
        name: "Zone GPS multijoueur",
        polygon: playArea.polygon,
        excludedPolygons: playArea.excludedPolygons ?? [],
      });
      if (validated.getAreaSquareMeters() <= 0)
        throw new RangeError("La zone doit avoir une surface positive.");
      lobby.playArea = validated.toJSON();
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
      lobby.game.recordHeroTravel({
        heroId: authoritativeHero.id,
        position: { latitude, longitude },
        accuracy: accuracy ?? 0,
      });
      authoritativeHero.updatePosition({
        latitude,
        longitude,
        ...(accuracy === null ? {} : { accuracy }),
      });
      const bag = lobby.game.inventoryService.getHeroBagState(authoritativeHero);
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
      game = Game.fromJSON(snapshot, { now: this.now });
    } catch {
      throw new LobbyError(
        "invalid_game_snapshot",
        "La configuration initiale de la partie est invalide.",
      );
    }
    const expectedPlayers = new Set(lobby.players.keys());
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
    lobby.game = game;
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
    authorizeGameCommand(lobby.game, player.id, command, args);
    const operation = lobby.game[command];
    if (typeof operation !== "function")
      throw new LobbyError("command_forbidden", "Commande de jeu interdite.");
    let result;
    try {
      result = operation.apply(lobby.game, structuredClone(args));
    } catch (error) {
      throw new LobbyError(
        "command_rejected",
        error instanceof Error ? error.message : "Commande refusée.",
      );
    }
    lobby.gameRevision += 1;
    lobby.lastGameFingerprint = JSON.stringify(lobby.game.toJSON());
    this.#markChanged();
    return { result: serializableResult(result), game: this.gameSnapshot(lobby.code) };
  }

  executeBattleCommand({ token, battleId, command, args = [] }) {
    const { lobby, player } = this.#playerForToken(token);
    const battle = lobby.game?.battles.find((entry) => entry.id === battleId);
    if (!battle)
      throw new LobbyError("battle_not_found", "Le combat n’existe pas.");
    if (!Array.isArray(args))
      throw new LobbyError("command_forbidden", "Commande de combat interdite.");
    const team = battle.teams.find((entry) =>
      entry.heroes.some((hero) => hero.playerId === player.id),
    );
    if (!team)
      throw new LobbyError("command_forbidden", "Vous ne participez pas à ce combat.");
    let result;
    if (command === "assignUnit") {
      const unit = battle.getEntity(args[0]);
      const commander = battle.getEntity(args[1]);
      if (unit?.playerId !== player.id || commander?.playerId !== player.id)
        throw new LobbyError("command_forbidden", "Cette unité ne vous appartient pas.");
      result = battle.assignUnit(...structuredClone(args));
    } else if (command === "orderRetreat") {
      const candidate = team.units
        .filter(
          (unit) =>
            unit.state === "active" &&
            unit.lane === args[0] &&
            !unit.retreating,
        )
        .sort(
          (first, second) =>
            second.progress - first.progress || first.id.localeCompare(second.id),
        )[0];
      if (candidate?.playerId !== player.id)
        throw new LobbyError("command_forbidden", "Cette unité ne vous appartient pas.");
      result = battle.orderRetreat(team.id, args[0], team.heroes.find((hero) => hero.playerId === player.id)?.id);
    } else if (command === "activateSpecialPower") {
      const input = structuredClone(args[0] ?? {});
      if (battle.getEntity(input.userId)?.playerId !== player.id)
        throw new LobbyError("command_forbidden", "Ce combattant ne vous appartient pas.");
      input.teamId = team.id;
      result = battle.activateSpecialPower(input);
    } else {
      throw new LobbyError("command_forbidden", "Commande de combat interdite.");
    }
    lobby.gameRevision += 1;
    lobby.lastGameFingerprint = JSON.stringify(lobby.game.toJSON());
    this.#markChanged();
    return { result: serializableResult(result), game: this.gameSnapshot(lobby.code) };
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
      if (lobby.status !== "started" || !lobby.game || lobby.game.status !== "started") continue;
      const delta = Math.max(0, Math.min(2_000, now - lobby.lastGameTickAt));
      lobby.lastGameTickAt = now;
      for (const battle of lobby.game.battles) {
        if (["countdown", "active"].includes(battle.status)) {
          battle.tick(delta);
        }
        if (
          battle.status === "finished" &&
          !lobby.resolvedBattleIds.has(battle.id)
        ) {
          lobby.game.resolveBattle(battle.id);
          lobby.resolvedBattleIds.add(battle.id);
        }
      }
      lobby.game.update();
      if (now - lobby.lastWorldCycleAt >= 10_000) {
        lobby.game.advanceCycle(1);
        lobby.lastWorldCycleAt = now;
      }
      const fingerprint = JSON.stringify(lobby.game.toJSON());
      if (fingerprint === lobby.lastGameFingerprint) continue;
      lobby.lastGameFingerprint = fingerprint;
      lobby.gameRevision += 1;
      updates.push(this.gameSnapshot(lobby.code));
    }
    if (updates.length > 0) this.#markChanged();
    return updates;
  }

  selectHeroClass({ token, heroClassId }) {
    const { lobby, player } = this.#playerForToken(token);
    this.#requireWaitingLobby(lobby);
    player.heroClassId = validChoice(
      heroClassId,
      HERO_CLASS_IDS,
      "invalid_hero_class",
      "Classe de héros inconnue.",
    );
    player.ready = false;
    this.#markChanged();
    return this.snapshot(lobby.code);
  }

  startLobby({ token }) {
    const { lobby, player } = this.#playerForToken(token);
    if (player.id !== lobby.hostPlayerId)
      throw new LobbyError("host_only", "Seul l’organisateur peut démarrer.");
    if (lobby.players.size < 2)
      throw new LobbyError(
        "not_enough_players",
        "Il faut au moins deux joueurs.",
      );
    if (
      lobby.configuration.positionMode === "gps" &&
      !lobby.playArea
    )
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
    if ([...lobby.players.values()].some((entry) => !entry.heroClassId))
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
      lobby.game = Game.fromJSON(lobby.resume.game, { now: this.now });
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
      configuration: { ...lobby.configuration },
      playArea: lobby.playArea ? structuredClone(lobby.playArea) : null,
      players: [...lobby.players.values()].map((entry) => ({
        id: entry.id,
        name: entry.name,
        heroClassId: entry.heroClassId,
      })),
    };
    lobby.status = "started";
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
        players: [...lobby.players.values()].map((player) => ({
          id: player.id,
          name: player.name,
          ready: player.ready,
          heroClassId: player.heroClassId,
          position: player.position ? structuredClone(player.position) : null,
          positionReceivedAt: player.positionReceivedAt,
          heroState: player.heroState ? structuredClone(player.heroState) : null,
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
      manualSaves: [...this.#manualSaves.values()].map((save) =>
        structuredClone(save),
      ),
      accounts: [...this.#accounts.values()].map(({ id, name }) => ({ id, name })),
    };
  }

  snapshot(code) {
    const lobby = this.#requireLobby(code);
    return {
      code: lobby.code,
      status: lobby.status,
      maxPlayers: lobby.maxPlayers,
      configuration: { ...lobby.configuration },
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
        connected: player.connections.size > 0,
        isHost: player.id === lobby.hostPlayerId,
      })),
    };
  }

  #addPlayer(lobby, name, connectionId, {
    identityHash = null,
    accountId = null,
    playerId = this.idFactory(),
    heroClassId = null,
  } = {}) {
    const token = this.randomBytes(32).toString("base64url");
    const player = {
      id: playerId,
      name,
      ready: false,
      heroClassId,
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
      if (!source || typeof source.code !== "string" || !Array.isArray(source.players)) {
        throw new TypeError("Lobby sauvegardé invalide.");
      }
      const game = source.game ? Game.fromJSON(source.game, { now: this.now }) : null;
      const lobby = {
        code: source.code,
        status: source.status,
        maxPlayers: source.maxPlayers,
        configuration: structuredClone(source.configuration),
        playArea: source.playArea ? structuredClone(source.playArea) : null,
        launch: source.launch ? structuredClone(source.launch) : null,
        resume: source.resume ? structuredClone(source.resume) : null,
        worldState: source.worldState ? structuredClone(source.worldState) : null,
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
        players: new Map(
          source.players.map((player) => [
            player.id,
            {
              id: player.id,
              name: player.name,
              ready: Boolean(player.ready),
              heroClassId: player.heroClassId ?? null,
              position: player.position ? structuredClone(player.position) : null,
              positionReceivedAt: player.positionReceivedAt ?? null,
              heroState: player.heroState ? structuredClone(player.heroState) : null,
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
      throw new LobbyError("account_required", "Choisissez d’abord votre compte joueur.");
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
    throw new LobbyError("invalid_world_state", "État du monde trop volumineux.");
  const ids = new Set();
  const locations = value.locations.map((location) => {
    const id = validIdentifier(location?.id);
    if (ids.has(id))
      throw new LobbyError("invalid_world_state", "Lieu dupliqué dans le monde.");
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
    const watchBeacons = validObjectList(
      value.watchBeacons,
      100,
      (entry) => new ScoutWatchBeacon(entry).toJSON(),
    );
    const worldState = new WorldState(value.worldState ?? {}).toJSON();
    const battles = validObjectList(
      value.battles,
      50,
      (entry) => new BattleEngine(entry).toJSON(),
    );
    const battleLoot = validObjectList(
      value.battleLoot,
      100,
      (entry) => new BattleLoot(entry).toJSON(),
    );
    const battleSites = validObjectList(
      value.battleSites,
      100,
      (entry) => new BattleSite(entry).toJSON(),
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
      throw new LobbyError("command_forbidden", "Ce héros ne vous appartient pas.");
  });
  if (command === "createBattle") {
    const heroIds = (args[0]?.teamParticipants ?? []).flatMap(
      (team) => team.heroIds ?? [],
    );
    if (!heroIds.some(ownsHero))
      throw new LobbyError("command_forbidden", "Vous devez participer au combat.");
  }
  if (command === "surrenderBattle") {
    const battle = game.battles.find((entry) => entry.id === args[0]?.battleId);
    const team = battle?.teams.find((entry) => entry.id === args[0]?.teamId);
    if (!team?.heroes.some((hero) => hero.playerId === playerId))
      throw new LobbyError("command_forbidden", "Vous ne pouvez pas rendre cette équipe.");
  }
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
