import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export async function versionArticles({
  root,
  articles,
  note,
  now = new Date(),
}) {
  const historyUrl = new URL("wiki/history.json", root);
  let history;
  try {
    history = JSON.parse(await readFile(historyUrl, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    history = {};
  }
  const changes = articles.filter((article) => {
    article.hash = createHash("sha256").update(article.snapshot).digest("hex");
    return history[article.id]?.at(-1)?.hash !== article.hash;
  });
  if (changes.some((article) => history[article.id]?.length) && !note?.trim()) {
    throw new Error(
      'Articles modifiés : fournir une note avec npm run wiki:build -- --note "Description du changement".',
    );
  }
  for (const article of changes) {
    const versions = (history[article.id] ??= []);
    const version = versions.length + 1;
    const file = `archives/${article.id}/v${version}.html`;
    const entry = {
      version,
      date: now.toISOString(),
      note: note?.trim() || "Version initiale du wiki",
      hash: article.hash,
      file,
    };
    await mkdir(new URL(`wiki/archives/${article.id}/`, root), {
      recursive: true,
    });
    await writeFile(
      new URL(`wiki/${file}`, root),
      `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(article.title)} — version ${version}</title><link rel="stylesheet" href="../../wiki.css"></head><body><header><p class="eyebrow">Archive du wiki · Version ${version}</p><h1>${escape(article.title)}</h1><p>${escape(entry.date.slice(0, 10))} · ${escape(entry.note)}</p><a href="../../index.html#${article.id}">Lire l’article actuel</a></header><main class="archive-content">${article.snapshot}</main></body></html>\n`,
    );
    versions.push(entry);
  }
  await mkdir(new URL("wiki/", root), { recursive: true });
  await writeFile(historyUrl, JSON.stringify(history, null, 2) + "\n");
  return new Map(
    articles.map((article) => {
      const versions = history[article.id];
      const current = versions.at(-1);
      const previous = versions.slice(0, -1).reverse();
      return [
        article.id,
        `<aside class="article-history" aria-label="Historique de l’article"><p>Version ${current.version} · <time datetime="${current.date}">${current.date.slice(0, 10)}</time> — ${escape(current.note)}</p>${previous.length ? `<details><summary>Versions précédentes archivées (${previous.length})</summary><ul>${previous.map((entry) => `<li><a href="${entry.file}">Version ${entry.version} · ${entry.date.slice(0, 10)}</a> — ${escape(entry.note)}</li>`).join("")}</ul></details>` : "<p>Aucune version précédente archivée.</p>"}</aside>`,
      ];
    }),
  );
}

function escape(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}
