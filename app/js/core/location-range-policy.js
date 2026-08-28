const DEFAULT_POLICY = Object.freeze({
  mode: "auto",
  interactionScale: 1,
  detectionScale: 1,
  minInteractionMeters: 10,
  maxInteractionMeters: 50,
  minDetectionMeters: 40,
  maxDetectionMeters: 200,
  typeOverrides: {},
});

/** Calcule les portées d'un lieu sans dépendre de l'interface ou du GPS. */
export class LocationRangePolicy {
  constructor(policy = {}) {
    this.policy = {
      ...DEFAULT_POLICY,
      ...policy,
      typeOverrides: structuredClone(policy.typeOverrides ?? {}),
    };
  }

  resolve(location, playArea = null) {
    const override = this.policy.typeOverrides[location.type] ?? {};
    const areaScale =
      this.policy.mode === "auto"
        ? scaleForArea(playArea?.getAreaSquareKilometers?.())
        : 1;
    const interaction =
      override.interactionRadius ?? location.interactionRadius;
    const detection = override.detectionRadius ?? location.detectionRadius;
    const interactionRadius = clamp(
      interaction * this.policy.interactionScale * areaScale,
      this.policy.minInteractionMeters,
      this.policy.maxInteractionMeters,
    );
    const detectionRadius = Math.max(
      interactionRadius,
      clamp(
        detection * this.policy.detectionScale * areaScale,
        this.policy.minDetectionMeters,
        this.policy.maxDetectionMeters,
      ),
    );
    return { interactionRadius, detectionRadius };
  }
}

function scaleForArea(areaSquareKilometers) {
  if (!Number.isFinite(areaSquareKilometers) || areaSquareKilometers > 16)
    return 1;
  if (areaSquareKilometers <= 0.25) return 0.65;
  if (areaSquareKilometers <= 1) return 0.8;
  if (areaSquareKilometers <= 4) return 1;
  return 1.15;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
