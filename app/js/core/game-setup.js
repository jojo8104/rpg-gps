import { PlayArea } from "./play-area.js";

const MODES = {
  quick: { minPlayers: 1, maxPlayers: 4, joinPolicy: "open", locationGenerationMode: "scenario" },
  custom: { minPlayers: 1, maxPlayers: 4, joinPolicy: "invite", locationGenerationMode: "mixed" },
  organizer: { minPlayers: 1, maxPlayers: 20, joinPolicy: "invite", locationGenerationMode: "manual" },
};

const JOIN_POLICIES = new Set(["closed", "invite", "open"]);
const STATUSES = new Set(["draft", "ready", "started", "closed"]);
const LOCATION_DENSITIES = { low: 5, balanced: 10, high: 16 };

/** Configuration validée d'une partie, avant l'instanciation de Game. */
export class GameSetup {
  constructor({
    id,
    name,
    mode,
    scenarioId,
    playArea,
    playerCount,
    participants = [],
    teams = [],
    locationSetup = {},
    qrSetup = {},
    rules = {},
    join = {},
    status = "draft",
  }) {
    this.id = GameSetup.#requireText(id, "L'identifiant de la partie");
    this.name = GameSetup.#requireText(name, "Le nom de la partie");
    this.mode = GameSetup.#requireMode(mode);
    this.scenarioId = GameSetup.#requireText(scenarioId, "L'identifiant du scénario");
    this.playArea = playArea instanceof PlayArea ? playArea : new PlayArea(playArea);
    this.teams = GameSetup.#createTeams(teams);
    this.rules = GameSetup.#createRules(rules, this.mode);
    this.playerCount = GameSetup.#createPlayerCount(playerCount, this.rules);
    this.join = GameSetup.#createJoin(join, this.mode);
    this.locationSetup = GameSetup.#createLocationSetup(locationSetup, this.mode);
    this.qrSetup = GameSetup.#createQrSetup(qrSetup);
    this.status = GameSetup.#requireStatus(status);
    this.participants = [];
    participants.forEach((participant) => this.registerPlayer(participant));
  }

  get canStart() {
    return this.participants.length === this.playerCount && this.status === "ready";
  }

  getGeneratedLocationCount() {
    const { density, minLocations, maxLocations } = this.locationSetup;
    const target = Math.round(this.playArea.getAreaSquareKilometers() * LOCATION_DENSITIES[density]);
    return Math.max(minLocations, Math.min(maxLocations, target));
  }

  registerPlayer({ playerId, name = playerId, teamId = null }) {
    if (!this.#canAcceptPlayers()) return false;
    const validPlayerId = GameSetup.#requireText(playerId, "L'identifiant du joueur");
    const validTeamId = GameSetup.#createTeamId(teamId, this.teams);

    if (this.participants.some((participant) => participant.playerId === validPlayerId)) return false;
    if (this.participants.length >= this.playerCount) return false;

    this.participants.push({ playerId: validPlayerId, name: GameSetup.#requireText(name, "Le nom du joueur"), teamId: validTeamId });
    return true;
  }

  unregisterPlayer(playerId) {
    if (!this.#canAcceptPlayers()) return false;
    const index = this.participants.findIndex((participant) => participant.playerId === playerId);
    if (index === -1) return false;
    this.participants.splice(index, 1);
    return true;
  }

  setStatus(status) {
    const nextStatus = GameSetup.#requireStatus(status);
    if (nextStatus === "started" && !this.canStart) {
      throw new Error("La partie doit être prête et avoir assez de joueurs pour démarrer.");
    }
    this.status = nextStatus;
  }

  toJSON() {
    return {
      id: this.id, name: this.name, mode: this.mode, scenarioId: this.scenarioId, playerCount: this.playerCount,
      playArea: this.playArea.toJSON(), participants: this.participants.map((participant) => ({ ...participant })),
      teams: this.teams.map((team) => ({ ...team })), locationSetup: { ...this.locationSetup },
      qrSetup: { ...this.qrSetup }, rules: { ...this.rules }, join: { ...this.join }, status: this.status,
    };
  }

  #canAcceptPlayers() {
    return this.status === "draft" || this.status === "ready";
  }

  static #createRules(rules, mode) {
    GameSetup.#requireObject(rules, "Les règles");
    const defaults = MODES[mode];
    const minPlayers = rules.minPlayers ?? defaults.minPlayers;
    const maxPlayers = rules.maxPlayers ?? defaults.maxPlayers;
    if (!Number.isInteger(minPlayers) || minPlayers < 1) throw new RangeError("Le minimum de joueurs doit être un entier positif.");
    if (!Number.isInteger(maxPlayers) || maxPlayers < minPlayers) throw new RangeError("Le maximum de joueurs doit être supérieur ou égal au minimum.");
    return {
      minPlayers, maxPlayers,
      maxHeroesPerPlayer: GameSetup.#positiveIntegerOrDefault(rules.maxHeroesPerPlayer, 1, "Le maximum de héros"),
      maxUnitsPerHero: GameSetup.#positiveIntegerOrDefault(rules.maxUnitsPerHero, 4, "Le maximum d'unités"),
      timeLimitMinutes: GameSetup.#optionalPositiveInteger(rules.timeLimitMinutes, "La limite de temps"),
      allowPvP: rules.allowPvP ?? false, allowCapture: rules.allowCapture ?? true,
      engagementRadiusMeters: GameSetup.#positiveIntegerOrDefault(rules.engagementRadiusMeters, 75, "Le rayon d'engagement"),
      fleeConfirmations: GameSetup.#positiveIntegerOrDefault(rules.fleeConfirmations, 2, "Les confirmations de fuite"),
      pursuitCooldownMinutes: GameSetup.#positiveIntegerOrDefault(rules.pursuitCooldownMinutes, 10, "Le cooldown de poursuite"),
    };
  }

  static #createPlayerCount(playerCount, rules) {
    const count = playerCount ?? rules.minPlayers;
    if (!Number.isInteger(count) || count < rules.minPlayers || count > rules.maxPlayers) {
      throw new RangeError("Le nombre de joueurs doit respecter les limites de la partie.");
    }
    return count;
  }

  static #createJoin(join, mode) {
    GameSetup.#requireObject(join, "La configuration de participation");
    const policy = join.policy ?? MODES[mode].joinPolicy;
    if (!JOIN_POLICIES.has(policy)) throw new RangeError("La politique de participation est invalide.");
    return { policy };
  }

  static #createLocationSetup(locationSetup, mode) {
    GameSetup.#requireObject(locationSetup, "La configuration des lieux");
    const generationMode = locationSetup.generationMode ?? MODES[mode].locationGenerationMode;
    if (!["scenario", "generated", "mixed", "manual"].includes(generationMode)) throw new RangeError("Le mode de génération des lieux est invalide.");
    const allowedSources = locationSetup.allowedSources ?? ["scenario", "generated", "quest", "qr", "organizer"];
    if (!Array.isArray(allowedSources)) throw new TypeError("Les sources de lieux doivent être une liste.");
    const density = locationSetup.density ?? "balanced";
    if (!(density in LOCATION_DENSITIES)) throw new RangeError("La densité de lieux est invalide.");
    const minLocations = locationSetup.minLocations ?? 3;
    const maxLocations = locationSetup.maxLocations ?? 30;
    if (!Number.isInteger(minLocations) || minLocations < 0) throw new RangeError("Le minimum de lieux doit être un entier positif ou nul.");
    if (!Number.isInteger(maxLocations) || maxLocations < minLocations) throw new RangeError("Le maximum de lieux doit être supérieur ou égal au minimum.");
    return {
      generationMode, density, minLocations, maxLocations,
      allowedSources: [...new Set(allowedSources.map((source) => GameSetup.#requireText(source, "Une source de lieu")))],
    };
  }

  static #createQrSetup(qrSetup) {
    GameSetup.#requireObject(qrSetup, "La configuration QR");
    const { enabled = false, allowed = true } = qrSetup;
    if (typeof enabled !== "boolean" || typeof allowed !== "boolean") throw new TypeError("La configuration QR doit contenir des booléens.");
    return { enabled, allowed };
  }

  static #createTeams(teams) {
    if (!Array.isArray(teams)) throw new TypeError("Les équipes doivent être une liste.");
    const ids = new Set();
    return teams.map((team) => {
      GameSetup.#requireObject(team, "Une équipe");
      const id = GameSetup.#requireText(team.id, "L'identifiant de l'équipe");
      if (ids.has(id)) throw new RangeError("Les identifiants d'équipe doivent être uniques.");
      ids.add(id);
      return { id, name: GameSetup.#requireText(team.name, "Le nom de l'équipe"), factionId: GameSetup.#requireText(team.factionId, "L'identifiant de faction") };
    });
  }

  static #createTeamId(teamId, teams) {
    if (teamId === null) return null;
    const validTeamId = GameSetup.#requireText(teamId, "L'identifiant de l'équipe");
    if (!teams.some((team) => team.id === validTeamId)) throw new RangeError("L'équipe du participant n'existe pas.");
    return validTeamId;
  }

  static #requireMode(mode) { if (!(mode in MODES)) throw new RangeError("Le mode de partie est invalide."); return mode; }
  static #requireStatus(status) { if (!STATUSES.has(status)) throw new RangeError("Le statut de la partie est invalide."); return status; }
  static #requireObject(value, label) { if (value === null || Array.isArray(value) || typeof value !== "object") throw new TypeError(`${label} doivent être un objet.`); }
  static #requireText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
  static #positiveIntegerOrDefault(value, fallback, label) { const result = value ?? fallback; if (!Number.isInteger(result) || result <= 0) throw new RangeError(`${label} doit être un entier positif.`); return result; }
  static #optionalPositiveInteger(value, label) { if (value === undefined || value === null) return null; return GameSetup.#positiveIntegerOrDefault(value, 1, label); }
}
