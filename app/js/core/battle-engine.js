import { BattleState } from "./battle-state.js";

/** Simulation temps réel indépendante de l'interface. */
export class BattleEngine {
  constructor(options) { this.state = options instanceof BattleState ? options : new BattleState(options); }
  get id() { return this.state.id; } get teams() { return this.state.teams; } get config() { return this.state.config; }
  get status() { return this.state.status; } set status(value) { this.state.status = value; }
  get winnerTeamId() { return this.state.winnerTeamId; } set winnerTeamId(value) { this.state.winnerTeamId = value; }
  get startedAt() { return this.state.startedAt; } get finishedAt() { return this.state.finishedAt; } set finishedAt(value) { this.state.finishedAt = value; }
  get eventLog() { return this.state.eventLog; }
  getEntity(id) { return this.state.getEntity(id); }
  getTeamForEntity(id) { return this.state.getTeamForEntity(id); }
  toJSON() { return this.state.toJSON(); }

  start() {
    if (this.status !== "ready") return false;
    this.state.status = "active"; this.state.startedAt = this.state.now(); this.#log("battle_started"); return true;
  }

  assignUnit(unitId, heroId, lane = null) {
    const unit = this.getEntity(unitId); const hero = this.getEntity(heroId);
    if (unit?.kind !== "unit" || hero?.kind !== "hero" || hero.state !== "active" || this.getTeamForEntity(unitId)?.id !== this.getTeamForEntity(heroId)?.id) return { success: false, reason: "invalid_assignment" };
    if (unit.lane !== null) return { success: false, reason: "unit_already_deployed" };
    const assignedLane = lane ?? hero.lane;
    if (!Number.isInteger(assignedLane) || assignedLane < 0 || assignedLane > 2) return { success: false, reason: "invalid_line" };
    unit.lane = assignedLane; unit.targetId = null; unit.progress = 0; this.#log("unit_assigned", { unitId, heroId, lane: assignedLane }); return { success: true, lane: assignedLane };
  }

  addReinforcement({ teamId, heroes = [], units = [] }) {
    if (this.status === "finished") return { success: false, reason: "battle_finished" };
    const team = this.teams.find((item) => item.id === teamId); const free = team?.lines.find((line) => line.heroId === null);
    if (!team || heroes.length !== 1 || !free) return { success: false, reason: free ? "invalid_reinforcement" : "no_free_line" };
    const arrivalAtMs = this.state.elapsedMs + this.config.reinforcementDelayMs;
    team.reinforcements.push({ arrivalAtMs, hero: { ...heroes[0] }, units: units.map((unit) => ({ ...unit })) });
    this.#log("reinforcement_scheduled", { teamId, heroId: heroes[0].id, lane: free.index, arrivalAtMs });
    return { success: true, lane: free.index, arrivalAtMs };
  }

  surrender(teamId) {
    if (this.status !== "active") return { success: false, reason: "battle_not_active" };
    const team = this.teams.find((item) => item.id === teamId);
    if (!team) return { success: false, reason: "unknown_team" };
    team.heroes.filter((hero) => hero.state === "active").forEach((hero) => { hero.state = "surrendered"; });
    team.units.filter((unit) => unit.state === "active").forEach((unit) => { unit.state = "captured"; });
    this.#log("team_surrendered", { teamId });
    this.#finish(this.teams.find((item) => item.id !== teamId && item.heroes.some((hero) => hero.state === "active"))?.id ?? null);
    return { success: true, winnerTeamId: this.winnerTeamId };
  }

  tick(deltaMs = this.config.tickMs) {
    if (this.status === "ready") this.start();
    if (this.status !== "active") return [];
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) throw new RangeError("Le delta du tick doit être positif.");
    const before = this.eventLog.length; this.state.elapsedMs += deltaMs; this.#arriveReinforcements();
    for (const team of this.teams) for (const unit of team.units.filter((item) => item.state === "active" && item.lane !== null)) this.#act(unit, team, deltaMs);
    this.#checkEnd(); return this.eventLog.slice(before);
  }

  attack(attackerId, targetId) { const attacker = this.getEntity(attackerId); const target = this.getEntity(targetId); if (!attacker || !target || this.getTeamForEntity(attackerId)?.id === this.getTeamForEntity(targetId)?.id) return { success: false, reason: "invalid_target" }; const result = this.#damage(attacker, target, 1); this.#checkEnd(); return result; }
  markUnitFled(id) { const unit = this.getEntity(id); if (unit?.kind !== "unit" || unit.state !== "active") return false; unit.state = "fled"; this.#log("unit_fled", { unitId: id }); return true; }
  markUnitCaptured(id) { return this.#mark(id, "captured"); } markUnitDeserted(id) { return this.#mark(id, "deserted"); }

  #act(unit, team, deltaMs) {
    if (unit.behavior === "retreat") { unit.progress = Math.max(0, unit.progress - 1.4 * unit.speed * deltaMs / 10_000); if (unit.progress === 0) this.markUnitFled(unit.id); return; }
    const enemy = this.teams.find((item) => item.id !== team.id); let target = this.getEntity(unit.targetId);
    if (!target || target.state !== "active" || target.lane !== unit.lane) { target = this.#targetFor(unit, enemy); unit.targetId = target?.id ?? null; if (target) this.#log("target_acquired", { unitId: unit.id, targetId: target.id }); }
    const rangeThreshold = unit.range > 1 ? 0.35 : 0.8;
    if (target && unit.progress >= rangeThreshold) { unit.attackCooldownMs -= deltaMs; if (unit.attackCooldownMs <= 0) { this.#damage(unit, target); unit.attackCooldownMs = Math.max(350, 1_500 - unit.speed * 100); } return; }
    unit.progress = Math.min(1, unit.progress + unit.speed * deltaMs / 10_000);
    if (!target && unit.progress >= 1) {
      const hero = this.#breakthroughHero(unit, enemy);
      if (hero) {
        unit.attackCooldownMs -= deltaMs;
        if (unit.attackCooldownMs <= 0) {
          this.#damage(unit, hero, this.config.breakthroughHeroDamageMultiplier, "breakthrough_attack");
          unit.attackCooldownMs = Math.max(350, 1_500 - unit.speed * 100);
        }
        return;
      }
      return;
    }
  }

  #targetFor(unit, enemy) { return enemy.units.find((item) => item.state === "active" && item.lane === unit.lane) ?? enemy.heroes.find((item) => item.state === "active" && item.lane === unit.lane) ?? null; }
  #breakthroughHero(unit, enemy) {
    return enemy.heroes
      .filter((hero) => hero.state === "active")
      .sort((first, second) => Math.abs(first.lane - unit.lane) - Math.abs(second.lane - unit.lane) || first.lane - second.lane)[0] ?? null;
  }
  #damage(attacker, target, multiplier = 1, eventType = "attack") {
    const strength = attacker.kind === "unit" ? attacker.quantity / attacker.maxQuantity : 1;
    const damage = Math.max(1, Math.round(attacker.attack * strength * multiplier * 10 / (target.defense + this.config.defenseBase)));
    const effectiveDamage = target.kind === "hero" ? Math.min(target.health, damage) : Math.min(target.quantity * this.config.unitHealthPerSurvivor, damage);
    this.#recordContribution(attacker.playerId, "damageDealt", effectiveDamage);
    this.#recordContribution(target.playerId, "damageTaken", effectiveDamage);
    if (target.kind === "hero") { target.health = Math.max(0, target.health - damage); if (target.health === 0) target.state = "ghost"; }
    else { const losses = Math.min(target.quantity, Math.max(1, Math.floor(damage / this.config.unitHealthPerSurvivor))); target.quantity -= losses; target.morale = Math.max(0, target.morale - losses / Math.max(1, target.maxQuantity) * 5); if (target.quantity === 0) target.state = "defeated"; else if (target.morale === 0) target.behavior = "retreat"; }
    this.#log(eventType, { attackerId: attacker.id, targetId: target.id, damage, multiplier, targetState: target.state }); return { success: true, damage, multiplier, targetState: target.state };
  }
  #arriveReinforcements() { for (const team of this.teams) { const due = team.reinforcements.filter((item) => item.arrivalAtMs <= this.state.elapsedMs); team.reinforcements = team.reinforcements.filter((item) => item.arrivalAtMs > this.state.elapsedMs); for (const item of due) { const lane = team.lines.find((line) => line.heroId === null); if (!lane) continue; const hero = { ...item.hero, kind: "hero", lane: lane.index, state: "active", targetId: null, progress: 0, attackCooldownMs: 0 }; lane.heroId = hero.id; team.heroes.push(hero); team.units.push(...item.units.map((unit) => ({ ...unit, kind: "unit", lane: lane.index, behavior: unit.behavior ?? "advance", symbol: unit.symbol ?? "U", state: "active", targetId: null, progress: 0, attackCooldownMs: 0 }))); this.#log("reinforcement_joined", { teamId: team.id, heroId: hero.id, lane: lane.index }); } } }
  #checkEnd() { const alive = this.teams.filter((team) => team.heroes.some((hero) => hero.state === "active")); if (alive.length > 1) return; this.#finish(alive[0]?.id ?? null); }
  #finish(winnerTeamId) { this.state.status = "finished"; this.state.finishedAt = this.state.now(); this.state.winnerTeamId = winnerTeamId; this.#log("battle_finished", { winnerTeamId }); }
  #mark(id, state) { const unit = this.getEntity(id); if (unit?.kind !== "unit" || unit.state !== "active") return false; unit.state = state; this.#log(`unit_${state}`, { unitId: id }); return true; }
  #recordContribution(playerId, field, amount) { const entry = this.state.contributions[playerId] ??= { damageDealt: 0, damageTaken: 0, support: 0, total: 0 }; entry[field] += amount; entry.total = entry.damageDealt + entry.damageTaken * 0.25 + entry.support; }
  #log(type, details = {}) { this.eventLog.push({ type, ...details, at: this.state.now(), elapsedMs: this.state.elapsedMs }); }
}
