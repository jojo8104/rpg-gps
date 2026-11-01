import { closeExceptionalSite } from "./exceptional-site-closure.js";
import { Location } from "./location.js";
import { PlayArea } from "./play-area.js";
import { ExteriorSearchService } from "./exterior-search-service.js";
import { ExceptionalExpeditionService } from "./exceptional-expedition-service.js";
import {
  LocationSpacingPolicy,
  placedLocations,
} from "./location-spacing-policy.js";
import { CAMP_FOUNDATION_COST } from "./camp-terrain-rules.js";
import {
  planLocationPayment,
  spendLocationPayment,
} from "./location-payment.js";
import { AutonomousGroup } from "./autonomous-group.js";
import { expedition } from "./exploration-records.js";

export class CampInstallationService {
  constructor(game) {
    this.game = game;
  }
  get state() {
    return this.game.explorationState;
  }
  hero(id) {
    return this.game.getHero?.(id) ?? this.game.heroes.find((h) => h.id === id);
  }
  location(id) {
    return (
      this.game.getLocation?.(id) ??
      this.game.locations.find((l) => l.id === id)
    );
  }
  grid() {
    if (this.cachedState !== this.state) {
      this.cachedState = this.state;
      this.cachedGrid = new ExteriorSearchService(this.game).grid();
      this.cellById = new Map(this.state.cells.map((c) => [c.id, c]));
      this.squareById = new Map(
        (this.cachedGrid?.cells ?? []).map((c) => [c.id, c]),
      );
    }
    return this.cachedGrid;
  }
  world() {
    return {
      ...this.game,
      setup: {
        ...this.game.setup,
        playArea: new PlayArea(
          this.state.generation?.playArea ?? this.game.setup.playArea,
        ),
      },
    };
  }
  actor(request) {
    return new ExceptionalExpeditionService(this.game).actor(request);
  }
  canInteract(hero, location) {
    if (!hero || !this.actor({ playerId: hero.playerId, heroId: hero.id }))
      return false;
    const world = this.world(),
      policy = new LocationSpacingPolicy({
        setup: world.setup,
        coordinateMode: world.coordinateMode,
      });
    return (
      policy.distance(hero.position, location.position) <=
      policy.radius(location)
    );
  }
  known(playerId, cellId) {
    return this.state.discoveries.some(
      (d) =>
        d.playerId === playerId &&
        d.targetKind === "cell" &&
        d.targetId === cellId,
    );
  }
  check(playerId, cellId, geometry = null) {
    if (!(geometry?.knownCells?.has(cellId) ?? this.known(playerId, cellId)))
      return { success: false, reason: "installation_unknown_cell" };
    this.grid();
    const cell = this.cellById.get(cellId),
      square = this.squareById.get(cellId);
    if (!cell || !square)
      return { success: false, reason: "installation_outside_area" };
    const current = this.location(cell.campLocationId);
    if (current && current.state !== "destroyed")
      return {
        success: false,
        reason: "installation_occupied",
        locationId: current.ownerId === playerId ? current.id : null,
      };
    if (
      cell.suppressedByLocationIds.some(
        (id) => this.location(id)?.state !== "destroyed",
      )
    )
      return { success: false, reason: "installation_under_influence" };
    const world = geometry?.world ?? this.world(),
      policy =
        geometry?.policy ??
        new LocationSpacingPolicy({
          setup: world.setup,
          coordinateMode: world.coordinateMode,
        });
    const placement = policy.check(
      { id: "new-camp", type: "camp", interactionRadius: 25 },
      square.center,
      geometry?.locations ?? placedLocations(world),
    );
    if (!placement.success)
      return { success: false, reason: "installation_too_close" };
    return { success: true, cell, square };
  }
  controls(heroId) {
    const hero = this.hero(heroId);
    if (!hero) return null;
    const actor = this.actor({ playerId: hero.playerId, heroId });
    const cell = hero.position && this.grid()?.getCellAt(hero.position);
    const world = this.world(),
      knownCells = new Set(
        this.state.discoveries
          .filter(
            (d) => d.playerId === hero.playerId && d.targetKind === "cell",
          )
          .map((d) => d.targetId),
      );
    const geometry = {
      world,
      knownCells,
      policy: new LocationSpacingPolicy({
        setup: world.setup,
        coordinateMode: world.coordinateMode,
      }),
      locations: placedLocations(world),
    };
    const targets = this.state.cells
      .filter((c) => knownCells.has(c.id))
      .map((c) => {
        const check = this.check(hero.playerId, c.id, geometry);
        return {
          id: c.id,
          row: c.row,
          column: c.column,
          resource: c.resource,
          available: !!actor && check.success,
          reason: check.reason ?? null,
        };
      });
    const available = new ExceptionalExpeditionService(this.game);
    const origins = actor
      ? this.game.locations
          .filter((l) => available.source(hero, l.id))
          .map((l) => ({
            id: l.id,
            name: l.name,
            affordable: planLocationPayment(l, CAMP_FOUNDATION_COST).affordable,
          }))
      : [];
    const payment = planLocationPayment(
      { resources: { stock: {} } },
      CAMP_FOUNDATION_COST,
      hero,
    );
    return {
      heroId,
      currentCellId: cell?.id ?? null,
      targets,
      origins,
      cost: { ...CAMP_FOUNDATION_COST },
      canFound:
        !!actor &&
        targets.some((t) => t.id === cell?.id && t.available) &&
        payment.affordable,
      affordable: payment.affordable,
    };
  }
  createCamp(playerId, check) {
    let id = `founded-${check.cell.id}`,
      serial = 1;
    while (this.location(id)) id = `founded-${check.cell.id}-${serial++}`;
    const camp = new Location({
      id,
      name: `Camp ${this.game.locations.filter((l) => l.terrain).length + 1}`,
      type: "camp",
      source: "player-foundation",
      position: check.square.center,
      ownerId: playerId,
      controllerId: playerId,
      visibility: "hidden",
      population: 0,
      populationCapacity: 8,
      defenseSlots: 1,
      terrain: { cellId: check.cell.id, resource: check.cell.resource },
      features: { capturable: true, battle: true },
      resources: { stock: {}, production: {} },
      qr: { enabled: false },
    });
    this.game.locationProgressionService.initialize(camp);
    this.game.campImprovementService.applyEffects(camp);
    this.game.locations.push(camp);
    check.cell.campLocationId = camp.id;
    this.game.getPlayer(playerId).discoverLocation(camp.id, 3);
    this.applyInfluence(camp, check.cell.id);
    return camp;
  }
  applyInfluence(camp, sourceCellId) {
    const world = this.world(),
      policy = new LocationSpacingPolicy({
        setup: world.setup,
        coordinateMode: world.coordinateMode,
      }),
      radius = policy.radius(camp);
    const influencedCells = new Set([sourceCellId]);
    for (const square of this.grid().cells) {
      if (square.id === sourceCellId) continue;
      const [sw, ne] = square.bounds;
      const nearest = {
        latitude: Math.max(
          sw.latitude,
          Math.min(ne.latitude, camp.position.latitude),
        ),
        longitude: Math.max(
          sw.longitude,
          Math.min(ne.longitude, camp.position.longitude),
        ),
      };
      if (policy.distance(camp.position, nearest) > radius) continue;
      influencedCells.add(square.id);
      const cell = this.cellById.get(square.id);
      if (!cell || cell.campLocationId) continue;
      if (!cell.suppressedByLocationIds.includes(camp.id))
        cell.suppressedByLocationIds.push(camp.id);
      cell.resource = "none";
    }
    for (const site of this.state.sites)
      if (site.status === "active" && influencedCells.has(site.cellId))
        closeExceptionalSite(this.game, site.id, {
          eventId: `camp-influence:${camp.id}`,
          at: this.game.now(),
          reason: "camp_influence",
        });
  }
  found(request) {
    const hero = this.actor(request);
    if (!hero)
      return { success: false, reason: "installation_hero_unavailable" };
    const square = this.grid()?.getCellAt(hero.position);
    if (square?.id !== request.cellId)
      return { success: false, reason: "installation_not_on_cell" };
    const check = this.check(request.playerId, request.cellId);
    if (!check.success) {
      if (check.reason === "installation_occupied" && check.locationId)
        return {
          success: true,
          replayed: true,
          locationId: check.locationId,
          message: "Votre camp est déjà installé sur cette case.",
        };
      return check;
    }
    const source = { resources: { stock: {} } };
    if (!planLocationPayment(source, CAMP_FOUNDATION_COST, hero).affordable)
      return { success: false, reason: "insufficient_resources" };
    const camp = this.createCamp(request.playerId, check);
    spendLocationPayment(source, CAMP_FOUNDATION_COST, hero);
    for (const location of this.game.locations)
      if (location.id !== camp.id)
        location.heroIds = location.heroIds.filter((id) => id !== hero.id);
    camp.heroIds.push(hero.id);
    return {
      success: true,
      locationId: camp.id,
      message: "Le camp est fondé. Installez des habitants pour le développer.",
    };
  }
  send(request) {
    const hero = this.actor(request);
    if (!hero)
      return { success: false, reason: "installation_hero_unavailable" };
    const check = this.check(request.playerId, request.cellId);
    if (!check.success) {
      if (check.reason === "installation_occupied" && check.locationId)
        return {
          success: true,
          replayed: true,
          locationId: check.locationId,
          message: "Votre camp est déjà installé sur cette case.",
        };
      return { success: false, reason: check.reason };
    }
    const source = new ExceptionalExpeditionService(this.game).source(
      hero,
      request.originLocationId,
    );
    if (!request.originLocationId || !source?.origin)
      return { success: false, reason: "prospecting_post_unavailable" };
    const existing = this.state.expeditions.find(
      (m) =>
        m.kind === "installation" &&
        m.playerId === request.playerId &&
        m.cellId === request.cellId &&
        ["travelling", "resolving"].includes(m.status),
    );
    if (existing)
      return {
        success: true,
        replayed: true,
        expeditionId: existing.id,
        message: "Une installation est déjà en route vers cette case.",
      };
    if (!planLocationPayment(source.origin, CAMP_FOUNDATION_COST).affordable)
      return { success: false, reason: "insufficient_resources" };
    let serial = this.state.expeditions.length + 1;
    while (
      this.state.expeditions.some((m) => m.id === `camp-installation-${serial}`)
    )
      serial++;
    const id = `camp-installation-${serial}`;
    const mission = expedition({
      id,
      playerId: request.playerId,
      kind: "installation",
      cellId: check.cell.id,
      groupId: `${id}-group`,
      originLocationId: source.origin.id,
      status: "travelling",
      createdAt: this.game.now(),
      departedAt: this.game.now(),
      preparation: {
        resources: {
          wood: CAMP_FOUNDATION_COST.wood,
          food: CAMP_FOUNDATION_COST.food,
        },
        equipment: {
          exploration_tools: CAMP_FOUNDATION_COST.exploration_tools,
        },
      },
      engagement: { preparerHeroId: hero.id },
    });
    const group = new AutonomousGroup({
      id: mission.groupId,
      type: "convoy",
      owner: { kind: "player", id: request.playerId },
      originLocationId: source.origin.id,
      position: source.origin.position,
      behavior: "passive",
      cargo: Object.entries(CAMP_FOUNDATION_COST).map(([itemId, quantity]) => ({
        itemId,
        quantity,
      })),
      mission: {
        managedBy: "camp_installation",
        coordinateMode: this.game.coordinateMode,
        destination: { ...check.square.center },
        active: true,
        expeditionId: id,
      },
    });
    spendLocationPayment(source.origin, CAMP_FOUNDATION_COST);
    this.state.expeditions.push(mission);
    this.game.autonomousGroups.push(group);
    return {
      success: true,
      expeditionId: id,
      message: "L’expédition d’installation est partie.",
    };
  }
  update() {
    for (const mission of this.state.expeditions) {
      if (mission.kind !== "installation" || !mission.engagement) continue;
      const group = this.game.getAutonomousGroup(mission.groupId);
      if (!group) continue;
      if (
        mission.status === "travelling" &&
        group.status === "arrived" &&
        group.mission.phase === "waiting"
      ) {
        const check = this.check(mission.playerId, mission.cellId);
        const quantities = Object.fromEntries(
          Object.keys(CAMP_FOUNDATION_COST).map((id) => [
            id,
            group.cargo
              .filter((i) => i.itemId === id)
              .reduce((n, i) => n + i.quantity, 0),
          ]),
        );
        if (
          !check.success ||
          Object.entries(CAMP_FOUNDATION_COST).some(
            ([id, n]) => quantities[id] < n,
          )
        ) {
          mission.result = {
            success: false,
            at: this.game.now(),
            message:
              "Installation impossible à l’arrivée. Le groupe rapporte les moyens restants.",
            pendingItems: [],
            reason: check.reason ?? "insufficient_resources",
          };
          this.game.exceptionalSiteResolutionService.finishOrReturn(
            mission,
            group,
          );
          continue;
        }
        const camp = this.createCamp(mission.playerId, check);
        for (const [id, cost] of Object.entries(CAMP_FOUNDATION_COST)) {
          let left = cost;
          for (const item of group.cargo)
            if (item.itemId === id) {
              const n = Math.min(item.quantity, left);
              item.quantity -= n;
              left -= n;
            }
        }
        group.cargo = group.cargo.filter((i) => i.quantity > 0);
        group.status = "completed";
        group.movement = null;
        group.mission.active = false;
        group.mission.phase = "completed";
        mission.status = "completed";
        mission.completedAt = this.game.now();
        mission.result = {
          success: true,
          at: this.game.now(),
          locationId: camp.id,
          message: "Camp installé. Il attend ses habitants.",
          consumed: { ...CAMP_FOUNDATION_COST },
          pendingItems: [],
        };
        mission.processedEventIds.push(`installed:${mission.id}`);
      }
      if (
        mission.status === "returning" &&
        group.mission.returnPending &&
        group.status !== "interrupted"
      )
        this.game.exceptionalSiteResolutionService.finishOrReturn(
          mission,
          group,
        );
      if (
        mission.status === "returning" &&
        group.status === "arrived" &&
        group.mission.phase === "returned"
      )
        this.game.exceptionalSiteResolutionService.settle(mission, group);
    }
  }
}
