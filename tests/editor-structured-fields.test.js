import test from "node:test";
import assert from "node:assert/strict";
import {
  renderStructuredField,
  setStructuredValue,
  emptyValue,
  FIELD_TEMPLATES,
} from "../editor/js/structured-fields.js";

test("les bonus proposent les statistiques numériques sans modifier le document", () => {
  const modifiers = { attack: 2, customImported: 7 };
  const html = renderStructuredField(modifiers, [
    "assets",
    "items",
    0,
    "modifiers",
  ]);
  for (const key of Object.keys(FIELD_TEMPLATES.modifiers))
    assert.ok(html.includes(`&quot;${key}&quot;`));
  assert.ok(html.includes('type="number"'));
  assert.ok(html.includes("customImported"));
  assert.ok(!html.includes("<textarea"));
  assert.deepEqual(modifiers, { attack: 2, customImported: 7 });
});
test("édition typée, suppression et listes conservent les données voisines", () => {
  const project = {
    quest: {
      events: [{ on: "ActionCompleted", effects: [] }],
      prerequisites: [],
    },
    assets: { items: [{ modifiers: { attack: 2, defense: 3 } }] },
  };
  setStructuredValue(project, ["assets", "items", 0, "modifiers", "attack"], 4);
  setStructuredValue(
    project,
    ["assets", "items", 0, "modifiers", "defense"],
    undefined,
    true,
  );
  assert.deepEqual(project.assets.items[0].modifiers, { attack: 4 });
  setStructuredValue(project, ["quest", "events", 0], undefined, true);
  assert.deepEqual(project.quest.events, []);
  assert.throws(() =>
    setStructuredValue(project, ["__proto__", "polluted"], true),
  );
  assert.equal({}.polluted, undefined);
});
test("valeurs facultatives, types et contenu HTML sont présentés sans code à écrire", () => {
  assert.equal(emptyValue("number"), 0);
  assert.equal(emptyValue("boolean"), false);
  assert.deepEqual(emptyValue("object", "army"), { units: [] });
  assert.ok(renderStructuredField(null, ["mission"]).includes("Facultatif"));
  assert.ok(
    renderStructuredField(["<script>"], ["dependsOn"]).includes(
      "&lt;script&gt;",
    ),
  );
  assert.ok(
    renderStructuredField({ units: [] }, ["army"]).includes(
      "Ajouter une ligne",
    ),
  );
});
