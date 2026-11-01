/** Transfère un résultat de duel terminé vers la bataille persistante du jeu. */
export function applyDuelOutcome({ battle, state }) {
  if (state?.phase !== "FINISHED" || state.id !== `${battle.id}-duel`)
    throw new Error("Résultat duel invalide pour cette bataille.");
  if (battle.status === "finished")
    throw new Error("Cette bataille est déjà terminée.");
  const teams = new Map(battle.teams.map((team) => [team.id, team]));
  if (
    state.players.length !== battle.teams.length ||
    state.players.some((player) => !teams.has(player.id)) ||
    ![null, ...teams.keys()].includes(state.winnerId)
  )
    throw new Error("Les camps du résultat duel ne correspondent pas.");
  const troops = new Map(state.troops.map((troop) => [troop.id, troop]));
  const battleTroops = battle.teams.flatMap((team) => team.units);
  if (
    troops.size !== state.troops.length ||
    battleTroops.some(
      (troop) => (troop.combatantCount ?? 0) > 0 && !troops.has(troop.id),
    )
  )
    throw new Error("Les troupes du résultat duel sont incomplètes.");

  for (const team of battle.teams) {
    const resultPlayer = state.players.find((player) => player.id === team.id);
    const hero = team.heroes.find((item) => item.id === resultPlayer.hero.id);
    if (!hero) throw new Error("Héros de bataille introuvable.");
    hero.health = Math.max(
      0,
      Math.min(hero.maxHealth, resultPlayer.hero.health),
    );
    hero.state = hero.health === 0 ? "ghost" : "active";
    for (const snapshot of team.units) {
      const troop = troops.get(snapshot.id);
      if (!troop) continue;
      if (
        troop.ownerId !== team.id ||
        !Number.isInteger(troop.count) ||
        troop.count < 0
      )
        throw new Error("Effectif duel invalide.");
      if (state.mode === "DUEL" && Array.isArray(troop.soldierHealth)) {
        if (
          troop.soldierHealth.some(
            (health) =>
              !Number.isFinite(health) ||
              health < 0 ||
              health > snapshot.healthPerSoldier,
          )
        )
          throw new Error("PV individuels du duel invalides.");
        snapshot.soldierHealth = [...troop.soldierHealth];
        snapshot.combatantCount = snapshot.soldierHealth.filter(
          (health) => health > snapshot.combatHealthThreshold,
        ).length;
        snapshot.woundedCount = snapshot.soldierHealth.filter(
          (health) => health > 0 && health <= snapshot.combatHealthThreshold,
        ).length;
        snapshot.deadCount = troop.deadCount;
        snapshot.quantity = snapshot.combatantCount + snapshot.woundedCount;
      }
      snapshot.morale = troop.morale;
      snapshot.state =
        snapshot.quantity === 0
          ? "defeated"
          : troop.tacticalState === "ROUTED"
            ? state.winnerId === team.id
              ? "fled"
              : "deserted"
            : troop.tacticalState === "INCAPACITATED"
              ? "wounded"
              : troop.tacticalState === "WITHDRAWING"
                ? "retreated"
                : "active";
    }
  }
  battle.status = "finished";
  battle.winnerTeamId = state.winnerId;
  battle.finishedAt = battle.state.now();
  battle.state.eventLog.push({
    type: "battle_duel_finished",
    round: state.round,
    winnerTeamId: state.winnerId,
  });
}
