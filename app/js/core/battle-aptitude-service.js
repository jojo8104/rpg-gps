const TARGETS = new Set([
  "none",
  "self",
  "ally_unit",
  "ally_entity",
  "enemy_unit",
  "enemy_entity",
]);

/** Interprète les aptitudes configurées sans dépendre du DOM ni des entités persistantes. */
export class BattleAptitudeService {
  constructor(definitions = []) {
    if (!Array.isArray(definitions))
      throw new TypeError("Les aptitudes de bataille doivent être une liste.");
    this.definitions = new Map(
      definitions.map((definition) => [
        definition.id,
        structuredClone(definition),
      ]),
    );
  }

  getDefinition(id) {
    return this.definitions.get(id) ?? null;
  }

  getPower(user, powerId) {
    const definition = this.getDefinition(powerId);
    if (!definition || definition.type === "passive") return null;
    const rank = user.aptitudeRanks?.[powerId] ?? "novice";
    const activation = definition.activation ?? { cost: 1, target: "none" };
    if (!TARGETS.has(activation.target ?? "none"))
      throw new RangeError(`La cible de ${powerId} est invalide.`);
    return {
      definition,
      rank,
      activation,
      effects: structuredClone(definition.effects?.[rank] ?? []),
    };
  }

  getTargetCandidates(state, teamId, userId, powerId) {
    const user = state.getEntity(userId);
    const team = state.teams.find((item) => item.id === teamId);
    const power = user ? this.getPower(user, powerId) : null;
    if (!team || !user || !power) return [];
    const enemy = state.teams.find((item) => item.id !== teamId);
    const active = (entities) =>
      entities.filter((entity) => entity.state === "active");
    switch (power.activation.target ?? "none") {
      case "none":
        return [];
      case "self":
        return [user];
      case "ally_unit":
        return active(team.units);
      case "ally_entity":
        return active([...team.heroes, ...team.units]);
      case "enemy_unit":
        return active(enemy?.units ?? []);
      case "enemy_entity":
        return active([...(enemy?.heroes ?? []), ...(enemy?.units ?? [])]);
      default:
        return [];
    }
  }

  isValidTarget(state, teamId, userId, powerId, targetId) {
    const user = state.getEntity(userId);
    const power = user ? this.getPower(user, powerId) : null;
    if (!power) return false;
    if ((power.activation.target ?? "none") === "none")
      return targetId === null;
    return this.getTargetCandidates(state, teamId, userId, powerId).some(
      (entity) => entity.id === targetId,
    );
  }

  passiveEffectsFor(state, entity) {
    const team = state.getTeamForEntity(entity.id);
    if (!team) return [];
    return team.heroes.flatMap((hero) =>
      (hero.skillIds ?? []).flatMap((aptitudeId) => {
        const definition = this.getDefinition(aptitudeId);
        if (definition?.type !== "passive") return [];
        const rank = hero.aptitudeRanks?.[aptitudeId] ?? "novice";
        return (definition.effects?.[rank] ?? [])
          .filter(
            (effect) =>
              effect.kind === "stat_modifier" ||
              effect.kind === "damage_reduction",
          )
          .filter((effect) =>
            this.#matchesRecipient(effect.recipient ?? "self", hero, entity),
          )
          .filter((effect) => matchesFilter(entity, effect.filter));
      }),
    );
  }

  effectiveStat(state, entity, stat) {
    const effects = [
      ...this.passiveEffectsFor(state, entity),
      ...(entity.activeEffects ?? []).filter(
        (effect) =>
          effect.kind === "stat_modifier" &&
          effect.expiresAtMs > state.elapsedMs,
      ),
    ].filter(
      (effect) =>
        effect.kind === "stat_modifier" &&
        effect.stat === stat &&
        matchesFilter(entity, effect.filter),
    );
    const added = effects
      .filter((effect) => (effect.operation ?? "add") === "add")
      .reduce((total, effect) => total + effect.value, 0);
    const multiplied = effects
      .filter((effect) => effect.operation === "multiply")
      .reduce((total, effect) => total * effect.value, 1);
    return Math.max(
      stat === "speed" ? 0.1 : 0,
      (entity[stat] + added) * multiplied,
    );
  }

  damageReduction(state, entity) {
    const effects = [
      ...this.passiveEffectsFor(state, entity),
      ...(entity.activeEffects ?? []).filter(
        (effect) =>
          effect.kind === "damage_reduction" &&
          effect.expiresAtMs > state.elapsedMs,
      ),
    ].filter(
      (effect) =>
        effect.kind === "damage_reduction" &&
        matchesFilter(entity, effect.filter),
    );
    return Math.min(
      0.8,
      effects.reduce((total, effect) => total + effect.value, 0),
    );
  }

  #matchesRecipient(recipient, owner, entity) {
    if (recipient === "self") return owner.id === entity.id;
    if (recipient === "allied_units") return entity.kind === "unit";
    if (recipient === "allied_entities") return true;
    return false;
  }
}

export function matchesFilter(entity, filter = null) {
  if (!filter) return true;
  if (filter.kind && entity.kind !== filter.kind) return false;
  if (
    Array.isArray(filter.tagsAny) &&
    !filter.tagsAny.some((tag) => entity.tags?.includes(tag))
  )
    return false;
  return true;
}
