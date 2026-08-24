/** Échéances absolues sérialisables, indépendantes de la fréquence des mises à jour. */
export class DeadlineService {
  create({ id, durationMs, startedAt }) {
    if (typeof id !== "string" || !id.trim()) throw new TypeError("L'identifiant de l'échéance est requis.");
    if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(startedAt)) throw new RangeError("La durée et le départ de l'échéance sont invalides.");
    return { id: id.trim(), startedAt, expiresAt: startedAt + durationMs };
  }

  evaluate(deadline, at) {
    if (!deadline || !Number.isFinite(deadline.expiresAt) || !Number.isFinite(at)) throw new TypeError("L'échéance ou l'heure est invalide.");
    const remainingMs = Math.max(0, deadline.expiresAt - at);
    return { expired: remainingMs === 0, remainingMs, progress: Math.max(0, Math.min(1, (at - deadline.startedAt) / (deadline.expiresAt - deadline.startedAt))) };
  }
}
