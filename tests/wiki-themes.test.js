import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("le parcours principal présente les règles par thème et conserve les rubriques secondaires", async () => {
  const manifest = JSON.parse(await read("wiki/build-manifest.json"));
  const index = await read("wiki/index.html");
  const themes = manifest.articles.filter((article) => article.theme);
  assert.equal(themes.length, 13);
  for (const id of [
    "armee",
    "exploration",
    "pouvoirs",
    "equipement",
    "economie",
    "cooperation",
    "sante",
    "butin",
  ])
    assert.ok(
      themes.some((theme) => theme.id === id),
      id,
    );
  const primary = index
    .split("<h2>Les règles par thème</h2>")[1]
    .split("<h2>Catalogues")[0];
  assert.doesNotMatch(
    primary,
    /id="(?:atelier-quetes|commandes-powershell|dashboard-monitoring)"/,
  );
  for (const theme of themes) {
    assert.ok(theme.topics.length >= 3, theme.id);
    assert.ok(primary.includes(`id="${theme.id}"`), theme.id);
    const html = await read(`wiki/${theme.id}.html`);
    assert.match(html, /class="rule-topic"/);
    assert.match(html, /article-history/);
    assert.doesNotMatch(
      html.split('<aside class="article-history"')[0],
      /correction de fixture|tests\/|Aucun effet sur les règles|Portraits v12/,
    );
  }
  for (const id of [
    "atelier-quetes",
    "commandes-powershell",
    "dashboard-monitoring",
  ])
    assert.ok(index.includes(`id="${id}"`), `Ancienne ancre conservée : ${id}`);
  const units = await read("wiki/unites.html");
  assert.match(units, /Autorité du type/);
  assert.doesNotMatch(units, /<th scope="col">Effectif max\./);
});

test("les thèmes, sous-rubriques, références et images sont accessibles", async () => {
  const manifest = JSON.parse(await read("wiki/build-manifest.json"));
  for (const page of manifest.pages) {
    const url = new URL(`wiki/${page}`, root);
    const html = await readFile(url, "utf8");
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1, page);
    for (const [, link] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (/^https?:/.test(link)) continue;
      assert.doesNotMatch(link, /\.md(?:#|$)/, page);
      const target = new URL(link, url);
      const anchor = target.hash.slice(1);
      target.hash = "";
      await access(target);
      if (anchor)
        assert.ok(
          (await readFile(target, "utf8")).includes(`id="${anchor}"`),
          `${page}: ${link}`,
        );
    }
  }
});
