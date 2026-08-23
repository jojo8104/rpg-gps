import { AutonomousGroup } from "./autonomous-group.js";
import { Unit } from "./unit.js";

/** Résout de façon déterministe les conséquences persistantes d'une bataille terminée. */
export class BattleConsequenceService {
  resolve({ game, battle, idGenerator }) {
    if (battle.status !== "finished") throw new Error("La bataille doit être terminée.");
    const report = { battleId: battle.id, winnerTeamId: battle.winnerTeamId, survivors: [], losses: [], prisoners: [], deserters: [], loot: [], autonomousGroupIds: [] };
    const ghostHeroIds = new Set(battle.teams.flatMap((team) => team.heroes.filter((hero) => hero.state === "ghost" || hero.health === 0).map((hero) => hero.sourceId)));
    battle.teams.forEach((team) => team.units.forEach((snapshot) => this.#resolveUnit({ game, battle, snapshot, report, idGenerator, ghostHeroIds })));
    game.battleReports.push(report);
    return report;
  }

  #resolveUnit({ game, battle, snapshot, report, idGenerator, ghostHeroIds }) {
    const unit = game.findUnit(snapshot.sourceId);
    if (unit === null) return;
    if (snapshot.state === "defeated" || snapshot.quantity === 0) {
      this.#removeUnitFromGame(game, unit.id);
      report.losses.push({ unitId: unit.id, name: unit.name, typeId: unit.typeId, reason: "defeated" });
      return;
    }
    if (snapshot.state === "deserted") {
      this.#removeUnitFromGame(game, unit.id);
      const groupId = idGenerator("autonomous-group");
      const rogueArmy = new AutonomousGroup({
        id: groupId, type: "rogue", owner: { kind: "independent", id: groupId },
        position: battle.engagementContext?.center ?? { latitude: 0, longitude: 0 },
        army: { units: [new Unit({ ...unit.toJSON(), id: idGenerator("rogue-unit"), ownerPlayerId: "rogue", state: "active" })] },
        behavior: "roaming", mission: { kind: "roam" }, morale: snapshot.morale ?? 3,
        history: [{ type: "deserted_from_battle", battleId: battle.id }],
      });
      game.addAutonomousGroup(rogueArmy);
      report.deserters.push({ unitId: unit.id, name: unit.name, typeId: unit.typeId, rogueArmyId: rogueArmy.id });
      report.autonomousGroupIds.push(rogueArmy.id);
      return;
    }
    if (snapshot.state === "captured") {
      this.#removeUnitFromGame(game, unit.id);
      report.prisoners.push({ unitId: unit.id, name: unit.name, typeId: unit.typeId, ownerPlayerId: unit.ownerPlayerId, capturedByTeamId: battle.winnerTeamId });
      return;
    }
    if (snapshot.heroSourceId !== null && ghostHeroIds.has(snapshot.heroSourceId)) {
      this.#removeUnitFromGame(game, unit.id);
      report.losses.push({ unitId: unit.id, name: unit.name, typeId: unit.typeId, reason: "hero_became_ghost", heroId: snapshot.heroSourceId });
      return;
    }
    unit.applyBattleHealth(snapshot.soldierHealth);
    const damageExperience = battle.eventLog.filter((event) => event.attackerId === snapshot.id).reduce((total, event) => total + (event.damage ?? 0), 0);
    const experienceGained = Math.max(1, Math.round(damageExperience)) + 10 + (battle.getTeamForEntity(snapshot.id)?.id === battle.winnerTeamId ? 20 : 0);
    const previousRank = unit.rank; unit.addExperience(experienceGained);
    report.survivors.push({ unitId: unit.id, name: unit.name, typeId: unit.typeId, quantity: unit.quantity, combatants: unit.combatantCount, wounded: unit.woundedCount, dead: snapshot.deadCount ?? 0, returnedFrom: snapshot.state, experienceGained, previousRank, rank: unit.rank, promotionAvailable: unit.canPromote });
  }

  #removeUnitFromGame(game, unitId) {
    for (const hero of game.heroes) if (hero.army.removeUnit(unitId) !== null) return;
    for (const location of game.locations) if (location.garrison.removeUnit(unitId) !== null) return;
    for (const group of game.autonomousGroups) if (group.army.removeUnit(unitId) !== null) return;
  }
}
