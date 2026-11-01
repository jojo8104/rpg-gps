import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { applyMultiplayerWorldState } from "../app/js/core/multiplayer-world-state.js";
import {
  createExplorationProjection,
  explorationPublicId,
} from "../server/realtime/exploration-projection.js";
import { SnapshotStream } from "../server/realtime/snapshot-stream.js";
import { SnapshotReceiver } from "../app/js/core/snapshot-delta.js";
import { explorationProjectionFixture } from "./fixtures/exploration-projection.js";

test("chaque joueur reçoit uniquement ses cellules, ses sites et les fragments qu’il détient", () => {
  const { project, state } = explorationProjectionFixture();
  const before = structuredClone(state);
  const alice = project("a", { state }).state.explorationView;
  const bob = project("b", { state }).state.explorationView;
  assert.deepEqual(
    alice.cells.map((cell) => cell.id),
    ["cell-0-0"],
  );
  assert.equal(alice.cells[0].resource, "none");
  assert.deepEqual(
    bob.cells.map((cell) => cell.resource),
    ["fertile-land"],
  );
  assert.equal(alice.sites.length, 1);
  assert.deepEqual(Object.keys(alice.sites[0]).sort(), [
    "hostLocationId",
    "id",
    "status",
    "type",
  ]);
  assert.equal(alice.sites[0].hostLocationId, "mine-a");
  assert.equal(bob.sites.length, 0);
  assert.equal(alice.clues.length, 4);
  assert.equal(bob.clues.length, 3);
  const map = alice.clues.find((clue) => clue.kind === "localization");
  assert.equal(
    map.text,
    state.explorationState.clueSeries[0].fragments[0].text,
  );
  assert.equal(map.fragmentIndex, 1);
  assert.equal(map.fragmentCount, 2);
  assert.equal(
    JSON.stringify(alice).includes(
      state.explorationState.clueSeries[0].fragments[1].text,
    ),
    false,
  );
  for (const forbidden of [
    "private-seed-8d3",
    "hidden-treasure",
    "won-dungeon",
    "lost-artifact",
    "treasure-series",
    "authentic",
    "requirements",
    "secret-relic",
    "0.123456789",
    "processedEventIds",
  ])
    assert.equal(JSON.stringify(alice).includes(forbidden), false, forbidden);
  assert.deepEqual(state, before);
});

test("alliance, vision et rôle d’organisateur ne donnent pas les indices de l’autre joueur", () => {
  const { project, state } = explorationProjectionFixture({ allied: true });
  const alice = project("a", { state }).state;
  assert.ok(alice.heroes.some((hero) => hero.playerId === "b"));
  assert.equal(alice.explorationView.clues.length, 4);
  assert.equal(
    alice.explorationView.clues.some(
      (clue) => clue.text === "Information détenue par location b",
    ),
    false,
  );
  assert.equal(
    alice.explorationView.clues.some(
      (clue) => clue.text === "Information détenue par group b",
    ),
    false,
  );
  assert.equal(
    alice.explorationView.expeditions.some(
      (mission) => mission.groupId === "group-b",
    ),
    false,
  );
  const unknown = project("observer", { state }).state.explorationView;
  for (const collection of [
    "cells",
    "sites",
    "clues",
    "searches",
    "expeditions",
  ])
    assert.deepEqual(unknown[collection], []);
});

test("les copies de données privées dans les accusés, journaux et enveloppes partielles sont filtrées", () => {
  const { project, state } = explorationProjectionFixture();
  const source = state.explorationState;
  const payload = {
    result: {
      nested: { explorationState: source },
      copied: structuredClone(source),
      generation: structuredClone(source.generation),
      site: source.sites[1],
      hiddenCell: source.cells[2],
      partialCell: {
        row: 1,
        column: 0,
        resource: "iron",
        hiddenDetail: "unreadable-cell-metadata",
      },
      partialSite: {
        type: "dungeon",
        cellId: "cell-1-0",
        position: { latitude: 0.7, longitude: 0.7 },
        hiddenDetail: "unreadable-site-metadata",
      },
      partial: {
        targetSiteId: "lost-artifact",
        position: source.sites[0].position,
      },
      fragment: source.clueSeries[0].fragments[1],
      nakedFragmentText: source.clueSeries[0].fragments[1].text,
      inventory: [
        {
          itemId: "map-b",
          quantity: 1,
          text: source.clueSeries[0].fragments[1].text,
        },
      ],
      forecast: structuredClone(source.expeditions[0].result),
      series: source.clueSeries,
      indices: source.clues,
      directIds: ["lost-artifact", "map-b", "treasure-series"],
      keyed: { "lost-artifact": "secret", "map-b": 1 },
      spoofed: {
        explorationView: { sites: source.sites, seed: source.generation.seed },
      },
      randomRoll: 0.123456789,
    },
    state: {
      ...state,
      eventLog: [
        {
          type: "exploration_future_resolution",
          playerId: "a",
          roll: 0.123456789,
          position: source.sites[0].position,
        },
      ],
    },
  };
  const packet = project("a", payload);
  const encoded = JSON.stringify(packet);
  for (const forbidden of [
    "explorationState",
    "private-seed-8d3",
    "lost-artifact",
    "won-dungeon",
    "0.123456789",
    "secret-relic",
    "authentic",
    "unreadable-cell-metadata",
    "unreadable-site-metadata",
    source.clueSeries[0].fragments[1].text,
  ])
    assert.equal(encoded.includes(forbidden), false, forbidden);
  assert.equal(packet.state.eventLog.length, 0);
  assert.deepEqual(
    packet.result.spoofed.explorationView,
    packet.state.explorationView,
  );
});

test("les missions cachent les résultats précalculés et les groupes n’exposent ni route ni butin futur", () => {
  const { project, state } = explorationProjectionFixture();
  const projected = project("a", { state }).state;
  const returning = projected.explorationView.expeditions.find(
    (mission) => mission.groupId === "group-a",
  );
  assert.ok(returning);
  assert.equal(returning.result, undefined);
  const completed = projected.explorationView.expeditions.find(
    (mission) => mission.status === "completed",
  );
  assert.deepEqual(completed.result, {
    success: true,
    gold: 150,
    experience: 40,
    heroDamage: 12,
    moraleDelta: 2,
  });
  const group = projected.autonomousGroups.find(
    (entry) => entry.id === "group-a",
  );
  assert.equal(group.movement, null);
  assert.deepEqual(group.cargo, []);
  assert.deepEqual(group.history, []);
  assert.equal(JSON.stringify(projected).includes("future-secret-loot"), false);
  const early = project("a", { state }, state, 2000).state.explorationView;
  assert.equal(
    early.expeditions.some((mission) => mission.status === "completed"),
    false,
  );
  assert.equal(JSON.stringify(early).includes('"gold":150'), false);
});

test("les identifiants publics sont opaques, propres au joueur et stables à la reprise", () => {
  const { state } = explorationProjectionFixture();
  const alice = explorationPublicId(state, "a", "clue", "map-a");
  assert.match(alice, /^exploration-clue-[a-f0-9]{32}$/);
  assert.notEqual(alice, explorationPublicId(state, "b", "clue", "map-a"));
  const restored = Game.fromJSON(JSON.parse(JSON.stringify(state))).toJSON();
  assert.equal(alice, explorationPublicId(restored, "a", "clue", "map-a"));
});

test("la modification d’un secret ne crée aucun delta, le transfert d’un indice retire le droit de lecture", () => {
  const { project, state, bob } = explorationProjectionFixture();
  const stream = new SnapshotStream();
  const receiver = new SnapshotReceiver();
  const first = {
    code: "A",
    revision: 1,
    state: project("a", { state }).state,
  };
  receiver.receive("game", stream.encode(first));
  const hiddenChanges = structuredClone(state);
  hiddenChanges.explorationState.cells[2].resource = "gold";
  hiddenChanges.explorationState.clueSeries[0].fragments[1].text =
    "Secret modifié pour Bob";
  hiddenChanges.explorationState.expeditions[0].result.success = true;
  hiddenChanges.explorationState.expeditions[0].result.roll = 0.999;
  hiddenChanges.explorationState.sites[0].rewards.gold = 999;
  hiddenChanges.explorationState.sites[0].requirements.expedition = 100;
  const second = {
    code: "A",
    revision: 2,
    state: project("a", { state: hiddenChanges }, hiddenChanges).state,
  };
  assert.equal(stream.encode(second), null);
  hiddenChanges.explorationState.clues[0].holder = { kind: "hero", id: bob.id };
  const third = {
    code: "A",
    revision: 3,
    state: project("a", { state: hiddenChanges }, hiddenChanges).state,
  };
  const delta = stream.encode(third);
  assert.equal(delta.sync.kind, "delta");
  const decoded = receiver.receive("game", delta);
  assert.equal(
    decoded.state.explorationView.clues.some(
      (clue) => clue.kind === "localization",
    ),
    false,
  );
});

test("la vue reçue est conservée côté client et reste distincte de l’état privé sauvegardé", () => {
  const { project, state } = explorationProjectionFixture();
  const projected = project("a", { state }).state;
  const game = Game.fromJSON(projected);
  assert.deepEqual(game.explorationView, projected.explorationView);
  assert.equal(game.explorationState.cells.length, 0);
  assert.equal(Object.hasOwn(game.toJSON(), "explorationView"), false);
  const updated = structuredClone(projected.explorationView);
  updated.clues = [];
  applyMultiplayerWorldState(game, {
    locations: projected.locations,
    explorationView: updated,
  });
  assert.deepEqual(game.explorationView.clues, []);
  updated.cells.length = 0;
  assert.equal(game.explorationView.cells.length, 1);
});

test("les indices vendus, perdus ou archivés ne donnent plus de texte au détenteur précédent", () => {
  const { project, state } = explorationProjectionFixture();
  for (const status of ["lost", "sold", "archived"]) {
    const changed = structuredClone(state);
    changed.explorationState.clues[0].status = status;
    const view = project("a", { state: changed }, changed).state
      .explorationView;
    assert.equal(
      view.clues.some((clue) => clue.kind === "localization"),
      false,
      status,
    );
  }
});

test("un site rattaché ne révèle jamais la position intérieure et attend la visibilité du lieu principal", () => {
  const { state } = explorationProjectionFixture();
  const hiddenHost = createExplorationProjection(state, "a", {
    now: 4000,
    visibleLocationIds: new Set(["mine-b"]),
  }).view;
  assert.deepEqual(hiddenHost.sites, []);
  const outside = structuredClone(state);
  outside.explorationState.sites[0].hostLocationId = null;
  const view = createExplorationProjection(outside, "a", { now: 4000 }).view;
  assert.deepEqual(
    view.sites[0].position,
    state.explorationState.sites[0].position,
  );
  assert.equal(Object.hasOwn(view.sites[0], "cellId"), false);
  assert.equal(
    view.cells.some((cell) => cell.id === "cell-0-1"),
    false,
  );
});

test("un ancien gisement ne dévoile ni les autres découvreurs ni un lieu non autorisé", () => {
  const { project, state } = explorationProjectionFixture();
  state.resourceZones = [
    {
      id: "legacy-zone",
      resourceId: "iron",
      locationType: "mine",
      position: { latitude: 0, longitude: 0 },
      discoveryRadius: 10,
      productionRate: 1,
      discoveredByPlayerIds: ["a", "b"],
      locationId: "invisible-mine",
    },
  ];
  const result = project("a", { state }).state.resourceZones[0];
  assert.deepEqual(result.discoveredByPlayerIds, ["a"]);
  assert.equal(result.locationId, null);
});

test("une issue sans données ne supprime pas les objets ordinaires d’un autre système", () => {
  const { project, state } = explorationProjectionFixture();
  state.explorationState.expeditions[0].result = {};
  state.explorationState.expeditions[1].result = { success: true };
  assert.deepEqual(
    project("a", { unrelated: { options: {}, result: { success: true } } })
      .unrelated,
    { options: {}, result: { success: true } },
  );
});
