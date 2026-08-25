import assert from "node:assert/strict";
import test from "node:test";
import { PlayAreaGrid } from "../app/js/core/play-area-grid.js";

const area = { id: "park", name: "Parc", polygon: [{ latitude: 48, longitude: 2 }, { latitude: 48, longitude: 2.004 }, { latitude: 48.004, longitude: 2.004 }, { latitude: 48.004, longitude: 2 }] };

test("une PlayArea est subdivisée en cellules GPS d'environ 100 mètres", () => {
  const grid = new PlayAreaGrid({ playArea: area, cellSizeMeters: 100 });
  assert.ok(grid.cells.length >= 9);
  assert.equal(grid.getCellAt({ latitude: 49, longitude: 2 }), null);
  assert.ok(grid.getCellAt({ latitude: 48.001, longitude: 2.001 }));
});

test("la heatmap enregistre visites et activité dans la cellule traversée", () => {
  const grid = new PlayAreaGrid({ playArea: area, cellSizeMeters: 100 });
  const position = { latitude: 48.001, longitude: 2.001 };
  const first = grid.recordVisit(position, { activity: 2, visitedAt: 10 });
  const second = grid.recordVisit(position, { activity: 3, visitedAt: 20 });
  assert.equal(second.id, first.id);
  assert.equal(second.visits, 2);
  assert.equal(second.activity, 5);
  assert.equal(second.lastVisitedAt, 20);
  assert.equal(grid.toJSON().cells.find((cell) => cell.id === first.id).activity, 5);
});

test("un signal de quête colore une zone sans modifier l'activité réelle", () => {
  const grid = new PlayAreaGrid({ playArea: area, cellSizeMeters: 100 }); const position = { latitude: 48.001, longitude: 2.001 };
  const signal = grid.setQuestSignal(position, { radiusCells: 1 }); assert.ok(signal.targetCellId); assert.equal(grid.getCellAt(position).questSignal, 1); assert.equal(grid.getCellAt(position).activity, 0);
  grid.clearQuestSignal(); assert.equal(grid.cells.some((cell) => cell.questSignal > 0), false);
});
