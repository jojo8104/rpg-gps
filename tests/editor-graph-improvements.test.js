import test from "node:test";
import assert from "node:assert/strict";
import { campaignGraphModel } from "../editor/js/campaign-graph.js";
import { questEntry } from "../editor/js/quest-entry-model.js";
import { referenceOptions } from "../editor/js/reference-options.js";
import { branchExample } from "../editor/js/branch-example.js";
test("le schéma conserve plusieurs départs indépendants et les issues des liens", () => {
  const p = branchExample();
  const a = structuredClone(p.quest),
    b = { ...structuredClone(p.quest), id: "suite", title: "Suite" },
    c = {
      ...structuredClone(p.quest),
      id: "independante",
      title: "Indépendante",
    };
  a.transitions = [{ questId: "suite", outcome: "failure" }];
  p.quest = a;
  p.campaign = {
    id: "scenario",
    quests: [a, b, c],
    initialQuestIds: [a.id, c.id],
  };
  const model = campaignGraphModel(p);
  assert.equal(model.nodes.filter((node) => node.start).length, 2);
  assert.deepEqual(model.links, [
    { from: a.id, to: "suite", outcome: "failure" },
  ]);
  assert.ok(!model.links.some((link) => link.to === "independante"));
  assert.deepEqual(
    campaignGraphModel(p).nodes.map((node) => node.position),
    model.nodes.map((node) => node.position),
  );
});
test("la proposition est une vue des racines, sans action ou lien fictif exporté", () => {
  const p = branchExample(),
    before = JSON.stringify(p.quest);
  const entry = questEntry(p);
  assert.deepEqual(
    entry.roots.map((action) => action.id),
    ["choisir"],
  );
  assert.ok(entry.x < p.editor.positions.choisir.x);
  assert.equal(JSON.stringify(p.quest), before);
});
test("les menus présentent les noms et gardent les identifiants comme valeurs", () => {
  const p = branchExample();
  p.assets = { npcs: [{ id: "merlin", name: "Merlin" }] };
  assert.ok(
    referenceOptions(["quest", "actions", 0, "lieu"], p).some(
      (option) => option.id === "capital" && option.name === "Capitale",
    ),
  );
  assert.ok(
    referenceOptions(["quest", "actions", 0, "dialogue", "qui"], p).some(
      (option) => option.id === "merlin",
    ),
  );
  assert.equal(referenceOptions(["quest", "title"], p), null);
});
