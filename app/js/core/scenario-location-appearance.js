import { locationWorldContext, locationKnownToPlayer } from "./scenario-location-world-policy.js";

/** Contrat de scénario : placement géographique et apparition sont indépendants. */
export function normalizeLocationAppearance(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value))
    throw new TypeError("L’apparition d’un lieu doit être un objet.");
  if (value.on === "immediate") return { on: "immediate" };
  if (!["QuestAccepted", "ActionCompleted"].includes(value.on))
    throw new RangeError("Déclencheur d’apparition de lieu inconnu.");
  const text = (name) => {
    if (typeof value[name] !== "string" || !value[name].trim())
      throw new TypeError(`L’apparition exige ${name}.`);
    return value[name].trim();
  };
  return {
    on: value.on,
    questId: text("questId"),
    ...(value.on === "ActionCompleted" ? { actionId: text("actionId") } : {}),
  };
}

/** Lecture de l’état officiel uniquement ; la connaissance GPS ne débloque pas un lieu. */
export function scenarioLocationHasAppeared(location, state, playerId) {
  const { slot, placement, world } = locationWorldContext(location, state);
  if (placement?.retiredForPlayerIds?.includes(playerId)) return false;
  if (world?.visibility === "known") return true;
  if (world?.visibility === "discoverable") return locationKnownToPlayer(location, state, playerId);
  const appearance =
    placement?.appearance ??
    slot?.appearance;
  if (!appearance || appearance.on === "immediate") return true;
  return (
    typeof playerId === "string" &&
    (placement?.appearedForPlayerIds ?? []).includes(playerId)
  );
}

/** Exécuté par le serveur après validation et à la reprise, sans rejouer les récompenses. */
export function syncScenarioLocationAppearances(game, engineState) {
  for (const slot of game.scenario?.locationSlots ?? []) {
    const rule = slot.appearance;
    const placement = game.scenarioRuntime?.placements?.[slot.id];
    if (!placement) continue;
    if (slot.world) placement.world = structuredClone(slot.world);
    const removal = slot.world?.removal;
    if (removal) {
      const retired = new Set();
      for (const instance of engineState.instances ?? []) {
        if (instance.questId !== removal.questId) continue;
        if (!["completed", "failed", "abandoned"].includes(instance.status) && (!removal.actionId || instance.actions[removal.actionId]?.status !== "completed")) continue;
        instance.playerIds.forEach((id) => retired.add(id));
      }
      placement.retiredForPlayerIds = [...retired];
    }
    if (!rule || rule.on === "immediate") continue;
    placement.appearance = structuredClone(rule);
    // Le monde préparé ou une ancienne projection ne constituent pas une preuve de progression.
    const appeared = new Set();
    for (const instance of engineState.instances ?? []) {
      if (instance.questId !== rule.questId) continue;
      if (
        rule.on === "ActionCompleted" &&
        instance.actions[rule.actionId]?.status !== "completed"
      )
        continue;
      for (const playerId of instance.playerIds) {
        appeared.add(playerId);
        if (game.getLocation(placement.locationId))
          game.getPlayer(playerId)?.discoverLocation(placement.locationId, 2);
      }
    }
    placement.appearedForPlayerIds = [...appeared];
  }
}
