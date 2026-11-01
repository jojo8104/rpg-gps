import { PlayArea } from "./play-area.js";
import { PlayAreaGrid } from "./play-area-grid.js";
import {
  LocationSpacingPolicy,
  placedLocations,
  isSpacedLocation,
} from "./location-spacing-policy.js";
import { getItemDefinition } from "./item-catalog.js";
import { searchAttempt } from "./exploration-records.js";

export const EXTERIOR_SEARCH_DURATION_MS = 60_000;
export const SEARCH_RESOURCE_POINTS = Object.freeze({
  wood: 1,
  food: 1,
  beer: 2,
  exploration_tools: 5,
});
export const SEARCH_SPECIALISTS = Object.freeze([
  "specialist_geologist",
  "specialist_miner",
  "specialist_lumberjack",
  "specialist_farmer",
  "specialist_cartographer",
  "specialist_adventurer",
]);

/** Règles exécutées par le serveur ; les contrôles publiés ne révèlent aucune cible cachée. */
export class ExteriorSearchService {
  constructor(game, { random = Math.random } = {}) {
    this.game = game;
    this.random = random;
  }
  get state() {
    return this.game.explorationState;
  }
  now() {
    return this.game.now();
  }
  hero(id) {
    return (
      this.game.getHero?.(id) ?? this.game.heroes.find((hero) => hero.id === id)
    );
  }
  player(id) {
    return (
      this.game.getPlayer?.(id) ??
      this.game.players.find((player) => player.id === id)
    );
  }
  grid() {
    if (!this.state.grid || !this.state.cells?.length) return null;
    if (this.cachedState !== this.state) {
      this.cachedState = this.state;
      this.area = new PlayArea(
        this.state.generation?.playArea ?? this.game.setup.playArea,
      );
      const base = new PlayAreaGrid({
        playArea: this.area,
        cellSizeMeters: this.state.grid.cellSizeMeters,
        cells: [],
      });
      const cells = this.state.cells.map((cell) => {
        const south = base.origin.latitude + cell.row * base.latitudeStep,
          west = base.origin.longitude + cell.column * base.longitudeStep;
        return {
          id: cell.id,
          row: cell.row,
          column: cell.column,
          bounds: [
            { latitude: south, longitude: west },
            {
              latitude: south + base.latitudeStep,
              longitude: west + base.longitudeStep,
            },
          ],
          center: {
            latitude: south + base.latitudeStep / 2,
            longitude: west + base.longitudeStep / 2,
          },
        };
      });
      this.cachedGrid = new PlayAreaGrid({
        playArea: this.area,
        cellSizeMeters: this.state.grid.cellSizeMeters,
        cells,
      });
    }
    return this.cachedGrid;
  }
  actor(playerId, heroId) {
    const hero = this.hero(heroId),
      grid = this.grid();
    if (
      !hero ||
      hero.playerId !== playerId ||
      !this.player(playerId) ||
      hero.state !== "active" ||
      this.game.status !== "started"
    )
      return { reason: "search_hero_unavailable" };
    if (
      (this.game.battles ?? []).some(
        (battle) =>
          battle.status !== "finished" &&
          battle.teams.some((team) =>
            team.heroes.some((member) => member.sourceId === heroId),
          ),
      )
    )
      return { reason: "hero_busy" };
    if (!grid || !hero.position || !this.area.allowsPlacement(hero.position))
      return { reason: "search_outside_area" };
    if (
      this.game.coordinateMode === "gps" &&
      (hero.position.accuracy ?? 0) > 50
    )
      return { reason: "search_gps_accuracy" };
    const square = grid.getCellAt(hero.position);
    if (!square) return { reason: "search_outside_area" };
    const setup = { ...this.game.setup, playArea: this.area };
    const policy = new LocationSpacingPolicy({
      setup,
      coordinateMode: this.game.coordinateMode,
    });
    const world = { ...this.game, setup, locations: this.game.locations };
    if (
      placedLocations(world).some(
        (location) =>
          location.state !== "destroyed" &&
          isSpacedLocation(location) &&
          !location.roles?.includes("clue") &&
          policy.distance(hero.position, location.position) <=
            policy.radius(location),
      )
    )
      return { reason: "search_inside_location" };
    return { hero, square };
  }
  quantity(hero, id) {
    return (
      (hero.resources?.[id] ?? 0) +
      (hero.carriedLoot ?? [])
        .filter((entry) => entry.itemId === id)
        .reduce((sum, entry) => sum + entry.quantity, 0)
    );
  }
  clues(hero) {
    return (this.state.clues ?? []).filter(
      (clue) =>
        clue.kind === "search" &&
        clue.status === "active" &&
        clue.holder?.kind === "hero" &&
        clue.holder.id === hero.id &&
        (hero.carriedLoot ?? []).some(
          (item) => item.itemId === clue.id && item.quantity > 0,
        ),
    );
  }
  active(heroId) {
    return (this.state.searches ?? []).find(
      (entry) => entry.heroId === heroId && entry.status === "preparing",
    );
  }
  cooldown(heroId) {
    return (this.state.searches ?? []).reduce(
      (latest, entry) =>
        entry.heroId === heroId
          ? Math.max(latest, entry.cooldownUntil)
          : latest,
      0,
    );
  }
  controls(heroId) {
    const hero = this.hero(heroId);
    if (!hero) return null;
    const actor = this.actor(hero.playerId, heroId),
      active = this.active(heroId),
      now = this.now();
    const known =
      actor.square &&
      this.state.sites.some(
        (site) =>
          site.cellId === actor.square.id &&
          this.state.discoveries.some(
            (entry) =>
              entry.playerId === hero.playerId &&
              entry.targetKind === "site" &&
              entry.targetId === site.id,
          ),
      );
    const reason =
      actor.reason ??
      (known
        ? "search_already_known"
        : active
          ? "search_in_progress"
          : this.cooldown(heroId) > now
            ? "search_cooldown"
            : null);
    return {
      heroId,
      serverNow: now,
      canStart: reason === null,
      reason,
      activeSearchId: active?.id ?? null,
      canPrepare:
        !!active &&
        !actor.reason &&
        !known &&
        actor.square.id === active.cellId,
      cooldownUntil: this.cooldown(heroId),
      discretionPenaltyUntil:
        hero.classFeatureState?.exteriorSearch?.discretionPenaltyUntil ?? 0,
      resources: Object.keys(SEARCH_RESOURCE_POINTS).map((id) => ({
        id,
        name: getItemDefinition(id)?.name ?? id,
        available: Math.max(0, Math.floor(this.quantity(hero, id))),
      })),
      specialists: SEARCH_SPECIALISTS.filter(
        (id) => this.quantity(hero, id) >= 1,
      ).map((id) => ({ id, name: getItemDefinition(id)?.name ?? id })),
      clues: this.clues(hero).map((clue) => ({
        id: clue.id,
        name:
          this.state.sites.find((site) => site.id === clue.siteId)?.name ??
          "Message de recherche",
        text: clue.text,
      })),
    };
  }
  begin({ playerId, heroId }) {
    const actor = this.actor(playerId, heroId);
    if (actor.reason) return { success: false, reason: actor.reason };
    const controls = this.controls(heroId);
    if (!controls.canStart) return { success: false, reason: controls.reason };
    const at = this.now();
    const attempt = searchAttempt({
      id: this.game.idGenerator("exterior-search"),
      playerId,
      heroId,
      position: actor.hero.position,
      cellId: actor.square.id,
      startedAt: at,
      cooldownUntil: at + EXTERIOR_SEARCH_DURATION_MS,
      discretionPenaltyUntil: at + EXTERIOR_SEARCH_DURATION_MS,
    });
    attempt.gauge = {
      clues: 0,
      specialists: 0,
      resources: 0,
      total: 0,
      chance: 0,
    };
    this.state.searches.push(attempt);
    actor.hero.classFeatureState.exteriorSearch = {
      cooldownUntil: attempt.cooldownUntil,
      discretionPenaltyUntil: attempt.discretionPenaltyUntil,
      active: true,
    };
    return {
      success: true,
      searchId: attempt.id,
      message:
        "Recherche ouverte : recharge de 60 s et discrétion réduite de 50 % pendant 60 s.",
    };
  }
  find({ playerId, heroId, searchId }) {
    return this.state.searches.find(
      (entry) =>
        entry.id === searchId &&
        entry.playerId === playerId &&
        entry.heroId === heroId,
    );
  }
  preparation(hero, value = {}) {
    if (
      !value ||
      Object.getPrototypeOf(value) !== Object.prototype ||
      Object.keys(value).some(
        (key) => !["clueIds", "npcIds", "resources"].includes(key),
      )
    )
      throw new RangeError("Préparation de recherche invalide.");
    const unique = (ids, allowed) => {
      if (
        !Array.isArray(ids) ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !allowed.includes(id))
      )
        throw new RangeError("Indice ou spécialiste indisponible.");
      return [...ids];
    };
    const clueIds = unique(
      value.clueIds ?? [],
      this.clues(hero).map((clue) => clue.id),
    );
    const npcIds = unique(
      value.npcIds ?? [],
      SEARCH_SPECIALISTS.filter((id) => this.quantity(hero, id) >= 1),
    );
    const resources = value.resources ?? {};
    if (!resources || Object.getPrototypeOf(resources) !== Object.prototype)
      throw new RangeError("Ressources invalides.");
    for (const [id, amount] of Object.entries(resources))
      if (
        !Object.hasOwn(SEARCH_RESOURCE_POINTS, id) ||
        !Number.isSafeInteger(amount) ||
        amount < 0 ||
        amount > this.quantity(hero, id)
      )
        throw new RangeError("Ressources de recherche indisponibles.");
    return { clueIds, npcIds, resources: { ...resources } };
  }
  gauge(preparation, siteId = undefined) {
    const ids = preparation.clueIds.filter(
      (id) =>
        siteId === undefined ||
        this.state.clues.find((clue) => clue.id === id)?.siteId === siteId,
    );
    const distinctClues = new Set(
      ids.map((id) => {
        const clue = this.state.clues.find((entry) => entry.id === id);
        return JSON.stringify([clue.siteId, clue.text]);
      }),
    ).size;
    const clues = Math.min(40, distinctClues * 20),
      specialists = Math.min(30, preparation.npcIds.length * 10);
    const resources = Math.min(
      30,
      Object.entries(preparation.resources).reduce(
        (sum, [id, amount]) => sum + SEARCH_RESOURCE_POINTS[id] * amount,
        0,
      ),
    );
    const total = clues + specialists + resources;
    return {
      clues,
      specialists,
      resources,
      total,
      chance: (0.9 * total) / 100,
    };
  }
  prepare(request) {
    const attempt = this.find(request),
      actor = this.actor(request.playerId, request.heroId);
    if (!attempt || attempt.status !== "preparing")
      return { success: false, reason: "search_unavailable" };
    if (actor.reason || actor.square.id !== attempt.cellId)
      return { success: false, reason: actor.reason ?? "search_moved" };
    let preparation;
    try {
      preparation = this.preparation(actor.hero, request.preparation);
    } catch {
      return { success: false, reason: "search_preparation_invalid" };
    }
    attempt.preparation = {
      clueIds: preparation.clueIds,
      npcIds: preparation.npcIds,
      resources: preparation.resources,
      volunteers: [],
      mounts: {},
      equipment: {},
    };
    attempt.gauge = this.gauge(preparation);
    return { success: true, searchId: attempt.id, gauge: { ...attempt.gauge } };
  }
  consume(hero, resources) {
    for (const [id, amount] of Object.entries(resources)) {
      let remaining = amount;
      for (const item of hero.carriedLoot)
        if (remaining > 0 && item.itemId === id) {
          const quantity = Math.min(item.quantity, remaining);
          item.quantity -= quantity;
          remaining -= quantity;
        }
      if (remaining > 0) hero.spendResource(id, remaining);
    }
    hero.carriedLoot = hero.carriedLoot.filter((item) => item.quantity > 0);
  }
  validate(request) {
    const attempt = this.find(request);
    if (!attempt) return { success: false, reason: "search_unavailable" };
    if (attempt.status === "resolved")
      return {
        success: true,
        replayed: true,
        searchId: attempt.id,
        message: attempt.result.message,
      };
    const actor = this.actor(request.playerId, request.heroId);
    if (
      attempt.status !== "preparing" ||
      actor.reason ||
      actor.square.id !== attempt.cellId
    )
      return { success: false, reason: actor.reason ?? "search_moved" };
    if (
      this.state.sites.some(
        (site) =>
          site.cellId === attempt.cellId &&
          this.state.discoveries.some(
            (entry) =>
              entry.playerId === request.playerId &&
              entry.targetKind === "site" &&
              entry.targetId === site.id,
          ),
      )
    )
      return { success: false, reason: "search_already_known" };
    const selected = request.preparation ?? {
      clueIds: attempt.preparation.clueIds,
      npcIds: attempt.preparation.npcIds,
      resources: attempt.preparation.resources,
    };
    let preparation;
    try {
      preparation = this.preparation(actor.hero, selected);
    } catch {
      return { success: false, reason: "search_preparation_invalid" };
    }
    const gauge = this.gauge(preparation);
    if (!gauge.total)
      return { success: false, reason: "search_empty_preparation" };
    const site = this.state.sites.find(
      (site) =>
        site.cellId === attempt.cellId &&
        site.status === "active" &&
        !site.hostLocationId &&
        !this.state.discoveries.some(
          (entry) =>
            entry.playerId === request.playerId &&
            entry.targetKind === "site" &&
            entry.targetId === site.id,
        ),
    );
    const actualGauge = this.gauge(preparation, site?.id ?? null),
      roll = this.random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
      throw new RangeError("Tirage de recherche invalide.");
    this.consume(actor.hero, preparation.resources);
    attempt.preparation = { ...attempt.preparation, ...preparation };
    attempt.gauge = gauge;
    const found = !!site && roll < actualGauge.chance;
    if (found) {
      this.state.discoveries.push({
        playerId: request.playerId,
        targetKind: "site",
        targetId: site.id,
        source: "search",
        discoveredAt: this.now(),
      });
      for (const clue of this.state.clues)
        if (
          clue.siteId === site.id &&
          clue.status === "active" &&
          ((clue.holder?.kind === "hero" &&
            this.hero(clue.holder.id)?.playerId === request.playerId) ||
            (clue.holder?.kind === "player" &&
              clue.holder.id === request.playerId))
        )
          clue.status = "obsolete";
    }
    const message = found
      ? `${{ treasure: "Trésor découvert", artifact: "Artefact découvert", dungeon: "Entrée de donjon découverte" }[site.type]}${site.name ? ` : ${site.name}.` : "."} Aucun butin n’est encore récupéré.`
      : "La recherche ne révèle aucun site exceptionnel.";
    attempt.status = "resolved";
    attempt.result = {
      success: found,
      at: this.now(),
      message,
      siteId: found ? site.id : null,
      roll,
      actualChance: site ? actualGauge.chance : 0,
      consumed: { ...preparation.resources },
    };
    return { success: true, found, searchId: attempt.id, message };
  }
  cancel(request) {
    const attempt = this.find(request);
    if (!attempt || attempt.status === "resolved")
      return { success: false, reason: "search_unavailable" };
    attempt.status = "cancelled";
    return {
      success: true,
      message:
        "Recherche annulée sans consommation. La recharge et la pénalité restent actives jusqu’à leur échéance.",
    };
  }
  refresh() {
    for (const hero of this.game.heroes) {
      const state = hero.classFeatureState?.exteriorSearch;
      if (state?.active && state.discretionPenaltyUntil <= this.now())
        state.active = false;
    }
  }
}
