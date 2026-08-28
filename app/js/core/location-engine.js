import { distanceMeters, validatePosition } from "./geo.js";

export const LOCATION_STATES = Object.freeze({
  OUTSIDE: "OUTSIDE",
  ENTERED: "ENTERED",
  INSIDE: "INSIDE",
  EXITED: "EXITED",
});

/** Transforme des positions en événements de zone, sans règle de scénario. */
export class LocationEngine {
  constructor({
    locations = [],
    cooldownMs = 0,
    exitMarginMeters = 8,
    now = () => Date.now(),
    distanceFn = distanceMeters,
    validatePositionFn = validatePosition,
  } = {}) {
    this.locations = locations;
    this.cooldownMs = nonNegative(cooldownMs, "Le cooldown");
    this.exitMarginMeters = nonNegative(exitMarginMeters, "La marge de sortie");
    this.now = now;
    this.distanceFn = distanceFn;
    this.validatePositionFn = validatePositionFn;
    this.presences = new Map();
  }

  update({ actorId, position }) {
    if (typeof actorId !== "string" || actorId === "")
      throw new TypeError("L'acteur est requis.");
    this.validatePositionFn(position);
    const events = [];
    for (const location of this.locations) {
      const key = `${actorId}:${location.id}`;
      const previous = this.presences.get(key) ?? {
        state: LOCATION_STATES.OUTSIDE,
        lastExitedAt: -Infinity,
      };
      const radius = location.interactionRadius;
      const distance = this.distanceFn(position, location.position);
      const wasInside =
        previous.state === LOCATION_STATES.ENTERED ||
        previous.state === LOCATION_STATES.INSIDE;
      const isInside =
        distance <= radius ||
        (wasInside && distance <= radius + this.exitMarginMeters);
      if (isInside && !wasInside) {
        const allowed = this.now() - previous.lastExitedAt >= this.cooldownMs;
        if (allowed) {
          const enteredAt = this.now();
          this.presences.set(key, {
            ...previous,
            state: LOCATION_STATES.ENTERED,
          });
          events.push({
            type: "LocationEntered",
            actorId,
            locationId: location.id,
            at: enteredAt,
          });
        } else {
          // Keep the actor outside until the cooldown expires. Setting INSIDE here
          // would swallow all later entry events while the actor remains nearby.
          this.presences.set(key, previous);
        }
      } else if (isInside)
        this.presences.set(key, { ...previous, state: LOCATION_STATES.INSIDE });
      else if (wasInside) {
        this.presences.set(key, {
          state: LOCATION_STATES.EXITED,
          lastExitedAt: this.now(),
        });
        events.push({
          type: "LocationExited",
          actorId,
          locationId: location.id,
          at: this.now(),
        });
      } else
        this.presences.set(key, {
          ...previous,
          state: LOCATION_STATES.OUTSIDE,
        });
    }
    return events;
  }

  getState(actorId, locationId) {
    return (
      this.presences.get(`${actorId}:${locationId}`)?.state ??
      LOCATION_STATES.OUTSIDE
    );
  }
}
function nonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${label} doit être positif ou nul.`);
  return value;
}
