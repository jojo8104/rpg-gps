import { Location } from "./location.js";
import { AutonomousGroup } from "./autonomous-group.js";
import { AutonomousGroupTrace } from "./autonomous-group-trace.js";
import { ScoutWatchBeacon } from "./scout-watch-beacon.js";
import { ScenarioState } from "./scenario.js";
import { TrailState } from "./trail.js";
import { WorldState } from "./world-state.js";
import { BattleEngine } from "./battle-engine.js";
import { BattleLoot } from "./battle-loot.js";
import { BattleSite } from "./battle-site.js";

/** État commun des lieux, sérialisable et indépendant de l'interface. */
export function createMultiplayerWorldState(gameOrLocations, runtimePositions = null) {
  const game = Array.isArray(gameOrLocations) ? null : gameOrLocations;
  const locations = game?.locations ?? gameOrLocations;
  if (!Array.isArray(locations))
    throw new TypeError("Les lieux multijoueurs doivent être une liste.");
  const state = {
    locations: locations.map((location) => {
      const snapshot = location.toJSON();
      const position = runtimePositions?.get?.(location.id);
      if (Array.isArray(position))
        snapshot.position = { latitude: position[0], longitude: position[1] };
      else if (position) snapshot.position = { ...position };
      return snapshot;
    }),
  };
  if (!game) return state;
  return {
    ...state,
    scenarioState: game.scenarioState?.toJSON() ?? null,
    scenarioRuntime: structuredClone(game.scenarioRuntime),
    worldState: game.worldState.toJSON(),
    availableQuests: structuredClone(game.availableQuests),
    lastQuestResult: structuredClone(game.lastQuestResult),
    questDeadlines: structuredClone(game.questDeadlines),
    evacuationStates: structuredClone(game.evacuationStates),
    trailStates: Object.fromEntries(
      Object.entries(game.trailStates).map(([id, trail]) => [id, trail.toJSON()]),
    ),
    autonomousGroups: game.autonomousGroups.map((group) => group.toJSON()),
    autonomousGroupTraces: game.autonomousGroupTraces.map((trace) => trace.toJSON()),
    watchBeacons: game.watchBeacons.map((beacon) => beacon.toJSON()),
    battles: game.battles.map((battle) => battle.toJSON()),
    battleReports: structuredClone(game.battleReports),
    battleLoot: game.battleLoot.map((loot) => loot.toJSON()),
    battleSites: game.battleSites.map((site) => site.toJSON()),
  };
}

/** Reconstruit les lieux reçus en conservant les définitions d'unités du moteur. */
export function applyMultiplayerWorldState(game, snapshot) {
  if (!game || !Array.isArray(snapshot?.locations))
    throw new TypeError("L’état multijoueur des lieux est invalide.");
  const ids = new Set();
  const locations = snapshot.locations.map((entry) => {
    if (ids.has(entry?.id))
      throw new RangeError("Un lieu multijoueur est présent plusieurs fois.");
    ids.add(entry?.id);
    return new Location({ ...entry, garrison: entry.garrison ?? {} });
  });
  game.locations = locations;
  if (Object.hasOwn(snapshot, "worldState"))
    game.worldState = new WorldState(snapshot.worldState ?? {});
  if (game.scenario && snapshot.scenarioState)
    game.scenarioState = new ScenarioState(game.scenario, {
      startsActive: false,
      state: snapshot.scenarioState,
    });
  if (Object.hasOwn(snapshot, "scenarioRuntime"))
    game.scenarioRuntime = structuredClone(snapshot.scenarioRuntime);
  if (Array.isArray(snapshot.availableQuests))
    game.availableQuests = structuredClone(snapshot.availableQuests);
  if (Object.hasOwn(snapshot, "lastQuestResult"))
    game.lastQuestResult = structuredClone(snapshot.lastQuestResult);
  if (snapshot.questDeadlines && typeof snapshot.questDeadlines === "object")
    game.questDeadlines = structuredClone(snapshot.questDeadlines);
  if (snapshot.evacuationStates && typeof snapshot.evacuationStates === "object")
    game.evacuationStates = structuredClone(snapshot.evacuationStates);
  if (snapshot.trailStates && game.scenario)
    game.trailStates = Object.fromEntries(
      game.scenario.trails.map((trail) => [
        trail.id,
        new TrailState(trail, snapshot.trailStates[trail.id] ?? {}),
      ]),
    );
  if (Array.isArray(snapshot.autonomousGroups))
    game.autonomousGroups = snapshot.autonomousGroups.map(
      (group) => new AutonomousGroup(group),
    );
  if (Array.isArray(snapshot.autonomousGroupTraces))
    game.autonomousGroupTraces = snapshot.autonomousGroupTraces.map(
      (trace) => new AutonomousGroupTrace(trace),
    );
  if (Array.isArray(snapshot.watchBeacons))
    game.watchBeacons = snapshot.watchBeacons.map(
      (beacon) => new ScoutWatchBeacon(beacon),
    );
  if (Array.isArray(snapshot.battles))
    game.battles = snapshot.battles.map((battle) => new BattleEngine(battle));
  if (Array.isArray(snapshot.battleReports))
    game.battleReports = structuredClone(snapshot.battleReports);
  if (Array.isArray(snapshot.battleLoot))
    game.battleLoot = snapshot.battleLoot.map((loot) => new BattleLoot(loot));
  if (Array.isArray(snapshot.battleSites))
    game.battleSites = snapshot.battleSites.map((site) => new BattleSite(site));
  return locations;
}

export function multiplayerWorldFingerprint(snapshot) {
  return JSON.stringify(snapshot);
}
