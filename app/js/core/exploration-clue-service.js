import { identifier, nonnegative } from "./exploration-validation.js";
import { ExplorationState } from "./exploration-state.js";
import { clueItem } from "./exploration-records.js";
import { stableNumber } from "./exploration-localization.js";
import { closeExceptionalSite } from "./exceptional-site-closure.js";
import {
  placedLocations,
  isSpacedLocation,
} from "./location-spacing-policy.js";

export const CLUE_DISAPPEARANCE_CHANCE = 0.25;

/** Stock fini, généré une fois. Les sources ne révèlent ni texte ni destination avant acquisition. */
export function initializeClueItems(game, state) {
  const locations = placedLocations(game)
    .filter(
      (location) =>
        location.state !== "destroyed" &&
        isSpacedLocation(location) &&
        !location.roles?.includes("clue"),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const taverns = locations.filter(
    (location) => location.infrastructure?.tavern >= 1,
  );
  const academies = locations.filter(
    (location) => location.infrastructure?.magic_academy >= 1,
  );
  let index = 0;
  const clues = [];
  const add = (siteId, kind, values) => {
    const number = index++;
    let source = ["loot", "tavern", "academy"][number % 3];
    const pool = source === "tavern" ? taverns : academies;
    if (source !== "loot" && !pool.length) source = "loot";
    const id = `clue-${kind}-${stableNumber(`${state.generation.seed}:${number}`)}-${number}`;
    clues.push(
      clueItem({
        id,
        siteId,
        kind,
        ...values,
        createdAt: state.generation.generatedAt,
        origin: {
          source,
          locationId: source === "loot" ? null : pool[number % pool.length].id,
        },
      }),
    );
  };
  for (const series of state.clueSeries)
    for (const fragment of series.fragments)
      add(series.siteId, "localization", {
        seriesId: series.id,
        fragmentId: fragment.id,
      });
  for (const site of state.sites)
    add(site.id, "search", {
      text: "Ce parchemin décrit des signes à examiner sur place. Il aide la recherche, sans indiquer où aller.",
    });
  return new ExplorationState({ ...state.toJSON(), clues });
}

export class ExplorationClueService {
  constructor(game, { random = Math.random } = {}) {
    this.game = game;
    this.random = random;
  }
  get state() {
    return this.game.explorationState;
  }
  find(id) {
    return this.state.clues.find((clue) => clue.id === id);
  }
  site(clue) {
    return this.state.sites.find((site) => site.id === clue.siteId);
  }
  held(hero) {
    return this.state.clues.filter(
      (clue) =>
        clue.holder?.kind === "hero" &&
        clue.holder.id === hero.id &&
        ["active", "obsolete"].includes(clue.status),
    );
  }
  obsolete(hero, clue) {
    return (
      clue.status === "obsolete" ||
      this.site(clue)?.status !== "active" ||
      this.state.discoveries.some(
        (d) =>
          d.playerId === hero.playerId &&
          d.targetKind === "site" &&
          d.targetId === clue.siteId,
      )
    );
  }
  usable(hero, kind, siteId) {
    return this.held(hero).filter(
      (clue) =>
        clue.kind === kind &&
        clue.status === "active" &&
        !this.obsolete(hero, clue) &&
        clue.siteId === siteId &&
        this.site(clue)?.status === "active",
    );
  }

  offers(context, source) {
    if (this.game.explorationView)
      return structuredClone(
        this.game.explorationView.clueOffers?.find(
          (entry) =>
            entry.heroId === context.hero.id &&
            entry.locationId === context.location.id &&
            entry.source === source,
        )?.options ?? [],
      );
    const { hero, location, canTavern, canTrade } = context;
    const available = this.state.clues.filter(
      (clue) =>
        !clue.holder &&
        clue.status === "active" &&
        this.site(clue)?.status === "active" &&
        (source === "tavern"
          ? canTavern &&
            clue.kind === "localization" &&
            location.infrastructure?.tavern >= 1 &&
            clue.origin?.source === "tavern" &&
            clue.origin.locationId === location.id
          : source === "equipment" &&
            ((canTrade &&
              location.infrastructure?.magic_academy >= 1 &&
              clue.origin?.source === "academy" &&
              clue.origin.locationId === location.id) ||
              (clue.origin?.source === "loot" &&
                clue.origin.rewardPlayerId === hero.playerId))),
    );
    const offers = available.map((clue) => ({
      id: `clue-action:take:${clue.id}`,
      kind: "clue",
      label:
        source === "tavern"
          ? "Acheter une carte de localisation · 5 or"
          : clue.origin.source === "academy"
            ? "Académie : retirer un parchemin"
            : "Retirer un indice trouvé dans le butin",
    }));
    if (source === "equipment" && context.canManageReserves)
      for (const clue of this.state.clues.filter(
        (clue) =>
          clue.holder?.kind === "location" &&
          clue.holder.id === location.id &&
          ["active", "obsolete"].includes(clue.status),
      ))
        offers.push({
          id: `clue-action:take:${clue.id}`,
          kind: "clue",
          label: "Reprendre un parchemin dans les réserves",
        });
    if (
      source === "equipment" &&
      canTrade &&
      ["village", "town", "capital"].includes(location.type)
    )
      for (const clue of this.held(hero))
        offers.push({
          id: `clue-action:sell:${clue.id}`,
          kind: "clue",
          label: this.obsolete(hero, clue)
            ? `Cartographe : archiver un indice · ${this.archivePrice(clue)} or`
            : "Vendre un indice actif · 5 or · risque de disparition : 25 %",
        });
    return offers;
  }

  select(context, source, optionId) {
    if (!this.offers(context, source).some((offer) => offer.id === optionId))
      return { success: false, reason: "clue_offer_unavailable" };
    const [, action, id] = /^clue-action:(take|sell):(.+)$/.exec(optionId);
    const clue = this.find(id),
      { hero } = context;
    if (action === "sell") return this.sell(hero, clue, context.location.id);
    const price = source === "tavern" ? 5 : 0;
    if (hero.getResourceAmount("gold") < price)
      return { success: false, reason: "insufficient_resources" };
    if (!this.canCarry(hero, price))
      return { success: false, reason: "hero_bag_full" };
    if (price) hero.spendResource("gold", price);
    if (clue.holder?.kind === "location") {
      context.location.storedItems = context.location.storedItems.filter(
        (item) => item.itemId !== clue.id,
      );
      clue.holder = null;
    }
    this.receive(hero, clue);
    return {
      success: true,
      message:
        "Le parchemin rejoint vos bagages. Vous pouvez le lire sans le consommer.",
    };
  }
  canCarry() {
    // Tous les indices sont des documents sans encombrement de bagage.
    return true;
  }
  receive(hero, clue) {
    if (clue.holder || !["active", "obsolete", "lost"].includes(clue.status))
      return false;
    const known = this.state.discoveries.some(
      (d) =>
        d.playerId === hero.playerId &&
        d.targetKind === "site" &&
        d.targetId === clue.siteId,
    );
    clue.status =
      this.site(clue)?.status === "active" && !known ? "active" : "obsolete";
    clue.holder = { kind: "hero", id: hero.id };
    hero.addCarriedLoot([
      {
        id: this.game.idGenerator("clue-package"),
        itemId: clue.id,
        quantity: 1,
        valuePerUnit: 5,
      },
    ]);
    return true;
  }
  archivePrice(clue) {
    const count =
      this.state.clueSeries.find((series) => series.id === clue.seriesId)
        ?.fragments.length ?? 1;
    return [5, 7, 10][count - 1];
  }
  sell(hero, clue, archiveId) {
    const entry = hero.carriedLoot.find((item) => item.itemId === clue.id);
    if (!entry || entry.quantity <= 0 || !this.held(hero).includes(clue))
      return { success: false, reason: "clue_not_carried" };
    const archived = this.obsolete(hero, clue);
    if (archived) identifier(archiveId, "L’archive de destination");
    if (!archived) this.lossRisk([clue], `sale:${clue.id}`, this.random);
    const gold = archived ? this.archivePrice(clue) : 5;
    hero.carriedLoot.splice(hero.carriedLoot.indexOf(entry), 1);
    clue.status = archived ? "archived" : "sold";
    clue.holder = archived ? { kind: "archive", id: archiveId } : null;
    clue.lifecycle = { eventId: `sale:${clue.id}`, at: this.game.now() };
    hero.addResource("gold", gold);
    return {
      success: true,
      gold,
      message: archived
        ? "Le cartographe conserve le parchemin dans ses archives."
        : "Le parchemin a été vendu.",
    };
  }
  lose(hero, itemIds, eventId, random = this.random) {
    const clues = this.held(hero).filter((clue) => itemIds.includes(clue.id));
    for (const clue of clues)
      if (this.obsolete(hero, clue)) clue.status = "obsolete";
    this.lossRisk(clues, eventId, random);
    for (const clue of clues) {
      clue.status = "lost";
      clue.holder = null;
      clue.lifecycle = { eventId, at: this.game.now() };
    }
    return clues;
  }
  lossRisk(clues, eventId, random) {
    const sites = new Set(
      clues
        .filter(
          (clue) =>
            clue.status === "active" && clue.lifecycle?.eventId !== eventId,
        )
        .map((clue) => clue.siteId),
    );
    const decisions = [];
    identifier(eventId, "L’événement de perte");
    const at = nonnegative(this.game.now(), "La date de perte", true);
    for (const siteId of sites) {
      const site = this.state.sites.find((s) => s.id === siteId);
      if (
        site?.status !== "active" ||
        this.state.clueEvents.some(
          (e) => e.siteId === siteId && e.eventId === eventId,
        )
      )
        continue;
      const roll = random();
      if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
        throw new RangeError("Tirage invalide.");
      decisions.push({ siteId, eventId, at, roll });
    }
    for (const decision of decisions) {
      this.state.clueEvents.push(decision);
      if (decision.roll < CLUE_DISAPPEARANCE_CHANCE)
        this.close(decision.siteId, {
          eventId,
          at,
          reason: "clue_lost_or_sold",
        });
    }
  }

  close(siteId, resolution, status = "disappeared") {
    return closeExceptionalSite(this.game, siteId, resolution, status);
  }

  unlockBattleLoot(battle) {
    if (this.state.clues.some((clue) => clue.origin?.battleId === battle.id))
      return;
    const winners =
      battle.teams.find((team) => team.id === battle.winnerTeamId)?.heroes ??
      [];
    const hero = winners
      .map((snapshot) => this.game.getHero(snapshot.sourceId))
      .find(
        (hero) =>
          hero?.state === "active" && this.game.getPlayer(hero.playerId),
      );
    if (!hero) return;
    const clue = this.state.clues.find(
      (clue) =>
        clue.origin?.source === "loot" &&
        !clue.origin.battleId &&
        !clue.holder &&
        clue.status === "active" &&
        this.site(clue)?.status === "active",
    );
    if (!clue) return;
    clue.origin.battleId = battle.id;
    clue.origin.rewardPlayerId = hero.playerId;
    if (this.canCarry(hero)) this.receive(hero, clue);
  }
}
