import { BattleEngine } from "./battle-engine.js";
import { HeroArmyModifier } from "./hero-army-modifier.js";

/** Pont entre les entités persistantes du jeu et leurs instantanés tactiques. */
export class BattleService {
  constructor(unitDefinitions) {
    this.unitDefinitions = unitDefinitions;
  }

  createBattle({ id, game, teamParticipants, loot = [], config, now, moraleMode = "casual", moraleContextByHeroId = {} }) {
    if (!Array.isArray(teamParticipants) || teamParticipants.length < 2) throw new RangeError("La bataille requiert au moins deux équipes.");
    const teams = teamParticipants.map((team) => {
      const location = team.locationId ? game.getLocation(team.locationId) : null;
      const modifiers = new Map(team.heroIds.map((heroId) => [heroId, this.#createModifiers(game, heroId, moraleMode, moraleContextByHeroId[heroId])]));
      const heroes = team.heroIds.map((heroId) => this.#createHeroSnapshot(game, heroId));
      if (heroes.length === 0 && location !== null) heroes.push(this.#createLocationCommanderSnapshot(location));
      return { id: team.id, heroes, units: [...team.heroIds.flatMap((heroId) => this.#createUnitSnapshots(game, heroId, modifiers.get(heroId))), ...this.#createGarrisonUnitSnapshots(location)] };
    });
    return new BattleEngine({ id, teams, loot, config, now });
  }

  applyOutcome({ game, battle }) {
    if (battle.status !== "finished") throw new Error("La bataille doit être terminée avant d'appliquer son résultat.");
    battle.teams.forEach((team) => team.heroes.forEach((snapshot) => {
      const hero = game.getHero(snapshot.sourceId);
      if (hero !== null) hero.setBattleState({ health: snapshot.health, state: snapshot.state });
    }));
    battle.teams.forEach((team) => team.units.forEach((snapshot) => {
      const unit = game.findUnit(snapshot.sourceId);
      if (unit !== null) {
        unit.applyBattleHealth(snapshot.soldierHealth);
        if (snapshot.state !== "fled" && snapshot.state !== "retreated") unit.state = snapshot.state;
      }
    }));
    return { winnerTeamId: battle.winnerTeamId, battleId: battle.id };
  }

  createReinforcementSnapshots({ game, heroId }) {
    const hero = game.getHero(heroId);
    if (hero === null) throw new RangeError("Le héros de renfort n'existe pas.");
    const heroSnapshot = this.#createHeroSnapshot(game, heroId);
    const unitSnapshots = this.#createUnitSnapshots(game, heroId);
    return {
      heroes: [{ ...heroSnapshot, id: `battle-hero-${hero.id}` }], units: unitSnapshots,
    };
  }

  #createHeroSnapshot(game, heroId) {
    const hero = game.getHero(heroId);
    if (hero === null) throw new RangeError("Le héros de bataille n'existe pas.");
    return { id: `battle-hero-${hero.id}`, sourceId: hero.id, playerId: hero.playerId, name: hero.name, maxHealth: hero.maxHealth, health: hero.health, attack: 10 + hero.level * 2, defense: 5 + hero.level, speed: 2, command: hero.maxCommandPoints, maxCommandPoints: hero.maxCommandPoints, commandPoints: hero.commandPoints, skillIds: [...hero.skillIds], specialPowerIds: [...hero.specialPowerIds] };
  }

  #createModifiers(game, heroId, moraleMode, context = {}) {
    const hero = game.getHero(heroId);
    return HeroArmyModifier.calculate({ hero, units: hero.army.units, unitDefinitions: this.unitDefinitions, moraleMode, context });
  }

  #createLocationCommanderSnapshot(location) {
    const playerId = location.controllerId ?? location.ownerId ?? `neutral-${location.id}`;
    return { id: `battle-location-${location.id}`, sourceId: `location-${location.id}`, playerId, maxHealth: 20 + location.level * 5, health: 20 + location.level * 5, attack: 8 + location.level * 2, defense: 5 + location.level, speed: 1, command: 2 + location.level };
  }

  #createGarrisonUnitSnapshots(location) {
    if (location === null) return [];
    return location.garrison.units.filter((unit) => unit.combatantCount > 0).map((unit) => {
      const definition = this.unitDefinitions.get(unit.typeId);
      if (definition === undefined) throw new RangeError("La définition d'une unité de garnison n'existe pas.");
      return { id: `battle-unit-${unit.id}`, sourceId: unit.id, playerId: unit.ownerPlayerId, name: unit.name ?? definition.name, typeId: unit.typeId, typeName: definition.name, tags: [...(definition.tags ?? [])], quantity: unit.quantity, maxQuantity: unit.maxQuantity, soldierHealth: [...unit.soldierHealth], healthPerSoldier: definition.stats.healthPerSoldier, combatHealthThreshold: definition.stats.combatHealthThreshold, damageMin: definition.stats.damageMin, damageMax: definition.stats.damageMax, attackIntervalMs: definition.stats.attackIntervalMs, attack: definition.stats.attack, defense: definition.stats.defense, speed: definition.stats.speed, range: definition.stats.range, morale: definition.stats.morale, behavior: definition.behavior ?? "advance", retreat: { ...definition.retreat }, symbol: (definition.name ?? unit.typeId ?? "U").slice(0, 1).toUpperCase() };
    });
  }

  #createUnitSnapshots(game, heroId, modifiers = this.#createModifiers(game, heroId, "casual")) {
    const hero = game.getHero(heroId);
    return hero.army.units.filter((unit) => unit.combatantCount > 0).map((unit, index) => {
      const definition = this.unitDefinitions.get(unit.typeId);
      if (definition === undefined) throw new RangeError("La définition d'une unité engagée n'existe pas.");
      const retreat = definition.retreat ?? definition.stats;
      return { id: `battle-unit-${unit.id}`, sourceId: unit.id, playerId: unit.ownerPlayerId, name: unit.name ?? definition.name, typeId: unit.typeId, typeName: definition.name, tags: [...(definition.tags ?? [])], quantity: unit.quantity, maxQuantity: unit.maxQuantity, soldierHealth: [...unit.soldierHealth], healthPerSoldier: definition.stats.healthPerSoldier, combatHealthThreshold: definition.stats.combatHealthThreshold, damageMin: definition.stats.damageMin, damageMax: definition.stats.damageMax, attackIntervalMs: definition.stats.attackIntervalMs, attack: Math.max(0, definition.stats.attack + modifiers.attackBonus), defense: Math.max(0, definition.stats.defense + modifiers.defenseBonus), speed: Math.max(0.1, definition.stats.speed * modifiers.speedMultiplier), range: definition.stats.range, morale: Math.max(0, (definition.stats.morale ?? 5) + modifiers.moraleBonus), specialPowerIds: [...new Set([...(definition.abilities ?? []), ...unit.specialPowerIds])], modifiers: structuredClone(modifiers), behavior: definition.behavior ?? "advance", retreat: { ...retreat, speed: Math.max(0.1, retreat.speed * modifiers.speedMultiplier) }, symbol: (definition.name ?? unit.typeId ?? "U").slice(0, 1).toUpperCase() };
    });
  }
}
