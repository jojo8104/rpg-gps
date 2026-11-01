/** Santé individuelle sérialisable, partagée par les duels et leur résultat. */
export function refreshTroopHealth(troop) {
  troop.count = troop.soldierHealth.filter(
    (health) => health > troop.combatHealthThreshold,
  ).length;
  troop.woundedCount = troop.soldierHealth.filter(
    (health) => health > 0 && health <= troop.combatHealthThreshold,
  ).length;
  troop.deadCount =
    (troop.priorDeadCount ?? 0) +
    troop.soldierHealth.filter((health) => health === 0).length;
}

/** Initialise les PV individuels des nouvelles cartes de combat. */
export function ensureTroopHealth(troop, source = {}) {
  // Les cartes adverses projetées ne contiennent aucun effectif ni PV.
  if (!Number.isInteger(troop.count) && !Array.isArray(troop.soldierHealth))
    return;
  troop.healthPerSoldier ??= source.healthPerSoldier ?? 10;
  troop.combatHealthThreshold ??=
    source.combatHealthThreshold ?? Math.min(4, troop.healthPerSoldier - 1);
  troop.damageCursor ??= 0;
  if (!Array.isArray(troop.soldierHealth)) {
    const sourceHealth = source.soldierHealth ?? [
      ...Array(troop.count).fill(troop.healthPerSoldier),
      ...Array(troop.woundedCount ?? 0).fill(troop.combatHealthThreshold),
    ];
    let retained = 0;
    troop.soldierHealth = sourceHealth.map((health) => {
      if (health <= troop.combatHealthThreshold) return health;
      if (retained++ >= troop.count) return 0;
      return troop.tacticalState === "INCAPACITATED"
        ? troop.combatHealthThreshold
        : health;
    });
    troop.priorDeadCount = Math.max(
      0,
      (source.deadCount ?? troop.deadCount ?? 0) -
        sourceHealth.filter((health) => health === 0).length,
    );
  }
  refreshTroopHealth(troop);
}

/** Répartit les dégâts entre soldats avec report du surplus. */
export function applyTroopDamage(troop, packets) {
  let applied = 0;
  for (const packet of packets) {
    let remaining = Math.max(0, packet);
    while (remaining > 0) {
      const living = troop.soldierHealth
        .map((health, index) => ({ health, index }))
        .filter(({ health }) => health > 0);
      if (!living.length) break;
      const chosen = living[troop.damageCursor % living.length];
      const dealt = Math.min(chosen.health, remaining);
      troop.soldierHealth[chosen.index] -= dealt;
      remaining -= dealt;
      applied += dealt;
      troop.damageCursor = (troop.damageCursor + 1) % living.length;
    }
  }
  refreshTroopHealth(troop);
  return applied;
}
