import { SetupPlacementService } from "./setup-placement-service.js";

/**
 * Remplace uniquement les coordonnées de catalogue incompatibles avec la
 * PlayArea. Le placement définitif reste ensuite géré par l'écran de setup.
 */
export function prepareScenarioLocationsForPlayArea({
  scenario,
  setup,
  bindings,
  locations,
  placementService = new SetupPlacementService(),
}) {
  const bindingBySlot = new Map(
    bindings.map((binding) => [binding.locationSlotId, binding.locationId]),
  );
  const fixedLocationIds = new Set(
    scenario.locationSlots
      .filter((slot) => {
        const override = setup.locationSetup.placements?.[slot.id];
        return (override?.strategy ?? slot.defaultPlacement?.strategy ?? "fixed") === "fixed";
      })
      .map((slot) => bindingBySlot.get(slot.id) ?? slot.id),
  );
  const prepared = locations.map((location) => structuredClone(location));
  const occupied = prepared
    .filter(
      (location) =>
        fixedLocationIds.has(location.id) &&
        setup.playArea.allowsPlacement(location.position),
    )
    .map((location) => location.position);

  for (const location of prepared) {
    if (
      !fixedLocationIds.has(location.id) ||
      setup.playArea.allowsPlacement(location.position)
    )
      continue;
    const position = placementService.generate({
      playArea: setup.playArea,
      count: 1,
      occupied,
    })[0];
    location.position = { ...position };
    occupied.push(position);
  }

  return prepared;
}
