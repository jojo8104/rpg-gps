import { distanceMeters, validatePosition } from "./geo.js";

/** Convertit un trajet GPS fiable en expérience, sans dépendre du navigateur ou du DOM. */
export class HeroTravelExperienceService {
  constructor({
    maximumAccuracyMeters = 50,
    maximumSegmentMeters = 250,
    distanceFn = distanceMeters,
  } = {}) {
    if (!Number.isFinite(maximumAccuracyMeters) || maximumAccuracyMeters <= 0)
      throw new RangeError("La précision GPS maximale doit être positive.");
    if (!Number.isFinite(maximumSegmentMeters) || maximumSegmentMeters <= 0)
      throw new RangeError(
        "La longueur maximale d'un segment doit être positive.",
      );
    this.maximumAccuracyMeters = maximumAccuracyMeters;
    this.maximumSegmentMeters = maximumSegmentMeters;
    this.distanceFn = distanceFn;
  }

  record(hero, position, { accuracy = position?.accuracy ?? 0 } = {}) {
    validatePosition(position);
    if (!Number.isFinite(accuracy) || accuracy < 0)
      throw new RangeError("La précision GPS doit être positive ou nulle.");
    const state = hero.travelProgress;
    const current = {
      latitude: position.latitude,
      longitude: position.longitude,
    };
    if (accuracy > this.maximumAccuracyMeters)
      return {
        accepted: false,
        reason: "insufficient_accuracy",
        distanceMeters: 0,
        experienceGained: 0,
      };
    if (state.lastPosition === null) {
      state.lastPosition = current;
      return {
        accepted: true,
        initialized: true,
        distanceMeters: 0,
        experienceGained: 0,
      };
    }
    const segment = this.distanceFn(state.lastPosition, current);
    state.lastPosition = current;
    if (segment > this.maximumSegmentMeters)
      return {
        accepted: false,
        reason: "gps_jump",
        distanceMeters: 0,
        experienceGained: 0,
      };
    const previousTotal = state.totalDistanceMeters;
    state.totalDistanceMeters += segment;
    const accumulated = state.remainderMeters + segment;
    const completed100MeterSteps = Math.floor(accumulated / 100);
    const completedKilometers =
      Math.floor(state.totalDistanceMeters / 1_000) -
      Math.floor(previousTotal / 1_000);
    state.remainderMeters = accumulated % 100;
    // Les anciens mètres déjà récompensés ne sont pas rejoués lors d’une reprise.
    const completed500MeterSteps =
      Math.floor(state.totalDistanceMeters / 500) -
      Math.floor(previousTotal / 500);
    const experienceGained = completed500MeterSteps * 100;
    return {
      accepted: true,
      distanceMeters: segment,
      totalDistanceMeters: state.totalDistanceMeters,
      remainderMeters: state.remainderMeters,
      completed500MeterSteps,
      completed100MeterSteps,
      completedKilometers,
      experienceGained,
    };
  }
}
