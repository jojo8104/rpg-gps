import { GameSetup } from "../app/js/core/game-setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import { socialGame } from "./fixtures/player-social-game.js";
import { PlayArea } from "../app/js/core/play-area.js";
import { PlayAreaGrid } from "../app/js/core/play-area-grid.js";
import { ExplorationState } from "../app/js/core/exploration-state.js";
import { Location } from "../app/js/core/location.js";
import { Game } from "../app/js/core/game.js";
import { CAMP_FOUNDATION_COST } from "../app/js/core/camp-terrain-rules.js";
import {
  exceptionalSite,
  clueItem,
} from "../app/js/core/exploration-records.js";
import { createExplorationProjection } from "../server/realtime/exploration-projection.js";
import { campInstallationDialog } from "../app/js/ui/camp-installation-view.js";
import { LobbyService } from "../server/lobby/lobby-service.js";

function fixture(resource = "wood", mode = "gps") {
  const f = socialGame();
  const game = f.game;
  game.coordinateMode = mode;
  const span = mode === "gps" ? 0.004 : 40;
  game.setup.playArea = new PlayArea({
    id: "terrain",
    name: "Terrain",
    polygon: [
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: span },
      { latitude: span, longitude: span },
      { latitude: span, longitude: 0 },
    ],
  });
  game.setup.locationSetup = { rangePolicy: { mode: "fixed" } };
  game.setup = new GameSetup(game.setup.toJSON());
  const grid = new PlayAreaGrid({
    playArea: game.setup.playArea,
    cellSizeMeters: mode === "gps" ? 15 : 1500000,
  });
  const square = grid.cells.at(-1),
    start = grid.cells[0];
  game.explorationState = new ExplorationState({
    grid: {
      playAreaId: "terrain",
      coordinateMode: mode,
      cellSizeMeters: grid.cellSizeMeters,
    },
    generation: {
      seed: "camp-private",
      generatedAt: 1000,
      playArea: game.setup.playArea.toJSON(),
    },
    cells: grid.cells.map((c) => ({
      id: c.id,
      row: c.row,
      column: c.column,
      resource: c.id === square.id ? resource : "none",
    })),
    discoveries: [
      {
        playerId: "a",
        targetKind: "cell",
        targetId: square.id,
        source: "prospecting",
        discoveredAt: 1000,
      },
    ],
  });
  const [hero, other] = f.heroes;
  hero.resources = {
    wood: 100,
    food: 100,
    exploration_tools: 5,
    gold: 100,
    stone: 100,
  };
  other.resources = { ...hero.resources };
  hero.updatePosition(square.center);
  other.updatePosition(square.center);
  const origin = new Location({
    id: "post",
    name: "Le poste",
    type: "village",
    source: "test",
    ownerId: "a",
    controllerId: "a",
    position: start.center,
    population: 20,
    infrastructure: { prospecting_post: 1 },
    resources: { stock: { wood: 100, food: 100, exploration_tools: 5 } },
  });
  game.locations = [origin];
  return {
    ...f,
    game,
    hero,
    other,
    origin,
    grid,
    square,
    cell: game.explorationState.cells.at(-1),
    request: { playerId: "a", heroId: hero.id, cellId: square.id },
    service: game.campInstallationService,
  };
}
for (const resource of [
  "none",
  "wood",
  "stone",
  "fertile-land",
  "iron",
  "gold",
])
  test(`fondation sur ${resource} : coût unique, terrain conservé, reprise sans production offerte`, () => {
    const f = fixture(resource);
    const before = f.hero.resources.wood;
    const first = f.game.foundResourceCamp(f.request);
    assert.equal(first.success, true);
    const camp = f.game.getLocation(first.locationId);
    assert.equal(camp.type, "camp");
    assert.equal(camp.population, 0);
    assert.equal(camp.ownerId, "a");
    assert.deepEqual(camp.terrain, { cellId: f.cell.id, resource });
    assert.equal(f.cell.resource, resource);
    assert.equal(f.cell.campLocationId, camp.id);
    assert.equal(f.hero.resources.wood, before - CAMP_FOUNDATION_COST.wood);
    assert.equal(camp.features.resourceProduction, false);
    assert.equal(f.game.foundResourceCamp(f.request).replayed, true);
    assert.equal(f.hero.resources.wood, before - CAMP_FOUNDATION_COST.wood);
    const saved = f.game.toJSON();
    const restored = Game.fromJSON(saved, { now: f.game.now });
    assert.deepEqual(restored.getLocation(camp.id).terrain, camp.terrain);
    assert.deepEqual(restored.toJSON(), saved);
  });
const branchByResource = {
  none: "fort",
  wood: "lumber-camp",
  stone: "quarry",
  "fertile-land": "village",
  iron: "iron-mine",
  gold: "gold-mine",
};
for (const [resource, branch] of Object.entries(branchByResource))
  test(`évolution ${resource} : seule la branche ${branch} est autorisée`, () => {
    const f = fixture(resource);
    const made = f.service.found(f.request),
      camp = f.game.getLocation(made.locationId);
    camp.level = 3;
    camp.addPopulation(25);
    camp.progression.experience = 10000;
    camp.resources.stock = { wood: 1000, stone: 1000, gold: 1000, iron: 1000 };
    camp.infrastructure = {
      housing: 2,
      barricades: 3,
      trading_post: 1,
      healing_tent: 1,
      watch_post: 2,
    };
    const choices = f.game
      .getCampDevelopment(camp.id, f.hero.id)
      .evolutions.map((b) => b.id);
    assert.deepEqual(choices, [branch]);
    const before = camp.toJSON();
    for (const wrong of Object.values(branchByResource).filter(
      (id) => id !== branch,
    ))
      assert.equal(
        f.game.evolveCamp({
          ...f.request,
          locationId: camp.id,
          branchId: wrong,
        }).success,
        false,
      );
    assert.deepEqual(camp.toJSON(), before);
    assert.equal(
      f.game.evolveCamp({ ...f.request, locationId: camp.id, branchId: branch })
        .success,
      true,
    );
    if (["wood", "stone", "iron", "gold"].includes(resource)) {
      assert.equal(camp.resources.production[resource], 1);
      const produced = camp.produceResources(1);
      assert.equal(produced[resource], 1);
    }
    if (resource === "fertile-land") {
      camp.type = "town";
      camp.level = 5;
      camp.progression.experience = 100000;
      const xp = camp.progression.experience;
      assert.equal(
        f.game.locationProgressionService.levelUp(camp).reason,
        "terrain_incompatible",
      );
      assert.equal(camp.progression.experience, xp);
    }
  });
for (const mode of ["gps", "simulation"])
  test(`installation envoyée ${mode} : paiement au poste, création à l’arrivée et rejeu`, () => {
    const f = fixture("iron", mode);
    f.hero.updatePosition(f.origin.position);
    f.origin.heroIds = [f.hero.id];
    const request = { ...f.request, originLocationId: f.origin.id };
    const first = f.game.sendCampInstallation(request);
    assert.equal(first.success, true);
    assert.equal(f.origin.resources.stock.wood, 80);
    assert.equal(f.game.sendCampInstallation(request).replayed, true);
    assert.equal(f.origin.resources.stock.wood, 80);
    const mission = f.game.explorationState.expeditions[0],
      group = f.game.getAutonomousGroup(mission.groupId);
    const move = (at) =>
      f.game.autonomousGroupService.advance({
        groups: [group],
        locations: f.game.locations,
        playArea: f.game.setup.playArea,
        now: at,
      });
    move(1000);
    assert.equal(group.status, "traveling");
    const saved = f.game.toJSON();
    const restored = Game.fromJSON(saved, { now: f.game.now });
    assert.deepEqual(restored.toJSON(), saved);
    move(group.movement.arrivesAt);
    f.service.update();
    assert.equal(mission.status, "completed");
    assert.equal(mission.result.success, true);
    assert.equal(group.cargo.length, 0);
    assert.equal(
      f.game.getLocation(f.cell.campLocationId).terrain.resource,
      "iron",
    );
    f.service.update();
    assert.equal(f.game.locations.filter((l) => l.terrain).length, 1);
  });
test("concurrence à l’arrivée : un seul camp et retour des matériaux de l’autre expédition", () => {
  const f = fixture();
  f.hero.updatePosition(f.origin.position);
  f.origin.heroIds = [f.hero.id];
  const sent = f.game.sendCampInstallation({
    ...f.request,
    originLocationId: f.origin.id,
  });
  assert.equal(sent.success, true);
  const mission = f.game.explorationState.expeditions[0],
    group = f.game.getAutonomousGroup(mission.groupId),
    cargo = structuredClone(group.cargo);
  f.hero.updatePosition(f.square.center);
  assert.equal(f.service.found(f.request).success, true);
  group.position = f.square.center;
  group.status = "arrived";
  group.mission.phase = "waiting";
  f.service.update();
  assert.equal(mission.status, "returning");
  assert.equal(mission.result.success, false);
  assert.deepEqual(group.cargo, cargo);
  assert.equal(f.game.locations.filter((l) => l.terrain).length, 1);
});
test("autorité, ressources, précision, position, influence et inconnus vérifiés avant dépense", () => {
  const f = fixture();
  const before = { ...f.hero.resources };
  assert.equal(f.service.found({ ...f.request, playerId: "b" }).success, false);
  assert.equal(
    f.service.found({ ...f.request, cellId: "unknown" }).success,
    false,
  );
  f.hero.position.accuracy = 100;
  assert.equal(f.service.found(f.request).success, false);
  delete f.hero.position.accuracy;
  f.game.explorationState.discoveries = [];
  assert.equal(f.service.found(f.request).reason, "installation_unknown_cell");
  assert.deepEqual(f.hero.resources, before);
  f.game.explorationState.discoveries.push({
    playerId: "a",
    targetKind: "cell",
    targetId: f.cell.id,
    source: "prospecting",
    discoveredAt: 1000,
  });
  f.hero.resources.wood = 0;
  assert.equal(f.service.found(f.request).reason, "insufficient_resources");
  assert.equal(f.game.locations.length, 1);
});
test("influence : propre gisement conservé, voisins neutralisés et site exceptionnel fermé sans butin", () => {
  const f = fixture("gold");
  const site = exceptionalSite({
    id: "exception",
    cellId: f.cell.id,
    type: "treasure",
    position: f.square.center,
  });
  f.game.explorationState.sites.push(site);
  const clue = clueItem({
    id: "clue",
    siteId: site.id,
    kind: "search",
    text: "Un signe",
  });
  f.game.explorationState.clues.push(clue);
  const founded = f.service.found(f.request);
  assert.equal(founded.success, true);
  assert.equal(f.cell.resource, "gold");
  assert.equal(site.status, "disappeared");
  assert.equal(clue.status, "obsolete");
  assert.equal(f.hero.resources.gold, 100);
  assert.ok(
    f.game.explorationState.cells.some(
      (c) =>
        c.id !== f.cell.id &&
        c.suppressedByLocationIds.includes(founded.locationId),
    ),
  );
});
test("projection : aucune cellule inconnue, développement officiel et HTML échappé", () => {
  const f = fixture();
  const first = createExplorationProjection(f.game.toJSON(), "a", {
    now: 1000,
  }).view;
  assert.equal(first.installationControls[0].targets.length, 1);
  assert.equal(
    createExplorationProjection(f.game.toJSON(), "b", { now: 1000 }).view
      .installationControls[0].targets.length,
    0,
  );
  const camp = f.game.getLocation(f.service.found(f.request).locationId);
  camp.addPopulation(1);
  const view = createExplorationProjection(f.game.toJSON(), "a", {
    now: 1000,
    visibleLocationIds: new Set([camp.id]),
  }).view;
  assert.equal(view.campDevelopments.length, 1);
  const client = Game.fromJSON({ ...f.game.toJSON(), explorationView: view });
  client.explorationState = new ExplorationState();
  assert.deepEqual(
    client.getCampDevelopment(camp.id, f.hero.id),
    view.campDevelopments[0].development,
  );
  const controls = first.installationControls[0];
  controls.origins = [
    { id: "post", name: "<script>x</script>", affordable: true },
  ];
  const html = campInstallationDialog({ controls });
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
});

test("réseau : fondation officielle unique, usurpation refusée et état rechargé", () => {
  const f = fixture();
  let id = 0;
  const service = new LobbyService({
    idFactory: () => ["a", "b"][id++] ?? `id-${id}`,
    now: () => 1000,
  });
  const host = service.createLobby({
    playerName: "Alice",
    positionMode: "gps",
    maxPlayers: 4,
  });
  service.joinLobby({ code: host.lobby.code, playerName: "Bob" });
  const state = service.exportState();
  state.lobbies[0].game = f.game.toJSON();
  state.lobbies[0].status = "started";
  const official = new LobbyService({ initialState: state, now: () => 1000 });
  const first = official.executeGameCommand({
    token: host.session.token,
    command: "foundResourceCamp",
    args: [f.request],
  });
  assert.equal(first.result.success, true);
  const second = official.executeGameCommand({
    token: host.session.token,
    command: "foundResourceCamp",
    args: [f.request],
  });
  assert.equal(second.result.replayed, true);
  const packet = official.projectForPlayer(host.session.token, first);
  assert.equal(
    packet.game.state.explorationView.installationControls[0].targets.length,
    1,
  );
  assert.equal(
    official
      .gameSnapshot(host.lobby.code)
      .state.locations.filter((l) => l.terrain).length,
    1,
  );
  assert.throws(
    () =>
      official.executeGameCommand({
        token: host.session.token,
        command: "foundResourceCamp",
        args: [{ ...f.request, playerId: "b" }],
      }),
    /Identité/,
  );
});
test("prospection : une case vide devient connue, sans camp ni gain", () => {
  const f = fixture("none");
  f.game.explorationState.discoveries = [];
  const group = {
    owner: { kind: "player", id: "a" },
    mission: { phase: "exploring", discoveries: [] },
  };
  f.game.explorationDiscoveryService.inspectProspectingSegment(group, {
    from: f.square.center,
    to: f.square.center,
    toAt: 1000,
  });
  assert.ok(
    f.game.explorationState.discoveries.some(
      (d) => d.targetId === f.cell.id && d.targetKind === "cell",
    ),
  );
  assert.equal(f.cell.campLocationId, null);
  assert.equal(f.hero.resources.gold, 100);
});
test("évolution distante refusée malgré une ancienne présence dans la fiche du lieu", () => {
  const f = fixture();
  const camp = f.game.getLocation(f.service.found(f.request).locationId);
  camp.level = 3;
  camp.addPopulation(25);
  camp.progression.experience = 10000;
  camp.resources.stock = { wood: 100, stone: 100, gold: 100 };
  f.hero.updatePosition(f.origin.position);
  assert.equal(
    f.game.evolveCamp({
      ...f.request,
      locationId: camp.id,
      branchId: "lumber-camp",
    }).reason,
    "hero_not_at_location",
  );
  assert.equal(camp.type, "camp");
});

test("la référence de terrain d’un camp ne révèle pas une ressource à un autre joueur", () => {
  const f = fixture("gold");
  const camp = f.game.getLocation(f.service.found(f.request).locationId);
  camp.addPopulation(1);
  const own = createExplorationProjection(f.game.toJSON(), "a", {
    now: 1000,
    visibleLocationIds: new Set([camp.id]),
  });
  assert.equal(own.sanitize(camp.toJSON()).terrain.resource, "gold");
  const other = createExplorationProjection(f.game.toJSON(), "b", {
    now: 1000,
    visibleLocationIds: new Set([camp.id]),
  });
  assert.equal(other.sanitize(camp.toJSON()).terrain, undefined);
  assert.equal(other.view.campDevelopments.length, 0);
});

test("la fondation transfère la présence officielle du héros au nouveau camp", () => {
  const f = fixture();
  f.origin.heroIds = [f.hero.id];
  const made = f.service.found(f.request);
  assert.equal(made.success, true);
  assert.equal(f.origin.heroIds.includes(f.hero.id), false);
  assert.equal(
    f.game.getLocation(made.locationId).heroIds.includes(f.hero.id),
    true,
  );
});
