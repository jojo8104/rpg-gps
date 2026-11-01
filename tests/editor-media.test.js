import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { validateEditorProject } from "../server/editor/editor-validation.js";
import { validateProjectMedia } from "../server/editor/editor-media.js";
import { installEditorProject } from "../server/editor/editor-installation.js";
import { readEditorPackages } from "../server/quests/editor-catalog.js";
import { createEditorHttpApi } from "../server/editor/editor-http-api.js";
import { branchExample } from "../editor/js/branch-example.js";
import { importProject } from "../editor/js/project.js";
import {
  addProjectImage,
  imagePath,
  imagePreview,
  imageArchiveFiles,
  removeProjectImage,
} from "../editor/js/media-model.js";
import { createZip } from "../editor/js/zip.js";
import { Location } from "../app/js/core/location.js";
import { AutonomousGroup } from "../app/js/core/autonomous-group.js";
import { createUniqueItemDefinition } from "../app/js/core/item-catalog.js";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFZkAAAAASUVORK5CYII=";
const image = () => ({
  id: "test-image",
  name: "Portrait.png",
  mimeType: "image/png",
  dataUrl: `data:image/png;base64,${png}`,
  size: Buffer.from(png, "base64").length,
  width: 1,
  height: 1,
});
function projectFixture() {
  const project = branchExample();
  project.media = { images: [image()] };
  project.world.locations[0].visual = {
    icon: imagePath(image()),
    illustration: imagePath(image()),
  };
  return project;
}

test("images portables : import JSON, validation, export binaire ZIP et références", async () => {
  const project = projectFixture(),
    report = validateEditorProject(project);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  const loaded = importProject(JSON.parse(JSON.stringify(report.project)));
  assert.equal(
    imagePreview(loaded, loaded.world.locations[0].visual.icon),
    image().dataUrl,
  );
  const files = imageArchiveFiles(loaded);
  assert.deepEqual(Buffer.from(files[0].content), Buffer.from(png, "base64"));
  const zip = new Uint8Array(await createZip(files).arrayBuffer());
  const offset = 30 + Buffer.byteLength(files[0].name);
  assert.deepEqual(
    Buffer.from(zip.slice(offset, offset + files[0].content.length)),
    Buffer.from(png, "base64"),
  );
  assert.equal(report.files.locations.data[0].visual.icon, imagePath(image()));
  assert.throws(
    () => removeProjectImage(loaded, image().id),
    /encore utilisée/,
  );
  delete loaded.world.locations[0].visual;
  removeProjectImage(loaded, image().id);
  assert.equal(loaded.media.images.length, 0);
});

test("formats, contenu, chemins et références incohérents sont refusés", () => {
  for (const change of [
    { mimeType: "image/svg+xml" },
    { id: "../../outside" },
    { dataUrl: "data:image/png;base64,SGVsbG8=" },
    { mimeType: "image/jpeg", dataUrl: `data:image/jpeg;base64,${png}` },
  ]) {
    const project = projectFixture();
    Object.assign(project.media.images[0], change);
    assert.equal(validateEditorProject(project).valid, false);
  }
  const project = projectFixture();
  project.world.locations[0].visual.icon = "assets/images/absent.png";
  assert.equal(validateEditorProject(project).valid, false);
  project.world.locations[0].visual.icon = "https://external.example/image.png";
  assert.equal(validateEditorProject(project).valid, false);
});

test("visuels conservés par les modèles sans modifier leurs valeurs par défaut", () => {
  const visual = { icon: imagePath(image()) };
  const location = new Location({
    id: "camp",
    name: "Camp",
    type: "camp",
    source: "quest-engine",
    position: { latitude: 0, longitude: 0 },
    visual,
  });
  assert.deepEqual(new Location(location.toJSON()).visual, visual);
  const group = new AutonomousGroup({
    id: "guard",
    type: "rogue",
    owner: { kind: "independent", id: "bandits" },
    position: { latitude: 0, longitude: 0 },
    visual,
  });
  assert.deepEqual(new AutonomousGroup(group.toJSON()).visual, visual);
  assert.deepEqual(
    createUniqueItemDefinition({ id: "token", name: "Jeton", visual }).visual,
    visual,
  );
  assert.equal(
    Object.hasOwn(
      new Location({ ...location.toJSON(), visual: null }).toJSON(),
      "visual",
    ),
    false,
  );
});

test("installation conserve les images, résout les URL runtime et sert seulement les fichiers image", async (t) => {
  const directory = pathToFileURL(
    (await mkdtemp(path.join(tmpdir(), "rpg-editor-media-"))) + path.sep,
  );
  const result = await installEditorProject(projectFixture(), directory);
  assert.equal(result.installed, true);
  assert.deepEqual(
    await readFile(
      new URL(
        `${result.packageDirectory}/assets/images/test-image.png`,
        directory,
      ),
    ),
    Buffer.from(png, "base64"),
  );
  const runtime = readEditorPackages(directory, { runtime: true })[0];
  const url = runtime.world.locations[0].visual.icon;
  assert.equal(url, `/editor-media/${result.packageDirectory}/test-image.png`);
  assert.equal(
    runtime.editorSource.world.locations[0].visual.icon,
    imagePath(image()),
  );
  const handler = createEditorHttpApi({ mediaDirectory: directory });
  const server = createServer(async (req, res) => {
    if (!(await handler(req, res))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(origin + url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    Buffer.from(png, "base64"),
  );
  assert.equal(
    (
      await fetch(
        origin + `/editor-media/${result.packageDirectory}/project.json`,
      )
    ).status,
    404,
  );
  assert.equal(
    (await fetch(origin + url, { method: "HEAD" })).headers.get(
      "content-length",
    ),
    String(image().size),
  );
});

test("bibliothèque : déduplication des imports et dimensions vérifiées côté serveur", () => {
  const project = branchExample();
  const a = addProjectImage(project, image()),
    b = addProjectImage(project, image());
  assert.equal(a.id, b.id);
  project.media.images[0].width = 2000;
  const errors = [],
    report = validateProjectMedia(project, (path, message) =>
      errors.push(message),
    );
  assert.deepEqual(errors, []);
  assert.equal(report.images[0].width, 1);
});
