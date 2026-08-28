/** Fusionne un module de quête dans un scénario sans coupler le moteur à son identifiant. */
export function composeScenario(base, module) {
  if (!base || !module)
    throw new TypeError("Le scénario et son module sont requis.");
  const mergeUnique = (first = [], second = [], label = "éléments") => {
    const result = first.map((entry) => structuredClone(entry));
    const ids = new Set(result.map(({ id }) => id));
    second.forEach((entry) => {
      if (ids.has(entry.id)) {
        if (label === "lieux") return;
        throw new RangeError(
          `Deux ${label} partagent l'identifiant ${entry.id}.`,
        );
      }
      ids.add(entry.id);
      result.push(structuredClone(entry));
    });
    return result;
  };
  return {
    ...structuredClone(base),
    locationSlots: mergeUnique(
      base.locationSlots,
      module.locationSlots,
      "lieux",
    ),
    trails: mergeUnique(base.trails, module.trails, "pistes"),
    phases: mergeUnique(base.phases, module.phases, "phases"),
    events: mergeUnique(base.events, module.events, "événements"),
    worldState: {
      flags: {
        ...structuredClone(base.worldState?.flags ?? {}),
        ...structuredClone(module.worldState?.flags ?? {}),
      },
      npcs: mergeUnique(base.worldState?.npcs, module.worldState?.npcs, "PNJ"),
    },
  };
}
