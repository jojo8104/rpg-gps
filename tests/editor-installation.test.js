import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { installEditorProject } from "../server/editor/editor-installation.js";
import { readEditorPackages } from "../server/quests/editor-catalog.js";
import { branchExample } from "../editor/js/branch-example.js";

test("installation validée, catalogue lisible au redémarrage, versions précédentes conservées", async () => {
  const directory = pathToFileURL(
    (await mkdtemp(path.join(tmpdir(), "rpg-editor-install-"))) + path.sep,
  );
  const project = branchExample();
  const first = await installEditorProject(project, directory);
  assert.equal(first.installed, true);
  const loaded = readEditorPackages(directory);
  assert.equal(loaded[0].quest.id, project.quest.id);
  assert.ok(
    await readFile(
      new URL(
        `${first.packageDirectory}/quests/${project.quest.id}.json`,
        directory,
      ),
      "utf8",
    ),
  );
  project.quest.title = "Version suivante";
  const second = await installEditorProject(project, directory);
  assert.notEqual(second.packageDirectory, first.packageDirectory);
  assert.equal(
    readEditorPackages(directory)[0].quest.title,
    "Version suivante",
  );
  assert.ok((await readdir(directory)).includes(first.packageDirectory));
  const before = await readFile(
    new URL("editor-catalog.json", directory),
    "utf8",
  );
  project.quest.actions = [];
  assert.equal((await installEditorProject(project, directory)).valid, false);
  assert.equal(
    await readFile(new URL("editor-catalog.json", directory), "utf8"),
    before,
  );
});
