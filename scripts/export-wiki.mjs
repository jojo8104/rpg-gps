import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const destination = new URL(".wiki-publish/", root);
const content = JSON.parse(
  await readFile(new URL("docs/wiki-content.json", root), "utf8"),
);
await mkdir(destination, { recursive: true });
const files = new Set([
  "wiki",
  "docs/wiki-content.json",
  "docs/wiki-articles.json",
  "docs/wiki-maintenance.md",
  "data/hero-classes.json",
  "data/units.json",
  "scripts/build-wiki.mjs",
  "scripts/wiki-history.mjs",
  "scripts/wiki-markdown.mjs",
  "scripts/wiki-stat-tables.mjs",
  ...[
    "tests/wiki-history.test.js",
    "tests/wiki-rendering.test.js",
    "tests/wiki-themes.test.js",
    "tests/wiki-stat-tables.test.js",
  ].filter((file) => existsSync(new URL(file, root))),
]);
const manifest = JSON.parse(
  await readFile(new URL("wiki/build-manifest.json", root), "utf8"),
);
for (const file of manifest.documents) files.add(`docs/${file}`);
for (const section of content.sections) {
  for (const ref of section.references ?? []) files.add(`docs/${ref.file}`);
}
for (const file of files) {
  const target = new URL(file, destination);
  await mkdir(new URL("./", target), { recursive: true });
  await cp(new URL(file, root), target, { recursive: true });
}
await writeFile(
  new URL("package.json", destination),
  JSON.stringify(
    {
      name: "rpg-gps-wiki",
      private: true,
      type: "module",
      scripts: {
        "wiki:build": "node scripts/build-wiki.mjs",
        test: "node --test tests/wiki*.test.js",
      },
    },
    null,
    2,
  ) + "\n",
);
await writeFile(
  new URL("index.html", destination),
  '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=wiki/"><title>Wiki RPG GPS</title></head><body><a href="wiki/">Consulter le wiki RPG GPS</a></body></html>\n',
);
await writeFile(new URL(".nojekyll", destination), "");
await writeFile(
  new URL("README.md", destination),
  `# Wiki RPG GPS

Wiki HTML : https://jojo8104.github.io/rpg-gps-wiki/

Ce dépôt contient le guide, les catalogues, les documents de règles et les versions
archivées. Aucun backend du jeu n’est inclus.

Les sources sont maintenues avec le jeu dans https://github.com/jojo8104/rpg-gps.
Après chaque changement, générer le wiki avec une note puis exécuter
\`npm run wiki:export\` dans le projet du jeu. Committer et pousser le résultat
du dossier \`.wiki-publish/\` sur ce dépôt. Ne jamais supprimer les archives.

Dans ce dépôt, \`npm test\` vérifie l’archivage et \`npm run wiki:build\` vérifie
la génération. Aucune dépendance npm n’est nécessaire.

GitHub Pages sert la branche \`main\` depuis la racine du dépôt.
`,
);
console.log("Wiki exporté dans .wiki-publish/.");
