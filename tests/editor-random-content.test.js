import test from "node:test";
import assert from "node:assert/strict";
import { generateRandomContent } from "../editor/js/random-content.js";
import { branchExample } from "../editor/js/branch-example.js";
import { validateEditorProject } from "../server/editor/editor-validation.js";
test("les profils générés restent compatibles avec la validation serveur", () => {
  const project = branchExample();
  for (let index = 0; index < 7; index++) {
    for (const kind of ["items", "npcs", "locations"])
      generateRandomContent(project, kind, { random: () => index / 7 });
  }
  const report = validateEditorProject(project);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.equal(new Set(project.assets.items.map((item) => item.id)).size, 7);
  for (const item of project.assets.items)
    if (item.category === "equipment") {
      assert.ok(item.equipmentSlot);
      assert.ok(
        Object.values(item.modifiers).every(
          (value) => Number.isInteger(value) && value >= 1 && value <= 4,
        ),
      );
    }
  for (const slot of project.world.locationSlots.slice(3))
    assert.equal(slot.defaultPlacement.strategy, "random");
  for (const location of project.world.locations.slice(3))
    assert.equal(location.position, undefined);
});
test("le futur générateur de noms se raccorde sans modifier les fiches existantes ou les quêtes", () => {
  const project = branchExample(),
    quest = structuredClone(project.quest),
    before = structuredClone(project.world.locations);
  const entry = generateRandomContent(project, "npcs", {
    random: () => 0,
    generateName: ({ kind, id }) => `${kind}-${id}-nom-futur`,
  });
  assert.equal(entry.name, "npcs-pnj-1-nom-futur");
  assert.equal(entry.locationId, "capital");
  assert.equal(entry.dialogueId, "");
  assert.deepEqual(project.quest, quest);
  assert.deepEqual(project.world.locations, before);
});
test("sans lieu, le PNJ reste une fiche narrative à rattacher ; une demande invalide ne crée rien", () => {
  const project = branchExample();
  project.world.locations = [];
  assert.equal(
    generateRandomContent(project, "npcs", { random: () => 0 }).locationId,
    "",
  );
  const before = JSON.stringify(project);
  assert.throws(() => generateRandomContent(project, "groups"));
  assert.throws(() =>
    generateRandomContent(project, "items", { random: () => 1 }),
  );
  assert.equal(JSON.stringify(project), before);
});
