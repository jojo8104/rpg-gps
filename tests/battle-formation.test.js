import assert from "node:assert/strict";
import test from "node:test";
import { formationProjectileOffsets, livingSoldierHealth, militiaFormationRows } from "../app/js/ui/battle-view.js";

test("le rendu conserve chaque soldat vivant et retire uniquement les morts", () => {
  assert.deepEqual(livingSoldierHealth({ soldierHealth: [10, 6, 0, 2, 0] }), [10, 6, 2]);
});

test("la formation des miliciens respecte les onze premières répartitions", () => {
  const expected = [[1], [2], [3], [2, 2], [1, 2, 2], [3, 3], [1, 3, 3], [4, 4], [3, 3, 3], [1, 3, 3, 3], [1, 5, 5]];
  expected.forEach((rows, index) => assert.deepEqual(militiaFormationRows(index + 1), rows));
});

test("une formation reste symétrique, bornée à cinq colonnes et vingt-quatre soldats", () => {
  for (let count = 1; count <= 24; count += 1) {
    const rows = militiaFormationRows(count);
    assert.equal(rows.reduce((sum, row) => sum + row, 0), count);
    assert.ok(rows.every((row) => row >= 1 && row <= 5));
    assert.ok(rows.length <= 6);
  }
  assert.deepEqual(militiaFormationRows(24), [4, 4, 4, 4, 4, 4]);
});

test("une volée crée exactement une flèche par archer selon ses rangs", () => {
  for (let count = 1; count <= 24; count += 1) {
    const offsets = formationProjectileOffsets(count);
    assert.equal(offsets.length, count);
    assert.ok(offsets.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
  }
  assert.deepEqual(formationProjectileOffsets(4), [
    { x: -.425, y: -.31 }, { x: .425, y: -.31 },
    { x: -.425, y: .31 }, { x: .425, y: .31 },
  ]);
});
