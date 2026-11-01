export class BattleState {
  constructor({
    id,
    teams,
    loot = [],
    config = {},
    now = () => Date.now(),
    status = "ready",
    startedAt = null,
    finishedAt = null,
    winnerTeamId = null,
    contributions = null,
    eventLog = [],
  }) {
    if (typeof id !== "string" || id.trim() === "")
      throw new TypeError("L'identifiant de bataille est requis.");
    if (!Array.isArray(teams) || teams.length !== 2)
      throw new RangeError("Une bataille oppose exactement deux équipes.");
    this.id = id;
    this.config = {
      tactical: config.tactical === true,
      humanPlayerIds: Array.isArray(config.humanPlayerIds)
        ? [...config.humanPlayerIds]
        : [],
      ambushTeamId:
        config.ambushTeamId === null || config.ambushTeamId === undefined
          ? null
          : requireText(config.ambushTeamId, "L'équipe d'embuscade"),
      randomSeed: nonNegativeInteger(
        config.randomSeed ?? stableSeed(id),
        "randomSeed",
      ),
    };
    this.teams = createTeams(teams);
    if (
      this.config.ambushTeamId !== null &&
      !this.teams.some((team) => team.id === this.config.ambushTeamId)
    )
      throw new RangeError(
        "L'équipe d'embuscade doit participer à la bataille.",
      );
    this.loot = createLoot(loot);
    this.contributions = Object.fromEntries(
      this.teams.flatMap((team) =>
        team.heroes.map((hero) => [
          hero.playerId,
          { damageDealt: 0, damageTaken: 0, support: 0, total: 0 },
        ]),
      ),
    );
    if (!["ready", "active", "finished"].includes(status))
      throw new RangeError("Le statut de bataille est invalide.");
    this.status = status;
    this.startedAt = startedAt;
    this.finishedAt = finishedAt;
    this.winnerTeamId = winnerTeamId;
    if (contributions !== null)
      this.contributions = structuredClone(contributions);
    if (!Array.isArray(eventLog))
      throw new TypeError("Le journal de bataille doit être une liste.");
    this.eventLog = structuredClone(eventLog);
    this.now = now;
  }

  getEntity(id) {
    for (const team of this.teams) {
      const entity = [...team.heroes, ...team.units].find(
        (item) => item.id === id,
      );
      if (entity) return entity;
    }
    return null;
  }

  getTeamForEntity(id) {
    return (
      this.teams.find((team) =>
        [...team.heroes, ...team.units].some((item) => item.id === id),
      ) ?? null
    );
  }

  toJSON() {
    return {
      id: this.id,
      config: structuredClone(this.config),
      teams: structuredClone(this.teams),
      status: this.status,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      winnerTeamId: this.winnerTeamId,
      loot: structuredClone(this.loot),
      contributions: structuredClone(this.contributions),
      eventLog: structuredClone(this.eventLog),
    };
  }
}

function createLoot(loot) {
  if (!Array.isArray(loot))
    throw new TypeError("Le butin doit être une liste.");
  return loot
    .filter((entry) => entry.protected !== true)
    .map((entry) => ({
      id: requireText(entry.id, "L'identifiant de butin"),
      itemId: requireText(entry.itemId ?? entry.id, "L'objet de butin"),
      quantity: positiveInteger(entry.quantity ?? 1, "La quantité de butin"),
      portable: entry.portable !== false,
      valuePerUnit: positive(entry.valuePerUnit ?? 1, "La valeur du butin"),
    }));
}

function createTeams(teams) {
  const teamIds = new Set();
  const entityIds = new Set();
  return teams.map((input) => {
    if (teamIds.has(input.id))
      throw new RangeError("Les équipes doivent être uniques.");
    teamIds.add(input.id);
    const heroInputs = input.heroes ?? [];
    const heroes = heroInputs.map((hero) => createHero(hero, entityIds));
    if (heroes.length === 0 || heroes.length > 3)
      throw new RangeError("Une équipe doit avoir entre un et trois héros.");
    const units = (input.units ?? []).map((unit) =>
      createUnit(unit, entityIds),
    );
    return {
      id: input.id,
      aiStyle: input.aiStyle ?? null,
      heroes,
      units,
    };
  });
}

function common(entity, kind, ids) {
  if (typeof entity.id !== "string" || entity.id === "" || ids.has(entity.id))
    throw new RangeError("Les entités doivent avoir des identifiants uniques.");
  ids.add(entity.id);
  return {
    id: entity.id,
    sourceId: entity.sourceId ?? entity.id,
    playerId: entity.playerId,
    kind,
    name: entity.name ?? null,
    typeName: entity.typeName ?? null,
    attack: nonNegative(entity.attack ?? 0, "L'attaque"),
    defense: nonNegative(entity.defense ?? 0, "La défense"),
    speed: positive(entity.speed ?? 1, "La vitesse"),
    range: positive(entity.range ?? 1, "La portée"),
    state: entity.state ?? "active",
  };
}

function createHero(entity, ids) {
  const base = common(entity, "hero", ids);
  const maxHealth = positive(entity.maxHealth ?? 20, "Les PV maximum");
  const maxCommandPoints = positiveInteger(
    entity.maxCommandPoints ?? entity.command ?? 3,
    "Les points de commandement maximum",
  );
  return {
    ...base,
    maxHealth,
    health: Math.min(
      maxHealth,
      nonNegative(entity.health ?? maxHealth, "Les PV"),
    ),
    command: maxCommandPoints,
    tacticalCommand: nonNegative(
      entity.tacticalCommand ?? maxCommandPoints,
      "Le commandement tactique",
    ),
    maxCommandPoints,
    commandPoints: Math.min(
      maxCommandPoints,
      nonNegativeInteger(
        entity.commandPoints ?? maxCommandPoints,
        "Les points de commandement",
      ),
    ),
  };
}

function createUnit(entity, ids) {
  const base = common(entity, "unit", ids);
  const maxQuantity = positiveInteger(entity.maxQuantity, "L'effectif maximal");
  const quantity = Math.min(
    maxQuantity,
    nonNegativeInteger(entity.quantity, "L'effectif"),
  );
  const healthPerSoldier = positiveInteger(
    entity.healthPerSoldier ?? 10,
    "Les PV par soldat",
  );
  const combatHealthThreshold = nonNegativeInteger(
    entity.combatHealthThreshold ?? 4,
    "Le seuil de blessure",
  );
  if (combatHealthThreshold >= healthPerSoldier)
    throw new RangeError(
      "Le seuil de blessure doit etre inferieur aux PV par soldat.",
    );
  const soldierHealth = createSoldierHealth(
    entity.soldierHealth,
    quantity,
    healthPerSoldier,
  );
  const counts = healthCounts(soldierHealth, combatHealthThreshold);
  return {
    ...base,
    typeId: entity.typeId ?? null,
    battleSlot: entity.battleSlot ?? null,
    heroSourceId:
      entity.heroSourceId === undefined || entity.heroSourceId === null
        ? null
        : requireText(entity.heroSourceId, "Le héros commandant"),
    tags: normalizeIds(entity.tags ?? []),
    maxQuantity,
    quantity: counts.alive,
    initialQuantity: soldierHealth.length,
    healthPerSoldier,
    combatHealthThreshold,
    soldierHealth,
    combatantCount: counts.combatants,
    woundedCount: counts.wounded,
    deadCount: Math.max(counts.dead, entity.deadCount ?? 0),
    morale: nonNegative(entity.morale ?? 5, "Le moral"),
    symbol: entity.symbol ?? "U",
  };
}

function createSoldierHealth(values, quantity, maximum) {
  if (values === undefined || values === null)
    return Array(quantity).fill(maximum);
  if (
    !Array.isArray(values) ||
    values.filter((health) => health > 0).length !== quantity
  )
    throw new RangeError(
      "Les PV des soldats ne correspondent pas a l'effectif.",
    );
  return values.map((health) => {
    if (!Number.isInteger(health) || health < 0 || health > maximum)
      throw new RangeError("Les PV d'un soldat sont invalides.");
    return health;
  });
}

function healthCounts(values, threshold) {
  return values.reduce(
    (counts, health) => {
      if (health === 0) counts.dead += 1;
      else if (health <= threshold) {
        counts.alive += 1;
        counts.wounded += 1;
      } else {
        counts.alive += 1;
        counts.combatants += 1;
      }
      return counts;
    },
    { alive: 0, combatants: 0, wounded: 0, dead: 0 },
  );
}

function stableSeed(value) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function positive(value, label) {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${label} doit être positif.`);
  return value;
}
function nonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${label} doit être positif ou nul.`);
  return value;
}
function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0)
    throw new RangeError(`${label} doit être un entier positif.`);
  return value;
}
function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0)
    throw new RangeError(`${label} doit être un entier positif ou nul.`);
  return value;
}
function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${label} est requis.`);
  return value.trim();
}
function normalizeIds(values) {
  if (!Array.isArray(values))
    throw new TypeError("Les identifiants doivent être une liste.");
  return [
    ...new Set(values.map((value) => requireText(value, "Un identifiant"))),
  ];
}
