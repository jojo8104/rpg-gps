import { distanceMeters } from "./geo.js";
import { LocationRangePolicy } from "./location-range-policy.js";
import { simulationRadii } from "./simulation-config.js";

/** Écart entre lieux permanents, basé sur leurs portées normales, sans DOM. */
export class LocationSpacingPolicy {
  constructor({ setup, coordinateMode = "gps", minimumDistance = 0 }) {
    this.setup = setup;
    this.coordinateMode = coordinateMode;
    this.minimumDistance = minimumDistance;
    this.ranges = new LocationRangePolicy(setup.locationSetup?.rangePolicy);
  }
  radius(location) {
    if (this.coordinateMode === "simulation") return simulationRadii[location.id] ?? 8;
    return this.ranges.resolve({ ...location, interactionRadius: location.interactionRadius ?? 25 }, this.setup.playArea).interactionRadius;
  }
  requiredDistance(first, second) {
    const clue = first.roles?.includes("clue") || second.roles?.includes("clue");
    const margin = clue ? (this.coordinateMode === "simulation" ? 8 : 20) : 1;
    return Math.max(this.minimumDistance, this.radius(first) + this.radius(second) + margin);
  }
  distance(first, second) {
    return this.coordinateMode === "simulation"
      ? Math.hypot(first.latitude - second.latitude, first.longitude - second.longitude)
      : distanceMeters(first, second);
  }
  check(location, position, others) {
    if (!isSpacedLocation(location)) return { success: true };
    for (const other of others) {
      if (other.id === location.id || other.state === "destroyed" || !isSpacedLocation(other)) continue;
      const minimumDistance = this.requiredDistance(location, other);
      const distance = this.distance(position, other.position);
      if (distance < minimumDistance)
        return { success: false, reason: "location_too_close", conflictingLocationId: other.id,
          minimumDistance, distance };
    }
    return { success: true };
  }
}

// Les marqueurs d'événement et les convois mobiles peuvent rejoindre un lieu.
export function isSpacedLocation(location) {
  if (location.roles?.includes("clue")) return true;
  return !["quest", "event_location", "event-location", "convoy"].includes(location.type);
}

export function placedLocations(game) {
  const deferred = new Set(Object.values(game.scenarioRuntime?.placements ?? {})
    .filter((placement) => placement.status !== "placed").map((placement) => placement.locationId));
  const configured = new Set((game.scenarioLocationBindings ?? []).map((binding) => binding.locationId));
  return game.locations.filter((location) => !deferred.has(location.id) &&
    (game.status !== "preparing" || !configured.size || configured.has(location.id) || location.source === "simulation") &&
    game.setup.playArea.allowsPlacement(location.position));
}
