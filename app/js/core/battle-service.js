import { BattleEngine } from "./battle-engine.js";

/** Pont entre les entités persistantes du jeu et leurs instantanés tactiques. */
export class BattleService {
  constructor(unitDefinitions) {
    this.unitDefinitions = unitDefinitions;
  }

  createBattle({ id, game, teamParticipants, loot = [], config, now }) {
    if (!Array.isArray(teamParticipants) || teamParticipants.length < 2) throw new RangeError("La bataille requiert au moins deux équipes.");
    const teams = teamParticipants.map((team) => ({
      id: team.id,
      heroes: team.heroIds.map((heroId) => this.#createHeroSnapshot(game, heroId)),
      units: team.heroIds.flatMap((heroId) => this.#createUnitSnapshots(game, heroId)),
    }));
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
        unit.quantity = snapshot.quantity;
        unit.state = snapshot.state === "fled" ? "active" : snapshot.state;
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
    return { id: `battle-hero-${hero.id}`, sourceId: hero.id, playerId: hero.playerId, maxHealth: hero.maxHealth, health: hero.health, attack: 10 + hero.level * 2, defense: 5 + hero.level, speed: 2, command: 2 + hero.level };
  }

  #createUnitSnapshots(game, heroId) {
    const hero = game.getHero(heroId);
    return hero.army.units.filter((unit) => unit.quantity > 0).map((unit, index) => {
      const definition = this.unitDefinitions.get(unit.typeId);
      if (definition === undefined) throw new RangeError("La définition d'une unité engagée n'existe pas.");
      return { id: `battle-unit-${unit.id}`, sourceId: unit.id, playerId: unit.ownerPlayerId, quantity: unit.quantity, maxQuantity: unit.maxQuantity, attack: definition.stats.attack, defense: definition.stats.defense, rangedAttack: definition.stats.ranged, speed: Math.max(1, definition.stats.mobility), range: definition.stats.ranged > 0 ? 3 : 1, morale: definition.stats.morale, behavior: definition.behavior ?? "advance", symbol: (definition.name ?? unit.typeId ?? "U").slice(0, 1).toUpperCase() };
    });
  }
}
