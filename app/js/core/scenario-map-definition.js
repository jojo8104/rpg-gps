/** Contrat de carte sérialisable du scénario ; aucune dépendance au DOM. */
export function normalizeScenarioMapDefinition(definition, slots) {
  if (definition == null) return null;
  if (typeof definition !== "object" || Array.isArray(definition))
    throw new TypeError("La définition de carte doit être un objet.");
  const result = structuredClone(definition);
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  if (result.initialLocationSlotIds !== undefined) {
    if (!Array.isArray(result.initialLocationSlotIds) || new Set(result.initialLocationSlotIds).size !== result.initialLocationSlotIds.length)
      throw new TypeError("Les lieux initiaux doivent former une liste unique.");
    for (const id of result.initialLocationSlotIds)
      if (!slotById.has(id)) throw new RangeError(`Lieu initial absent du scénario : ${id}.`);
    if ((result.requiredLocationSlotIds ?? []).some(id => !result.initialLocationSlotIds.includes(id)))
      throw new RangeError("Les lieux obligatoires doivent appartenir au monde initial.");
  }
  if (!Array.isArray(result.requiredLocationSlotIds))
    throw new TypeError("Les lieux obligatoires doivent être une liste.");
  result.requiredLocationSlotIds = [...new Set(result.requiredLocationSlotIds)];
  for (const id of result.requiredLocationSlotIds)
    if (!slotById.has(id))
      throw new RangeError(`Le lieu obligatoire ${id} est absent du scénario.`);
  const required = result.requiredLocationSlotIds.map((id) => slotById.get(id));
  if (
    !required.some((slot) => slot.type === "capital") ||
    !required.some((slot) => slot.type === "village") ||
    !required.some(
      (slot) => slot.type === "mine" && slot.roles?.includes("gold"),
    )
  )
    throw new RangeError(
      "La carte exige une capitale, un village et une mine d’or obligatoires.",
    );
  if (!Array.isArray(result.zones))
    throw new TypeError("Les zones de carte doivent être une liste.");
  const zoneIds = new Set();
  let previousOuter = 0;
  for (const zone of result.zones) {
    if (
      !zone ||
      typeof zone.id !== "string" ||
      !zone.id.trim() ||
      zoneIds.has(zone.id)
    )
      throw new RangeError("Chaque zone doit avoir un identifiant unique.");
    zoneIds.add(zone.id);
    if (
      !Number.isFinite(zone.innerRadiusRatio) ||
      !Number.isFinite(zone.outerRadiusRatio) ||
      zone.innerRadiusRatio < previousOuter ||
      zone.outerRadiusRatio <= zone.innerRadiusRatio ||
      zone.outerRadiusRatio > 1
    )
      throw new RangeError(
        "Les couronnes doivent être ordonnées entre zéro et un.",
      );
    previousOuter = zone.outerRadiusRatio;
    if (
      !Number.isFinite(zone.enemyGroupDensityMultiplier) ||
      zone.enemyGroupDensityMultiplier < 0
    )
      throw new RangeError("La densité ennemie doit être positive ou nulle.");
    if (!Array.isArray(zone.locations))
      throw new TypeError("Les objectifs de lieux doivent être une liste.");
    for (const location of zone.locations)
      if (
        !location ||
        typeof location.type !== "string" ||
        !location.type.trim() ||
        !Number.isInteger(location.count) ||
        location.count < 1
      )
        throw new RangeError(
          "Chaque objectif de lieu exige un type et un nombre positif.",
        );
  }
  return result;
}

/** Vérifié également lors de la reconstruction du moteur par le serveur. */
export function validateScenarioMapLocations(scenario, bindings, locations) {
  if (!scenario?.mapDefinition) return;
  const bySlot = new Map(
    bindings.map((binding) => [binding.locationSlotId, binding.locationId]),
  );
  for (const slotId of scenario.mapDefinition.requiredLocationSlotIds) {
    const slot = scenario.locationSlots.find((entry) => entry.id === slotId);
    const location = locations.find(
      (entry) => entry.id === (bySlot.get(slotId) ?? slotId),
    );
    if (!location || location.type !== slot.type)
      throw new RangeError(
        `Le lieu obligatoire ${slotId} doit être présent avec le bon type.`,
      );
    if (
      slot.type === "mine" &&
      slot.roles?.includes("gold") &&
      !(location.resources?.production?.gold > 0)
    )
      throw new RangeError("La mine d’or obligatoire doit produire de l’or.");
  }
}
