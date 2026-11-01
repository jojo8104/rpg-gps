/** Projection visuelle uniquement : ne calcule ni bonus ni règles d'équipement. */
export function equipmentDisplay(hero, intent) {
  if (
    !intent ||
    intent.heroId !== hero.id ||
    (intent.type === "equip" && !intent.itemId)
  )
    return { equipment: hero.equipment, carriedLoot: hero.carriedLoot };
  const equipment = { ...hero.equipment };
  let carriedLoot = (hero.carriedLoot ?? []).map((entry) => ({ ...entry }));
  if (intent.type === "equip") {
    // Une réponse officielle peut arriver avant la fin de la promesse.
    if (
      equipment[intent.slot] === intent.itemId &&
      !carriedLoot.some((entry) => entry.id === intent.packageId)
    )
      return { equipment, carriedLoot };
    const previous = equipment[intent.slot];
    carriedLoot = carriedLoot.filter((entry) => entry.id !== intent.packageId);
    if (previous)
      carriedLoot.push({
        id: `display-${intent.slot}`,
        itemId: previous,
        quantity: 1,
      });
    equipment[intent.slot] = intent.itemId;
  } else {
    const previous = equipment[intent.slot];
    if (previous)
      carriedLoot.push({
        id: `display-${intent.slot}`,
        itemId: previous,
        quantity: 1,
      });
    delete equipment[intent.slot];
  }
  return { equipment, carriedLoot };
}
