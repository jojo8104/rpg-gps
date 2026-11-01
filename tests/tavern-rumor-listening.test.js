import assert from "node:assert/strict";
import test from "node:test";
import { explorationWorld } from "./fixtures/exploration-world.js";
import { Game } from "../app/js/core/game.js";
import { InventoryService } from "../app/js/core/inventory-service.js";
import { BattleLoot } from "../app/js/core/battle-loot.js";
import {
  renderInventoryView,
  renderInventoryItemDetail,
} from "../app/js/ui/inventory-view.js";
import { createExplorationProjection } from "../server/realtime/exploration-projection.js";
import { LobbyService } from "../server/lobby/lobby-service.js";

function fixture() {
  const f = explorationWorld();
  for (const clue of f.game.explorationState.clues)
    if (clue.kind === "search") clue.origin = { source: "loot" };
  const clue = f.game.explorationState.clues.find(
    (clue) => clue.kind === "search",
  );
  clue.origin = { source: "tavern", locationId: f.location.id };
  f.hero.resources = { gold: 30, wood: (f.hero.bagSlotCount - 1) * 20 };
  return {
    ...f,
    clue,
    listening: f.game.explorationRumorService.listening,
    listen() {
      return f.game.selectLocationChiefOption({
        playerId: "a",
        heroId: f.hero.id,
        locationId: f.location.id,
        source: "tavern",
        optionId: f.game.explorationRumorService.listening.offers(
          f.context(),
          "tavern",
        )[0].id,
      });
    },
  };
}

test("rumeur sans importance : 5 or, aucun objet ni effet sur un site", () => {
  const f = fixture();
  f.listening.random = () => 0.9;
  assert.equal(new InventoryService().getHeroBagState(f.hero).freeSlots, 0);
  const before = f.hero.carriedLoot.length;
  const reply = f.listen();
  assert.equal(reply.success, true);
  assert.equal(reply.outcome, "ambient");
  assert.equal(f.hero.resources.gold, 25);
  assert.equal(f.hero.carriedLoot.length, before);
  assert.equal(f.game.explorationState.rumorKnowledge.length, 0);
  assert.equal(f.game.explorationState.rumorPurchases.length, 1);
  assert.ok(
    f.game.explorationState.sites.every((site) => site.status === "active"),
  );
  assert.equal(f.game.explorationState.announcements.length, 0);
});

test("rumeur utile : message de recherche fiable et réutilisable, reçu avec les bagages pleins", () => {
  const f = fixture();
  f.listening.random = () => 0.24999;
  const inventory = new InventoryService(),
    before = inventory.getUsedHeroBagSlots(f.hero);
  assert.equal(f.listen().outcome, "clue");
  assert.equal(f.hero.resources.gold, 25);
  assert.equal(f.clue.medium, "message");
  assert.equal(f.clue.kind, "search");
  assert.equal(f.clue.seriesId, null);
  assert.equal(f.clue.holder.id, f.hero.id);
  assert.ok(f.hero.carriedLoot.some((entry) => entry.itemId === f.clue.id));
  assert.equal(inventory.getUsedHeroBagSlots(f.hero), before);
  assert.ok(
    f.game.explorationClueService
      .usable(f.hero, "search", f.clue.siteId)
      .includes(f.clue),
  );
  assert.deepEqual(
    f.game.explorationClueService.usable(f.hero, "localization", f.clue.siteId),
    [],
  );
  assert.ok(
    !f.game.explorationClueService
      .offers(f.context(), "tavern")
      .some((offer) => offer.id.endsWith(f.clue.id)),
  );
  const projected = createExplorationProjection(f.game.toJSON(), "a", {
    now: 1000,
  }).view;
  const item = projected.clues.find((entry) => entry.medium === "message");
  assert.ok(item);
  assert.match(
    renderInventoryItemDetail(item.id, 1, item),
    /Message de recherche/,
  );
});

test("seuil strict, stock fini et absence de nouveau tirage à la consultation ou au rejeu", () => {
  const f = fixture();
  let rolls = 0;
  f.listening.random = () => {
    rolls++;
    return 0.25;
  };
  const offer = f.listening.offers(f.context(), "tavern")[0];
  for (let i = 0; i < 5; i++) f.listening.offers(f.context(), "tavern");
  assert.equal(rolls, 0);
  assert.equal(
    f.listening.select(f.context(), "tavern", offer.id).outcome,
    "ambient",
  );
  assert.equal(
    f.listening.select(f.context(), "tavern", offer.id).success,
    false,
  );
  assert.equal(rolls, 1);
  assert.equal(f.hero.resources.gold, 25);
  f.listening.random = () => 0;
  assert.equal(f.listen().outcome, "clue");
  assert.equal(f.listen().outcome, "ambient");
  assert.equal(
    f.hero.carriedLoot.filter((entry) => entry.itemId === f.clue.id).length,
    1,
  );
});

test("paiement et accès validés avant le tirage, résultat conservé après reprise", () => {
  const f = fixture();
  f.listening.random = () => {
    throw Error("Aucun tirage autorisé");
  };
  const id = f.listening.offers(f.context(), "tavern")[0].id;
  f.hero.resources.gold = 4;
  assert.equal(f.listen().reason, "insufficient_resources");
  assert.equal(f.listening.select(f.context(), "chief", id).success, false);
  assert.equal(
    f.listening.select(f.context(), "tavern", "tavern-rumor:999").success,
    false,
  );
  assert.equal(f.game.explorationState.rumorPurchases.length, 0);
  f.hero.resources.gold = 30;
  f.listening.random = () => 0;
  f.listen();
  const restored = Game.fromJSON(f.game.toJSON(), { now: f.game.now });
  restored.explorationRumorService.listening.random = () => {
    throw Error("Pas de rejeu");
  };
  const context = restored.itemAcquisitionContext({
    playerId: "a",
    heroId: f.hero.id,
    locationId: f.location.id,
  });
  assert.equal(
    restored.explorationRumorService.listening.select(context, "tavern", id)
      .success,
    false,
  );
  assert.deepEqual(
    restored.explorationState.rumorPurchases,
    f.game.explorationState.rumorPurchases,
  );
});

test("messages, papiers, parchemins et cartes ne comptent pas dans les bagages ni dans le loot", () => {
  const f = fixture();
  const inventory = new InventoryService(),
    before = inventory.getUsedHeroBagSlots(f.hero);
  for (const itemId of [
    "message",
    "written_message",
    "parchment",
    "paper",
    "sealed_fort_message",
    "clue-localization-test",
    "clue-search-test",
  ])
    f.hero.addCarriedLoot([{ id: `package-${itemId}`, itemId, quantity: 1 }]);
  assert.equal(inventory.getUsedHeroBagSlots(f.hero), before);
  const bag = inventory.getHeroBagState(f.hero);
  const loot = new BattleLoot({
    id: "loot",
    battleId: "battle",
    shares: [{ playerId: "a", heroId: f.hero.id, ratio: 1 }],
    entries: [
      {
        id: "message-drop",
        itemId: "message",
        quantity: 1,
        portable: true,
        valuePerUnit: 1,
        allocations: { a: 1 },
      },
    ],
  });
  const result = loot.collect({
    playerId: "a",
    bag,
    selection: { "message-drop": 1 },
  });
  assert.equal(result.success, true);
  assert.equal(result.remainingSlots, 0);
  const element = { innerHTML: "" };
  renderInventoryView({
    element,
    hero: f.hero,
    slotCount: f.hero.bagSlotCount,
  });
  assert.ok(
    element.innerHTML.includes(`${before}/${f.hero.bagSlotCount} slots`),
  );
  assert.ok(element.innerHTML.includes("Hors capacité des bagages"));
  assert.ok(!element.innerHTML.includes("Capacité dépassée"));
  f.location.resources.stock.paper = 1;
  assert.equal(
    f.game.transferLocationResource({
      playerId: "a",
      heroId: f.hero.id,
      locationId: f.location.id,
      resourceName: "paper",
      amount: 1,
      direction: "to_hero",
    }).success,
    true,
  );
  assert.equal(inventory.getUsedHeroBagSlots(f.hero), before);
});

test("résultats de rumeur individuels et commande serveur rejouée sans second débit", () => {
  const f = fixture();
  let index = 0;
  const service = new LobbyService({
    idFactory: () => ["a", "b"][index++] ?? `id-${index}`,
    now: () => 1000,
  });
  const host = service.createLobby({
    playerName: "Alice",
    positionMode: "gps",
    maxPlayers: 4,
  });
  service.joinLobby({ code: host.lobby.code, playerName: "Bob" });
  f.game.getPlayer("a").discoverLocation(f.location.id, 3);
  const saved = service.exportState();
  saved.lobbies[0].game = f.game.toJSON();
  saved.lobbies[0].status = "started";
  const official = new LobbyService({ initialState: saved, now: () => 1000 });
  const packet = official.projectForPlayer(host.session.token, {
    game: official.gameSnapshot(host.lobby.code),
  });
  const option = packet.game.state.explorationView.rumorOffers
    .find((entry) => entry.source === "tavern")
    .options.find((offer) => offer.id.startsWith("tavern-rumor:"));
  assert.ok(option);
  const request = {
    token: host.session.token,
    command: "selectLocationChiefOption",
    args: [
      {
        playerId: "a",
        heroId: f.hero.id,
        locationId: f.location.id,
        source: "tavern",
        optionId: option.id,
      },
    ],
  };
  const reply = official.executeGameCommand(request);
  assert.equal(reply.result.success, true);
  assert.equal(official.executeGameCommand(request).result.success, false);
  const state = official.gameSnapshot(host.lobby.code).state;
  assert.equal(
    state.heroes.find((hero) => hero.id === f.hero.id).resources.gold,
    25,
  );
  const alice = createExplorationProjection(state, "a", { now: 1000 }),
    bob = createExplorationProjection(state, "b", { now: 1000 });
  assert.equal(alice.view.rumorPurchases.length, 1);
  assert.equal(bob.view.rumorPurchases.length, 0);
  assert.equal(
    bob.sanitize(state.explorationState.rumorPurchases[0]),
    undefined,
  );
  assert.ok(!JSON.stringify(alice.view.rumorPurchases).includes('"roll"'));
  assert.ok(!JSON.stringify(alice.view.rumorPurchases).includes('"clueId"'));
});
