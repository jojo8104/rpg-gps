import { selectedPreparationLocationIds } from "../../app/js/core/preparation-location-selection.js";

/** Filtre avant tout placement, y compris pour les préparations sauvegardées. */
export function selectPreparedWorld(data, bindings, catalog, preparation) {
  const ids = selectedPreparationLocationIds(preparation, catalog);
  const scenario = structuredClone(data.scenario);
  scenario.locationSlots = scenario.locationSlots.filter((s) => ids.has(s.id));
  const selectedBindings = bindings.filter((b) => ids.has(b.locationSlotId));
  const locationIds = new Set(selectedBindings.map((b) => b.locationId));
  const locations = data.locations.filter((l) => locationIds.has(l.id));
  scenario.trails = (scenario.trails ?? []).filter((t) =>
    ids.has(t.destinationLocationSlotId),
  );
  const trails = new Set(scenario.trails.map((t) => t.id));
  for (const phase of scenario.phases)
    phase.objectives = (phase.objectives ?? []).filter(
      (o) =>
        o.trigger?.type !== "trailPointInspected" ||
        trails.has(o.trigger.trailId),
    );
  if (scenario.mapDefinition) {
    const required = scenario.mapDefinition.requiredLocationSlotIds.filter(
      (id) => ids.has(id),
    );
    // La carte conserve son contrat économique, sans réintroduire un lieu de quête.
    if (
      !required.some(
        (id) =>
          scenario.locationSlots.find((s) => s.id === id)?.type === "village",
      )
    ) {
      const village = scenario.locationSlots.find((s) => s.type === "village");
      if (village) required.push(village.id);
    }
    scenario.mapDefinition.requiredLocationSlotIds = required;
  }
  const selectedPreparation = structuredClone(preparation);
  selectedPreparation.locations = Object.fromEntries(
    Object.entries(preparation.locations ?? {}).filter(([id]) => ids.has(id)),
  );
  return {
    scenario,
    locations,
    bindings: selectedBindings,
    preparation: selectedPreparation,
  };
}
