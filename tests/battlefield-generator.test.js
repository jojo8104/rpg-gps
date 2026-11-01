import test from "node:test";
import assert from "node:assert/strict";
import { generateBattlefield } from "../app/js/core/battlefield-generator.js";
import { battlefieldPresentation } from "../app/js/map/tactical-terrain-renderer.js";
import { handleBattlefieldPreview } from "../server/maps/battlefield-http-api.js";

test("la carte est reproductible, sérialisable et varie selon la graine", () => {
  assert.deepEqual(generateBattlefield("test"), generateBattlefield("test"));
  assert.deepEqual(
    JSON.parse(JSON.stringify(generateBattlefield("test"))),
    generateBattlefield("test"),
  );
  const layouts = new Set(
    Array.from({ length: 100 }, (_, i) =>
      JSON.stringify(generateBattlefield(i).cells),
    ),
  );
  assert.ok(layouts.size > 10);
});

test("1000 graines conservent les départs et alternent rivières avec pont et terrains sans rivière", () => {
  const variants = new Set();
  for (let seed = 0; seed < 1000; seed++) {
    const map = generateBattlefield(seed);
    assert.equal(map.columns, 3);
    assert.equal(map.rows, 5);
    for (const row of [0, 4])
      for (const cell of map.cells[row]) {
        assert.equal(cell.terrain, "grass");
        assert.equal(cell.structure, null);
      }
    const river = map.cells[2][0].terrain === "water";
    variants.add(river);
    assert.equal(
      new Set(map.cells.flat().map((cell) => cell.terrain)).size,
      river ? 5 : 4,
    );
    if (river) {
      assert.ok(map.cells[2].every((cell) => cell.terrain === "water"));
      assert.deepEqual(map.cells[2][1].structure, {
        kind: "bridge",
        rotation: 90,
      });
    } else {
      assert.ok(
        map.cells[2].every(
          (cell) => cell.terrain === "grass" && !cell.structure,
        ),
      );
    }
    for (const row of [1, 3]) assert.equal(map.cells[row][1].terrain, "grass");
    assert.equal(
      new Set(
        map.cells
          .flat()
          .filter((cell) => cell.structure)
          .map((cell) => cell.structure.kind),
      ).size,
      river ? 4 : 3,
    );
    assert.equal(map.terrainEffectsEnabled, true);
  }
  assert.equal(variants.size, 2);
});

test("la vue opposée réoriente les cases et objets sans modifier la carte officielle", () => {
  const map = generateBattlefield("flip"),
    before = structuredClone(map);
  const a = battlefieldPresentation(map),
    b = battlefieldPresentation(map, true);
  assert.deepEqual(
    b.grid,
    a.grid.toReversed().map((row) => row.toReversed()),
  );
  for (const object of a.objects) {
    assert.ok(
      b.objects.some(
        (other) =>
          other.kind === object.kind &&
          other.col === 2 - object.col &&
          other.row === 4 - object.row &&
          other.rotation === object.rotation + 180,
      ),
    );
  }
  assert.deepEqual(map, before);
});

test("le banc d'essai génère sur le serveur et valide méthode et taille de graine", () => {
  const invoke = (url, method = "GET") => {
    let status, body;
    const handled = handleBattlefieldPreview(
      { url, method },
      {
        writeHead(value) {
          status = value;
        },
        end(value) {
          body = value;
        },
      },
    );
    return { handled, status, body };
  };
  const result = invoke("/api/playtest/battlefield?seed=test");
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.body), generateBattlefield("test"));
  assert.equal(invoke("/api/playtest/battlefield", "POST").status, 405);
  assert.equal(
    invoke("/api/playtest/battlefield?seed=" + "x".repeat(101)).status,
    400,
  );
  assert.equal(invoke("/health").handled, false);
});
