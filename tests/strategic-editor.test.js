import test from "node:test";
import assert from "node:assert/strict";
import { newProject, importProject, addAction } from "../editor/js/project.js";
import {
  createStrategicEvent,
  addStrategicBlock,
  validateStrategicProject,
} from "../editor/js/strategic-model.js";
import { Quest } from "../app/js/core/quest.js";
import { validateEditorProject } from "../server/editor/editor-validation.js";
import { installEditorProject } from "../server/editor/editor-installation.js";
function fixture() {
  const project = newProject();
  addAction(project, "Parcourir");
  project.quest.cooperation = {
    mode: "open",
    minimumPlayers: 1,
    maximumPlayers: 4,
    invitation: "ga-messenger",
    joinInProgress: "allowed",
  };
  const event = createStrategicEvent(project);
  project.world.locationSlots = [{ id: "village", type: "village" }];
  for (const position of event.positions) position.locationSlotId = "village";
  const block = addStrategicBlock(project, event.id);
  block.afterQuestId = project.quest.id;
  block.outcomes.victory = project.quest.id;
  return project;
}
test("strategic model, cooperation and block links survive project and Quest round trips", () => {
  const project = fixture();
  project.quest.actions[0].cooperation = { type: "relay" };
  const restored = importProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored.strategicEvents, project.strategicEvents);
  assert.deepEqual(restored.strategicBlocks, project.strategicBlocks);
  assert.deepEqual(restored.quest, project.quest);
  assert.deepEqual(
    new Quest(project.quest).toJSON().cooperation,
    project.quest.cooperation,
  );
  assert.deepEqual(new Quest(project.quest).toJSON().actions[0].cooperation, {
    type: "relay",
  });
  assert.deepEqual(validateStrategicProject(project), []);
});
test("three strategies and valid terrain, challenge and block references are required", () => {
  for (const mutate of [
    (p) => p.strategicEvents[0].strategies.pop(),
    (p) => (p.strategicEvents[0].positions[0].locationSlotId = "absent"),
    (p) => (p.strategicBlocks[0].eventId = "absent"),
    (p) => (p.strategicBlocks[0].outcomes.victory = "absent"),
    (p) =>
      p.strategicEvents[0].strategies[0].challenges.push({
        id: "defi",
        questId: "absent",
        actionId: "absent",
        strategyCost: 0,
        requirements: [],
      }),
  ]) {
    const project = fixture();
    mutate(project);
    assert.ok(validateStrategicProject(project).length);
  }
});
test("conditional challenge accepts player-specific unlock requirements", () => {
  const project = fixture();
  project.strategicEvents[0].strategies[0].challenges.push({
    id: "defi",
    questId: project.quest.id,
    actionId: project.quest.actions[0].id,
    strategyCost: 2,
    requirements: [{ type: "class", id: "scout", minimum: 1 }],
  });
  assert.deepEqual(validateStrategicProject(project), []);
});
test("cooperation rejects contradictory solo limits and unknown mechanics", () => {
  const project = fixture();
  project.quest.cooperation.mode = "solo";
  assert.throws(() => new Quest(project.quest));
  project.quest.cooperation.mode = "open";
  project.quest.actions[0].cooperation = { type: "unknown" };
  assert.throws(() => new Quest(project.quest));
});
test("server exports design definitions and refuses installation before runtime support", async () => {
  const project = fixture();
  project.world.locationSlots = [];
  project.strategicEvents = [];
  project.strategicBlocks = [];
  const report = validateEditorProject(project);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.ok(
    report.warnings.some((issue) =>
      issue.message.includes("exécution serveur"),
    ),
  );
  assert.ok(report.files.strategic);
  const install = await installEditorProject(project);
  assert.equal(install.valid, false);
  assert.match(install.errors[0].message, /Installation bloquée/);
});
