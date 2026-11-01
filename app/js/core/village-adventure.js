/** Prépare des missions locales sans événements ni chaîne de scénario royal. */
export function createVillageAdventure(base, locations, bindings) {
  const villages = locations.filter((location) => location.type === "village");
  const slotByLocation = new Map(bindings.map((binding) => [binding.locationId, binding.locationSlotId]));
  const eligible = villages.filter((village) => slotByLocation.has(village.id));
  const phases = [{ id: "village-free-play", title: "Les affaires des villages", description: "Rencontrez les chefs des villages pour obtenir une mission locale.", objectives: [], eventIds: [], transitions: [] }];
  const missions = new Map();
  eligible.forEach((village, index) => {
    if (eligible.length < 2) return;
    const target = eligible[(index + 1) % eligible.length];
    const id = `village-mission-${village.id}`;
    missions.set(village.id, id);
    phases.push({ id, title: `Liaison avec ${target.name}`, description: `Portez les nouvelles de ${village.name} à ${target.name}.`, objectives: [{ id: `${id}-arrival`, text: `Rejoindre ${target.name}`, trigger: { type: "enterLocation", locationSlotId: slotByLocation.get(target.id) } }], eventIds: [], transitions: [] });
  });
  return {
    scenario: { mapDefinition: structuredClone(base.mapDefinition ?? null), id: base.id, name: "Les affaires des villages", intro: "Développez votre héros et affrontez votre adversaire en aidant les villages.", playerStart: structuredClone(base.playerStart), initialPhaseId: "village-free-play", locationSlots: base.locationSlots.map((slot) => ({ id: slot.id, type: slot.type, roles: slot.roles ?? [], defaultPlacement: { strategy: "fixed" } })), factions: structuredClone(base.factions), phases },
    locations: locations.map((location) => ({ ...structuredClone(location), chief: missions.has(location.id) ? { name: `Chef de ${location.name}`, title: "Chef du village", openingLines: ["Les villages ont besoin de nouvelles de leurs voisins."], secondaryQuestIds: [missions.get(location.id)], trade: false } : null })),
  };
}
