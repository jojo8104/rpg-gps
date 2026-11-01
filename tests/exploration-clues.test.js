import { retireInteriorExceptionalSites } from "../app/js/core/exploration-exterior-migration.js";
import assert from "node:assert/strict";
import test from "node:test";
import { socialGame } from "./fixtures/player-social-game.js";
import { ExplorationState } from "../app/js/core/exploration-state.js";
import { PlayArea } from "../app/js/core/play-area.js";
import { PlayAreaGrid } from "../app/js/core/play-area-grid.js";
import { Location } from "../app/js/core/location.js";
import { Game } from "../app/js/core/game.js";
import {
  generateLocalization,
  verifyLocalization,
  stableNumber,
} from "../app/js/core/exploration-localization.js";
import { initializeClueItems } from "../app/js/core/exploration-clue-service.js";
import {
  explorationPublicId,
  createExplorationProjection,
} from "../server/realtime/exploration-projection.js";
import { renderInventoryItemDetail } from "../app/js/ui/inventory-view.js";
import { LobbyService } from "../server/lobby/lobby-service.js";

function fixture() {
  const {
    game,
    heroes: [hero, other],
  } = socialGame();
  const playArea = new PlayArea({
    id: "small",
    name: "Terrain",
    polygon: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 0.001 },
      { latitude: 0.001, longitude: 0.001 },
      { latitude: 0.001, longitude: 0 },
    ],
  });
  game.setup.playArea = playArea;
  const grid = new PlayAreaGrid({ playArea, cellSizeMeters: 15 });
  const start = grid.cells[0];
  const target = grid.cells.find((cell) => cell.row === 3 && cell.column === 2);
  const location = new Location({
    id: "village",
    name: "Valombre",
    type: "village",
    source: "test",
    ownerId: "a",
    controllerId: "a",
    position: start.center,
    features: { trade: true },
    infrastructure: { tavern: 1, magic_academy: 1 },
  });
  game.locations = [location];
  location.heroIds.push(hero.id);
  hero.updatePosition(start.center);
  hero.addResource("gold", 50);
  Object.defineProperty(hero, "bagSlotCount", {
    value: 30,
    writable: true,
    configurable: true,
  });
  game.explorationState = new ExplorationState({
    grid: {
      playAreaId: playArea.id,
      coordinateMode: "gps",
      cellSizeMeters: 15,
    },
    generation: {
      seed: "secret",
      generatedAt: 1000,
      playArea: playArea.toJSON(),
    },
    cells: grid.cells.map((cell) => ({
      id: cell.id,
      row: cell.row,
      column: cell.column,
      resource: "none",
    })),
    sites: [
      {
        id: "outside",
        cellId: target.id,
        type: "treasure",
        position: target.center,
        requirements: { expedition: 100 },
      },
      {
        id: "inside",
        cellId: start.id,
        type: "dungeon",
        hostLocationId: location.id,
        position: start.center,
      },
    ],
  });
  game.explorationState = initializeClueItems(
    game,
    generateLocalization(game, game.explorationState),
  );
  return {
    game,
    hero,
    other,
    location,
    service: game.explorationClueService,
    context: game.itemAcquisitionContext({
      playerId: "a",
      heroId: hero.id,
      locationId: location.id,
    }),
  };
}

test("les cartes complémentaires conduisent à la bonne case et persistent sans régénération", () => {
  const { game } = fixture();
  const series = game.explorationState.clueSeries[0];
  assert.equal(series.fragments.length, 3);
  assert.match(series.fragments[1].text, /3 cases vers le nord/);
  assert.match(series.fragments[2].text, /2 cases vers l’est/);
  for (const entry of game.explorationState.clueSeries)
    assert.equal(
      verifyLocalization(
        entry,
        game.explorationState.sites.find((site) => site.id === entry.siteId),
        game.explorationState,
        game.locations,
      ),
      true,
    );
  const altered = structuredClone(series);
  altered.fragments[2].text = "99 cases vers le nord";
  assert.equal(
    verifyLocalization(
      altered,
      game.explorationState.sites[0],
      game.explorationState,
      game.locations,
    ),
    false,
  );
  const expected = game.explorationState.toJSON();
  retireInteriorExceptionalSites(expected);
  const restored = Game.fromJSON(game.toJSON(), { now: game.now });
  assert.deepEqual(
    restored.explorationState.toJSON(),
    expected,
  );
});

test("noms, anagrammes, anciens noms et légendes désignent le lieu principal sans second lieu", () => {
  const { game, location } = fixture();
  const styles = new Set();
  for (let index = 0; styles.size < 4 && index < 100; index++) {
    game.explorationState.generation.seed = `seed-${index}`;
    const generated = generateLocalization(game, game.explorationState);
    const series = generated.clueSeries.find(
      (entry) => entry.siteId === "inside",
    );
    styles.add(series.style);
    assert.equal(series.referenceLocationId, location.id);
    assert.equal(
      verifyLocalization(series, generated.sites[1], generated, game.locations),
      true,
    );
    assert.equal(game.locations.length, 1);
  }
  assert.equal(styles.size, 4);
});

test("cartes à une ou deux parties, point repère sans village et déplacement vers le sud-ouest", () => {
  const { game } = fixture();
  game.explorationState.sites = [game.explorationState.sites[0]];
  game.explorationState.clueSeries = game.explorationState.clueSeries.filter(
    (series) => series.siteId === "outside",
  );
  game.explorationState.clues = [];
  game.explorationState.sites[0].requirements.expedition = 40;
  let generated = generateLocalization(game, game.explorationState);
  assert.equal(generated.clueSeries[0].fragments.length, 2);
  game.explorationState.sites[0].cellId = "cell-3-0";
  generated = generateLocalization(game, game.explorationState);
  assert.equal(generated.clueSeries[0].fragments.length, 1);
  game.locations = [];
  generated = generateLocalization(game, game.explorationState);
  assert.match(generated.clueSeries[0].fragments[0].text, /case repère/);
});

test("acquisition finie par taverne et académie, sac plein et réutilisation exclusive", () => {
  const { game, hero, service, context } = fixture();
  for (const source of ["tavern", "equipment"]) {
    const offer = service
      .offers(context, source)
      .find((offer) => offer.id.startsWith("clue-action:take:"));
    assert.ok(offer);
    hero.bagSlotCount = 1;
    const gold = hero.getResourceAmount("gold");
    assert.equal(service.select(context, source, offer.id).success, true);
    assert.equal(
      hero.getResourceAmount("gold"),
      gold - (source === "tavern" ? 5 : 0),
    );
    assert.equal(service.select(context, source, offer.id).success, false);
  }
  const clue = service.held(hero).find((clue) => clue.kind === "localization");
  assert.ok(clue);
  assert.equal(
    service.usable(hero, "search", clue.siteId).includes(clue),
    false,
  );
  const before = JSON.stringify(game.explorationState.toJSON());
  assert.deepEqual(
    service.usable(hero, "localization", clue.siteId),
    service.usable(hero, "localization", clue.siteId),
  );
  assert.equal(JSON.stringify(game.explorationState.toJSON()), before);
});

test("perte : un seul tirage par site et événement, seuil strict de 25 %, clôture mondiale", () => {
  const { game, hero, other, service } = fixture();
  const clues = game.explorationState.clues.filter(
    (clue) => clue.siteId === "outside",
  );
  service.receive(hero, clues[0]);
  service.receive(other, clues[1]);
  let rolls = 0;
  service.lose(hero, [clues[0].id], "battle:one", () => {
    rolls++;
    return 0.25;
  });
  service.lose(other, [clues[1].id], "battle:one", () => {
    rolls++;
    return 0;
  });
  assert.equal(rolls, 1);
  assert.equal(game.explorationState.sites[0].status, "active");
  service.receive(hero, clues[2]);
  service.lose(hero, [clues[2].id], "battle:two", () => 0.24999);
  assert.equal(game.explorationState.sites[0].status, "disappeared");
  assert.equal(game.explorationState.sites[0].resolution.eventId, "battle:two");
  assert.ok(
    game.explorationState.clues
      .filter((clue) => clue.siteId === "outside")
      .every((clue) => clue.status !== "active"),
  );
  assert.equal(game.explorationState.toJSON().clueEvents.length, 2);
});

test("archives conservées, prix entre 5 et 10, vente sans nouveau tirage et sans double paiement", () => {
  const { game, hero, service } = fixture();
  const clue = game.explorationState.clues[0];
  service.receive(hero, clue);
  service.close(
    clue.siteId,
    { eventId: "won", at: 1000, playerId: "a" },
    "won",
  );
  assert.equal(clue.status, "obsolete");
  assert.ok(hero.carriedLoot.some((item) => item.itemId === clue.id));
  const gold = hero.getResourceAmount("gold");
  const result = service.sell(hero, clue, "cartographer");
  assert.equal(result.success, true);
  assert.ok(result.gold >= 5 && result.gold <= 10);
  assert.equal(clue.status, "archived");
  assert.equal(clue.holder.id, "cartographer");
  assert.equal(service.sell(hero, clue, "cartographer").success, false);
  assert.equal(hero.getResourceAmount("gold"), gold + result.gold);
  assert.deepEqual(game.explorationState.clueEvents, []);
});

test("document de loot attribué une fois même si le sac est plein, pertes puis récupération", () => {
  const { game, hero, service, context } = fixture();
  hero.bagSlotCount = 1;
  const battle = {
    id: "battle",
    winnerTeamId: "winner",
    teams: [{ id: "winner", heroes: [{ sourceId: hero.id }] }],
  };
  service.unlockBattleLoot(battle);
  service.unlockBattleLoot(battle);
  assert.equal(
    game.explorationState.clues.filter(
      (clue) => clue.origin?.battleId === "battle",
    ).length,
    1,
  );
  assert.equal(
    service
      .offers(context, "equipment")
      .some((offer) => offer.label.includes("butin")),
    false,
  );
  const clue = game.explorationState.clues.find(
    (clue) => clue.origin?.battleId === "battle",
  );
  assert.equal(clue.holder.id, hero.id);
  service.lose(hero, [clue.id], "battle:loss", () => 0.9);
  hero.carriedLoot = hero.carriedLoot.filter((item) => item.itemId !== clue.id);
  assert.equal(service.receive(hero, clue), true);
  assert.equal(service.receive(hero, clue), false);
});

test("offres opaques et lecture autorisée sans destination privée, UI échappe le texte", () => {
  const { game, hero, service, context } = fixture();
  const offer = service.offers(context, "tavern")[0];
  const project = () =>
    createExplorationProjection(game.toJSON(), "a", {
      now: 1000,
      visibleLocationIds: new Set(["village"]),
    });
  const publicOffer = project().sanitize(offer);
  assert.match(publicOffer.id, /^clue-action:take:exploration-clue-/);
  assert.ok(!publicOffer.id.includes(game.explorationState.clues[1].id));
  hero.bagSlotCount = 30;
  service.select(context, "tavern", offer.id);
  const { view, sanitize } = project();
  const wire = JSON.stringify(
    sanitize({ explorationView: view, hero: hero.toJSON() }),
  );
  assert.ok(!wire.includes('"solution"'));
  assert.ok(!wire.includes('"authentic"'));
  assert.ok(!wire.includes('"siteId"'));
  assert.ok(view.clues.length >= 1);
  const html = renderInventoryItemDetail(view.clues[0].id, 1, {
    ...view.clues[0],
    text: "<script>alert(1)</script>",
  });
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.equal(
    sanitize(game.explorationState.clueSeries[0].solution),
    undefined,
  );
  assert.equal(
    explorationPublicId(game, "a", "clue", service.held(hero)[0].id),
    view.clues[0].id,
  );
});

test("vente active : 25 % côté serveur pour tous les indices", () => {
  const { game, hero, service } = fixture();
  service.random = () => 0;
  const clue = game.explorationState.clues[0];
  service.receive(hero, clue);
  assert.equal(service.sell(hero, clue, "village").success, true);
  assert.equal(service.site(clue).status, "disappeared");
  assert.equal(clue.status, "sold");
  const remaining = game.explorationState.clues.find(
    (entry) => service.site(entry).status === "active",
  );
  remaining.authentic = false;
  service.receive(hero, remaining);
  assert.ok(
    service.usable(hero, remaining.kind, remaining.siteId).includes(remaining),
  );
  assert.equal(service.sell(hero, remaining, "village").success, true);
  assert.equal(service.site(remaining).status, "disappeared");
});

test("les directions sud-ouest et les noms homonymes sont vérifiés ; un lieu différé ne sert pas de repère", () => {
  const { game, location } = fixture();
  const grid = new PlayAreaGrid({
    playArea: game.setup.playArea,
    cellSizeMeters: 15,
  });
  location.position = grid.cells.find(
    (cell) => cell.row === 5 && cell.column === 5,
  ).center;
  game.locations.push(
    new Location({
      id: "other-village",
      name: location.name,
      type: "village",
      source: "test",
      position: location.position,
    }),
  );
  game.explorationState.clues = [];
  const generated = generateLocalization(game, game.explorationState);
  const series = generated.clueSeries.find(
    (series) => series.siteId === "outside",
  );
  const text = series.fragments.map((fragment) => fragment.text).join(" ");
  assert.match(text, /2 cases vers le sud/);
  assert.match(text, /3 cases vers l’ouest/);
  assert.match(text, /repère/);
  assert.equal(
    verifyLocalization(series, generated.sites[0], generated, game.locations),
    true,
  );
  game.scenarioRuntime = {
    placements: Object.fromEntries(
      game.locations.map((location) => [
        location.id,
        { locationId: location.id, status: "walking" },
      ]),
    ),
  };
  game.explorationState.sites = [game.explorationState.sites[0]];
  game.explorationState.clueSeries = [];
  const deferred = generateLocalization(game, game.explorationState);
  assert.equal(deferred.clueSeries[0].referenceLocationId, null);
  assert.match(deferred.clueSeries[0].fragments[0].text, /case repère/);
});

test("tous les stocks sont fiables et stables, sans règle de faux parchemin", () => {
  const { game } = fixture();
  const state = generateLocalization(game, game.explorationState);
  const generated = initializeClueItems(game, state);
  assert.ok(generated.clues.every((clue) => !("authentic" in clue)));
  assert.ok(generated.clues.every((clue) => !clue.id.includes("false")));
  assert.equal(
    generated.clues.filter((clue) => clue.kind === "localization").length,
    generated.clueSeries.reduce(
      (sum, series) => sum + series.fragments.length,
      0,
    ),
  );
  assert.deepEqual(
    initializeClueItems(game, state).toJSON(),
    generated.toJSON(),
  );
});

test("commandes serveur : offres publiques exécutables, usurpation et rejeu refusés, réserves récupérables", () => {
  const { game, hero, location } = fixture();
  game.getPlayer("a").discoverLocation(location.id, 3);
  let id = 0;
  const lobby = new LobbyService({
    idFactory: () => ["a", "b"][id++] ?? `id-${id}`,
    now: () => 1000,
  });
  const host = lobby.createLobby({
    playerName: "Alice",
    positionMode: "simulation",
    maxPlayers: 4,
  });
  lobby.joinLobby({ code: host.lobby.code, playerName: "Bob" });
  const saved = lobby.exportState();
  saved.lobbies[0].game = game.toJSON();
  saved.lobbies[0].status = "started";
  const official = new LobbyService({ initialState: saved, now: () => 1000 });
  const packet = official.projectForPlayer(host.session.token, {
    game: official.gameSnapshot(host.lobby.code),
  });
  const entry = packet.game.state.explorationView.clueOffers.find(
    (entry) => entry.source === "tavern",
  );
  assert.ok(entry);
  const args = {
    playerId: "a",
    heroId: hero.id,
    locationId: location.id,
    source: "tavern",
    optionId: entry.options[0].id,
  };
  assert.throws(() =>
    official.executeGameCommand({
      token: host.session.token,
      command: "selectLocationChiefOption",
      args: [{ ...args, playerId: "b" }],
    }),
  );
  const reply = official.executeGameCommand({
    token: host.session.token,
    command: "selectLocationChiefOption",
    args: [args],
  });
  assert.equal(reply.result.success, true);
  assert.equal(
    official.executeGameCommand({
      token: host.session.token,
      command: "selectLocationChiefOption",
      args: [args],
    }).result.success,
    false,
  );
  const publicReply = official.projectForPlayer(host.session.token, reply);
  const publicHero = publicReply.game.state.heroes.find(
    (entry) => entry.id === hero.id,
  );
  const item = publicHero.carriedLoot.find((entry) =>
    entry.itemId.startsWith("exploration-clue-"),
  );
  assert.ok(item);
  const deposited = official.executeGameCommand({
    token: host.session.token,
    command: "depositLocationItem",
    args: [
      {
        playerId: "a",
        heroId: hero.id,
        locationId: location.id,
        lootId: item.id,
      },
    ],
  });
  assert.equal(deposited.result.success, true);
  const projected = official.projectForPlayer(host.session.token, deposited);
  const take = projected.game.state.explorationView.clueOffers
    .find((entry) => entry.source === "equipment")
    .options.find((offer) => offer.label.includes("réserves"));
  assert.ok(take);
  assert.equal(
    official.executeGameCommand({
      token: host.session.token,
      command: "selectLocationChiefOption",
      args: [{ ...args, source: "equipment", optionId: take.id }],
    }).result.success,
    true,
  );
  // Le navigateur affiche les options officielles sans recréer les stocks privés.
  const clientGame = Game.fromJSON(projected.game.state);
  assert.equal(clientGame.explorationState.clues.length, 0);
  assert.ok(
    clientGame
      .getLocationChiefConversation({ ...args, source: "equipment" })
      .options.some((offer) => offer.id === take.id),
  );
});
