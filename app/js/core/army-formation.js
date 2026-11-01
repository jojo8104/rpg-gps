/** Formation persistante, validée exclusivement par le moteur serveur. */
export function setArmyFormation(game, { heroId, unitId, slot = null }) {
  const hero = game.getHero(heroId);
  if (!hero) throw new Error("Héros introuvable.");
  if (
    game.battles.some(
      (battle) =>
        battle.status === "active" &&
        battle.teams.some((team) =>
          team.heroes.some((entry) => entry.sourceId === heroId),
        ),
    )
  )
    throw new Error("La formation ne peut pas changer pendant un combat.");
  const unit = hero.army.getUnit(unitId);
  if (!unit) throw new Error("Cette troupe n’appartient pas à ce héros.");
  if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot > 2))
    throw new Error("Position de départ invalide.");
  if (slot !== null && unit.combatantCount <= 0)
    throw new Error("Cette troupe n’a aucun soldat apte.");
  if (
    slot !== null &&
    hero.army.units.some(
      (entry) => entry.id !== unitId && entry.battleSlot === slot,
    )
  )
    throw new Error(
      "Cette position est déjà occupée. Placez d’abord sa troupe en réserve.",
    );
  unit.battleSlot = slot;
  return { success: true, unitId, slot };
}
