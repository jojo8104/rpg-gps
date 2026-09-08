export function distanceGeneratedLocationIds({
  bindings = [],
  placements = {},
} = {}) {
  return new Set(
    bindings
      .filter(
        (binding) =>
          placements[binding.locationSlotId]?.strategy === "distance",
      )
      .map((binding) => binding.locationId),
  );
}

export function initiallyPlacedScenarioLocationIds({
  bindings = [],
  placements = {},
} = {}) {
  return bindings
    .filter(
      (binding) =>
        placements[binding.locationSlotId]?.status === "placed" &&
        placements[binding.locationSlotId]?.strategy !== "distance",
    )
    .map((binding) => binding.locationId);
}
