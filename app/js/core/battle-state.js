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
    };
    this.teams = createTeams(teams);
    this.loot = createLoot(loot);
    this.contributions = Object.fromEntries(this.teams.flatMap((team) => team.heroes.map((hero) => [hero.playerId, { damageDealt: 0, damageTaken: 0, support: 0, total: 0 }])));
    this.status = "ready";
    this.elapsedMs = 0;
    this.startedAt = null;
    this.finishedAt = null;
    this.winnerTeamId = null;
    this.eventLog = [];
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
      elapsedMs: this.elapsedMs, startedAt: this.startedAt, finishedAt: this.finishedAt,
      winnerTeamId: this.winnerTeamId, loot: structuredClone(this.loot), contributions: structuredClone(this.contributions), eventLog: structuredClone(this.eventLog),
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
    attack: nonNegative(entity.attack ?? 0, "L'attaque"), defense: nonNegative(entity.defense ?? 0, "La défense"),
    speed: positive(entity.speed ?? 1, "La vitesse"), range: positive(entity.range ?? 1, "La portée"),
    state: entity.state ?? "active", targetId: null, attackCooldownMs: 0, progress: 0,
  };
}

function createHero(entity, lane, ids) {
  const base = common(entity, "hero", ids);
  const maxHealth = positive(entity.maxHealth ?? 100, "Les PV maximum");
  return { ...base, maxHealth, health: Math.min(maxHealth, nonNegative(entity.health ?? maxHealth, "Les PV")), lane, command: positive(entity.command ?? entity.commandRadius ?? 1, "Le commandement") };
}

function createUnit(entity, lane, ids) {
  const base = common(entity, "unit", ids);
  const maxQuantity = positiveInteger(entity.maxQuantity, "L'effectif maximal");
  const retreat = entity.retreat ?? {};
  return {
    ...base,
    maxQuantity,
    quantity: Math.min(maxQuantity, nonNegativeInteger(entity.quantity, "L'effectif")),
    morale: nonNegative(entity.morale ?? 5, "Le moral"),
    lane,
    behavior: entity.behavior ?? "advance",
    symbol: entity.symbol ?? "U",
    retreating: entity.retreating === true,
    retreat: {
      speed: positive(retreat.speed ?? base.speed, "La vitesse de retraite"),
      defense: nonNegative(retreat.defense ?? base.defense, "La defense de retraite"),
      attack: nonNegative(retreat.attack ?? base.attack, "L'attaque de retraite"),
      range: positive(retreat.range ?? base.range, "La portee de retraite"),
    },
  };
}

function positive(value, label) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} doit être positif.`); return value; }
function nonNegative(value, label) { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} doit être positif ou nul.`); return value; }
function positiveInteger(value, label) { if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} doit être un entier positif.`); return value; }
function nonNegativeInteger(value, label) { if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} doit être un entier positif ou nul.`); return value; }
function requireText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} est requis.`); return value.trim(); }
