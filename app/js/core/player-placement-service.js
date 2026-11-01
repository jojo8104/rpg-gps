import {
  LocationSpacingPolicy,
  placedLocations,
} from "./location-spacing-policy.js";
import { scenarioLocationHasAppeared } from "./scenario-location-appearance.js";

/** Placements différés et missions de repérage. Exécuté uniquement par le serveur. */
export class PlayerPlacementService {
  state(game) {
    if (!game.worldState.get("playerPlacement"))
      game.worldState.set("playerPlacement", {
        walks: {},
        missions: {},
        cells: {},
      });
    return game.worldState.get("playerPlacement");
  }
  team(game, playerId) {
    return game.territoryService.teamFor(game, playerId);
  }
  policy(game) {
    return new LocationSpacingPolicy({
      setup: game.setup,
      coordinateMode: game.coordinateMode,
    });
  }
  available(game, playerId) {
    return Object.entries(game.scenarioRuntime?.placements ?? {}).filter(
      ([, placement]) =>
        ["player-walk", "validated-cell"].includes(placement.strategy) &&
        placement.status !== "placed" &&
        (placement.world?.visibility === "discoverable" ||
          scenarioLocationHasAppeared(
            game.getLocation(placement.locationId),
            game,
            playerId,
          )),
    );
  }
  recordPosition(game, playerId, position, accuracy, at) {
    const state = game.worldState.get("playerPlacement");
    if (
      !state ||
      !game.heroes.some(
        (hero) => hero.playerId === playerId && hero.state === "active",
      )
    )
      return;
    const valid =
      game.setup.playArea.allowsPlacement(position) &&
      (game.coordinateMode === "simulation" ||
        (Number.isFinite(accuracy) && accuracy <= 50 && accuracy >= 0));
    for (const walk of Object.values(state.walks[playerId] ?? {})) {
      if (!valid) {
        walk.last = null;
        continue;
      }
      if (walk.last && at > walk.at) {
        const segment =
          this.policy(game).distance(walk.last, position) *
          (game.coordinateMode === "simulation" ? 10 : 1);
        if (
          segment <= 250 &&
          (game.coordinateMode === "simulation" ||
            segment <= ((at - walk.at) / 1000) * 8)
        )
          walk.distanceMeters += segment;
      }
      walk.last = {
        latitude: position.latitude,
        longitude: position.longitude,
      };
      walk.at = at;
    }
  }
  options(game, playerId) {
    const state = this.state(game),
      team = this.team(game, playerId);
    return {
      success: true,
      pendingLocations: this.available(game, playerId).map(
        ([id, placement]) => ({
          id,
          name: game.getLocation(placement.locationId).name,
          mode: placement.strategy,
          requiredMeters: placement.walkingDistanceMeters,
          walk: structuredClone(state.walks[playerId]?.[id] ?? null),
        }),
      ),
      mission: structuredClone(state.missions[playerId] ?? null),
      cells: Object.values(state.cells)
        .filter((cell) => cell.teamId === team && !cell.usedBy)
        .map((cell) => structuredClone(cell)),
    };
  }
  command(game, { playerId, action, slotId, cellId }, officialPosition) {
    const hero = game.heroes.find(
      (h) => h.playerId === playerId && h.state === "active",
    );
    if (!hero || game.status !== "started")
      return { success: false, reason: "active_hero_required" };
    if (action === "options") return this.options(game, playerId);
    if (!officialPosition)
      return { success: false, reason: "fresh_position_required" };
    const state = this.state(game),
      team = this.team(game, playerId),
      now = game.now();
    if (!game.setup.playArea.allowsPlacement(officialPosition))
      return { success: false, reason: "outside_play_area" };
    const available = this.available(game, playerId);
    if (action === "start-survey") {
      if (state.missions[playerId]?.status === "active")
        return this.options(game, playerId);
      game.territoryService.initialize(game);
      const policy = this.policy(game);
      const candidates = game.territoryState.grid.cells.filter(
        (cell) =>
          !state.cells[cell.id] &&
          !inside(cell, officialPosition) &&
          cell.bounds.every((p) => game.setup.playArea.allowsPlacement(p)) &&
          game.setup.playArea.allowsPlacement(cell.center) &&
          policy.distance(officialPosition, cell.center) >=
            (game.coordinateMode === "simulation" ? 2 : 20) &&
          available.some(
            ([, entry]) =>
              entry.strategy === "validated-cell" &&
              policy.check(
                game.getLocation(entry.locationId),
                cell.center,
                placedLocations(game),
              ).success,
          ),
      );
      candidates.sort(
        (a, b) =>
          policy.distance(officialPosition, a.center) -
          policy.distance(officialPosition, b.center),
      );
      if (!candidates.length)
        return { success: false, reason: "no_compatible_cell" };
      state.missions[playerId] = {
        id: game.idGenerator("survey"),
        title: "Repérage d’un emplacement",
        status: "active",
        cell: structuredClone(candidates[0]),
        acceptedAt: now,
      };
      return this.options(game, playerId);
    }
    if (action === "complete-survey") {
      const mission = state.missions[playerId];
      if (!mission || mission.status !== "active")
        return { success: false, reason: "survey_not_active" };
      const cell = mission.cell;
      if (!inside(cell, officialPosition))
        return { success: false, reason: "survey_target_not_reached" };
      if (
        state.cells[cell.id] ||
        !available.some(
          ([, entry]) =>
            entry.strategy === "validated-cell" &&
            this.policy(game).check(
              game.getLocation(entry.locationId),
              cell.center,
              placedLocations(game),
            ).success,
        )
      )
        return { success: false, reason: "cell_unavailable" };
      state.cells[cell.id] = {
        ...structuredClone(cell),
        teamId: team,
        validatedBy: playerId,
        missionId: mission.id,
        validatedAt: now,
        usedBy: null,
      };
      mission.status = "completed";
      mission.completedAt = now;
      game.eventLog.push({
        type: "survey_completed",
        playerId,
        cellId: cell.id,
        at: now,
      });
      return this.options(game, playerId);
    }
    if (action === "abandon-survey") {
      if (state.missions[playerId]?.status === "active")
        state.missions[playerId].status = "abandoned";
      return this.options(game, playerId);
    }
    const entry = available.find(([id]) => id === slotId)?.[1];
    if (!entry) return { success: false, reason: "placement_unavailable" };
    if (action === "start-walk" && entry.strategy === "player-walk") {
      state.walks[playerId] ??= {};
      state.walks[playerId][slotId] ??= {
        distanceMeters: 0,
        last: { ...officialPosition },
        at: now,
      };
      return this.options(game, playerId);
    }
    let position, cell;
    if (action === "place-walk" && entry.strategy === "player-walk") {
      if (
        (state.walks[playerId]?.[slotId]?.distanceMeters ?? 0) <
        entry.walkingDistanceMeters
      )
        return { success: false, reason: "walking_distance_required" };
      position = officialPosition;
    } else if (action === "place-cell" && entry.strategy === "validated-cell") {
      cell = state.cells[cellId];
      if (!cell || cell.teamId !== team || cell.usedBy)
        return { success: false, reason: "cell_unavailable" };
      position = cell.center;
    } else return { success: false, reason: "invalid_placement_action" };
    const moved = game.updateLocationPosition({
      locationId: entry.locationId,
      position,
    });
    if (!moved.success) return moved;
    entry.status = "placed";
    entry.position = { ...position };
    if (cell) cell.usedBy = entry.locationId;
    game.eventLog.push({
      type: "player_location_placed",
      playerId,
      slotId,
      cellId: cell?.id ?? null,
      at: now,
    });
    return { ...moved, ...this.options(game, playerId) };
  }
}

function inside(cell, p) {
  const [a, b] = cell.bounds;
  return (
    p.latitude >= a.latitude &&
    p.latitude < b.latitude &&
    p.longitude >= a.longitude &&
    p.longitude < b.longitude
  );
}
