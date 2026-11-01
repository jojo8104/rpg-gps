import {
  closeExceptionalSite,
  reconcileClosedExceptionalSites,
} from "./exceptional-site-closure.js";
import {
  configureExceptionalSite,
  exceptionalSuccessChance,
} from "./exceptional-site-rules.js";
import { expeditionScore } from "./exceptional-expedition-service.js";
import { ExteriorSearchService } from "./exterior-search-service.js";
import { HERO_ITEM_DEFINITIONS } from "./hero-item-catalog.js";
import { InventoryService } from "./inventory-service.js";
import { getItemDefinition } from "./item-catalog.js";
import {
  applyExpeditionMorale,
  expireExpeditionMorale,
} from "./expedition-morale.js";
import { LocationSpacingPolicy } from "./location-spacing-policy.js";

import {
  expeditionParticipants,
  expeditionPower,
} from "./exceptional-expedition-party.js";
function consume(participants, resources) {
  if (participants.hero) {
    new ExteriorSearchService({}).consume(participants.hero, resources);
    return;
  }
  for (const [id, n] of Object.entries(resources)) {
    let left = n;
    for (const item of participants.group.cargo)
      if (item.itemId === id) {
        const taken = Math.min(left, item.quantity);
        item.quantity -= taken;
        left -= taken;
      }
  }
  participants.group.cargo = participants.group.cargo.filter(
    (x) => x.quantity > 0,
  );
}
export class ExceptionalSiteResolutionService {
  constructor(game, { random = Math.random } = {}) {
    this.game = game;
    this.random = random;
  }
  get state() {
    return this.game.explorationState;
  }
  rules(site) {
    return configureExceptionalSite(site, this.state.generation?.seed);
  }
  rewards(site, hero) {
    const settings = site.rewards;
    if (
      !settings ||
      !Number.isSafeInteger(settings.gold) ||
      settings.gold < 0 ||
      !Number.isSafeInteger(settings.experience) ||
      settings.experience < 0 ||
      !Number.isSafeInteger(settings.itemCount) ||
      settings.itemCount < 0 ||
      settings.itemCount > 10
    )
      return null;
    if (
      site.type === "artifact" &&
      (settings.itemCount !== 1 ||
        settings.gold !== 0 ||
        settings.experience !== 0 ||
        !settings.powerful)
    )
      return null;
    if (
      site.type === "treasure" &&
      (settings.gold <= 0 ||
        settings.itemCount < 1 ||
        settings.experience !== 0)
    )
      return null;
    if (
      site.type === "dungeon" &&
      (settings.gold <= 0 || settings.itemCount < 1 || settings.experience <= 0)
    )
      return null;
    const issued = this.game.itemAcquisitionService.state?.issued ?? {};
    const pool = Object.values(HERO_ITEM_DEFINITIONS)
      .filter(
        (d) =>
          (settings.powerful ? d.rarity === "rare" : d.rarity !== "rare") &&
          (!hero || d.allowedClasses.includes(hero.classId)) &&
          (issued[d.id] ?? 0) < d.worldLimit,
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    if (pool.length < settings.itemCount) return null;
    let hash = 0;
    for (const c of `${this.state.generation?.seed}:${site.id}`)
      hash = (Math.imul(hash, 31) + c.charCodeAt(0)) | 0;
    const items = [];
    for (let i = 0; i < settings.itemCount; i++) {
      const index = ((hash >>> 0) + i) % pool.length;
      items.push({ itemId: pool.splice(index, 1)[0].id, quantity: 1 });
    }
    return { gold: settings.gold, experience: settings.experience, items };
  }
  atSite(hero, site) {
    const actor = new ExteriorSearchService(this.game).actor(
      hero.playerId,
      hero.id,
    );
    return actor.square?.id === site.cellId;
  }
  resolve(request) {
    const mission = this.state.expeditions.find(
      (m) =>
        m.id === request.expeditionId &&
        m.playerId === request.playerId &&
        m.engagement?.preparerHeroId === request.heroId,
    );
    if (!mission) return { success: false, reason: "expedition_unavailable" };
    if (mission.result)
      return { success: true, replayed: true, message: mission.result.message };
    const hero = this.game.getHero(request.heroId);
    if (!hero || hero.playerId !== request.playerId || !mission.heroId)
      return { success: false, reason: "expedition_unavailable" };
    const site = this.state.sites.find((s) => s.id === mission.siteId);
    if (!site || site.status !== "active")
      return this.abort(mission, "site_unavailable");
    if (
      !["travelling", "resolving"].includes(mission.status) ||
      !this.atSite(hero, site)
    )
      return { success: false, reason: "expedition_not_at_site" };
    return this.attempt(mission, site);
  }
  attempt(mission, site) {
    if (mission.result)
      return { success: true, replayed: true, message: mission.result.message };
    if (this.game.status !== "started" || site.status !== "active")
      return this.abort(mission, "site_unavailable");
    this.rules(site);
    const participants = expeditionParticipants(this.game, mission);
    if (
      !participants ||
      (participants.hero?.state !== undefined &&
        participants.hero.state !== "active") ||
      (participants.group &&
        ["destroyed", "suspended", "interrupted"].includes(
          participants.group.status,
        ))
    )
      return { success: false, reason: "expedition_unavailable" };
    const power = expeditionPower(this.game, participants),
      score = expeditionScore(participants.preparation, {
        relevantNpcIds: site.relevantNpcIds,
      });
    const chance = exceptionalSuccessChance(site, score.total, power);
    const rewards = this.rewards(
      site,
      participants.hero ?? this.game.getHero(mission.engagement.preparerHeroId),
    );
    const consequences = site.type === "dungeon" ? site.rewards.dungeon : null;
    if (
      !Number.isFinite(chance) ||
      !rewards ||
      (consequences &&
        (![consequences.success, consequences.failure].every(
          (c) =>
            c &&
            Number.isFinite(c.damageRatio) &&
            c.damageRatio >= 0 &&
            c.damageRatio <= 1 &&
            Number.isFinite(c.moraleDelta),
        ) ||
          !Number.isSafeInteger(consequences.durationMs) ||
          consequences.durationMs < 0))
    )
      return { success: false, reason: "site_rewards_unavailable" };
    const roll = this.random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
      throw new RangeError("Tirage d’expédition invalide.");
    const won = roll < chance,
      at = this.game.now(),
      eventId = `resolution:${mission.id}`;
    const result = {
      success: won,
      at,
      roll,
      chance,
      gold: won ? rewards.gold : 0,
      experience: won ? rewards.experience : 0,
      items: won ? rewards.items : [],
      pendingItems: won ? structuredClone(rewards.items) : [],
      heroDamage: 0,
      troopDamage: [],
      moraleDelta: 0,
      consumed: structuredClone(participants.preparation.resources),
      message: won
        ? "Expédition réussie : le site est remporté."
        : "Expédition échouée : le site reste disponible.",
    };
    // Réserver la clôture avant tout gain ; les concurrents sont rappelés sans toucher au vainqueur.
    if (site.status !== "active")
      return this.abort(mission, "site_unavailable");
    if (
      won &&
      !closeExceptionalSite(
        this.game,
        site.id,
        { eventId, at, playerId: mission.playerId, expeditionId: mission.id },
        "won",
      )
    )
      return this.abort(mission, "site_unavailable");
    consume(participants, result.consumed);
    if (consequences) {
      const effect = won ? consequences.success : consequences.failure;
      if (participants.hero) {
        const h = participants.hero;
        result.heroDamage = Math.min(
          h.health,
          Math.ceil(h.maxHealth * effect.damageRatio),
        );
        h.setBattleState({
          health: h.health - result.heroDamage,
          state: h.health - result.heroDamage === 0 ? "ghost" : "active",
        });
      }
      for (const { unit, indices } of participants.troops) {
        let damage = 0;
        const selected = new Set(indices);
        const health = unit.soldierHealth.map((hp, i) => {
          if (!selected.has(i)) return hp;
          const loss = Math.min(
            hp,
            Math.ceil(unit.healthPerSoldier * effect.damageRatio),
          );
          damage += loss;
          return hp - loss;
        });
        const participant = participants.troops.find((p) => p.unit === unit);
        participant.survivingCount = indices.filter(
          (i) => health[i] > 0,
        ).length;
        unit.applyBattleHealth(health);
        result.troopDamage.push({
          unitId: unit.id,
          damage,
          participants: indices.length,
          remaining: unit.quantity,
        });
      }
      applyExpeditionMorale(
        participants.hero,
        participants.troops,
        effect.moraleDelta,
        at,
        consequences.durationMs,
        eventId,
      );
      result.moraleDelta = effect.moraleDelta;
    }
    if (won) {
      for (const item of rewards.items)
        this.game.itemAcquisitionService.state.issued[item.itemId] =
          (this.game.itemAcquisitionService.state.issued[item.itemId] ?? 0) +
          item.quantity;
      if (participants.hero && rewards.gold)
        participants.hero.addResource("gold", rewards.gold);
      if (participants.group && rewards.gold)
        participants.group.cargo.push({
          itemId: "gold",
          quantity: rewards.gold,
        });
      if (rewards.experience) {
        if (participants.hero)
          this.game.heroProgressionService.addExperience(
            participants.hero,
            rewards.experience,
            `expedition:${site.type}`,
            this.game.heroClasses.get(participants.hero.classId),
          );
        for (const { unit } of participants.troops)
          if (unit.quantity > 0) unit.addExperience(rewards.experience);
      }
    }
    mission.scores = { expedition: score.total, power, narrative: 0 };
    mission.engagement.breakdown = score;
    mission.engagement.chance = chance;
    mission.result = result;
    mission.processedEventIds.push(eventId);
    this.finishOrReturn(mission, participants.group);
    return { success: true, message: result.message, won };
  }
  finishOrReturn(mission, group) {
    if (!group) {
      mission.status = "completed";
      mission.completedAt = this.game.now();
      return;
    }
    mission.status = "returning";
    if (group.status === "interrupted") {
      group.mission.returnPending = true;
      return;
    }
    if (["destroyed", "mission_failed"].includes(group.status)) {
      mission.status = "cancelled";
      group.mission.active = false;
      return;
    }
    delete group.mission.returnPending;
    group.movement = null;
    group.status = "idle";
    group.mission.phase = "returning";
    const origin = this.game.getLocation(mission.originLocationId);
    if (
      !origin ||
      origin.state === "destroyed" ||
      origin.ownerId !== mission.playerId
    ) {
      group.status = "suspended";
      group.mission.suspensionReason = "origin_unavailable";
      return;
    }
    group.mission.destination = { ...origin.position };
  }
  abort(mission, reason) {
    if (mission.result)
      return { success: true, replayed: true, message: mission.result.message };
    mission.result = {
      success: false,
      at: this.game.now(),
      reason,
      message:
        reason === "site_rewards_unavailable"
          ? "Les récompenses du site sont indisponibles. Retour sans tentative ni dépense supplémentaire."
          : "Le site n’est plus disponible. Aucune tentative ni dépense supplémentaire.",
      gold: 0,
      experience: 0,
      items: [],
      pendingItems: [],
    };
    this.finishOrReturn(
      mission,
      mission.groupId ? this.game.getAutonomousGroup(mission.groupId) : null,
    );
    return { success: true, message: mission.result.message };
  }
  settle(mission, group) {
    const origin = this.game.getLocation(mission.originLocationId);
    if (
      !origin ||
      origin.ownerId !== mission.playerId ||
      origin.state === "destroyed"
    ) {
      group.status = "suspended";
      group.mission.suspensionReason = "origin_unavailable";
      return;
    }
    for (const unit of group.army.units)
      if (unit.quantity > 0) origin.garrison.addUnit(unit);
    group.army.units = [];
    for (const item of group.cargo) {
      const accepted = origin.depositResource(item.itemId, item.quantity);
      item.quantity -= accepted;
    }
    group.cargo = group.cargo.filter((i) => i.quantity > 0);
    group.mission.active = false;
    group.mission.phase = "completed";
    group.status = "completed";
    group.movement = null;
    mission.status = "completed";
    mission.completedAt = this.game.now();
    mission.result.cargoPending = group.cargo.reduce(
      (n, i) => n + i.quantity,
      0,
    );
  }
  claim(request) {
    const mission = this.state.expeditions.find(
      (m) => m.id === request.expeditionId && m.playerId === request.playerId,
    );
    const hero = this.game.getHero(request.heroId);
    if (
      !hero ||
      hero.playerId !== request.playerId ||
      hero.state !== "active" ||
      !mission ||
      mission.status !== "completed" ||
      !mission.result
    )
      return { success: false, reason: "expedition_unavailable" };
    if (mission.heroId) {
      const site = this.state.sites.find((s) => s.id === mission.siteId);
      if (hero.id !== mission.heroId || !site || !this.atSite(hero, site))
        return { success: false, reason: "expedition_not_at_site" };
    } else {
      const origin = this.game.getLocation(mission.originLocationId),
        policy = new LocationSpacingPolicy({
          setup: this.game.setup,
          coordinateMode: this.game.coordinateMode,
        });
      if (
        !origin ||
        origin.ownerId !== request.playerId ||
        !hero.position ||
        !origin.heroIds.includes(hero.id) ||
        policy.distance(hero.position, origin.position) >
          policy.radius(origin) ||
        (this.game.coordinateMode === "gps" &&
          (hero.position.accuracy ?? 0) > 50)
      )
        return { success: false, reason: "hero_not_at_origin" };
    }
    let taken = 0;
    const inventory = new InventoryService();
    for (const item of mission.result.pendingItems ?? [])
      while (
        item.quantity > 0 &&
        inventory.getHeroBagState(hero).freeSlots > 0
      ) {
        hero.addCarriedLoot([
          {
            id: `reward:${mission.id}:${item.itemId}:${item.quantity}`,
            itemId: item.itemId,
            quantity: 1,
            valuePerUnit: getItemDefinition(item.itemId).price,
          },
        ]);
        item.quantity--;
        taken++;
      }
    if (mission.groupId) {
      const group = this.game.getAutonomousGroup(mission.groupId),
        origin = this.game.getLocation(mission.originLocationId);
      for (const item of group?.cargo ?? [])
        if (item.quantity > 0) {
          const accepted = origin.depositResource(item.itemId, item.quantity);
          item.quantity -= accepted;
        }
      if (group) group.cargo = group.cargo.filter((i) => i.quantity > 0);
      if (group)
        mission.result.cargoPending = group.cargo.reduce(
          (n, i) => n + i.quantity,
          0,
        );
    }
    const pending = (mission.result.pendingItems ?? []).some(
      (i) => i.quantity > 0,
    );
    return {
      success: taken > 0 || !pending,
      reason: pending && !taken ? "hero_bag_full" : null,
      message: pending
        ? "Libérez des places : les objets restants sont conservés."
        : "Récompenses récupérées.",
      taken,
    };
  }
  update() {
    reconcileClosedExceptionalSites(this.game);
    expireExpeditionMorale(this.game, this.game.now());
    for (const mission of this.state.expeditions) {
      if (!mission.engagement || mission.kind === "installation") continue;
      const site = this.state.sites.find((s) => s.id === mission.siteId),
        group = mission.groupId
          ? this.game.getAutonomousGroup(mission.groupId)
          : null;
      if (
        ["travelling", "resolving"].includes(mission.status) &&
        !mission.result
      ) {
        if (!site || site.status !== "active") {
          this.abort(mission, "site_unavailable");
          continue;
        }
        if (group?.status === "arrived" && group.mission.phase === "waiting") {
          const attempted = this.attempt(mission, site);
          if (
            !attempted.success &&
            attempted.reason === "site_rewards_unavailable"
          )
            this.abort(mission, "site_rewards_unavailable");
        }
      }
      if (
        mission.status === "returning" &&
        group?.mission.returnPending &&
        group.status !== "interrupted"
      )
        this.finishOrReturn(mission, group);
      if (
        mission.status === "returning" &&
        group?.status === "arrived" &&
        group.mission.phase === "returned"
      )
        this.settle(mission, group);
    }
  }
}
