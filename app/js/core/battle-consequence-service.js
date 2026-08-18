import { RogueArmy } from "./rogue-army.js";
import { Unit } from "./unit.js";

/** Résout de façon déterministe les conséquences persistantes d'une bataille terminée. */
export class BattleConsequenceService {
  resolve({ game, battle, idGenerator }) {
    if (battle.status !== "finished") throw new Error("La bataille doit être terminée.");
    const report = { battleId: battle.id, winnerTeamId: battle.winnerTeamId, survivors: [], losses: [], prisoners: [], deserters: [], loot: [], rogueArmyIds: [] };
    battle.teams.forEach((team) => team.units.forEach((snapshot) => this.#resolveUnit({ game, battle, snapshot, report, idGenerator })));
    game.battleReports.push(report);
    return report;
  }

  #resolveUnit({ game, battle, snapshot, report, idGenerator }) {
    const unit = game.findUnit(snapshot.sourceId);
    if (unit === null) return;
    if (snapshot.state === "defeated" || snapshot.quantity === 0) {
      this.#removeUnitFromGame(game, unit.id);
      report.losses.push({ unitId: unit.id, name: unit.name, typeId: unit.typeId, reason: "defeated" });
      return;
    }
    if (snapshot.state === "deserted") {
      this.#removeUnitFromGame(game, unit.id);
      const rogueArmy = new RogueArmy({
        id: idGenerator("rogue-army"), position: battle.engagementContext?.center ?? { latitude: 0, longitude: 0 },
        army: { units: [new Unit({ ...unit.toJSON(), id: idGenerator("rogue-unit"), ownerPlayerId: "rogue", state: "active" })] },
        behavior: "roaming", morale: snapshot.morale ?? 3, history: [{ type: "deserted_from_battle", battleId: battle.id }],
      });
      game.rogueArmies.push(rogueArmy);
      report.deserters.push({ unitId: unit.id, name: unit.name, typeId: unit.typeId, rogueArmyId: rogueArmy.id });
      report.rogueArmyIds.push(rogueArmy.id);
      return;
    }
    if (snapshot.state === "captured") {
      this.#removeUnitFromGame(game, unit.id);
      report.prisoners.push({ unitId: unit.id, name: unit.name, typeId: unit.typeId, ownerPlayerId: unit.ownerPlayerId, capturedByTeamId: battle.winnerTeamId });
      return;
    }
    unit.quantity = snapshot.quantity;
    unit.state = "active";
    const damageExperience = battle.eventLog.filter((event) => event.attackerId === snapshot.id).reduce((total, event) => total + (event.damage ?? 0), 0);
    const experienceGained = Math.max(1, Math.round(damageExperience)) + 10 + (battle.getTeamForEntity(snapshot.id)?.id === battle.winnerTeamId ? 20 : 0);
    const previousRank = unit.rank; unit.addExperience(experienceGained);
    report.survivors.push({ unitId: unit.id, name: unit.name, typeId: unit.typeId, quantity: unit.quantity, returnedFrom: snapshot.state, experienceGained, previousRank, rank: unit.rank });
  }

  #removeUnitFromGame(game, unitId) {
    for (const hero of game.heroes) if (hero.army.removeUnit(unitId) !== null) return;
    for (const location of game.locations) if (location.garrison.removeUnit(unitId) !== null) return;
  }
}
