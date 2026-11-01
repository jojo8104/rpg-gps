import test from "node:test";
import assert from "node:assert/strict";
import { timeWindow, resourceSeries } from "../dashboard/history-data.js";
test("fenêtre commune, navigation passée et retour au direct sans mutation", () => {
  const samples = [0, 4000, 8000, 12000].map((at) => ({ at }));
  assert.deepEqual(
    timeWindow(samples, 8000).map((s) => s.at),
    [4000, 8000, 12000],
  );
  assert.deepEqual(
    timeWindow(samples, 4000, 8000).map((s) => s.at),
    [4000, 8000],
  );
  assert.deepEqual(
    timeWindow(samples, 0, 8000).map((s) => s.at),
    [0, 4000, 8000],
  );
  assert.deepEqual(
    timeWindow(samples, 4000, -500).map((s) => s.at),
    [0],
  );
  assert.equal(samples.length, 4);
  assert.deepEqual(timeWindow([], 4000), []);
});
test("production et stocks distincts, ressources seulement stockées et valeurs absentes", () => {
  const samples = [
    {
      locations: [
        { id: "v", production: { wood: 2 }, stock: { wood: 12, gold: 8 } },
      ],
    },
    { locations: [{ id: "v", production: { wood: 3 } }] },
    { locations: [] },
  ];
  const before = structuredClone(samples);
  const series = resourceSeries(samples, "v");
  assert.deepEqual(series.find((s) => s.id === "stock-wood").values, [
    12,
    null,
    null,
  ]);
  assert.deepEqual(series.find((s) => s.id === "production-wood").values, [
    2,
    3,
    null,
  ]);
  assert.deepEqual(series.find((s) => s.id === "stock-gold").values, [
    8,
    null,
    null,
  ]);
  assert.equal(series.find((s) => s.id === "stock-gold").axis, "right");
  assert.equal(series.find((s) => s.id === "stock-gold").kind, "column");
  assert.deepEqual(samples, before);
});
import { createDashboardCharts } from "../dashboard/history-charts.js";
test("contrôles de période persistants et colonnes dessinées sur un axe distinct", () => {
  const rectangles = [];
  class Node {
    constructor(tag) {
      this.tag = tag;
      this.children = [];
      this.attributes = {};
      this.style = {};
      this.textContent = "";
    }
    append(...nodes) {
      this.children.push(...nodes);
    }
    replaceChildren(...nodes) {
      this.children = nodes;
    }
    setAttribute(k, v) {
      this.attributes[k] = v;
    }
    getContext() {
      return new Proxy(
        {},
        {
          get: (_, k) =>
            k === "fillRect" ? (...args) => rectangles.push(args) : () => {},
        },
      );
    }
  }
  const savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new Node(tag) };
  try {
    const root = new Node("div");
    const view = createDashboardCharts(root);
    const samples = [0, 300000, 600000].map((at) => ({
      at,
      heroes: [],
      teams: [],
      battles: [],
      locations: [
        {
          id: "v",
          name: "Village",
          level: 1,
          population: 10,
          production: { wood: 2 },
          stock: { wood: 25 },
        },
      ],
    }));
    const nodes = () => {
      const walk = (n) => [n, ...n.children.flatMap(walk)];
      return walk(root);
    };
    const control = (label) =>
      nodes().find((n) => n.attributes["aria-label"] === label);
    view.render(samples, { unitTypes: [] });
    assert.ok(rectangles.length > 0);
    const period = control("Période des graphiques");
    period.value = "300000";
    period.onchange();
    assert.equal(control("Période des graphiques").value, 300000);
    const slider = control("Fin de la période affichée");
    slider.value = "1";
    slider.onchange();
    view.render([...samples, { ...samples[2], at: 900000 }], { unitTypes: [] });
    assert.equal(control("Fin de la période affichée").value, 1);
    nodes()
      .find((n) => n.textContent === "Revenir au direct")
      .onclick();
    assert.equal(control("Fin de la période affichée").value, 3);
    view.clear();
    view.render(samples, { unitTypes: [] });
    assert.equal(control("Période des graphiques").value, 0);
  } finally {
    globalThis.document = savedDocument;
  }
});
