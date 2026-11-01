export function unitExpeditionMorale(unit, now) {
  const count = unit.quantity;
  if (!count) return 0;
  return (unit.expeditionMorale ?? [])
    .filter((e) => e.expiresAt > now)
    .reduce(
      (sum, e) => sum + (e.delta * Math.min(count, e.quantity)) / count,
      0,
    );
}
export function applyExpeditionMorale(
  hero,
  participants,
  delta,
  at,
  duration,
  eventId,
) {
  if (hero) {
    const effects = (hero.classFeatureState.expeditionMorale ??= []);
    effects.push({ delta, expiresAt: at + duration, eventId });
    hero.temporaryModifiers.morale += delta;
    hero.recordMoraleFactor("battle", delta, `expedition:${eventId}`);
  }
  for (const {
    unit,
    indices,
    survivingCount = indices.length,
  } of participants) {
    if (!survivingCount) continue;
    unit.expeditionMorale.push({
      delta,
      quantity: survivingCount,
      expiresAt: at + duration,
      eventId,
    });
  }
}
export function expireExpeditionMorale(game, at) {
  for (const hero of game.heroes) {
    const effects = hero.classFeatureState.expeditionMorale;
    if (!effects) continue;
    const expired = effects.filter((e) => e.expiresAt <= at);
    for (const effect of expired)
      hero.temporaryModifiers.morale -= effect.delta;
    hero.classFeatureState.expeditionMorale = effects.filter(
      (e) => e.expiresAt > at,
    );
    const reasons = new Set(expired.map((e) => `expedition:${e.eventId}`));
    hero.moraleHistory = hero.moraleHistory.filter(
      (e) => !reasons.has(e.reason),
    );
  }
  for (const army of [
    ...game.heroes.map((h) => h.army),
    ...game.locations.map((l) => l.garrison),
    ...game.autonomousGroups.map((g) => g.army),
  ])
    for (const unit of army.units)
      unit.expeditionMorale = unit.expeditionMorale.filter(
        (e) => e.expiresAt > at,
      );
}
