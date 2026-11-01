import { dashboardLocationNpcs } from "./dashboard-location-npcs.js";
import { dashboardHeatmap } from "./dashboard-heatmap.js";
import { unitPowerCoefficient } from "./world-sample.js";
import {
  dashboardPerception,
  recordDashboardExploration,
} from "./dashboard-perception.js";
import {
  ITEM_DEFINITIONS,
  getItemDefinition,
} from "../../app/js/core/item-catalog.js";
import { ravitaillementView } from "../quests/ravitaillement-integration.js";
const MAX_SAMPLES = 2000;

/** Mesures de supervision uniquement, sans effet sur la simulation. */
export function recordDashboardPosition(lobby, player, at) {
  recordDashboardExploration(lobby, player.id, player.position, at);
  const samples = (lobby.monitoringSamples ??= []);
  samples.push({ playerId: player.id, position: { ...player.position }, at });
  if (samples.length > MAX_SAMPLES)
    samples.splice(0, samples.length - MAX_SAMPLES);
}

export function dashboardParty(lobby) {
  const game = lobby.game;
  const samples = (lobby.monitoringSamples ?? []).slice(-MAX_SAMPLES);
  const serialize = (items = []) =>
    items.map((item) => (item.toJSON ? item.toJSON() : structuredClone(item)));
  return {
    code: lobby.code,
    status: lobby.status,
    active:
      lobby.status === "started" &&
      [...lobby.players.values()].some((player) => player.connections.size),
    configuration: { ...lobby.configuration },
    coordinateMode: game?.coordinateMode ?? lobby.configuration.positionMode,
    revision: lobby.gameRevision,
    createdAt: lobby.createdAt,
    sampledAt: lobby.lastMonitoringAt ?? null,
    playArea: structuredClone(lobby.playArea ?? game?.setup?.playArea ?? null),
    players: [...lobby.players.values()].map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.connections.size > 0,
      heroClassId: player.heroClassId,
      position: player.position ? { ...player.position } : null,
      positionReceivedAt: player.positionReceivedAt,
    })),
    teams: serialize(game?.setup?.teams),
    perception: dashboardPerception(lobby),
    territory: structuredClone(game?.territoryState?.view ?? null),
    playerDetails: Object.fromEntries(
      [...lobby.players.keys()].map((id) => [
        id,
        {
          knowledge: game?.getPlayer?.(id)?.toJSON() ?? null,
          quests: game ? ravitaillementView(game, id) : null,
        },
      ]),
    ),
    itemTypes: [
      ...new Map(
        [
          ...Object.values(ITEM_DEFINITIONS).map((item) => [item.id, item]),
          ...(game?.heroes ?? []).flatMap((hero) =>
            [
              ...Object.values(hero.equipment ?? {}),
              ...(hero.carriedLoot ?? []).map((entry) => entry.itemId),
            ]
              .filter(Boolean)
              .map((id) => [id, getItemDefinition(id)]),
          ),
        ].filter(([, value]) => value),
      ).values(),
    ].map((item) => structuredClone(item)),
    heroClasses: [...(game?.heroClasses?.values() ?? [])].map((entry) =>
      structuredClone(entry),
    ),
    heroDetails: Object.fromEntries(
      (game?.heroes ?? []).map((hero) => [
        hero.id,
        {
          progress: game.heroProgressionService?.getProgress(hero) ?? null,
          bag: game.inventoryService?.getHeroBagState(hero) ?? null,
        },
      ]),
    ),
    heroes: serialize(game?.heroes),
    locations: serialize(game?.locations),
    locationNpcs: Object.fromEntries(
      (game?.locations ?? []).map((location) => [
        location.id,
        dashboardLocationNpcs(game, location),
      ]),
    ),
    groups: serialize(game?.autonomousGroups),
    zones: serialize(game?.resourceZones),
    battles: serialize(game?.battles),
    loot: serialize(game?.battleLoot),
    sites: serialize(game?.battleSites),
    quests: structuredClone(game?.questEngineState ?? {}),
    scenario: game?.scenarioState?.toJSON?.() ?? null,
    world: game?.worldState?.toJSON?.() ?? null,
    events: (game?.eventLog ?? []).slice(-100).map((event) => ({ ...event })),
    traces: serialize((game?.autonomousGroupTraces ?? []).slice(-500)),
    heatmap: dashboardHeatmap(lobby, samples),
    samples: structuredClone(samples),
    heatmapLimit: MAX_SAMPLES,
    unitTypes: [...(game?.unitDefinitions?.values() ?? [])].map((unit) => ({
      id: unit.id,
      name: unit.name,
      stats: structuredClone(unit.stats ?? {}),
      abilities: structuredClone(unit.abilities ?? []),
      coefficient: unitPowerCoefficient(unit),
      mobilityMultiplier: 1 + (unit.stats?.speed ?? 0) * 0.05,
    })),
  };
}
