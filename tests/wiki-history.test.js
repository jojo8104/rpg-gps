import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { versionArticles } from "../scripts/wiki-history.mjs";

test("le wiki conserve les versions, exige une note et ne versionne que les articles modifiés", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rpg-wiki-"));
  const root = pathToFileURL(directory + "/");
  const article = (snapshot) => ({ id: "combats", title: "Combats", snapshot });
  const unchanged = () => ({
    id: "lieux",
    title: "Lieux",
    snapshot: "Lieux inchangés",
  });
  try {
    await versionArticles({
      root,
      articles: [article("Avant"), unchanged()],
      now: new Date("2026-10-07T10:00:00Z"),
    });
    const archive = await readFile(
      new URL("wiki/archives/combats/v1.html", root),
      "utf8",
    );
    const initial = await readFile(new URL("wiki/history.json", root), "utf8");
    await versionArticles({ root, articles: [article("Avant"), unchanged()] });
    assert.equal(
      await readFile(new URL("wiki/history.json", root), "utf8"),
      initial,
    );
    await assert.rejects(
      versionArticles({ root, articles: [article("Après"), unchanged()] }),
      /fournir une note/,
    );
    assert.equal(
      await readFile(new URL("wiki/history.json", root), "utf8"),
      initial,
    );
    const notes = await versionArticles({
      root,
      articles: [article("Après"), unchanged()],
      note: "Nouvelle règle <test>",
      now: new Date("2026-10-08T10:00:00Z"),
    });
    assert.match(notes.get("combats"), /archives\/combats\/v1.html/);
    assert.match(notes.get("combats"), /Nouvelle règle &lt;test&gt;/);
    const history = JSON.parse(
      await readFile(new URL("wiki/history.json", root), "utf8"),
    );
    assert.equal(history.combats.length, 2);
    assert.equal(history.lieux.length, 1);
    assert.equal(
      await readFile(new URL("wiki/archives/combats/v1.html", root), "utf8"),
      archive,
    );
    assert.match(
      await readFile(new URL("wiki/archives/combats/v2.html", root), "utf8"),
      /Après/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
