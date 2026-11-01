const amount = (actor, id) =>
  Math.floor(
    (actor.resources?.[id] ?? 0) +
      (actor.carriedLoot ?? actor.cargo ?? [])
        .filter((x) => x.itemId === id)
        .reduce((s, x) => s + x.quantity, 0),
  );
export function expeditionParticipants(game, mission) {
  const hero = mission.heroId ? game.getHero(mission.heroId) : null;
  const group = mission.groupId
    ? game.getAutonomousGroup(mission.groupId)
    : null;
  const actor = hero ?? group;
  if (!actor) return null;
  const troops = mission.preparation.volunteers
    .map((v) => {
      const unit = actor.army.units.find(
        (u) => u.id === (hero ? v.unitId : `${mission.id}-${v.unitId}`),
      );
      if (!unit || unit.state !== "active") return null;
      const indices = unit.soldierHealth
        .map((hp, i) => (hp > unit.combatHealthThreshold ? i : -1))
        .filter((i) => i >= 0)
        .slice(0, v.quantity);
      return indices.length ? { unit, indices } : null;
    })
    .filter(Boolean);
  const preparation = structuredClone(mission.preparation);
  preparation.npcIds = preparation.npcIds.filter((id) => amount(actor, id) > 0);
  for (const category of ["mounts", "equipment", "resources"])
    for (const id of Object.keys(preparation[category]))
      preparation[category][id] = Math.min(
        preparation[category][id],
        amount(actor, id),
      );
  preparation.volunteers = troops.map(({ unit, indices }) => ({
    unitId: unit.id,
    quantity: indices.length,
  }));
  return { hero, group, actor, troops, preparation };
}
/** Puissance dérivée des statistiques de combat et des seuls soldats sélectionnés. */
export function expeditionPower(game, participants) {
  const { hero, troops } = participants;
  const bonusAttack = hero?.finalStats.attack ?? 0,
    bonusDefense = hero?.finalStats.defense ?? 0;
  let power = hero ? bonusAttack + bonusDefense + hero.health : 0;
  for (const { unit, indices } of troops) {
    const definition = game.unitDefinitions.get(unit.typeId);
    if (!definition) throw new RangeError("Définition de troupe manquante.");
    power += indices.reduce(
      (sum, i) =>
        sum +
        Math.max(0, (definition.stats.attack ?? 0) + bonusAttack) +
        Math.max(0, (definition.stats.defense ?? 0) + bonusDefense) +
        unit.soldierHealth[i],
      0,
    );
  }
  return Math.round(power * 100) / 100;
}
