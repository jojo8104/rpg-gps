import { distanceMeters } from "./geo.js";

/** Gère l'immobilité GPS et la dissimulation sans dépendre de l'interface. */
export class HeroConcealmentService {
  constructor({
    stationaryDurationMs = 20_000,
    movementThresholdMeters = 5,
    concealedSignatureMultiplier = 0.6,
    distanceFn = distanceMeters,
  } = {}) {
    this.stationaryDurationMs = stationaryDurationMs;
    this.movementThresholdMeters = movementThresholdMeters;
    this.concealedSignatureMultiplier = concealedSignatureMultiplier;
    this.distanceFn = distanceFn;
    this.stationarySince = null;
    this.lastPosition = null;
    this.concealed = false;
  }

  update({ position, accuracy = 0, at = Date.now() }) {
    if (!this.lastPosition) {
      this.lastPosition = { ...position, accuracy };
      this.stationarySince = at;
      return { moved: false, concealmentCancelled: false };
    }
    const rawDistance = this.distanceFn(this.lastPosition, position);
    const uncertainty = Math.min(
      accuracy || 0,
      this.lastPosition.accuracy || 0,
    );
    const moved =
      Math.max(0, rawDistance - uncertainty) > this.movementThresholdMeters;
    const concealmentCancelled = moved && this.concealed;
    if (moved) {
      this.stationarySince = at;
      this.concealed = false;
    }
    this.lastPosition = { ...position, accuracy };
    return { moved, concealmentCancelled };
  }

  canConceal(at = Date.now()) {
    return (
      !this.concealed &&
      this.stationarySince !== null &&
      at - this.stationarySince >= this.stationaryDurationMs
    );
  }
  preparationMs(at = Date.now()) {
    return this.stationarySince === null
      ? 0
      : Math.max(0, at - this.stationarySince);
  }
  confirm(at = Date.now()) {
    if (!this.canConceal(at)) return false;
    this.concealed = true;
    return true;
  }
  get signatureMultiplier() {
    return this.concealed ? this.concealedSignatureMultiplier : 1;
  }
}
