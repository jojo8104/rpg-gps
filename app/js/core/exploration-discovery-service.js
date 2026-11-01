import { PlayAreaGrid } from "./play-area-grid.js";
import { distanceMeters } from "./geo.js";

export const DEFAULT_SPECIALIST_DISCOVERY_CHANCES = Object.freeze({
  specialist_geologist: Object.freeze({ stone: 0.5, iron: 0.5, gold: 0.5 }),
  specialist_miner: Object.freeze({ iron: 0.5, gold: 0.5 }),
  specialist_lumberjack: Object.freeze({ wood: 0.5 }),
  specialist_farmer: Object.freeze({ "fertile-land": 0.5 }),
  specialist_cartographer: Object.freeze({
    wood: 0.2,
    stone: 0.2,
    iron: 0.2,
    gold: 0.2,
    "fertile-land": 0.2,
  }),
  specialist_adventurer: Object.freeze({
    wood: 0.2,
    stone: 0.2,
    iron: 0.2,
    gold: 0.2,
    "fertile-land": 0.2,
  }),
});

/** Révèle des connaissances, sans créer de lieu, de production ni de récompense. */
export class ExplorationDiscoveryService {
  constructor(
    game,
    {
      random = Math.random,
      chances = DEFAULT_SPECIALIST_DISCOVERY_CHANCES,
    } = {},
  ) {
    this.game = game;
    for (const resources of Object.values(chances))
      for (const chance of Object.values(resources))
        if (!Number.isFinite(chance) || chance < 0 || chance > 1)
          throw new RangeError("Probabilité de spécialiste invalide.");
    this.random = random;
    this.chances = chances;
  }
  get state() {
    return this.game.explorationState;
  }
  grid() {
    if (!this.state.grid || !this.state.cells.length) return null;
    if (this.cachedState !== this.state) {
      this.cachedState = this.state;
      this.cachedGrid = new PlayAreaGrid({
        playArea: this.state.generation?.playArea ?? this.game.setup.playArea,
        cellSizeMeters: this.state.grid.cellSizeMeters,
      });
    }
    return this.cachedGrid;
  }
  reveal(playerId, targetKind, targetId, source, at) {
    if (
      !this.game.getPlayer(playerId) ||
      this.state.discoveries.some(
        (entry) =>
          entry.playerId === playerId &&
          entry.targetKind === targetKind &&
          entry.targetId === targetId,
      )
    )
      return false;
    this.state.discoveries.push({
      playerId,
      targetKind,
      targetId,
      source,
      discoveredAt: at,
    });
    return true;
  }
  inspectProspectingSegment(group, segment) {
    if (
      !this.game.getPlayer(group.owner?.id) ||
      group.mission?.phase !== "exploring"
    )
      return [];
    const grid = this.grid();
    if (!grid) return [];
    const cells = new Map(this.state.cells.map((cell) => [cell.id, cell]));
    const discovered = [];
    for (const square of grid.cells) {
      if (!segmentIntersectsCell(segment.from, segment.to, square)) continue;
      const cell = cells.get(square.id);
      if (
        cell &&
        !cell.suppressedByLocationIds.length &&
        this.reveal(
          group.owner.id,
          "cell",
          cell.id,
          "prospecting",
          segment.toAt,
        )
      )
        discovered.push(cell.id);
      for (const site of this.state.sites.filter(
        (site) =>
          site.cellId === square.id &&
          site.status === "active" &&
          !site.hostLocationId,
      ))
        if (
          this.reveal(
            group.owner.id,
            "site",
            site.id,
            "prospecting",
            segment.toAt,
          )
        )
          discovered.push(site.id);
    }
    for (const id of discovered)
      if (!group.mission.discoveries.includes(id))
        group.mission.discoveries.push(id);
    return discovered;
  }
  inspectHeroPosition({
    heroId,
    position,
    previousPosition = null,
    accuracy = 0,
    at = this.game.now(),
  }) {
    const hero = this.game.getHero(heroId),
      grid = this.grid();
    if (
      !hero ||
      hero.state !== "active" ||
      !this.game.getPlayer(hero.playerId) ||
      !grid ||
      !this.game.setup.playArea.allowsPlacement(position)
    )
      return [];
    if (
      this.game.coordinateMode === "gps" &&
      (!Number.isFinite(accuracy) ||
        accuracy < 0 ||
        accuracy > 50 ||
        (previousPosition && distanceMeters(previousPosition, position) > 250))
    )
      return [];
    const carried = Object.keys(this.chances).filter(
      (id) =>
        (hero.resources[id] ?? 0) +
          hero.carriedLoot
            .filter((entry) => entry.itemId === id)
            .reduce((sum, entry) => sum + entry.quantity, 0) >=
        1,
    );
    if (!carried.length) return [];
    const from =
      previousPosition &&
      this.game.setup.playArea.allowsPlacement(previousPosition)
        ? previousPosition
        : position;
    const cells = new Map(this.state.cells.map((cell) => [cell.id, cell]));
    const discovered = [];
    for (const square of grid.cells) {
      if (!segmentIntersectsCell(from, position, square)) continue;
      const cell = cells.get(square.id);
      if (
        !cell ||
        cell.resource === "none" ||
        cell.suppressedByLocationIds.length
      )
        continue;
      if (
        this.state.discoveries.some(
          (entry) =>
            entry.playerId === hero.playerId &&
            entry.targetKind === "cell" &&
            entry.targetId === cell.id,
        )
      )
        continue;
      for (const specialistId of carried) {
        const chance = this.chances[specialistId][cell.resource] ?? 0;
        if (
          !chance ||
          this.state.discoveryAttempts.some(
            (entry) =>
              entry.playerId === hero.playerId &&
              entry.cellId === cell.id &&
              entry.specialistId === specialistId,
          )
        )
          continue;
        const roll = this.random();
        if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
          throw new RangeError("Tirage de découverte invalide.");
        this.state.discoveryAttempts.push({
          playerId: hero.playerId,
          cellId: cell.id,
          specialistId,
          chance,
          roll,
          at,
        });
        if (
          roll < chance &&
          this.reveal(hero.playerId, "cell", cell.id, "specialist", at)
        ) {
          discovered.push(cell.id);
          break;
        }
      }
    }
    return discovered;
  }
}

/** Intersection segment/carré exacte : aucune cellule traversée n’est sautée. */
export function segmentIntersectsCell(from, to, cell) {
  let start = 0,
    end = 1;
  for (const axis of ["latitude", "longitude"]) {
    const delta = to[axis] - from[axis],
      min = cell.bounds[0][axis],
      max = cell.bounds[1][axis];
    if (delta === 0) {
      if (from[axis] < min || from[axis] > max) return false;
      continue;
    }
    const a = (min - from[axis]) / delta,
      b = (max - from[axis]) / delta;
    start = Math.max(start, Math.min(a, b));
    end = Math.min(end, Math.max(a, b));
    if (start > end) return false;
  }
  return true;
}
