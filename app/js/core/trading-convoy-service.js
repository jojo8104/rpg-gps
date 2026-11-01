import { AutonomousGroup } from "./autonomous-group.js";
import { getItemDefinition } from "./item-catalog.js";

export const DEFAULT_TRADING_CONVOY_CONFIG = Object.freeze({
  creationCost: Object.freeze({ wood: 8, iron: 3, horse: 2 }),
  capacitySlots: 2,
  speedMetersPerSecond: 1.4,
});

/** Règles du comptoir et de sa liaison logistique, sans dépendance au DOM. */
export class TradingConvoyService {
  constructor({ config = DEFAULT_TRADING_CONVOY_CONFIG, idGenerator = (prefix) => `${prefix}-${Date.now()}` } = {}) {
    this.config = normalizeConfig(config);
    this.idGenerator = idGenerator;
  }

  getOptions({ locations, groups = [], playerId, originLocationId }) {
    const origin = locations.find((location) => location.id === originLocationId);
    if (!origin || origin.ownerId !== playerId || !hasTradingPost(origin))
      return { success: false, reason: "trading_post_unavailable", cost: { ...this.config.creationCost }, destinations: [], convoys: [] };
    const destinations = locations.filter((location) => location.id !== origin.id && location.ownerId === playerId && location.state !== "destroyed")
      .map((location) => ({ id: location.id, name: location.name, resources: Object.keys(location.resources.production).filter((resourceId) => (location.resources.production[resourceId] ?? 0) > 0) }))
      .filter((location) => location.resources.length > 0);
    const convoys = groups.filter((group) => isManagedConvoy(group) && group.mission.originLocationId === origin.id)
      .map((group) => ({ id: group.id, destinationLocationId: group.mission.destinationLocationId, resourceId: group.mission.resourceId, status: group.status, phase: group.mission.phase, active: group.mission.active, cargo: group.cargo.map((entry) => ({ ...entry })) }));
    return { success: true, cost: { ...this.config.creationCost }, capacitySlots: this.config.capacitySlots, destinations, convoys };
  }

  create({ locations, playerId, originLocationId, destinationLocationId, resourceId, coordinateMode = "gps", now = Date.now() }) {
    const origin = locations.find((location) => location.id === originLocationId);
    const destination = locations.find((location) => location.id === destinationLocationId);
    const invalid = validateRoute({ origin, destination, playerId, resourceId });
    if (invalid) return { success: false, reason: invalid, cost: { ...this.config.creationCost } };
    const missingResources = Object.entries(this.config.creationCost).filter(([id, amount]) => (origin.resources.stock[id] ?? 0) < amount).map(([id]) => id);
    if (missingResources.length) return { success: false, reason: "insufficient_resources", missingResources, cost: { ...this.config.creationCost } };
    Object.entries(this.config.creationCost).forEach(([id, amount]) => { origin.resources.stock[id] -= amount; });
    const id = this.idGenerator("convoy");
    const group = new AutonomousGroup({
      id, type: "convoy", owner: { kind: "player", id: playerId }, factionId: playerId,
      originLocationId: origin.id, position: origin.position, status: "idle", behavior: "passive",
      mission: { kind: "transport", managedBy: "trading_post", originLocationId: origin.id, destinationLocationId: destination.id, resourceId, loop: true, active: true, phase: "outbound", capacitySlots: this.config.capacitySlots, speedMetersPerSecond: this.config.speedMetersPerSecond, coordinateMode },
      history: [{ type: "trading_convoy_created", originLocationId: origin.id, destinationLocationId: destination.id, resourceId, cost: { ...this.config.creationCost }, at: now }],
    });
    return { success: true, group, cost: { ...this.config.creationCost } };
  }

  validate(group, locations) {
    if (!isManagedConvoy(group)) return { success: true };
    if (group.mission.active !== true) return { success: false, reason: "route_stopped" };
    const origin = locations.find((location) => location.id === group.mission.originLocationId);
    const destination = locations.find((location) => location.id === group.mission.destinationLocationId);
    return validateRoute({ origin, destination, playerId: group.owner.id, resourceId: group.mission.resourceId })
      ? { success: false, reason: validateRoute({ origin, destination, playerId: group.owner.id, resourceId: group.mission.resourceId }) }
      : { success: true, origin, destination };
  }

  destinationFor(group, locations) {
    const validity = this.validate(group, locations);
    if (!validity.success) return validity;
    return { ...validity, destination: group.mission.phase === "inbound" ? validity.origin : validity.destination };
  }

  arrive(group, locations, now) {
    const validity = this.validate(group, locations);
    if (!validity.success) return validity;
    const { origin, destination } = validity; const resourceId = group.mission.resourceId;
    if (group.mission.phase === "outbound") {
      const bundleSize = getItemDefinition(resourceId)?.bundleSize ?? 1;
      const capacity = group.mission.capacitySlots * bundleSize;
      const loaded = Math.min(capacity, Math.floor(destination.resources.productionStock[resourceId] ?? 0));
      if (loaded > 0) { destination.resources.productionStock[resourceId] -= loaded; group.cargo = [{ itemId: resourceId, quantity: loaded, occupiedSlots: Math.ceil(loaded / bundleSize) }]; }
      group.mission.phase = "inbound"; group.status = "idle";
      group.history.push({ type: "trading_convoy_loaded", locationId: destination.id, resourceId, quantity: loaded, at: now });
      return { success: true, type: "autonomous_convoy_loaded", quantity: loaded, locationId: destination.id };
    }
    const carried = group.cargo.find((entry) => entry.itemId === resourceId)?.quantity ?? 0;
    const unloaded = carried > 0 ? origin.depositResource(resourceId, carried) : 0;
    const remaining = carried - unloaded;
    const bundleSize = getItemDefinition(resourceId)?.bundleSize ?? 1;
    group.cargo = remaining > 0 ? [{ itemId: resourceId, quantity: remaining, occupiedSlots: Math.ceil(remaining / bundleSize) }] : [];
    group.history.push({ type: "trading_convoy_unloaded", locationId: origin.id, resourceId, quantity: unloaded, at: now });
    if (remaining > 0) return { success: false, reason: "origin_storage_full", unloaded, remaining };
    group.mission.phase = "outbound"; group.status = "idle";
    return { success: true, type: "autonomous_convoy_unloaded", quantity: unloaded, locationId: origin.id };
  }

  stop(group, now = Date.now()) {
    if (!isManagedConvoy(group) || group.mission.active !== true) return { success: false, reason: "convoy_not_active" };
    group.mission.active = false; group.movement = null; group.status = "stopped";
    group.history.push({ type: "trading_convoy_stopped", at: now });
    return { success: true, groupId: group.id };
  }
}

export function isManagedConvoy(group) { return group?.type === "convoy" && group.mission?.kind === "transport" && group.mission.managedBy === "trading_post"; }
function hasTradingPost(location) { return (location?.infrastructure?.trading_post ?? 0) > 0 && location.state !== "destroyed"; }
function validateRoute({ origin, destination, playerId, resourceId }) {
  if (!origin) return "origin_not_found";
  if (!hasTradingPost(origin)) return "trading_post_unavailable";
  if (origin.ownerId !== playerId) return "origin_not_owned";
  if (!destination || destination.state === "destroyed") return "destination_not_found";
  if (destination.ownerId !== playerId) return "destination_not_owned";
  if (origin.id === destination.id) return "same_location";
  if (typeof resourceId !== "string" || (destination.resources.production[resourceId] ?? 0) <= 0) return "resource_unavailable";
  return null;
}
function normalizeConfig(config) {
  const creationCost = Object.fromEntries(Object.entries(config.creationCost ?? {}).map(([id, amount]) => {
    if (!Number.isFinite(amount) || amount <= 0) throw new RangeError("Le coût d'un convoi doit être strictement positif."); return [id, amount];
  }));
  const capacitySlots = Number(config.capacitySlots); const speedMetersPerSecond = Number(config.speedMetersPerSecond);
  if (!Number.isInteger(capacitySlots) || capacitySlots <= 0) throw new RangeError("La capacité du convoi doit être un entier positif.");
  if (!Number.isFinite(speedMetersPerSecond) || speedMetersPerSecond <= 0) throw new RangeError("La vitesse du convoi doit être positive.");
  return { creationCost, capacitySlots, speedMetersPerSecond };
}
