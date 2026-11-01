const LOCATION_FIELDS = new Set([
  "locationSlotId",
  "locationId",
  "lieu",
  "origine",
  "destinataire",
  "sourceLocationSlotId",
  "destinationLocationSlotId",
  "originLocationSlotId",
  "targetLocationId",
]);

/** Lie une fiche aux lieux officiels sans modifier le catalogue ni créer de lieu. */
export function bindQuestToScenarioLocations(definition, game) {
  const data =
    typeof definition.toJSON === "function" ? definition.toJSON() : definition;
  const createdIds = new Set(
    (data.prerequisites ?? [])
      .filter((entry) => ["lieu", "marqueur"].includes(entry.type))
      .map((entry) => entry.id),
  );
  const bound = bindReferences(data, game, createdIds);
  for (const action of bound.actions ?? []) {
    if (action.action === "Combattre" && action.targetLocationId)
      action.qui = action.targetLocationId;
  }
  return bound;
}

export function bindDialoguesToScenarioLocations(
  dialogues,
  game,
  definitions = [],
) {
  const createdIds = new Set(
    definitions.flatMap((definition) =>
      (definition.prerequisites ?? [])
        .filter((entry) => ["lieu", "marqueur"].includes(entry.type))
        .map((entry) => entry.id),
    ),
  );
  return bindReferences(dialogues, game, createdIds);
}

function bindReferences(data, game, createdIds) {
  const bySlot = new Map(
    (game.scenarioLocationBindings ?? []).map((binding) => [
      binding.locationSlotId,
      binding.locationId,
    ]),
  );
  const visit = (value) => {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        if (key === "locationId" && value.type === "ga" && entry === "")
          return [key, null];
        if (!LOCATION_FIELDS.has(key) || entry == null)
          return [key, visit(entry)];
        if (typeof entry !== "string" || !entry.trim())
          throw new RangeError(`Référence de lieu invalide : ${key}.`);
        // Les créations explicitement décrites dans une quête restent possibles.
        if (createdIds.has(entry)) return [key, entry];
        const id = bySlot.get(entry) ?? entry;
        if (!game.getLocation(id))
          throw new RangeError(`Lieu de quête absent du scénario : ${entry}.`);
        return [key, id];
      }),
    );
  };
  return visit(data);
}
