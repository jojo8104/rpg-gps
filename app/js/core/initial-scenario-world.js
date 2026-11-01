/** Sélection du monde initial, indépendante des quêtes retenues et du DOM. */
export function selectInitialScenarioWorld(scenario, bindings, locations) {
  const initial = scenario?.mapDefinition?.initialLocationSlotIds;
  if (!initial) return { scenario, bindings, locations };
  const ids = new Set(initial);
  const selected = typeof scenario.toJSON === "function" ? scenario.toJSON() : structuredClone(scenario);
  selected.locationSlots = selected.locationSlots.filter(slot => ids.has(slot.id));
  const selectedBindings = bindings.filter(binding => ids.has(binding.locationSlotId));
  const locationIds = new Set(selectedBindings.map(binding => binding.locationId));
  initial.forEach(id => { if (!selectedBindings.some(binding => binding.locationSlotId === id)) locationIds.add(id); });
  selected.trails = (selected.trails ?? []).filter(trail => ids.has(trail.destinationLocationSlotId));
  const trailIds = new Set(selected.trails.map(trail => trail.id));
  for (const phase of selected.phases ?? [])
    phase.objectives = (phase.objectives ?? []).filter(objective =>
      objective.trigger?.type !== "trailPointInspected" || trailIds.has(objective.trigger.trailId));
  return { scenario: selected, bindings: selectedBindings, locations: locations.filter(location => locationIds.has(location.id)) };
}
