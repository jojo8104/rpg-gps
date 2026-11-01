import test from "node:test";
import assert from "node:assert/strict";
import {
  explorationMapEntries,
  ExplorationRenderer,
} from "../app/js/map/ExplorationRenderer.js";
import { explorationWorld } from "./fixtures/exploration-world.js";
import { createExplorationProjection } from "../server/realtime/exploration-projection.js";
import { Game } from "../app/js/core/game.js";

const position = { latitude: 1, longitude: 2 };
test("cinq marqueurs, aucun pour vide ou inconnu, aucun doublon de lieu", () => {
  const cells = [
    "stone",
    "wood",
    "iron",
    "gold",
    "fertile-land",
    "none",
    "secret",
  ].map((resource, i) => ({ id: String(i), resource, position }));
  assert.equal(explorationMapEntries({ cells }).length, 5);
  cells[0].campLocationId = "camp";
  const entries = explorationMapEntries(
    {
      cells,
      sites: [
        {
          id: "host",
          type: "treasure",
          status: "active",
          hostLocationId: "village",
          position,
        },
        { id: "won", type: "dungeon", status: "won", position },
        { id: "gone", type: "artifact", status: "disappeared", position },
        { id: "active", type: "dungeon", status: "active", position },
      ],
    },
    [{ id: "camp" }],
  );
  assert.equal(entries.length, 5);
  assert.equal(entries.filter((e) => e.kind === "site").length, 1);
  assert.equal(
    entries.some((e) => e.id === "0"),
    false,
  );
});
for (const mode of ["gps", "simulation"])
  test(`${mode} : découverte, position officielle, reprise et isolation des joueurs`, () => {
    const f = explorationWorld({ mode });
    const cell = f.at(2, 3);
    f.game.explorationState.discoveries.push({
      playerId: "a",
      targetKind: "cell",
      targetId: cell.id,
      source: "prospecting",
      discoveredAt: 1000,
    });
    const project = (game) =>
      createExplorationProjection(game.toJSON(), "a", { now: 1000 });
    const before = project(f.game).view;
    const known = before.cells.find((c) => c.id === cell.id);
    assert.deepEqual(known.position, cell.center);
    assert.equal(
      explorationMapEntries(before).some((e) => e.id === cell.id),
      true,
    );
    const other = createExplorationProjection(f.game.toJSON(), "b", {
      now: 1000,
    }).view;
    assert.equal(
      other.cells.some((c) => c.id === cell.id),
      false,
    );
    assert.equal(JSON.stringify(before).includes("private-test"), false);
    const restored = Game.fromJSON(f.game.toJSON(), { now: () => 1000 });
    assert.deepEqual(project(restored).view.cells, before.cells);
  });

test("la couche retire les marqueurs fermés et les connaissances révoquées", () => {
  const removed = [];
  const renderer = new ExplorationRenderer({});
  renderer.markers.set("site:closed", {
    remove() {
      removed.push("site");
    },
  });
  renderer.markers.set("cell:hidden", {
    remove() {
      removed.push("cell");
    },
  });
  renderer.render({
    sites: [{ id: "closed", type: "treasure", status: "won", position }],
  });
  assert.deepEqual(removed, ["site", "cell"]);
  assert.equal(renderer.markers.size, 0);
});

test("les résultats restent lisibles sans source de préparation (héros inactif)", async () => {
  const { exceptionalExpeditionDialog } = await import(
    "../app/js/ui/exceptional-expedition-view.js"
  );
  const html = exceptionalExpeditionDialog({
    controls: { sources: [], sites: [], canPrepare: false },
    history: [
      {
        id: "done",
        scores: {},
        result: { message: "Le donjon est remporté.", gold: 100 },
      },
    ],
  });
  assert.match(html, /Le donjon est remporté/);
  assert.match(html, /Or : 100/);
});

test("le marqueur ouvre la fiche dédiée et ne déclenche aucune commande de jeu", () => {
  const previous = globalThis.L;
  const elements = [];
  const doc = {
    createElement(tag) {
      const element = {
        tag,
        children: [],
        append(...children) {
          this.children.push(...children);
        },
      };
      elements.push(element);
      return element;
    },
  };
  let leafletMarker;
  globalThis.L = {
    icon: (options) => options,
    marker: (position, options) => {
      leafletMarker = {
        position,
        options,
        addTo() {
          return this;
        },
        setLatLng(value) {
          this.position = value;
        },
        bindPopup(sheet) {
          this.sheet = sheet;
        },
        closePopup() {
          this.closed = true;
        },
        remove() {},
      };
      return leafletMarker;
    },
  };
  try {
    const selected = [];
    const renderer = new ExplorationRenderer({
      getContainer: () => ({ ownerDocument: doc }),
    });
    renderer.render(
      { cells: [{ id: "known", resource: "gold", position }] },
      { onSelect: (entry) => selected.push(entry) },
    );
    assert.match(leafletMarker.options.icon.iconUrl, /resource-gold.png$/);
    assert.deepEqual(leafletMarker.position, [1, 2]);
    elements.find((e) => e.tag === "button").onclick();
    assert.equal(selected[0].id, "known");
    assert.equal(selected[0].kind, "cell");
    assert.equal(leafletMarker.closed, true);
  } finally {
    globalThis.L = previous;
  }
});
