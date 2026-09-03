import assert from "node:assert/strict";
import test from "node:test";
import { renderUnitTypeIcon, unitIconKind } from "../app/js/ui/unit-icon.js";

test("les types d'unites partagent une icone SVG explicite", () => {
  assert.equal(unitIconKind({ typeId: "militia", tags: ["infantry"], range: 1 }), "melee");
  assert.equal(unitIconKind({ typeId: "archer", tags: ["ranged"], range: 3 }), "ranged");
  assert.equal(unitIconKind({ typeId: "mounted-archer", tags: ["cavalry", "ranged"], range: 3 }), "cavalry");
  assert.match(renderUnitTypeIcon({ tags: ["ranged"] }), /<svg[^>]+data-unit-icon="ranged"/);
});

test("les miliciens utilisent leur vignette d'unite illustrée", () => {
  assert.match(renderUnitTypeIcon({ typeId: "militia" }), /militia-thumbnail\.png/);
  assert.match(renderUnitTypeIcon({ typeId: "archer" }), /archer-thumbnail\.png/);
  assert.match(
    renderUnitTypeIcon({ typeId: "mounted-archer" }),
    /mounted-archer-thumbnail\.png/,
  );
  for (const typeId of [
    "spearman",
    "swordsman",
    "heavy-infantry",
    "light-cavalry",
    "heavy-cavalry",
  ]) {
    assert.match(
      renderUnitTypeIcon({ typeId }),
      new RegExp(`${typeId}-thumbnail\\.png`),
    );
  }
});
