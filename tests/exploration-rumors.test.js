import assert from "node:assert/strict";
import test from "node:test";
import { explorationWorld } from "./fixtures/exploration-world.js";
import { Game } from "../app/js/core/game.js";
import { createExplorationProjection } from "../server/realtime/exploration-projection.js";
import { LobbyService } from "../server/lobby/lobby-service.js";

test("les PNJ expliquent la carte détenue, explication gratuite, sans consommation ni révélation exceptionnelle", () => {
  const f = explorationWorld(),
    service = f.game.explorationRumorService;
  assert.equal(
    service
      .offers(f.context(), "tavern")
      .some((offer) => offer.id.startsWith("rumor-action:")),
    false,
  );
  const clue = f.carryMap();
  const options = f.game.getLocationChiefConversation({
    playerId: "a",
    heroId: f.hero.id,
    locationId: f.location.id,
    source: "tavern",
  }).options;
  const option = options.find((option) =>
    option.id.startsWith("rumor-action:explain:"),
  );
  assert.ok(option);
  assert.ok(!option.label.includes("5 or"));
  const before = f.hero.resources.gold;
  const result = f.game.selectLocationChiefOption({
    playerId: "a",
    heroId: f.hero.id,
    locationId: f.location.id,
    source: "tavern",
    optionId: option.id,
  });
  assert.equal(result.success, true);
  assert.match(result.lines[0], /Valombre/);
  assert.equal(f.hero.resources.gold, before);
  assert.ok(f.hero.carriedLoot.some((item) => item.itemId === clue.id));
  assert.equal(clue.status, "active");
  assert.equal(f.game.explorationState.discoveries.length, 0);
  assert.equal(service.select(f.context(), "tavern", option.id).success, false);
  assert.equal(f.hero.resources.gold, before);
  const restored = Game.fromJSON(f.game.toJSON(), { now: f.game.now });
  assert.deepEqual(
    restored.explorationState.rumorKnowledge,
    f.game.explorationState.rumorKnowledge,
  );
  assert.deepEqual(
    restored.explorationRumorService
      .offers(
        restored.itemAcquisitionContext({
          playerId: "a",
          heroId: f.hero.id,
          locationId: f.location.id,
        }),
        "tavern",
      )
      .filter((offer) => offer.id.startsWith("rumor-action:")),
    [],
  );
});

test("chef gratuit, manque d’or sans mutation, carte perdue et accès distant refusés", () => {
  const f = explorationWorld();
  f.carryMap();
  const service = f.game.explorationRumorService;
  const rumor = service.offers(f.context(), "tavern")[0];
  f.hero.resources.gold = 4;
  assert.equal(
    service.select(f.context(), "tavern", rumor.id).reason,
    "insufficient_resources",
  );
  assert.equal(f.game.explorationState.rumorKnowledge.length, 0);
  const chief = service.offers(f.context(), "chief")[0];
  assert.ok(chief);
  assert.equal(service.select(f.context(), "chief", chief.id).success, true);
  assert.equal(f.hero.resources.gold, 4);
  assert.equal(
    f.game.selectLocationChiefOption({
      playerId: "b",
      heroId: f.hero.id,
      locationId: f.location.id,
      source: "chief",
      optionId: chief.id,
    }).success,
    false,
  );
  f.location.heroIds = [];
  assert.equal(
    f.game.selectLocationChiefOption({
      playerId: "a",
      heroId: f.hero.id,
      locationId: f.location.id,
      source: "chief",
      optionId: chief.id,
    }).success,
    false,
  );
});

test("explication de directions : le PNJ donne le départ sans livrer les fragments manquants", () => {
  const f = explorationWorld();
  f.carryMap("outside");
  const offer = f.game.explorationRumorService
    .offers(f.context(), "tavern")
    .find((offer) => offer.id.startsWith("rumor-action:explain:"));
  const result = f.game.explorationRumorService.select(
    f.context(),
    "tavern",
    offer.id,
  );
  assert.match(result.message, /case qui contient Valombre/);
  assert.ok(!result.message.includes("2 cases"));
  const state = f.game.toJSON();
  const alice = createExplorationProjection(state, "a", {
    now: 2000,
    visibleLocationIds: new Set([f.location.id]),
  });
  const bob = createExplorationProjection(state, "b", {
    now: 2000,
    visibleLocationIds: new Set([f.location.id]),
  });
  assert.equal(alice.view.rumors.length, 1);
  assert.deepEqual(bob.view.rumors, []);
  assert.equal(
    bob.sanitize(f.game.explorationState.rumorKnowledge[0]),
    undefined,
  );
  assert.equal(bob.sanitize(result.message), undefined);
  assert.ok(!JSON.stringify(alice.view.rumors).includes('"seriesId"'));
});

test("les offres opaques de rumeur sont exécutables par le serveur et visibles sur le client sans modèle privé", () => {
  const f = explorationWorld();
  f.carryMap("outside");
  f.game.getPlayer("a").discoverLocation(f.location.id, 3);
  let index = 0;
  const service = new LobbyService({
    idFactory: () => ["a", "b"][index++] ?? `id-${index}`,
    now: () => 1000,
  });
  const host = service.createLobby({
    playerName: "Alice",
    positionMode: "simulation",
    maxPlayers: 4,
  });
  service.joinLobby({ code: host.lobby.code, playerName: "Bob" });
  const saved = service.exportState();
  saved.lobbies[0].game = f.game.toJSON();
  saved.lobbies[0].status = "started";
  const official = new LobbyService({ initialState: saved, now: () => 1000 });
  const packet = official.projectForPlayer(host.session.token, {
    game: official.gameSnapshot(host.lobby.code),
  });
  const option = packet.game.state.explorationView.rumorOffers
    .find((entry) => entry.source === "tavern")
    .options.find((offer) => offer.id.startsWith("rumor-action:explain:"));
  assert.match(option.id, /^rumor-action:explain:exploration-series-/);
  const client = Game.fromJSON(packet.game.state);
  assert.ok(
    client
      .getLocationChiefConversation({
        playerId: "a",
        heroId: f.hero.id,
        locationId: f.location.id,
        source: "tavern",
      })
      .options.some((entry) => entry.id === option.id),
  );
  const reply = official.executeGameCommand({
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
  });
  assert.equal(reply.result.success, true);
  const after = official.projectForPlayer(host.session.token, reply);
  assert.equal(after.game.state.explorationView.rumors.length, 1);
});
