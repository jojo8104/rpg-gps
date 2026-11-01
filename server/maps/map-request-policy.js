/** Limites partagées par toutes les zones du service, sans attente ni relance automatique. */
export class MapRequestPolicy {
  constructor(now = Date.now) {
    this.now = now;
    this.failures = 0;
    this.nextAttemptAt = 0;
  }
  check() {
    const seconds = Math.ceil((this.nextAttemptAt - this.now()) / 1000);
    if (seconds > 0)
      throw Object.assign(
        new Error(
          `Extraction OSM en pause. Réessayez dans ${seconds} secondes.`,
        ),
        {
          status: 429,
          retryAfter: seconds,
        },
      );
  }
  failed(error) {
    this.failures = Math.min(this.failures + 1, 6);
    const delay = Math.max(
      30000 * 2 ** (this.failures - 1),
      error.retryAfterMs || 0,
    );
    this.nextAttemptAt = this.now() + delay;
    error.retryAfter = Math.ceil(delay / 1000);
  }
  succeeded() {
    this.failures = 0;
    this.nextAttemptAt = 0;
  }
}

export function retryAfterMilliseconds(value, now) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}
