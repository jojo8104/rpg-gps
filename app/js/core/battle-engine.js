import {
  initializeTactics,
  submitTacticalChoice,
  lockTacticalChoice,
  aiTacticalChoice,
  refreshTacticalOptions,
} from "./battle-tactics.js";
import { BattleState } from "./battle-state.js";
import { createBattleDuelForGame } from "./battle-duel/state.js";
import { applyDuelOutcome } from "./battle-duel/outcome.js";
import {
  submitDuelChoice,
  lockDuelChoice,
  aiDuelChoice,
} from "./battle-duel/commands.js";

/** Combat par cartes : choix simultanés, échéances et état persistant. */
export class BattleEngine {
  static canRestoreSnapshot(snapshot) {
    return snapshot?.duel?.mode === "DUEL" && snapshot.duel.version === 5;
  }

  constructor(options) {
    this.state =
      options instanceof BattleState ? options : new BattleState(options);
    this.lootPosition = options.lootPosition
      ? { ...options.lootPosition }
      : null;
    this.sourceLocationId = options.sourceLocationId ?? null;
    this.sourceEnemyTeamId = options.sourceEnemyTeamId ?? null;
    this.engagementContext = options.engagementContext
      ? structuredClone(options.engagementContext)
      : null;
    if (
      options.duel &&
      (options.duel.mode !== "DUEL" || options.duel.version !== 5)
    )
      throw new Error(
        "Format de bataille incompatible : une nouvelle partie est nécessaire.",
      );
    if (!options.duel && ["active", "finished"].includes(options.status))
      throw new Error("L’état de duel est requis pour restaurer une bataille.");
    this.duel = options.duel
      ? structuredClone(options.duel)
      : createBattleDuelForGame(this);
    if (!options.duel && this.config.tactical)
      initializeTactics(this.duel, this);
    this.decisionDeadlineAt = options.decisionDeadlineAt ?? null;
  }
  get id() {
    return this.state.id;
  }
  get teams() {
    return this.state.teams;
  }
  get config() {
    return this.state.config;
  }
  get status() {
    return this.state.status;
  }
  set status(value) {
    this.state.status = value;
  }
  get winnerTeamId() {
    return this.state.winnerTeamId;
  }
  set winnerTeamId(value) {
    this.state.winnerTeamId = value;
  }
  get startedAt() {
    return this.state.startedAt;
  }
  get finishedAt() {
    return this.state.finishedAt;
  }
  set finishedAt(value) {
    this.state.finishedAt = value;
  }
  get eventLog() {
    return this.state.eventLog;
  }
  getEntity(id) {
    return this.state.getEntity(id);
  }
  getTeamForEntity(id) {
    return this.state.getTeamForEntity(id);
  }
  toJSON() {
    return {
      ...this.state.toJSON(),
      lootPosition: this.lootPosition,
      sourceLocationId: this.sourceLocationId,
      sourceEnemyTeamId: this.sourceEnemyTeamId,
      engagementContext: this.engagementContext
        ? structuredClone(this.engagementContext)
        : null,
      duel: structuredClone(this.duel),
      decisionDeadlineAt: this.decisionDeadlineAt,
    };
  }
  start(now = this.state.now()) {
    if (this.status !== "ready") return false;
    this.status = "active";
    this.state.startedAt = now;
    this.decisionDeadlineAt = now + (this.duel.tactics ? 30_000 : 15_000);
    return true;
  }
  submitDuelChoice(teamId, choice) {
    if (this.status !== "active")
      throw new Error("La bataille n’est pas active.");
    this.duel = this.duel.tactics
      ? submitTacticalChoice(this.duel, teamId, choice)
      : submitDuelChoice(this.duel, teamId, choice);
    return this.duel;
  }
  lockDuelChoice(teamId, now = this.state.now()) {
    if (this.status !== "active")
      throw new Error("La bataille n’est pas active.");
    this.duel = this.duel.tactics
      ? lockTacticalChoice(this.duel, teamId)
      : lockDuelChoice(this.duel, teamId);
    if (this.duel.phase === "FINISHED")
      applyDuelOutcome({ battle: this, state: this.duel });
    else if (
      this.duel.phase === "CHOICE" &&
      this.duel.players.every((player) => !player.locked)
    ) {
      // Four seconds of reading plus the decision window of the combat mode.
      this.decisionDeadlineAt = now + (this.duel.tactics ? 34_000 : 19_000);
    }
    return this.duel;
  }
  advanceDuel({ now = this.state.now(), humanTeamIds = [] } = {}) {
    if (this.status !== "active") return;
    const human = new Set(humanTeamIds);
    for (const player of this.duel.players) {
      if (
        player.locked ||
        (human.has(player.id) && now < this.decisionDeadlineAt)
      )
        continue;
      if (!this.duel.pendingChoices[player.id])
        this.submitDuelChoice(
          player.id,
          human.has(player.id)
            ? this.duel.tactics
              ? { orders: [] }
              : { cards: [], order: "ATTACK" }
            : this.duel.tactics
              ? aiTacticalChoice(this.duel, player.id)
              : aiDuelChoice(this.duel, player.id),
        );
      this.lockDuelChoice(player.id, now);
    }
  }
  addReinforcement({ teamId, heroes = [], units = [] }) {
    const team = this.teams.find((entry) => entry.id === teamId);
    if (
      this.status !== "active" ||
      this.duel.phase !== "CHOICE" ||
      !team ||
      heroes.length !== 1 ||
      this.duel.players.some((player) => player.locked) ||
      Object.keys(this.duel.pendingChoices).length
    )
      return { success: false, reason: "reinforcement_unavailable" };
    try {
      const nextState = new BattleState({
        ...this.state.toJSON(),
        teams: this.teams.map((entry) =>
          entry.id === teamId
            ? {
                ...entry,
                heroes: [...entry.heroes, ...heroes],
                units: [...entry.units, ...units],
              }
            : entry,
        ),
        now: this.state.now,
      });
      const cards = createBattleDuelForGame({
        id: this.id,
        teams: nextState.teams,
      }).troops.filter((card) => units.some((unit) => unit.id === card.id));
      this.state = nextState;
      this.duel.troops.push(...cards);
      return { success: true };
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }
}
