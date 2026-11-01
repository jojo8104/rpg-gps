import { unitExpeditionMorale } from "./expedition-morale.js";
import { BattleEngine } from "./battle-engine.js";
import { HeroArmyModifier } from "./hero-army-modifier.js";

/** Pont entre les entités persistantes du jeu et leurs instantanés tactiques. */
export class BattleService {
  constructor(unitDefinitions) {
    this.unitDefinitions = unitDefinitions;
  }

  createBattle({
    id,
    game,
    teamParticipants,
    loot = [],
    config,
    now,
    moraleMode = "casual",
    moraleContextByHeroId = {},
  }) {
    if (!Array.isArray(teamParticipants) || teamParticipants.length < 2)
      throw new RangeError("La bataille requiert au moins deux équipes.");
    const teams = teamParticipants.map((team) => {
      const heroIds = [...(team.heroIds ?? [])];
      const location = team.locationId
        ? game.getLocation(team.locationId)
        : null;
      const autonomousGroup = team.autonomousGroupId
        ? game.getAutonomousGroup(team.autonomousGroupId)
        : null;
      for (const id of location?.heroIds ?? []) {
        const hero = game.getHero(id);
        if (id === "capital-marshal" && hero?.state === "active" && game.locationAccessPolicy.isDefender(hero.playerId, location) && !heroIds.includes(id)) heroIds.push(id);
      }
      if (team.autonomousGroupId && autonomousGroup === null)
        throw new RangeError("Le groupe autonome de bataille n'existe pas.");
      const modifiers = new Map(
        heroIds.map((heroId) => [
          heroId,
          this.#createModifiers(
            game,
            heroId,
            moraleMode,
            moraleContextByHeroId[heroId],
          ),
        ]),
      );
      const heroes = heroIds.map((heroId) =>
        this.#createHeroSnapshot(game, heroId),
      );
      if (heroes.length === 0 && location !== null && autonomousGroup === null)
        heroes.push(this.#createLocationCommanderSnapshot(location));
      if (autonomousGroup !== null)
        heroes.push(this.#createAutonomousCommanderSnapshot(autonomousGroup));
      return {
        id: team.id,
        aiStyle:
          team.aiStyle !== undefined
            ? team.aiStyle
            : heroIds.includes("capital-marshal") ? "defensive"
            : heroIds.length > 0
              ? null
              : autonomousGroup !== null
                ? autonomousGroup.type === "rogue"
                  ? "aggressive"
                  : "opportunist"
                : location !== null
                  ? "defensive"
                  : null,
        heroes,
        units: [
          ...heroIds.flatMap((heroId) =>
            this.#createUnitSnapshots(
              game,
              heroId,
              modifiers.get(heroId),
              location,
            ),
          ),
          ...this.#createGarrisonUnitSnapshots(location, game.now()),
          ...(autonomousGroup?.mission?.questId === "repression" && autonomousGroup.id === "repression-knight" && location ? [] : this.#createAutonomousUnitSnapshots(autonomousGroup, game.now())),
        ],
      };
    });
    return new BattleEngine({
      id,
      teams,
      loot,
      config,
      now,
    });
  }

  applyOutcome({ game, battle }) {
    if (battle.status !== "finished")
      throw new Error(
        "La bataille doit être terminée avant d'appliquer son résultat.",
      );
    battle.teams.forEach((team) =>
      team.heroes.forEach((snapshot) => {
        const hero = game.getHero(snapshot.sourceId);
        if (hero !== null) {
          const state =
            snapshot.health === 0 || snapshot.state === "ghost"
              ? "ghost"
              : ["fled", "retreated", "surrendered"].includes(snapshot.state)
                ? "active"
                : snapshot.state;
          hero.setBattleState({ health: snapshot.health, state });
        }
      }),
    );
    battle.teams.forEach((team) =>
      team.units.forEach((snapshot) => {
        const unit = game.findUnit(snapshot.sourceId);
        if (unit !== null) {
          unit.applyBattleHealth(snapshot.soldierHealth);
          if (snapshot.state !== "fled" && snapshot.state !== "retreated")
            unit.state = snapshot.state;
        }
      }),
    );
    return { winnerTeamId: battle.winnerTeamId, battleId: battle.id };
  }

  createReinforcementSnapshots({ game, heroId }) {
    const hero = game.getHero(heroId);
    if (hero === null)
      throw new RangeError("Le héros de renfort n'existe pas.");
    const heroSnapshot = this.#createHeroSnapshot(game, heroId);
    const unitSnapshots = this.#createUnitSnapshots(game, heroId);
    return {
      heroes: [{ ...heroSnapshot, id: `battle-hero-${hero.id}` }],
      units: unitSnapshots,
    };
  }

  #createHeroSnapshot(game, heroId) {
    const hero = game.getHero(heroId);
    if (hero === null)
      throw new RangeError("Le héros de bataille n'existe pas.");
    return {
      id: `battle-hero-${hero.id}`,
      sourceId: hero.id,
      playerId: hero.playerId,
      name: hero.name,
      state: hero.state,
      maxHealth: hero.maxHealth,
      health: hero.health,
      attack: 10 + hero.level * 2 + (hero.id === "capital-marshal" ? hero.finalStats.attack : 0),
      defense: 5 + hero.level + (hero.id === "capital-marshal" ? hero.finalStats.defense : 0),
      speed: 2,
      tacticalCommand: hero.finalStats.command,
      command: hero.maxCommandPoints,
      maxCommandPoints: hero.maxCommandPoints,
      commandPoints: hero.commandPoints,
      skillIds: [...hero.skillIds],
      specialPowerIds: [...hero.specialPowerIds],
      aptitudeRanks: { ...hero.aptitudeRanks },
    };
  }

  #createModifiers(game, heroId, moraleMode, context = {}) {
    const hero = game.getHero(heroId);
    return HeroArmyModifier.calculate({
      hero,
      units: hero.army.units,
      unitDefinitions: this.unitDefinitions,
      moraleMode,
      context,
    });
  }

  #createLocationCommanderSnapshot(location) {
    const playerId =
      location.controllerId ?? location.ownerId ?? `neutral-${location.id}`;
    return {
      id: `battle-location-${location.id}`,
      sourceId: `location-${location.id}`,
      playerId,
      maxHealth: 20 + location.level * 5,
      health: 20 + location.level * 5,
      attack: 8 + location.level * 2,
      defense: 5 + location.level + (location.defenseBonus ?? 0),
      speed: 1,
      command: 2 + location.level,
    };
  }

  #createAutonomousCommanderSnapshot(group) {
    if (group.commander) {
      const hero = group.commander;
      const stats = hero.finalStats;
      return { id: `battle-group-${group.id}`, sourceId: `autonomous-group-${group.id}`, playerId: group.owner.id,
        name: hero.name, maxHealth: hero.maxHealth, health: hero.health, attack: 10 + hero.level * 2 + stats.attack,
        defense: 5 + hero.level + stats.defense, speed: 2, command: hero.maxCommandPoints,
        maxCommandPoints: hero.maxCommandPoints, commandPoints: hero.commandPoints,
        specialPowerIds: [...hero.specialPowerIds], aptitudeRanks: { ...hero.aptitudeRanks } };
    }
    const soldiers = group.army.units.reduce(
      (sum, unit) => sum + unit.combatantCount,
      0,
    );
    const command = Math.max(
      1,
      Math.min(
        10,
        group.army.units.length + Math.floor((group.morale ?? 3) / 2),
      ),
    );
    const health = Math.max(20, 15 + soldiers);
    return {
      id: `battle-group-${group.id}`,
      sourceId: `autonomous-group-${group.id}`,
      playerId: group.owner.id,
      name:
        group.type === "rogue" ? "Chef des déserteurs" : "Commandant autonome",
      maxHealth: health,
      health,
      attack: 8 + command,
      defense: 4 + command,
      speed: 1.5,
      command,
      maxCommandPoints: command,
      commandPoints: command,
    };
  }

  #createAutonomousUnitSnapshots(group, at = Date.now()) {
    if (group === null) return [];
    const modifiers = group.commander ? HeroArmyModifier.calculate({ hero: group.commander, units: group.army.units, unitDefinitions: this.unitDefinitions }) : null;
    return group.army.units
      .filter((unit) => unit.combatantCount > 0)
      .map((unit) => {
        const definition = this.unitDefinitions.get(unit.typeId);
        if (definition === undefined)
          throw new RangeError(
            "La définition d'une unité autonome n'existe pas.",
          );
        const retreat = definition.retreat ?? definition.stats;
        return {
          id: `battle-unit-${unit.id}`,
          sourceId: unit.id,
          heroSourceId: `autonomous-group-${group.id}`,
          playerId: group.owner.id,
          name: unit.name ?? definition.name,
          typeId: unit.typeId,
          battleSlot: unit.battleSlot,
          typeName: definition.name,
          tags: [...(definition.tags ?? [])],
          quantity: unit.quantity,
          maxQuantity: unit.maxQuantity,
          soldierHealth: [...unit.soldierHealth],
          healthPerSoldier: definition.stats.healthPerSoldier,
          combatHealthThreshold: definition.stats.combatHealthThreshold,
          damageMin: definition.stats.damageMin,
          damageMax: definition.stats.damageMax,
          attackIntervalMs: definition.stats.attackIntervalMs,
          attack: definition.stats.attack + (modifiers?.attackBonus ?? 0),
          defense: definition.stats.defense + (modifiers?.defenseBonus ?? 0),
          speed: definition.stats.speed * (modifiers?.speedMultiplier ?? 1),
          range: definition.stats.range,
          morale: Math.max(0, (group.morale ?? definition.stats.morale ?? 5) + (modifiers?.moraleBonus ?? 0) + unitExpeditionMorale(unit,at)),
          behavior: definition.behavior ?? "advance",
          retreat: { ...retreat },
          symbol: (definition.name ?? unit.typeId ?? "U")
            .slice(0, 1)
            .toUpperCase(),
        };
      });
  }

  #createGarrisonUnitSnapshots(location, at = Date.now()) {
    if (location === null) return [];
    return location.garrison.units
      .filter((unit) => unit.combatantCount > 0)
      .map((unit) => {
        const definition = this.unitDefinitions.get(unit.typeId);
        if (definition === undefined)
          throw new RangeError(
            "La définition d'une unité de garnison n'existe pas.",
          );
        return {
          id: `battle-unit-${unit.id}`,
          sourceId: unit.id,
          playerId: unit.ownerPlayerId,
          name: unit.name ?? definition.name,
          typeId: unit.typeId,
          battleSlot: unit.battleSlot,
          typeName: definition.name,
          tags: [...(definition.tags ?? [])],
          quantity: unit.quantity,
          maxQuantity: unit.maxQuantity,
          soldierHealth: [...unit.soldierHealth],
          healthPerSoldier: definition.stats.healthPerSoldier,
          combatHealthThreshold: definition.stats.combatHealthThreshold,
          damageMin: definition.stats.damageMin,
          damageMax: definition.stats.damageMax,
          attackIntervalMs: definition.stats.attackIntervalMs,
          attack: definition.stats.attack + (location.locationAttackBonus ?? 0),
          defense: definition.stats.defense + (location.defenseBonus ?? 0),
          speed: definition.stats.speed,
          range: definition.stats.range,
          morale: Math.max(0, (definition.stats.morale ?? 5) + unitExpeditionMorale(unit,at)),
          behavior: definition.behavior ?? "advance",
          retreat: { ...definition.retreat },
          symbol: (definition.name ?? unit.typeId ?? "U")
            .slice(0, 1)
            .toUpperCase(),
        };
      });
  }

  #createUnitSnapshots(
    game,
    heroId,
    modifiers = this.#createModifiers(game, heroId, "casual"),
    defendingLocation = null,
  ) {
    const hero = game.getHero(heroId);
    return hero.army.units
      .filter((unit) => unit.combatantCount > 0)
      .map((unit, index) => {
        const definition = this.unitDefinitions.get(unit.typeId);
        if (definition === undefined)
          throw new RangeError(
            "La définition d'une unité engagée n'existe pas.",
          );
        const retreat = definition.retreat ?? definition.stats;
        return {
          id: `battle-unit-${unit.id}`,
          sourceId: unit.id,
          heroSourceId: hero.id,
          playerId: unit.ownerPlayerId,
          name: unit.name ?? definition.name,
          typeId: unit.typeId,
          battleSlot: unit.battleSlot,
          typeName: definition.name,
          tags: [...(definition.tags ?? [])],
          quantity: unit.quantity,
          maxQuantity: unit.maxQuantity,
          soldierHealth: [...unit.soldierHealth],
          healthPerSoldier: definition.stats.healthPerSoldier,
          combatHealthThreshold: definition.stats.combatHealthThreshold,
          damageMin: definition.stats.damageMin,
          damageMax: definition.stats.damageMax,
          attackIntervalMs: definition.stats.attackIntervalMs,
          attack: Math.max(
            0,
            definition.stats.attack +
              modifiers.attackBonus +
              (defendingLocation?.locationAttackBonus ?? 0),
          ),
          defense: Math.max(
            0,
            definition.stats.defense +
              modifiers.defenseBonus +
              (defendingLocation?.defenseBonus ?? 0),
          ),
          speed: Math.max(
            0.1,
            definition.stats.speed * modifiers.speedMultiplier,
          ),
          range: definition.stats.range,
          morale: Math.max(
            0,
            (definition.stats.morale ?? 5) + modifiers.moraleBonus + unitExpeditionMorale(unit,game.now()),
          ),
          specialPowerIds: [
            ...new Set([
              ...(definition.abilities ?? []),
              ...unit.specialPowerIds,
            ]),
          ],
          modifiers: structuredClone(modifiers),
          behavior: definition.behavior ?? "advance",
          retreat: {
            ...retreat,
            speed: Math.max(0.1, retreat.speed * modifiers.speedMultiplier),
          },
          symbol: (definition.name ?? unit.typeId ?? "U")
            .slice(0, 1)
            .toUpperCase(),
        };
      });
  }
}
