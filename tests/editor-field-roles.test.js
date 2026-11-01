import test from "node:test";
import assert from "node:assert/strict";
import { fieldRoles, renderFieldRoles } from "../editor/js/field-help.js";
test("le rôle dépend du contexte : rôle narratif, monde et apparence", () => {
  assert.deepEqual(fieldRoles(["assets", "npcs", 0, "role"]), ["descriptive"]);
  assert.deepEqual(fieldRoles(["world", "locationSlots", 0, "world", "role"]), [
    "gameplay",
  ]);
  assert.deepEqual(
    fieldRoles(["world", "locationSlots", 0, "appearance", "on"]),
    ["gameplay"],
  );
  assert.deepEqual(
    fieldRoles(["world", "locations", 0, "visual", "illustration"]),
    ["descriptive"],
  );
});
test("les bonus à intégrer ne sont pas présentés comme immédiatement disponibles", () => {
  assert.deepEqual(fieldRoles(["assets", "items", 0, "modifiers", "attack"]), [
    "gameplay",
    "integration",
  ]);
  assert.deepEqual(fieldRoles(["quest", "id"]), ["technical"]);
  assert.deepEqual(fieldRoles(["editor", "positions", "action", "x"]), [
    "editor",
  ]);
  assert.deepEqual(fieldRoles(["quest", "extensionImportee"]), ["advanced"]);
  assert.ok(
    renderFieldRoles(["assets", "items", 0, "modifiers"]).includes(
      "Intégration requise",
    ),
  );
});
