import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createNpcPortraitBridge } from "../editor/js/npc-portrait-bridge.js";
import { createPortraitEditorState } from "../app/js/core/portrait-editor-state.js";
import { branchExample } from "../editor/js/branch-example.js";
import { installEditorProject } from "../server/editor/editor-installation.js";
import { readEditorPackages } from "../server/quests/editor-catalog.js";
import { validateEditorProject } from "../server/editor/editor-validation.js";

test("portrait session saves only to its original NPC and project", () => {
  let project = { assets: { npcs: [{ id: "npc", name: "Guide" }] } };
  let handler,
    saved = 0,
    sent;
  const popup = {
    postMessage(value) {
      sent = value;
    },
  };
  const host = {
    location: { origin: "http://localhost" },
    open: () => popup,
    addEventListener(type, listener) {
      handler = listener;
    },
  };
  const bridge = createNpcPortraitBridge({
    host,
    getProject: () => project,
    changed: () => saved++,
    notify() {},
  });
  const npc = project.assets.npcs[0];
  bridge.open(npc);
  const dispatch = (data, source = popup, origin = host.location.origin) =>
    handler({ data, source, origin });
  dispatch({ type: "quest-npc-ready" });
  assert.equal(sent.state.text.name, "Guide");
  const state = createPortraitEditorState("male");
  state.adjustments.head.x = 12;
  dispatch({ type: "quest-npc-save", state }, {}, "https://other.example");
  assert.equal(saved, 0);
  dispatch({ type: "quest-npc-save", state });
  assert.equal(saved, 1);
  assert.equal(npc.portraitEditor.adjustments.head.x, 12);
  bridge.open(npc);
  dispatch({ type: "quest-npc-ready" });
  assert.equal(sent.state.appearance.gender, "male");
  project = { assets: { npcs: [] } };
  dispatch({ type: "quest-npc-save", state });
  assert.equal(saved, 1);
});

test("installed NPC portraits survive reload and apply to their speaker dialogues", async () => {
  const project = branchExample();
  const [id, dialogue] = Object.entries(project.dialogues)[0];
  const state = createPortraitEditorState();
  state.scene.scale = 110;
  project.assets = {
    npcs: [
      {
        id: dialogue.speakerId,
        name: "Guide",
        dialogueId: id,
        locationId: dialogue.locationId,
        portraitEditor: state,
      },
    ],
    groups: [],
    items: [],
  };
  const directory = pathToFileURL(
    (await mkdtemp(path.join(tmpdir(), "rpg-npc-"))) + path.sep,
  );
  const result = await installEditorProject(project, directory);
  assert.equal(result.installed, true, JSON.stringify(result.errors));
  const loaded = readEditorPackages(directory, { runtime: true })[0];
  assert.deepEqual(loaded.assets.npcs[0].portraitEditor, state);
  assert.deepEqual(loaded.dialogues[id].appearance, state.appearance);
  assert.equal(loaded.dialogues[id].portraitEditor.scene.scale, 110);
  project.assets.npcs[0].portraitEditor = { appearance: { gender: "invalid" } };
  assert.equal(validateEditorProject(project).valid, false);
});
