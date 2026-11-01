/** Nature du lieu indépendante de sa géographie et de son déclencheur de quête. */
export function normalizeLocationWorld(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Le rôle mondial du lieu doit être un objet.");
  const result = structuredClone(value);
  if (!["starting-point", "world", "quest"].includes(result.role))
    throw new RangeError("Rôle mondial de lieu inconnu.");
  if (!["known", "discoverable", "quest"].includes(result.visibility))
    throw new RangeError("Visibilité de lieu inconnue.");
  if (!["persistent", "ephemeral"].includes(result.lifetime))
    throw new RangeError("Durée de vie de lieu inconnue.");
  if (result.role === "starting-point" && (result.visibility !== "known" || result.lifetime !== "persistent"))
    throw new RangeError("Le point de départ doit être durable et connu.");
  if (result.lifetime === "ephemeral") {
    const removal = result.removal;
    if (!removal || typeof removal.questId !== "string" || !removal.questId.trim() ||
        (removal.actionId !== undefined && (typeof removal.actionId !== "string" || !removal.actionId.trim())))
      throw new TypeError("Un élément éphémère exige une quête de disparition et éventuellement une action.");
  } else if (result.removal !== undefined) {
    throw new RangeError("Un lieu durable ne disparaît pas à la fin d’une quête.");
  }
  return result;
}

export function locationWorldContext(location, state) {
  const binding = state.scenarioLocationBindings?.find((entry) => entry.locationId === location.id);
  const slotId = binding?.locationSlotId ?? location.id;
  const slot = state.scenario?.locationSlots?.find((entry) => entry.id === slotId);
  const placement = state.scenarioRuntime?.placements?.[slotId];
  return { slot, placement, world: placement?.world ?? slot?.world };
}

export function locationKnownToPlayer(location, state, playerId) {
  const player = state.players?.find((entry) => entry.id === playerId);
  return player?.knowsLocation?.(location.id) ?? Boolean(
    player?.discoveredLocationIds?.includes(location.id) || player?.locationKnowledge?.[location.id]);
}
