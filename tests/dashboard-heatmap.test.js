import test from "node:test";
import assert from "node:assert/strict";
import { dashboardHeatmap } from "../server/monitoring/dashboard-heatmap.js";
import { PlayAreaGrid } from "../app/js/core/play-area-grid.js";
import { playAreaCellSizeMeters } from "../app/js/core/play-area-grid-config.js";

for (const mode of ["gps", "simulation"]) {
  test(`la heatmap ${mode} reprend exactement les limites et dimensions du jeu`, () => {
    const lat = mode === "gps" ? 48.8566 : 22;
    const lon = mode === "gps" ? 2.3522 : 23;
    const span = mode === "gps" ? 0.001 : 0.4;
    const playArea = {
      id: "area",
      name: "Zone",
      polygon: [
        { latitude: lat, longitude: lon },
        { latitude: lat + span, longitude: lon },
        { latitude: lat + span, longitude: lon + span },
        { latitude: lat, longitude: lon + span },
      ],
    };
    const lobby = { playArea, configuration: { positionMode: mode } };
    const grid = new PlayAreaGrid({
      playArea,
      cellSizeMeters: playAreaCellSizeMeters(mode),
    });
    const position = grid.cells[0].center;
    const samples = [{ position }, { position }];
    const result = dashboardHeatmap(lobby, samples);
    assert.deepEqual(
      result.map((c) => c.bounds),
      grid.cells.map((c) => c.bounds.map((p) => [p.latitude, p.longitude])),
    );
    assert.equal(result[0].visits, 2);
    assert.deepEqual(
      dashboardHeatmap(lobby, []).map((c) => c.visits),
      result.map(() => 0),
    );
    lobby.playArea = {
      ...playArea,
      polygon: playArea.polygon.map((p) => ({
        ...p,
        latitude: p.latitude + span,
      })),
    };
    assert.notDeepEqual(
      dashboardHeatmap(lobby, []).map((c) => c.bounds),
      result.map((c) => c.bounds),
    );
  });
}
