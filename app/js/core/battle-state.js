export class BattleState {
  constructor({ id, teams, loot = [], config = {}, now = () => Date.now() }) {
    if (typeof id !== "string" || id.trim() === "") throw new TypeError("L'identifiant de bataille est requis.");
    if (!Array.isArray(teams) || teams.length !== 2) throw new RangeError("Une bataille oppose exactement deux équipes.");
    this.id = id;
    this.config = {
      tickMs: positive(config.tickMs ?? 500, "tickMs"),
      unitHealthPerSurvivor: positive(config.unitHealthPerSurvivor ?? 10, "unitHealthPerSurvivor"),
      defenseBase: positive(config.defenseBase ?? 5, "defenseBase"),
      reinforcementDelayMs: nonNegative(config.reinforcementDelayMs ?? 3_000, "reinforcementDelayMs"),
      pursuitLossRate: nonNegative(config.pursuitLossRate ?? 0.2, "pursuitLossRate"),
      breakthroughHeroDamageMultiplier: positive(config.breakthroughHeroDamageMultiplier ?? 1.5, "breakthroughHeroDamageMultiplier"),
      retreatCommandCost: positiveInteger(config.retreatCommandCost ?? 1, "retreatCommandCost"),
      countdownMs: nonNegative(config.countdownMs ?? 0, "countdownMs"),
      ambushTeamId: config.ambushTeamId === null || config.ambushTeamId === undefined ? null : requireText(config.ambushTeamId, "L'équipe d'embuscade"),
      ambushDefenderRevealDelayMs: nonNegative(config.ambushDefenderRevealDelayMs ?? 1_500, "ambushDefenderRevealDelayMs"),
      randomSeed: nonNegativeInteger(config.randomSeed ?? stableSeed(id), "randomSeed"),
    };
    this.teams = createTeams(teams);
    if (this.config.ambushTeamId !== null && !this.teams.some((team) => team.id === this.config.ambushTeamId)) throw new RangeError("L'équipe d'embuscade doit participer à la bataille.");
    this.loot = createLoot(loot);
    this.contributions = Object.fromEntries(this.teams.flatMap((team) => team.heroes.map((hero) => [hero.playerId, { damageDealt: 0, damageTaken: 0, support: 0, total: 0 }])));
    this.status = "ready";
    this.elapsedMs = 0;
    this.countdownRemainingMs = 0;
    this.startedAt = null;
    this.finishedAt = null;
    this.winnerTeamId = null;
    this.eventLog = [];
    this.randomState = this.config.randomSeed >>> 0;
    this.now = now;
  }

  getEntity(id) {
    for (const team of this.teams) {
      const entity = [...team.heroes, ...team.units].find((item) => item.id === id);
      if (entity) return entity;
    }
    return null;
  }

  getTeamForEntity(id) {
    return this.teams.find((team) => [...team.heroes, ...team.units].some((item) => item.id === id)) ?? null;
  }

  toJSON() {
    return {
      id: this.id, config: structuredClone(this.config), teams: structuredClone(this.teams), status: this.status,
      elapsedMs: this.elapsedMs, countdownRemainingMs: this.countdownRemainingMs, startedAt: this.startedAt, finishedAt: this.finishedAt,
      winnerTeamId: this.winnerTeamId, loot: structuredClone(this.loot), contributions: structuredClone(this.contributions), eventLog: structuredClone(this.eventLog), randomState: this.randomState,
    };
  }
}

function createLoot(loot) {
  if (!Array.isArray(loot)) throw new TypeError("Le butin doit être une liste.");
  return loot.filter((entry) => entry.protected !== true).map((entry) => ({
    id: requireText(entry.id, "L'identifiant de butin"), itemId: requireText(entry.itemId ?? entry.id, "L'objet de butin"),
    quantity: positiveInteger(entry.quantity ?? 1, "La quantité de butin"), portable: entry.portable !== false,
    weightPerUnit: nonNegative(entry.weightPerUnit ?? 1, "Le poids du butin"), valuePerUnit: positive(entry.valuePerUnit ?? 1, "La valeur du butin"),
  }));
}

function createTeams(teams) {
  const teamIds = new Set(); const entityIds = new Set();
  return teams.map((input) => {
    if (teamIds.has(input.id)) throw new RangeError("Les équipes doivent être uniques.");
    teamIds.add(input.id);
    const heroInputs = input.heroes ?? [];
    const laneLayouts = { 1: [1], 2: [0, 2], 3: [0, 1, 2] };
    const heroes = heroInputs.map((hero, index) => createHero(hero, laneLayouts[heroInputs.length]?.[index], entityIds));
    if (heroes.length === 0 || heroes.length > 3) throw new RangeError("Une équipe doit avoir entre un et trois héros.");
    const heroByPlayer = new Map(heroes.map((hero) => [hero.playerId, hero]));
    const units = (input.units ?? []).map((unit) => createUnit(unit, heroByPlayer.get(unit.playerId)?.lane ?? null, entityIds));
    return {
      id: input.id,
      heroes, units,
      lines: Array.from({ length: 3 }, (_, index) => ({ index, heroId: heroes.find((hero) => hero.lane === index)?.id ?? null })),
      reinforcements: [],
    };
  });
}

function common(entity, kind, ids) {
  if (typeof entity.id !== "string" || entity.id === "" || ids.has(entity.id)) throw new RangeError("Les entités doivent avoir des identifiants uniques.");
  ids.add(entity.id);
  return {
    id: entity.id, sourceId: entity.sourceId ?? entity.id, playerId: entity.playerId, kind,
    name: entity.name ?? null, typeName: entity.typeName ?? null,
    attack: nonNegative(entity.attack ?? 0, "L'attaque"), defense: nonNegative(entity.defense ?? 0, "La défense"),
    speed: positive(entity.speed ?? 1, "La vitesse"), range: positive(entity.range ?? 1, "La portée"),
    state: entity.state ?? "active", targetId: null, attackCooldownMs: 0, progress: 0,
  };
}

function createHero(entity, lane, ids) {
  const base = common(entity, "hero", ids);
  const maxHealth = positive(entity.maxHealth ?? 20, "Les PV maximum");
  const maxCommandPoints = positiveInteger(entity.maxCommandPoints ?? entity.command ?? 3, "Les points de commandement maximum");
  return { ...base, maxHealth, health: Math.min(maxHealth, nonNegative(entity.health ?? maxHealth, "Les PV")), lane, command: maxCommandPoints, maxCommandPoints, commandPoints: Math.min(maxCommandPoints, nonNegativeInteger(entity.commandPoints ?? maxCommandPoints, "Les points de commandement")), skillIds: normalizeIds(entity.skillIds ?? entity.abilityIds ?? []), specialPowerIds: normalizeIds(entity.specialPowerIds ?? []) };
}

function createUnit(entity, lane, ids) {
  const base = common(entity, "unit", ids);
  const maxQuantity = positiveInteger(entity.maxQuantity, "L'effectif maximal");
  const retreat = entity.retreat ?? {};
  const quantity = Math.min(maxQuantity, nonNegativeInteger(entity.quantity, "L'effectif"));
  const healthPerSoldier = positiveInteger(entity.healthPerSoldier ?? 10, "Les PV par soldat");
  const combatHealthThreshold = nonNegativeInteger(entity.combatHealthThreshold ?? 4, "Le seuil de blessure");
  if (combatHealthThreshold >= healthPerSoldier) throw new RangeError("Le seuil de blessure doit etre inferieur aux PV par soldat.");
  const soldierHealth = createSoldierHealth(entity.soldierHealth, quantity, healthPerSoldier);
  const counts = healthCounts(soldierHealth, combatHealthThreshold);
  const damageMin = positive(entity.damageMin ?? Math.max(1, Math.floor(base.attack / 2)), "Les degats minimum");
  const damageMax = positive(entity.damageMax ?? Math.max(1, base.attack), "Les degats maximum");
  if (damageMax < damageMin) throw new RangeError("Les degats maximum doivent etre superieurs aux degats minimum.");
  return {
    ...base,
    maxQuantity,
    quantity: counts.alive,
    initialQuantity: soldierHealth.length,
    healthPerSoldier,
    combatHealthThreshold,
    soldierHealth,
    combatantCount: counts.combatants,
    woundedCount: counts.wounded,
    deadCount: counts.dead,
    damageMin,
    damageMax,
    attackIntervalMs: positive(entity.attackIntervalMs ?? Math.max(350, 1_500 - base.speed * 100), "La cadence d'attaque"),
    damageCursor: nonNegativeInteger(entity.damageCursor ?? 0, "Le curseur de degats"),
    morale: nonNegative(entity.morale ?? 5, "Le moral"),
    specialPowerIds: normalizeIds(entity.specialPowerIds ?? []),
    lane,
    behavior: entity.behavior ?? "advance",
    symbol: entity.symbol ?? "U",
    retreating: entity.retreating === true || (counts.alive > 0 && counts.combatants === 0),
    retreatReason: entity.retreatReason ?? (counts.alive > 0 && counts.combatants === 0 ? "rout" : null),
    retreat: {
      speed: positive(retreat.speed ?? base.speed, "La vitesse de retraite"),
      defense: nonNegative(retreat.defense ?? base.defense, "La defense de retraite"),
      attack: nonNegative(retreat.attack ?? base.attack, "L'attaque de retraite"),
      range: positive(retreat.range ?? base.range, "La portee de retraite"),
    },
  };
}

function createSoldierHealth(values, quantity, maximum) {
  if (values === undefined || values === null) return Array(quantity).fill(maximum);
  if (!Array.isArray(values) || values.length !== quantity) throw new RangeError("Les PV des soldats ne correspondent pas a l'effectif.");
  return values.map((health) => {
    if (!Number.isInteger(health) || health < 0 || health > maximum) throw new RangeError("Les PV d'un soldat sont invalides.");
    return health;
  });
}

function healthCounts(values, threshold) {
  return values.reduce((counts, health) => {
    if (health === 0) counts.dead += 1;
    else if (health <= threshold) { counts.alive += 1; counts.wounded += 1; }
    else { counts.alive += 1; counts.combatants += 1; }
    return counts;
  }, { alive: 0, combatants: 0, wounded: 0, dead: 0 });
}

function stableSeed(value) {
  let hash = 2_166_136_261;
  for (const character of value) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16_777_619); }
  return hash >>> 0;
}

function positive(value, label) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} doit être positif.`); return value; }
function nonNegative(value, label) { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} doit être positif ou nul.`); return value; }
function positiveInteger(value, label) { if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} doit être un entier positif.`); return value; }
function nonNegativeInteger(value, label) { if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} doit être un entier positif ou nul.`); return value; }
function requireText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} est requis.`); return value.trim(); }
function normalizeIds(values) { if (!Array.isArray(values)) throw new TypeError("Les identifiants doivent être une liste."); return [...new Set(values.map((value) => requireText(value, "Un identifiant")))]; }
