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
    this.state.startedAt = this.state.now();
    if (this.config.ambushTeamId === null && this.config.countdownMs > 0) {
      this.state.status = "countdown"; this.state.countdownRemainingMs = this.config.countdownMs; this.#log("battle_countdown_started", { durationMs: this.config.countdownMs }); return true;
    }
    this.state.status = "active"; this.#log("battle_started", { ambushTeamId: this.config.ambushTeamId }); return true;
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

  orderRetreat(teamId, lane, heroId = null) {
    if (this.status !== "active") return { success: false, reason: "battle_not_active" };
    const team = this.teams.find((item) => item.id === teamId);
    if (!team || !Number.isInteger(lane) || lane < 0 || lane > 2) return { success: false, reason: "invalid_line" };
    const unit = team.units
      .filter((item) => item.state === "active" && item.lane === lane && !item.retreating)
      .sort((first, second) => second.progress - first.progress || first.id.localeCompare(second.id))[0];
    if (!unit) return { success: false, reason: "no_retreat_candidate" };
    const commander = this.#commanderFor(team, unit.playerId, heroId);
    if (!commander) return { success: false, reason: "no_commander" };
    if (!this.#spendCommand(commander, this.config.retreatCommandCost, "retreat", { unitId: unit.id })) return { success: false, reason: "insufficient_command_points" };
    unit.retreating = true;
    unit.retreatReason = "ordered";
    unit.targetId = null;
    this.#log("retreat_ordered", { teamId, lane, unitId: unit.id });
    return { success: true, unitId: unit.id, lane };
  }

  activateSpecialPower({ teamId, userId, powerId, cost = 1, targetId = null }) {
    if (this.status !== "active") return { success: false, reason: "battle_not_active" };
    const team = this.teams.find((item) => item.id === teamId); const user = this.getEntity(userId);
    if (!team || !user || this.getTeamForEntity(userId)?.id !== teamId) return { success: false, reason: "invalid_user" };
    if (!user.specialPowerIds?.includes(powerId)) return { success: false, reason: "unknown_power" };
    const commander = user.kind === "hero" ? user : this.#commanderFor(team, user.playerId);
    if (!commander) return { success: false, reason: "no_commander" };
    if (!this.#spendCommand(commander, cost, "special_power", { userId, powerId, targetId })) return { success: false, reason: "insufficient_command_points" };
    this.#log("special_power_activated", { teamId, commanderId: commander.id, userId, powerId, targetId, cost });
    return { success: true, commanderId: commander.id, remainingCommandPoints: commander.commandPoints };
  }

  tick(deltaMs = this.config.tickMs) {
    if (this.status === "ready") this.start();
    if (this.status === "countdown") {
      this.state.countdownRemainingMs = Math.max(0, this.state.countdownRemainingMs - deltaMs);
      if (this.state.countdownRemainingMs > 0) return [];
      this.state.status = "active"; this.#log("battle_started", { ambushTeamId: null }); return [];
    }
    if (this.status !== "active") return [];
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) throw new RangeError("Le delta du tick doit être positif.");
    const before = this.eventLog.length; this.state.elapsedMs += deltaMs; this.#arriveReinforcements();
    const intents = [];
    const progressAtTickStart = new Map(this.teams.flatMap((team) => team.units.map((unit) => [unit.id, unit.progress])));
    for (const team of this.teams) {
      const activeUnits = team.units.filter((item) => item.state === "active" && item.lane !== null);
      for (const unit of activeUnits) {
        const intent = this.#planAction(unit, team, deltaMs, progressAtTickStart);
        if (intent) intents.push(intent);
      }
    }
    for (const intent of intents) this.#applyDamage(intent);
    this.#checkEnd(); return this.eventLog.slice(before);
  }

  attack(attackerId, targetId) { const attacker = this.getEntity(attackerId); const target = this.getEntity(targetId); if (!attacker || !target || this.getTeamForEntity(attackerId)?.id === this.getTeamForEntity(targetId)?.id) return { success: false, reason: "invalid_target" }; const result = this.#applyDamage(this.#createDamageIntent(attacker, target)); this.#checkEnd(); return result; }
  markUnitFled(id) { const unit = this.getEntity(id); if (unit?.kind !== "unit" || unit.state !== "active") return false; unit.state = "fled"; this.#log("unit_fled", { unitId: id }); return true; }
  markUnitCaptured(id) { return this.#mark(id, "captured"); } markUnitDeserted(id) { return this.#mark(id, "deserted"); }

  #planAction(unit, team, deltaMs, progressAtTickStart) {
    const enemy = this.teams.find((item) => item.id !== team.id); let target = this.getEntity(unit.targetId);
    if (!target || target.state !== "active" || target.lane !== unit.lane) { target = this.#targetFor(unit, enemy); unit.targetId = target?.id ?? null; if (target) this.#log("target_acquired", { unitId: unit.id, targetId: target.id }); }
    const combatRange = unit.retreating ? unit.retreat.range : unit.range;
    const closingProgress = (progressAtTickStart.get(unit.id) ?? unit.progress) + (target?.kind === "unit" ? (progressAtTickStart.get(target.id) ?? target.progress) : 0);
    const rangeThreshold = combatRange > 1 ? 0.45 : 1;
    let intent = null;
    if (target && closingProgress >= rangeThreshold) {
      unit.attackCooldownMs -= deltaMs;
      if (unit.attackCooldownMs <= 0) {
        intent = this.#createDamageIntent(unit, target, 1, unit.retreating ? "retreat_attack" : "attack");
        unit.attackCooldownMs = unit.attackIntervalMs;
      }
      if (!unit.retreating) return intent;
    }
    if (unit.retreating) {
      unit.progress = Math.max(0, unit.progress - unit.retreat.speed * deltaMs / 10_000);
      if (unit.progress === 0) {
        const routed = unit.retreatReason === "rout";
        unit.lane = null; unit.retreating = false; unit.targetId = null; unit.attackCooldownMs = 0; unit.retreatReason = null;
        unit.state = routed ? "fled" : "active";
        this.#log(routed ? "unit_fled" : "unit_returned_to_hand", { unitId: unit.id, teamId: team.id });
      }
      return intent;
    }
    unit.progress = Math.min(1, unit.progress + unit.speed * deltaMs / 10_000);
    if (!target && unit.progress >= 1) {
      const hero = this.#breakthroughHero(unit, enemy);
      if (hero) {
        if (unit.targetId !== hero.id) { unit.targetId = hero.id; this.#log("target_acquired", { unitId: unit.id, targetId: hero.id }); }
        unit.attackCooldownMs -= deltaMs;
        if (unit.attackCooldownMs <= 0) {
          intent = this.#createDamageIntent(unit, hero, this.config.breakthroughHeroDamageMultiplier, "breakthrough_attack");
          unit.attackCooldownMs = unit.attackIntervalMs;
        }
        return intent;
      }
      return null;
    }
    return intent;
  }

  #targetFor(unit, enemy) { return enemy.units.find((item) => item.state === "active" && item.lane === unit.lane) ?? null; }
  #breakthroughHero(unit, enemy) {
    return enemy.heroes
      .filter((hero) => hero.state === "active")
      .sort((first, second) => Math.abs(first.lane - unit.lane) - Math.abs(second.lane - unit.lane) || first.lane - second.lane)[0] ?? null;
  }
  #createDamageIntent(attacker, target, multiplier = 1, eventType = "attack") {
    const attack = attacker.kind === "unit" && attacker.retreating ? attacker.retreat.attack : attacker.attack;
    const defense = target.kind === "unit" && target.retreating ? target.retreat.defense : target.defense;
    const combatMultiplier = this.#combatMultiplier(attack, defense);
    const packetCount = attacker.kind === "unit" ? attacker.combatantCount : 1;
    const minimum = attacker.kind === "unit" ? attacker.damageMin : Math.max(1, Math.floor(attacker.attack / 2));
    const maximum = attacker.kind === "unit" ? attacker.damageMax : Math.max(minimum, attacker.attack);
    const packets = attack <= 0 ? [] : Array.from({ length: packetCount }, () => Math.max(1, Math.round(this.#roll(minimum, maximum) * combatMultiplier * multiplier)));
    return { attackerId: attacker.id, targetId: target.id, packets, damage: packets.reduce((total, amount) => total + amount, 0), multiplier, combatMultiplier, eventType };
  }
  #applyDamage({ attackerId, targetId, packets = [], damage = 0, multiplier = 1, combatMultiplier = 1, eventType = "attack" }) {
    const attacker = this.getEntity(attackerId); const target = this.getEntity(targetId);
    if (!attacker || !target) return { success: false, reason: "unknown_entity" };
    const previousDead = target.kind === "unit" ? target.deadCount : 0;
    const previousWounded = target.kind === "unit" ? target.woundedCount : 0;
    let effectiveDamage = 0;
    if (target.kind === "hero") effectiveDamage = Math.min(target.health, damage);
    else effectiveDamage = this.#applyPacketsToUnit(target, packets.length > 0 ? packets : [damage]);
    this.#recordContribution(attacker.playerId, "damageDealt", effectiveDamage);
    this.#recordContribution(target.playerId, "damageTaken", effectiveDamage);
    let losses = 0;
    if (target.kind === "hero") { target.health = Math.max(0, target.health - effectiveDamage); if (target.health === 0) target.state = "ghost"; }
    else {
      losses = Math.max(0, target.deadCount - previousDead);
      const greenRatio = target.combatantCount / Math.max(1, target.initialQuantity);
      if (target.quantity === 0) target.state = "defeated";
      else if (!target.retreating && (target.combatantCount === 0 || greenRatio <= this.#routThreshold(target.morale))) {
        target.retreating = true; target.retreatReason = "rout"; target.targetId = null;
        this.#log("unit_routed", { unitId: target.id, combatants: target.combatantCount, wounded: target.woundedCount, morale: target.morale });
      }
    }
    const wounded = target.kind === "unit" ? Math.max(0, target.woundedCount - previousWounded) : 0;
    this.#log(eventType, { attackerId: attacker.id, targetId: target.id, damage: effectiveDamage, rolledDamage: damage, losses, wounded, multiplier, combatMultiplier, targetState: target.state }); return { success: true, damage: effectiveDamage, rolledDamage: damage, losses, wounded, multiplier, targetState: target.state };
  }

  #applyPacketsToUnit(unit, packets) {
    let applied = 0;
    for (const packet of packets) {
      let remaining = Math.max(0, packet);
      let safety = unit.soldierHealth.length + 1;
      while (remaining > 0 && safety > 0) {
        const living = unit.soldierHealth.map((health, index) => ({ health, index })).filter(({ health }) => health > 0);
        if (living.length === 0) break;
        const chosen = living[unit.damageCursor % living.length];
        const dealt = Math.min(chosen.health, remaining);
        unit.soldierHealth[chosen.index] -= dealt;
        remaining -= dealt; applied += dealt; unit.damageCursor = (unit.damageCursor + 1) % Math.max(1, living.length);
        safety -= 1;
      }
    }
    this.#refreshUnitHealth(unit);
    return applied;
  }

  #refreshUnitHealth(unit) {
    unit.combatantCount = unit.soldierHealth.filter((health) => health > unit.combatHealthThreshold).length;
    unit.woundedCount = unit.soldierHealth.filter((health) => health > 0 && health <= unit.combatHealthThreshold).length;
    unit.deadCount = unit.soldierHealth.filter((health) => health === 0).length;
    unit.quantity = unit.combatantCount + unit.woundedCount;
  }

  #combatMultiplier(attack, defense) {
    const difference = attack - defense;
    return difference >= 0 ? Math.min(3, 1 + difference * 0.05) : Math.max(0.3, 1 - Math.abs(difference) * 0.025);
  }

  #routThreshold(morale) { return Math.max(0.1, Math.min(0.55, 0.55 - morale * 0.045)); }
  #roll(minimum, maximum) { this.state.randomState = (Math.imul(1_664_525, this.state.randomState) + 1_013_904_223) >>> 0; return Math.floor(this.state.randomState / 4_294_967_296 * (maximum - minimum + 1)) + minimum; }
  #arriveReinforcements() { for (const team of this.teams) { const due = team.reinforcements.filter((item) => item.arrivalAtMs <= this.state.elapsedMs); team.reinforcements = team.reinforcements.filter((item) => item.arrivalAtMs > this.state.elapsedMs); for (const item of due) { const lane = team.lines.find((line) => line.heroId === null); if (!lane) continue; const hero = { ...item.hero, kind: "hero", lane: lane.index, state: "active", targetId: null, progress: 0, attackCooldownMs: 0 }; lane.heroId = hero.id; team.heroes.push(hero); team.units.push(...item.units.map((unit) => createReinforcementUnit(unit, lane.index))); this.#log("reinforcement_joined", { teamId: team.id, heroId: hero.id, lane: lane.index }); } } }
  #checkEnd() { const alive = this.teams.filter((team) => team.heroes.some((hero) => hero.state === "active")); if (alive.length > 1) return; this.#finish(alive[0]?.id ?? null); }
  #finish(winnerTeamId) { this.state.status = "finished"; this.state.finishedAt = this.state.now(); this.state.winnerTeamId = winnerTeamId; this.#log("battle_finished", { winnerTeamId }); }
  #mark(id, state) { const unit = this.getEntity(id); if (unit?.kind !== "unit" || unit.state !== "active") return false; unit.state = state; this.#log(`unit_${state}`, { unitId: id }); return true; }
  #recordContribution(playerId, field, amount) { const entry = this.state.contributions[playerId] ??= { damageDealt: 0, damageTaken: 0, support: 0, total: 0 }; entry[field] += amount; entry.total = entry.damageDealt + entry.damageTaken * 0.25 + entry.support; }
  #commanderFor(team, playerId, heroId = null) { return team.heroes.find((hero) => hero.state === "active" && (heroId ? hero.id === heroId : hero.playerId === playerId)) ?? null; }
  #spendCommand(hero, cost, action, details) { if (!Number.isInteger(cost) || cost <= 0) throw new RangeError("Le coût de commandement doit être un entier positif."); if (hero.commandPoints < cost) return false; hero.commandPoints -= cost; this.#log("command_spent", { heroId: hero.id, action, cost, remainingCommandPoints: hero.commandPoints, ...details }); return true; }
  #log(type, details = {}) { this.eventLog.push({ type, ...details, at: this.state.now(), elapsedMs: this.state.elapsedMs }); }
}

function createReinforcementUnit(unit, lane) {
  const healthPerSoldier = unit.healthPerSoldier ?? 10;
  const combatHealthThreshold = unit.combatHealthThreshold ?? 4;
  const soldierHealth = [...(unit.soldierHealth ?? Array(unit.quantity).fill(healthPerSoldier))];
  const combatantCount = soldierHealth.filter((health) => health > combatHealthThreshold).length;
  const woundedCount = soldierHealth.filter((health) => health > 0 && health <= combatHealthThreshold).length;
  return { ...unit, kind: "unit", lane, behavior: unit.behavior ?? "advance", symbol: unit.symbol ?? "U", healthPerSoldier, combatHealthThreshold, soldierHealth, initialQuantity: soldierHealth.length, combatantCount, woundedCount, deadCount: soldierHealth.filter((health) => health === 0).length, damageMin: unit.damageMin ?? Math.max(1, Math.floor(unit.attack / 2)), damageMax: unit.damageMax ?? Math.max(1, unit.attack), attackIntervalMs: unit.attackIntervalMs ?? Math.max(350, 1_500 - unit.speed * 100), damageCursor: 0, retreating: false, retreatReason: null, retreat: { speed: unit.retreat?.speed ?? unit.speed, defense: unit.retreat?.defense ?? unit.defense, attack: unit.retreat?.attack ?? unit.attack, range: unit.retreat?.range ?? unit.range }, state: "active", targetId: null, progress: 0, attackCooldownMs: 0 };
}
