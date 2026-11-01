import {
  configureExceptionalSite,
  exceptionalSuccessChance,
} from "./exceptional-site-rules.js";
import {
  expeditionParticipants,
  expeditionPower,
} from "./exceptional-expedition-party.js";
import { PlayArea } from "./play-area.js";
import { getItemDefinition } from "./item-catalog.js";
import { expedition } from "./exploration-records.js";
import { AutonomousGroup } from "./autonomous-group.js";
import { Unit } from "./unit.js";
import { ExteriorSearchService } from "./exterior-search-service.js";
import { LocationSpacingPolicy } from "./location-spacing-policy.js";

const ACTIVE = ["preparing", "travelling", "resolving", "returning"];
const RESOURCE_POINTS = { food: 1, wood: 1, beer: 2 };
const quantity = (source, id) =>
  Math.floor(
    (source.resources?.[id] ?? 0) +
      (source.carriedLoot ?? [])
        .filter((x) => x.itemId === id)
        .reduce((n, x) => n + x.quantity, 0),
  );
const units = (source) => source.army?.units ?? [];
const availableSoldiers = (unit) =>
  unit.combatantCount ??
  unit.soldierHealth?.filter((hp) => hp > unit.combatHealthThreshold).length ??
  unit.quantity;
export function expeditionScore(
  preparation,
  {
    relevantNpcIds = ["specialist_cartographer", "specialist_adventurer"],
    narrative = 0,
  } = {},
) {
  const npcs = Math.min(
    30,
    [...new Set(preparation.npcIds)].reduce(
      (sum, id) => sum + (relevantNpcIds.includes(id) ? 10 : 2),
      0,
    ),
  );
  const volunteers = Math.min(
    20,
    preparation.volunteers.reduce((sum, x) => sum + x.quantity * 2, 0),
  );
  const mounts = Math.min(10, (preparation.mounts.horse ?? 0) * 2);
  const equipment = Math.min(
    20,
    (preparation.equipment.exploration_tools ?? 0) * 5,
  );
  const resources = Math.min(
    20,
    Object.entries(preparation.resources).reduce(
      (sum, [id, n]) => sum + (RESOURCE_POINTS[id] ?? 0) * n,
      0,
    ),
  );
  const base = npcs + volunteers + mounts + equipment + resources;
  return {
    npcs,
    volunteers,
    mounts,
    equipment,
    resources,
    base,
    narrative,
    total: base + narrative,
  };
}
export function expeditionSuccessChance(score, target) {
  return Number.isFinite(target) && target > 0
    ? Math.min(0.95, (0.7 * score) / target)
    : null;
}

/** Préparation commune. Aucun tirage ni récompense : la résolution sera raccordée séparément. */
export class ExceptionalExpeditionService {
  constructor(game) {
    this.game = game;
  }
  get state() {
    return this.game.explorationState;
  }
  hero(id) {
    return this.game.getHero?.(id) ?? this.game.heroes.find((x) => x.id === id);
  }
  location(id) {
    return (
      this.game.getLocation?.(id) ??
      this.game.locations.find((x) => x.id === id)
    );
  }
  actor(request) {
    const hero = this.hero(request.heroId);
    if (
      !hero ||
      hero.playerId !== request.playerId ||
      hero.state !== "active" ||
      this.game.status !== "started"
    )
      return null;
    if (
      (this.game.battles ?? []).some(
        (b) =>
          b.status !== "finished" &&
          b.teams.some((t) => t.heroes.some((h) => h.sourceId === hero.id)),
      )
    )
      return null;
    if (
      !hero.position ||
      !new PlayArea(this.game.setup.playArea).allowsPlacement(hero.position) ||
      (this.game.coordinateMode === "gps" && (hero.position.accuracy ?? 0) > 50)
    )
      return null;
    return hero;
  }
  site(playerId, id) {
    const site = this.state.sites.find(
      (s) => s.id === id && s.status === "active" && !s.hostLocationId,
    );
    return site &&
      this.state.discoveries.some(
        (d) =>
          d.playerId === playerId &&
          d.targetKind === "site" &&
          d.targetId === id,
      )
      ? site
      : null;
  }
  source(hero, originLocationId) {
    if (!originLocationId) return { source: hero, army: units(hero) };
    const origin = this.location(originLocationId);
    if (
      !origin ||
      origin.ownerId !== hero.playerId ||
      origin.state === "destroyed" ||
      !origin.infrastructure?.prospecting_post ||
      !origin.heroIds?.includes(hero.id)
    )
      return null;
    const policy = new LocationSpacingPolicy({
      setup: this.game.setup,
      coordinateMode: this.game.coordinateMode,
    });
    if (
      !hero.position ||
      policy.distance(hero.position, origin.position) > policy.radius(origin) ||
      (this.game.coordinateMode === "gps" && (hero.position.accuracy ?? 0) > 50)
    )
      return null;
    return {
      source: { resources: origin.resources.stock },
      army: origin.garrison?.units ?? [],
      origin,
    };
  }
  available(hero, originLocationId = null) {
    const stock = this.source(hero, originLocationId);
    if (!stock) return null;
    const ids = new Set([
      ...Object.keys(stock.source.resources ?? {}),
      ...(stock.source.carriedLoot ?? []).map((x) => x.itemId),
    ]);
    return {
      originLocationId,
      originName: stock.origin?.name ?? null,
      npcs: [...ids]
        .filter(
          (id) =>
            ["specialist", "character"].includes(
              getItemDefinition(id)?.category,
            ) && quantity(stock.source, id) > 0,
        )
        .map((id) => ({ id, name: getItemDefinition(id).name })),
      volunteers: stock.army
        .filter(
          (u) =>
            u.ownerPlayerId === hero.playerId &&
            u.state === "active" &&
            availableSoldiers(u) > 0,
        )
        .map((u) => ({
          unitId: u.id,
          name: u.name ?? u.typeId,
          quantity: availableSoldiers(u),
        })),
      mounts: { horse: quantity(stock.source, "horse") },
      equipment: {
        exploration_tools: quantity(stock.source, "exploration_tools"),
      },
      resources: Object.fromEntries(
        Object.keys(RESOURCE_POINTS).map((id) => [
          id,
          quantity(stock.source, id),
        ]),
      ),
    };
  }
  controls(heroId) {
    const hero = this.hero(heroId);
    if (!hero) return null;
    if (!this.actor({ heroId, playerId: hero.playerId }))
      return {
        heroId,
        canPrepare: false,
        sites: [],
        sources: [
          {
            originLocationId: null,
            npcs: [],
            volunteers: [],
            mounts: {},
            equipment: {},
            resources: {},
          },
        ],
      };
    return {
      heroId,
      canPrepare: true,
      sites: this.state.sites
        .filter((s) => this.site(hero.playerId, s.id))
        .map((s) => ({ id: s.id, name: s.name ?? s.type, type: s.type })),
      sources: [
        this.available(hero),
        ...this.game.locations.map((l) => this.available(hero, l.id)),
      ].filter(Boolean),
    };
  }
  normalizePreparation(raw, available) {
    if (
      !raw ||
      Object.getPrototypeOf(raw) !== Object.prototype ||
      Object.keys(raw).some(
        (k) =>
          ![
            "clueIds",
            "npcIds",
            "volunteers",
            "mounts",
            "equipment",
            "resources",
          ].includes(k),
      )
    )
      return null;
    if (
      raw.clueIds != null &&
      (!Array.isArray(raw.clueIds) || raw.clueIds.length)
    )
      return null;
    const checked = {
      clueIds: [],
      npcIds: raw.npcIds ?? [],
      volunteers: raw.volunteers ?? [],
      mounts: {},
      equipment: {},
      resources: {},
    };
    if (
      !Array.isArray(checked.npcIds) ||
      new Set(checked.npcIds).size !== checked.npcIds.length ||
      checked.npcIds.some((id) => !available.npcs.some((n) => n.id === id))
    )
      return null;
    if (
      !Array.isArray(checked.volunteers) ||
      new Set(checked.volunteers.map((v) => v?.unitId)).size !==
        checked.volunteers.length ||
      checked.volunteers.some(
        (v) =>
          !v ||
          Object.keys(v).some((k) => !["unitId", "quantity"].includes(k)) ||
          !Number.isSafeInteger(v.quantity) ||
          v.quantity < 0 ||
          v.quantity >
            (available.volunteers.find((u) => u.unitId === v.unitId)
              ?.quantity ?? -1),
      )
    )
      return null;
    for (const category of ["mounts", "equipment", "resources"]) {
      const input = raw[category] ?? {};
      if (!input || Object.getPrototypeOf(input) !== Object.prototype)
        return null;
      for (const [id, n] of Object.entries(input)) {
        if (
          !Object.hasOwn(available[category], id) ||
          !Number.isSafeInteger(n) ||
          n < 0 ||
          n > available[category][id]
        )
          return null;
        if (n) checked[category][id] = n;
      }
    }
    checked.volunteers = checked.volunteers
      .filter((v) => v.quantity > 0)
      .map((v) => ({ ...v }));
    return structuredClone(checked);
  }
  prepare(request) {
    const hero = this.actor(request),
      site = this.site(request.playerId, request.siteId);
    if (!hero || !site)
      return { success: false, reason: "expedition_unavailable" };
    configureExceptionalSite(site, this.state.generation?.seed);
    const originLocationId = request.originLocationId ?? null;
    const available = this.available(hero, originLocationId);
    const preparation =
      available && this.normalizePreparation(request.preparation, available);
    if (!preparation)
      return { success: false, reason: "invalid_expedition_preparation" };
    let mission = this.state.expeditions.find(
      (m) =>
        m.id === request.expeditionId &&
        m.playerId === request.playerId &&
        m.status === "preparing",
    );
    if (
      request.expeditionId &&
      (!mission ||
        mission.engagement?.preparerHeroId !== hero.id ||
        mission.siteId !== site.id ||
        mission.originLocationId !== originLocationId)
    )
      return { success: false, reason: "expedition_unavailable" };
    if (
      this.state.expeditions.some(
        (m) =>
          m.id !== mission?.id &&
          ACTIVE.includes(m.status) &&
          (m.heroId === hero.id ||
            (m.engagement?.preparerHeroId === hero.id &&
              m.status === "preparing")),
      )
    )
      return { success: false, reason: "expedition_already_active" };
    const breakdown = expeditionScore(preparation, {
      relevantNpcIds: site.relevantNpcIds,
    });
    if (!mission) {
      let serial = this.state.expeditions.length + 1;
      while (
        this.state.expeditions.some(
          (m) => m.id === `exceptional-expedition-${serial}`,
        )
      )
        serial++;
      const id = `exceptional-expedition-${serial}`;
      mission = expedition({
        id,
        playerId: hero.playerId,
        heroId: originLocationId ? null : hero.id,
        groupId: originLocationId ? `${id}-group` : null,
        siteId: site.id,
        kind: site.type,
        createdAt: this.game.now(),
        originLocationId,
        preparation,
        scores: { expedition: breakdown.total },
        engagement: { preparerHeroId: hero.id },
      });
      this.state.expeditions.push(mission);
    }
    const stock = this.source(hero, originLocationId);
    const selectedTroops = preparation.volunteers.map((v) => {
      const unit = stock.army.find((u) => u.id === v.unitId);
      return {
        unit,
        indices: unit.soldierHealth
          .map((hp, i) => (hp > unit.combatHealthThreshold ? i : -1))
          .filter((i) => i >= 0)
          .slice(0, v.quantity),
      };
    });
    const power = expeditionPower(this.game, {
      hero: originLocationId ? null : hero,
      troops: selectedTroops,
    });
    mission.scores.power = power;
    mission.preparation = preparation;
    mission.scores.expedition = breakdown.total;
    mission.engagement = {
      preparerHeroId: hero.id,
      breakdown,
      chance: exceptionalSuccessChance(site, breakdown.total, power),
    };
    return {
      success: true,
      expeditionId: mission.id,
      message: "Préparation et score actualisés par le serveur.",
    };
  }
  depart(request) {
    const mission = this.state.expeditions.find(
      (m) => m.id === request.expeditionId && m.playerId === request.playerId,
    );
    const hero = this.actor(request);
    if (!mission || !hero || mission.engagement?.preparerHeroId !== hero.id)
      return { success: false, reason: "expedition_unavailable" };
    if (mission.status !== "preparing")
      return {
        success: ACTIVE.includes(mission.status),
        replayed: true,
        expeditionId: mission.id,
      };
    const site = this.site(request.playerId, mission.siteId),
      stock = this.source(hero, mission.originLocationId);
    const available = stock && this.available(hero, mission.originLocationId);
    const prep =
      available && this.normalizePreparation(mission.preparation, available);
    if (!site || !prep || mission.scores.expedition <= 0)
      return { success: false, reason: "expedition_departure_refused" };
    if (stock.origin) {
      const cargo = [
        ...prep.npcIds.map((id) => ({ itemId: id, quantity: 1 })),
        ...[prep.mounts, prep.equipment, prep.resources].flatMap((c) =>
          Object.entries(c).map(([itemId, quantity]) => ({ itemId, quantity })),
        ),
      ];
      const transferred = prep.volunteers.map((v) => {
        const unit = stock.army.find((u) => u.id === v.unitId);
        const snapshot = unit.toJSON();
        snapshot.id = `${mission.id}-${unit.id}`;
        snapshot.soldierHealth = unit.soldierHealth
          .filter((hp) => hp > unit.combatHealthThreshold)
          .slice(0, v.quantity);
        snapshot.quantity = v.quantity;
        if (v.quantity < unit.quantity) {
          snapshot.equipmentIds = [];
          snapshot.specialPowerIds = [];
          snapshot.expeditionMorale = (snapshot.expeditionMorale ?? []).map(
            (e) => ({ ...e, quantity: Math.min(e.quantity, v.quantity) }),
          );
        }
        return { unit, moved: new Unit(snapshot) };
      });
      const group = new AutonomousGroup({
        id: mission.groupId,
        type: "army",
        owner: { kind: "player", id: hero.playerId },
        position: stock.origin.position,
        originLocationId: stock.origin.id,
        behavior: "passive",
        cargo,
        army: { units: transferred.map((x) => x.moved) },
        mission: {
          managedBy: "exceptional_expedition",
          expeditionId: mission.id,
          coordinateMode: this.game.coordinateMode,
          destination: { ...site.position },
          active: true,
        },
      });
      for (const item of cargo)
        stock.origin.resources.stock[item.itemId] -= item.quantity;
      for (const { unit, moved } of transferred) {
        let left = moved.quantity;
        unit.soldierHealth = unit.soldierHealth.filter((hp) =>
          hp > unit.combatHealthThreshold && left > 0 ? (left--, false) : true,
        );
        unit.quantity = unit.soldierHealth.length;
        unit.expeditionMorale = unit.expeditionMorale
          .map((e) => ({
            ...e,
            quantity: Math.max(0, e.quantity - moved.quantity),
          }))
          .filter((e) => e.quantity > 0);
      }
      stock.origin.garrison.units = stock.army.filter((u) => u.quantity > 0);
      this.game.autonomousGroups.push(group);
    }
    mission.status = "travelling";
    mission.departedAt = this.game.now();
    return {
      success: true,
      expeditionId: mission.id,
      message: "Expédition partie vers le site découvert.",
    };
  }
  cancel(request) {
    const m = this.state.expeditions.find(
      (m) =>
        m.id === request.expeditionId &&
        m.playerId === request.playerId &&
        m.engagement?.preparerHeroId === request.heroId,
    );
    if (
      !this.actor(request) ||
      !m ||
      !["preparing", "cancelled"].includes(m.status)
    )
      return { success: false, reason: "expedition_unavailable" };
    m.status = "cancelled";
    return {
      success: true,
      message: "Préparation annulée, aucun moyen dépensé.",
    };
  }
  refresh() {
    for (const m of this.state.expeditions) {
      if (!["travelling", "resolving"].includes(m.status) || !m.engagement)
        continue;
      if (m.heroId) {
        const hero = this.hero(m.heroId),
          site = this.site(m.playerId, m.siteId);
        const available = hero && this.available(hero);
        if (!available || !site) continue;
        const p = structuredClone(m.preparation);
        p.npcIds = p.npcIds.filter((id) =>
          available.npcs.some((n) => n.id === id),
        );
        for (const c of ["mounts", "equipment", "resources"])
          for (const id of Object.keys(p[c]))
            p[c][id] = Math.min(p[c][id], available[c][id] ?? 0);
        p.volunteers = p.volunteers.map((v) => ({
          ...v,
          quantity: Math.min(
            v.quantity,
            available.volunteers.find((u) => u.unitId === v.unitId)?.quantity ??
              0,
          ),
        }));
        const score = expeditionScore(p, {
          relevantNpcIds: site.relevantNpcIds,
        });
        m.scores.expedition = score.total;
        m.engagement.breakdown = score;
        configureExceptionalSite(site, this.state.generation?.seed);
        const party = expeditionParticipants(this.game, m);
        const power = party ? expeditionPower(this.game, party) : 0;
        m.scores.power = power;
        m.engagement.chance = exceptionalSuccessChance(
          site,
          score.total,
          power,
        );
        const actor = new ExteriorSearchService(this.game).actor(
          hero.playerId,
          hero.id,
        );
        if (actor.square?.id === site.cellId) m.status = "resolving";
      } else {
        const group = this.game.autonomousGroups.find(
          (g) => g.id === m.groupId,
        );
        const site = this.site(m.playerId, m.siteId);
        if (!group || !site) continue;
        const p = structuredClone(m.preparation);
        const stock = { carriedLoot: group.cargo };
        p.npcIds = p.npcIds.filter((id) => quantity(stock, id) > 0);
        for (const c of ["mounts", "equipment", "resources"])
          for (const id of Object.keys(p[c]))
            p[c][id] = Math.min(p[c][id], quantity(stock, id));
        p.volunteers = p.volunteers.map((v) => ({
          ...v,
          quantity: Math.min(
            v.quantity,
            availableSoldiers(
              group.army.units.find((u) => u.id === `${m.id}-${v.unitId}`) ?? {
                quantity: 0,
              },
            ),
          ),
        }));
        const score = expeditionScore(p, {
          relevantNpcIds: site.relevantNpcIds,
        });
        m.scores.expedition = score.total;
        m.engagement.breakdown = score;
        configureExceptionalSite(site, this.state.generation?.seed);
        const party = expeditionParticipants(this.game, m);
        const power = party ? expeditionPower(this.game, party) : 0;
        m.scores.power = power;
        m.engagement.chance = exceptionalSuccessChance(
          site,
          score.total,
          power,
        );
        if (group.status === "arrived") {
          m.status = "resolving";
          group.mission.phase = "waiting";
        }
      }
    }
  }
}
