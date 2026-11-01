import assert from "node:assert/strict";
import test from "node:test";
import { explorationWorld } from "./fixtures/exploration-world.js";
import { Game } from "../app/js/core/game.js";
import { ExplorationState } from "../app/js/core/exploration-state.js";
import { clueItem } from "../app/js/core/exploration-records.js";
import { createExplorationProjection } from "../server/realtime/exploration-projection.js";
import { exteriorSearchDialog } from "../app/js/ui/exterior-search-view.js";
import { LobbyService } from "../server/lobby/lobby-service.js";

function fixture(type = "treasure", mode = "gps") {
  const f = explorationWorld({ mode });
  f.game.locations = [];
  const site = f.game.explorationState.sites.find(
    (site) => site.id === "outside",
  );
  site.type = type;
  site.name = "Le site des Brumes";
  f.hero.updatePosition(f.at(2, 3).center);
  f.hero.resources = {
    wood: 50,
    food: 50,
    beer: 20,
    exploration_tools: 20,
    specialist_geologist: 1,
    specialist_cartographer: 2,
    specialist_adventurer: 1,
    specialist_miner: 1,
  };
  const first = f.game.explorationState.clues.find(
    (clue) => clue.kind === "search" && clue.siteId === site.id,
  );
  first.text = "Cherchez une étoile gravée.";
  f.game.explorationClueService.receive(f.hero, first);
  const second = clueItem({
    ...first,
    id: "search-complement",
    text: "Examinez les joints de la dalle.",
    holder: null,
  });
  f.game.explorationState.clues.push(second);
  f.game.explorationClueService.receive(f.hero, second);
  const request = { playerId: "a", heroId: f.hero.id };
  const preparation = {
    clueIds: [first.id, second.id],
    npcIds: [
      "specialist_geologist",
      "specialist_cartographer",
      "specialist_adventurer",
    ],
    resources: { exploration_tools: 6 },
  };
  return {
    ...f,
    site,
    first,
    second,
    request,
    preparation,
    service: f.game.exteriorSearchService,
    begin() {
      const result = f.game.beginExteriorSearch(request);
      assert.equal(result.success, true);
      return { ...request, searchId: result.searchId };
    },
  };
}

test("ouverture : 60 secondes immédiatement, signature doublée, aucune consommation, annulation sans remise à zéro", () => {
  const f = fixture();
  const before = structuredClone(f.hero.resources),
    signature = f.game.heroClassFeatureService.signatureMultiplier(f.hero);
  const request = f.begin(),
    attempt = f.service.find(request);
  assert.equal(attempt.cooldownUntil, 61000);
  assert.equal(attempt.discretionPenaltyUntil, 61000);
  assert.equal(
    f.game.heroClassFeatureService.signatureMultiplier(f.hero),
    signature * 2,
  );
  assert.deepEqual(f.hero.resources, before);
  assert.equal(f.game.cancelExteriorSearch(request).success, true);
  assert.equal(f.game.beginExteriorSearch(f.request).reason, "search_cooldown");
  assert.equal(
    f.game.heroClassFeatureService.signatureMultiplier(f.hero),
    signature * 2,
  );
  f.advance(59999);
  assert.equal(f.game.beginExteriorSearch(f.request).success, false);
  f.advance(1);
  f.game.update();
  assert.equal(
    f.game.heroClassFeatureService.signatureMultiplier(f.hero),
    signature,
  );
  assert.equal(f.game.beginExteriorSearch(f.request).success, true);
});

test("jauge officielle plafonnée et actualisation sans dépense, copies de même indice sans double bonus", () => {
  const f = fixture(),
    request = f.begin(),
    before = structuredClone(f.hero.resources);
  const result = f.game.prepareExteriorSearch({
    ...request,
    preparation: {
      ...f.preparation,
      npcIds: [...f.preparation.npcIds, "specialist_miner"],
      resources: { wood: 50, food: 20, beer: 10, exploration_tools: 10 },
    },
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.gauge, {
    clues: 40,
    specialists: 30,
    resources: 30,
    total: 100,
    chance: 0.9,
  });
  assert.deepEqual(f.hero.resources, before);
  f.second.text = f.first.text;
  assert.equal(
    f.game.prepareExteriorSearch({ ...request, preparation: f.preparation })
      .gauge.clues,
    20,
  );
});

for (const type of ["treasure", "artifact", "dungeon"])
  test(`${type} : validation consomme une fois, révèle le site sans récompense et garde les documents`, () => {
    const f = fixture(type),
      request = f.begin();
    let rolls = 0;
    f.service.random = () => {
      rolls++;
      return 0.899;
    };
    const gold = f.hero.resources.gold,
      locations = f.game.locations.length;
    const result = f.game.validateExteriorSearch({
      ...request,
      preparation: f.preparation,
    });
    assert.equal(result.success, true);
    assert.equal(result.found, true);
    assert.equal(f.hero.resources.exploration_tools, 14);
    assert.equal(f.hero.resources.gold, gold);
    assert.equal(f.game.locations.length, locations);
    assert.equal(
      f.game.explorationState.discoveries.filter(
        (entry) => entry.targetId === f.site.id,
      ).length,
      1,
    );
    assert.equal(f.site.status, "active");
    assert.equal(f.first.status, "obsolete");
    assert.ok(f.hero.carriedLoot.some((item) => item.itemId === f.first.id));
    assert.equal(f.hero.resources.specialist_geologist, 1);
    assert.equal(
      f.game.validateExteriorSearch({ ...request, preparation: f.preparation })
        .replayed,
      true,
    );
    assert.equal(f.hero.resources.exploration_tools, 14);
    assert.equal(rolls, 1);
    assert.deepEqual(f.game.itemAcquisitionService.state.rewards, []);
  });

test("échec au seuil de 90 %, mauvaise case et site disparu : ressources consommées sans révélation", () => {
  for (const variant of ["roll", "empty", "disappeared", "hosted"]) {
    const f = fixture();
    if (variant === "empty") {
      f.hero.updatePosition(f.at(3, 3).center);
    }
    if (variant === "disappeared")
      f.game.explorationClueService.close(f.site.id, {
        eventId: "gone",
        at: 1000,
      });
    if (variant === "hosted") f.site.hostLocationId = "old-host";
    const request = f.begin();
    f.service.random = () => 0.9;
    const preparation =
      variant === "disappeared"
        ? { ...f.preparation, clueIds: [] }
        : f.preparation;
    const result = f.game.validateExteriorSearch({ ...request, preparation });
    assert.equal(result.found, false);
    assert.equal(f.hero.resources.exploration_tools, 14);
    assert.ok(
      !f.game.explorationState.discoveries.some(
        (entry) => entry.targetId === f.site.id,
      ),
    );
  }
});

test("préparation vide, ressources changées, indice de localisation, spécialiste absent et déplacement : refus sans débit", () => {
  const f = fixture(),
    request = f.begin();
  f.service.random = () => {
    throw Error("Pas de tirage");
  };
  assert.equal(
    f.game.validateExteriorSearch({ ...request, preparation: {} }).reason,
    "search_empty_preparation",
  );
  const map = f.game.explorationState.clues.find(
    (clue) => clue.kind === "localization",
  );
  for (const preparation of [
    { resources: { wood: 51 } },
    { resources: { gold: 1 } },
    { resources: { food: -1 } },
    { resources: { food: 0.5 } },
    { clueIds: [map.id] },
    { clueIds: [f.first.id, f.first.id] },
    { npcIds: ["specialist_farmer"] },
  ])
    assert.equal(
      f.game.validateExteriorSearch({ ...request, preparation }).success,
      false,
    );
  f.game.prepareExteriorSearch({ ...request, preparation: f.preparation });
  f.hero.resources.exploration_tools = 0;
  assert.equal(
    f.game.validateExteriorSearch(request).reason,
    "search_preparation_invalid",
  );
  f.hero.resources.exploration_tools = 20;
  f.hero.updatePosition(f.at(3, 3).center);
  assert.equal(
    f.game.validateExteriorSearch({ ...request, preparation: f.preparation })
      .reason,
    "search_moved",
  );
  assert.equal(f.hero.resources.exploration_tools, 20);
});

for (const mode of ["gps", "simulation"])
  test(`reprise ${mode} : même échéance, préparation et résultat sans nouveau tirage`, () => {
    const f = fixture("dungeon", mode),
      request = f.begin();
    f.game.prepareExteriorSearch({ ...request, preparation: f.preparation });
    let now = 31000;
    const restored = Game.fromJSON(f.game.toJSON(), { now: () => now });
    assert.equal(
      restored.exteriorSearchService.find(request).cooldownUntil,
      61000,
    );
    restored.exteriorSearchService.random = () => 0;
    assert.equal(restored.validateExteriorSearch(request).found, true);
    const ended = Game.fromJSON(restored.toJSON(), { now: () => now });
    ended.exteriorSearchService.random = () => {
      throw Error("Pas de nouveau tirage");
    };
    assert.equal(ended.validateExteriorSearch(request).replayed, true);
    now = 61000;
    ended.update();
    assert.equal(
      ended.heroes.find((hero) => hero.id === f.hero.id).classFeatureState
        .exteriorSearch.active,
      false,
    );
  });

test("aucun renseignement de présence avant validation, tirages et données des autres joueurs privés", () => {
  const f = fixture(),
    request = f.begin();
  f.game.prepareExteriorSearch({ ...request, preparation: f.preparation });
  const view = () =>
    createExplorationProjection(f.game.toJSON(), "a", { now: 1000 });
  const before = view().view;
  f.site.status = "disappeared";
  f.site.resolution = { eventId: "secret", at: 1000 };
  assert.deepEqual(view().view, before);
  f.site.status = "active";
  f.site.resolution = null;
  f.service.random = () => 0;
  f.game.validateExteriorSearch({ ...request, preparation: f.preparation });
  const alice = view(),
    bob = createExplorationProjection(f.game.toJSON(), "b", { now: 1000 });
  assert.equal(alice.view.sites.length, 1);
  assert.equal(bob.view.sites.length, 0);
  assert.equal(bob.view.searches.length, 0);
  const wire = JSON.stringify(alice.view);
  assert.ok(!wire.includes('"roll"'));
  assert.ok(!wire.includes('"actualChance"'));
  assert.ok(!wire.includes('"siteId":"outside"'));
  assert.equal(bob.sanitize(f.service.find(request)), undefined);
});

test("commandes publiques opaques, usurpation refusée, jauge HTML sans calcul local ni injection", () => {
  const f = fixture();
  let index = 0;
  const lobby = new LobbyService({
    idFactory: () => ["a", "b"][index++] ?? `id-${index}`,
    now: () => 1000,
  });
  const host = lobby.createLobby({
    playerName: "Alice",
    positionMode: "gps",
    maxPlayers: 4,
  });
  lobby.joinLobby({ code: host.lobby.code, playerName: "Bob" });
  const saved = lobby.exportState();
  saved.lobbies[0].game = f.game.toJSON();
  saved.lobbies[0].status = "started";
  const official = new LobbyService({ initialState: saved, now: () => 1000 });
  const execute = (command, request) =>
    official.executeGameCommand({
      token: host.session.token,
      command,
      args: [request],
    });
  assert.throws(() =>
    execute("beginExteriorSearch", { playerId: "b", heroId: f.hero.id }),
  );
  const started = official.projectForPlayer(
    host.session.token,
    execute("beginExteriorSearch", f.request),
  );
  const controls = started.game.state.explorationView.searchControls.find(
    (entry) => entry.heroId === f.hero.id,
  );
  assert.match(controls.activeSearchId, /^exploration-search-/);
  const request = {
    ...f.request,
    searchId: controls.activeSearchId,
    preparation: {
      ...f.preparation,
      clueIds: controls.clues.map((entry) => entry.id),
    },
  };
  const prepared = official.projectForPlayer(
    host.session.token,
    execute("prepareExteriorSearch", request),
  );
  const attempt = prepared.game.state.explorationView.searches[0];
  assert.equal(attempt.gauge.total, 100);
  const html = exteriorSearchDialog({
    controls: {
      ...controls,
      clues: [{ id: "safe", name: "<script>alert(1)</script>", text: "&" }],
    },
    attempt,
  });
  assert.ok(html.includes('max="100"'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  const resolved = execute("validateExteriorSearch", request);
  assert.equal(resolved.result.success, true);
  assert.equal(
    execute("validateExteriorSearch", request).result.replayed,
    true,
  );
  assert.equal(
    official
      .gameSnapshot(host.lobby.code)
      .state.heroes.find((hero) => hero.id === f.hero.id).resources
      .exploration_tools,
    14,
  );
});
