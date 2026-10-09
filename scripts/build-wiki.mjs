import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { versionArticles } from "./wiki-history.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const escape = (value) =>
  String(value ?? "—").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const [content, classes, units] = await Promise.all([
  readJson("docs/wiki-content.json"),
  readJson("data/hero-classes.json"),
  readJson("data/units.json"),
]);
const ids = new Set(["classes", "unites"]);
for (const section of content.sections) {
  if (!/^[a-z][a-z0-9-]*$/.test(section.id) || ids.has(section.id))
    throw new Error(`Identifiant invalide : ${section.id}`);
  ids.add(section.id);
  for (const ref of section.references ?? []) {
    if (!/^[a-z0-9-]+\.md$/.test(ref.file))
      throw new Error(`Référence invalide : ${ref.file}`);
    await access(new URL(`docs/${ref.file}`, root));
  }
}
const guide = content.sections
  .map(
    (section) =>
      `<section id="${section.id}"><h2>${escape(section.title)}</h2>${section.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("")}${(section.references ?? []).map((ref) => `<p><a href="../docs/${ref.file}">${escape(ref.label)} (document de règles)</a></p>`).join("")}</section>`,
  )
  .join("\n");
const classCards = classes
  .map(
    (hero) =>
      `<article><h3>${escape(hero.name)}</h3><p>${escape(hero.advantage)}</p><dl>${Object.entries(
        {
          Attaque: hero.baseStats.attack,
          Défense: hero.baseStats.defense,
          Moral: hero.baseStats.morale,
          Mobilité: hero.baseStats.mobility,
          Commandement: hero.baseStats.command,
          PV: hero.baseStats.health,
        },
      )
        .map(
          ([label, value]) =>
            `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`,
        )
        .join("")}</dl></article>`,
  )
  .join("");
const rows = units
  .map(
    (unit) =>
      `<tr>${[unit.name, unit.faction, unit.maxQuantity, unit.authorityCost, unit.stats.attack, unit.stats.defense, unit.stats.healthPerSoldier, unit.stats.speed, unit.stats.range].map((value) => `<td>${escape(value)}</td>`).join("")}</tr>`,
  )
  .join("");
const nav = [
  ...content.sections,
  { id: "classes", title: "Classes" },
  { id: "unites", title: "Unités" },
]
  .map((section) => `<a href="#${section.id}">${escape(section.title)}</a>`)
  .join("");
let html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Wiki du prototype RPG GPS : héros, unités, quêtes, lieux et combats."><title>Wiki — RPG GPS</title><link rel="stylesheet" href="wiki.css"></head>
<body><a class="skip" href="#contenu">Aller au contenu</a><header><p class="eyebrow">RPG GPS · Wiki du jeu</p><h1>${escape(content.title)}</h1><p>${escape(content.intro)}</p><a href="../app/">Ouvrir le jeu</a></header><div class="layout"><nav aria-label="Sommaire"><strong>Dans ce guide</strong>${nav}<a href="../docs/wiki-maintenance.md">Maintenir le wiki</a></nav><main id="contenu">${guide}<section id="classes"><h2>Classes de héros</h2><p>Caractéristiques de base issues de <a href="../data/hero-classes.json">data/hero-classes.json</a>, avant progression et équipement.</p><div class="cards">${classCards}</div></section><section id="unites"><h2>Catalogue des unités</h2><p>Valeurs de base issues de <a href="../data/units.json">data/units.json</a>. L’effectif maximal concerne une unité ; les bonus de combat ne figurent pas ici.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Statistiques des unités"><table><caption>Statistiques de base des types d’unités</caption><thead><tr>${["Unité", "Faction", "Effectif max.", "Coût d’autorité", "Attaque", "Défense", "PV / soldat", "Vitesse", "Portée"].map((label) => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div></section></main></div><footer>Guide du prototype · Les règles détaillées sont conservées dans le dépôt. Les catalogues sont actualisés à chaque génération du wiki.</footer></body></html>\n`;
const articles = [];
for (const match of html.matchAll(
  /<section id="([^"]+)">([\s\S]*?)<\/section>/g,
)) {
  const [, id, body] = match;
  const title = [
    ...content.sections,
    { id: "classes", title: "Classes de héros" },
    { id: "unites", title: "Catalogue des unités" },
  ].find((section) => section.id === id).title;
  let snapshot = body.replaceAll('href="../', 'href="../../../');
  for (const ref of content.sections.find((section) => section.id === id)
    ?.references ?? []) {
    const source = await readFile(new URL(`docs/${ref.file}`, root), "utf8");
    snapshot += `<details><summary>${escape(ref.label)} — texte conservé pour cette version</summary><pre class="archived-source">${escape(source)}</pre></details>`;
  }
  articles.push({ id, title, snapshot });
}
const noteIndex = process.argv.indexOf("--note");
if (noteIndex !== -1 && !process.argv[noteIndex + 1]?.trim())
  throw new Error("La note de changement est vide.");
const history = await versionArticles({
  root,
  articles,
  note: noteIndex === -1 ? undefined : process.argv[noteIndex + 1],
});
html = html.replace(
  /(<section id="([^"]+)">[\s\S]*?)(<\/section>)/g,
  (_, body, id, end) => body + history.get(id) + end,
);
await mkdir(new URL("wiki/", root), { recursive: true });
await writeFile(new URL("wiki/index.html", root), html);
console.log(
  `Wiki généré : ${content.sections.length} rubriques, ${classes.length} classes, ${units.length} types d’unités.`,
);
