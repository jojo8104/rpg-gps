/** Vitesse moyenne d'une armée, pondérée par ses soldats encore vivants. */
export function armySpeed(units, speedFor = (unit) => unit.speed) {
  if (!Array.isArray(units)) throw new TypeError("Les unités de l'armée doivent être une liste.");
  const survivors = units.filter((unit) => unit.state !== "defeated" && (unit.quantity ?? 0) > 0);
  const soldiers = survivors.reduce((total, unit) => total + unit.quantity, 0);
  if (soldiers === 0) return 0;
  return survivors.reduce((total, unit) => total + speedFor(unit) * unit.quantity, 0) / soldiers;
}

/** Nombre de rounds d'attaques gratuites accordés au poursuivant. */
export function pursuitRounds(winnerSpeed, loserSpeed) {
  if (!Number.isFinite(winnerSpeed) || !Number.isFinite(loserSpeed) || winnerSpeed < 0 || loserSpeed < 0) throw new RangeError("Les vitesses d'armée doivent être positives ou nulles.");
  const difference = winnerSpeed - loserSpeed;
  if (difference > 2) return 2;
  if (difference > 0) return 1;
  return 0;
}
