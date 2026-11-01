import { readFile, mkdir, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { versionArticles } from "./wiki-history.mjs";
import { escapeHtml as esc, renderMarkdown, slug } from "./wiki-markdown.mjs";
import { renderStatTable, renderRuleExample } from "./wiki-stat-tables.mjs";

export async function buildWiki({
  root = new URL("../", import.meta.url),
  note,
} = {}) {
  const json = async (path) =>
    JSON.parse(await readFile(new URL(path, root), "utf8"));
  const [content, classes, units, editorial] = await Promise.all([
    json("docs/wiki-content.json"),
    json("data/hero-classes.json"),
    json("data/units.json"),
    json("docs/wiki-articles.json"),
  ]);
  const guides = content.sections;
  const audiences = {
    players: "Règles du jeu",
    designers: "Création de scénarios",
    administrators: "Administration et maintenance",
    development: "Présentation et notes techniques",
    planned: "Idées et fonctionnalités prévues",
    historical: "Systèmes historiques",
  };
  const documents = new Map();
  const documentId = (file) => `article-${file.replace(/\.md$/, "")}`;
  const queue = [
    ...new Set([
      ...guides.flatMap((s) => (s.references ?? []).map((r) => r.file)),
      "wiki-maintenance.md",
    ]),
  ];
  for (let i = 0; i < queue.length; i++) {
    const file = queue[i];
    if (!/^[a-z0-9-]+\.md$/.test(file))
      throw new Error(`Document invalide : ${file}`);
    if (!editorial[file]?.summary || !editorial[file]?.explanation?.length)
      throw new Error(`Explication éditoriale manquante : ${file}`);
    const source = (
      await readFile(new URL(`docs/${file}`, root), "utf8")
    ).replace(/\r\n?/g, "\n");
    const title = /^# (.+)$/m.exec(source)?.[1] ?? editorial[file].summary;
    documents.set(file, {
      file,
      id: documentId(file),
      title,
      source,
      ...editorial[file],
    });
    for (const match of source.matchAll(
      /\[[^\]]+\]\(([^\s)]+\.md)(?:#[^)]*)?\)/g,
    )) {
      if (/^https?:/.test(match[1])) continue;
      const linked = match[1].split("/").at(-1);
      if (!queue.includes(linked)) queue.push(linked);
    }
  }
  const imageManifest = new Set();
  let previousAssets = {};
  try {
    previousAssets = (await json("wiki/build-manifest.json")).assets ?? {};
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const assets = {};
  async function image(asset, caption, size = "") {
    if (
      !/^[a-zA-Z0-9/_-]+\.(png|jpe?g|webp|svg)$/.test(asset) ||
      asset.includes("..")
    )
      throw new Error(`Image invalide : ${asset}`);
    let bytes;
    try {
      bytes = await readFile(new URL(`app/assets/${asset}`, root));
    } catch (error) {
      // Le dépôt dédié ne contient que les médias exportés, sans l’application.
      const exported = previousAssets[asset];
      if (
        error.code !== "ENOENT" ||
        !/^media\/[a-f0-9]{16}-[a-zA-Z0-9_-]+\.(png|jpe?g|webp|svg)$/.test(
          exported ?? "",
        )
      )
        throw error;
      bytes = await readFile(new URL(`wiki/${exported}`, root));
    }
    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    const file = `${hash}-${asset.split("/").at(-1)}`;
    const target = new URL(`wiki/media/${file}`, root);
    await mkdir(new URL("wiki/media/", root), { recursive: true });
    try {
      await access(target);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      try {
        await writeFile(target, bytes, { flag: "wx" });
      } catch (writeError) {
        if (writeError.code !== "EEXIST") throw writeError;
      }
    }
    imageManifest.add(`media/${file}`);
    assets[asset] = `media/${file}`;
    return `<figure class="illustration ${size}"><img src="media/${file}" alt="${esc(caption)}" loading="lazy" decoding="async"><figcaption>${esc(caption)}</figcaption></figure>`;
  }
  const guideArt = {
    "premiers-pas": [
      "welcome-landscape.png",
      "Illustration d’accueil du jeu RPG GPS.",
    ],
    "heros-armee": [
      "portraits/hero-warrior-male-anime-v2.png",
      "Portrait d’aventurier utilisé pour le Guerrier.",
    ],
    lieux: [
      "markers/capital.png",
      "La capitale, un des lieux du monde de jeu.",
    ],
    quetes: [
      "characters/marshal-aldren.png",
      "Le maréchal Aldren, interlocuteur de quêtes à la capitale.",
    ],
    combats: [
      "units/heavy-cavalry-thumbnail.png",
      "Cavalerie lourde : illustration d’une unité du catalogue.",
    ],
    exploration: [
      "markers/quest.png",
      "Un repère à découvrir ou à visiter dans le monde.",
    ],
    armee: [
      "units/spearman-thumbnail.png",
      "Une troupe de lanciers : les soldats, le grade et l’autorité sont des notions distinctes.",
    ],
    pouvoirs: [
      "portraits/hero-mage-female-anime-v2.png",
      "Le Mage dispose de pouvoirs de renseignement et d’interaction.",
    ],
    equipement: [
      "equipment/iron-sword.png",
      "L’épée de fer possède les effets de sa fiche d’équipement.",
    ],
    economie: [
      "improvements/farm.png",
      "La ferme contribue à la production et à la croissance selon son niveau.",
    ],
  };
  const articles = [];
  const ids = new Set();
  function add(article) {
    if (!/^[a-z][a-z0-9-]*$/.test(article.id) || ids.has(article.id))
      throw new Error(`Identifiant invalide ou dupliqué : ${article.id}`);
    ids.add(article.id);
    article.audience ??= "players";
    if (!audiences[article.audience])
      throw new Error(`Public inconnu : ${article.audience}`);
    articles.push(article);
  }
  const articleLinks = (items) =>
    `<ul class="related-links">${items.map((item) => `<li><a href="${item.id}.html">${esc(item.title)}</a></li>`).join("")}</ul>`;
  for (const guide of guides) {
    const related = (guide.references ?? []).map((r) => documents.get(r.file));
    const art = guideArt[guide.id];
    const audience = guide.audience ?? "players";
    const topics = guide.topics ?? [];
    const topicIds = topics.map((topic) => `theme-${slug(topic.title)}`);
    if (new Set(topicIds).size !== topics.length)
      throw new Error(`Rubriques dupliquées : ${guide.id}`);
    const topicBody = (
      await Promise.all(
        topics.map(
          async (topic, i) =>
            `<section class="rule-topic" id="${topicIds[i]}"><h2>${esc(topic.title)}</h2>${topic.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}${topic.table ? await renderStatTable(topic.table, image) : ""}${(topic.explanation ?? []).map((p) => `<p class="table-explanation">${esc(p)}</p>`).join("")}${await renderRuleExample(topic.example, image)}</section>`,
        ),
      )
    ).join("");
    const toc = topics.length
      ? `<details class="article-toc" open><summary>Les règles de ce thème</summary><ul>${topics.map((topic, i) => `<li><a href="#${topicIds[i]}">${esc(topic.title)}</a></li>`).join("")}</ul></details>`
      : "";
    const playerReferences = related.filter(
      (doc) => doc.audience === "players",
    );
    const otherReferences = related.filter((doc) => doc.audience !== "players");
    add({
      ...guide,
      audience,
      category: audiences[audience],
      summary: guide.summary ?? guide.paragraphs[0],
      body: `${guide.summary ? `<p class="lead">${esc(guide.summary)}</p>` : ""}${art ? await image(...art, "guide-art") : ""}${toc}${guide.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}${topicBody}${await renderRuleExample(guide.example, image)}${playerReferences.length ? `<h2>Règles détaillées et cas particuliers</h2>${articleLinks(playerReferences)}` : ""}${guide.seeAlso?.length ? `<h2>Thèmes liés</h2>${articleLinks(guide.seeAlso.map((id) => ({ id, title: guides.find((g) => g.id === id)?.title ?? { classes: "Classes de héros", unites: "Catalogue des unités" }[id] ?? id })))}` : ""}${otherReferences.length ? `<details class="article-toc"><summary>Conception, présentation et autres références</summary>${articleLinks(otherReferences)}</details>` : ""}`,
    });
  }
  for (const doc of documents.values()) {
    const resolveLink = (href) => {
      if (/^https?:\/\//.test(href)) return href;
      if (href.startsWith("#"))
        return `#ref-${slug(decodeURIComponent(href.slice(1)))}`;
      const [path, anchor] = href.split("#");
      const file = path.split("/").at(-1);
      if (documents.has(file))
        return `${documentId(file)}.html${anchor ? `#ref-${slug(decodeURIComponent(anchor))}` : ""}`;
      return null;
    };
    const rendered = renderMarkdown(doc.source.replace(/^# [^\n]+\n/, ""), {
      resolveLink,
    });
    const illustrations = await Promise.all(
      (doc.images ?? []).map((a) => image(a.path, a.caption)),
    );
    const parents = guides.filter((g) =>
      g.references?.some((r) => r.file === doc.file),
    );
    const toc = rendered.headings.filter((h) => h.level <= 3);
    add({
      id: doc.id,
      title: doc.title,
      summary: doc.summary,
      category: doc.status ?? "Règles et fonctionnement",
      audience: doc.audience ?? "development",
      sourceFile: doc.file,
      body: `<p class="lead">${esc(doc.summary)}</p><section class="explanation"><h2>Comprendre ce que cela implique</h2>${doc.explanation.map((p) => `<p>${esc(p)}</p>`).join("")}</section>${illustrations.length ? `<div class="illustrations">${illustrations.join("")}</div>` : ""}${toc.length ? `<details class="article-toc"><summary>Dans cet article</summary><ul>${toc.map((h) => `<li><a href="#${h.id}">${esc(h.title)}</a></li>`).join("")}</ul></details>` : ""}<h2>Détails de référence</h2><p class="source-note">Texte de référence mis en forme et conservé dans l’historique de cet article. Les paragraphes datés peuvent décrire une évolution ou une étape antérieure.</p><div class="reference-body">${rendered.html}</div>${parents.length ? `<h2>Revenir au guide</h2>${articleLinks(parents)}` : ""}`,
    });
  }
  const portraits = {
    warrior: "hero-warrior-male-anime-v2.png",
    ranger: "hero-ranger-female-anime-v2.png",
    mage: "hero-mage-female-anime-v2.png",
  };
  const classTable = await renderStatTable(
    {
      caption: "Caractéristiques de départ des classes",
      columns: [
        "Classe",
        "Attaque",
        "Défense",
        "Moral",
        "Mobilité",
        "Commandement",
        "PV",
        "Bonus d’autorité",
      ],
      rows: classes.map((hero) => ({
        label: hero.name,
        values: [
          hero.baseStats.attack,
          hero.baseStats.defense,
          hero.baseStats.morale,
          hero.baseStats.mobility,
          hero.baseStats.command,
          hero.baseStats.health,
          hero.authorityBonus ?? 0,
        ],
        ...(portraits[hero.id]
          ? {
              illustration: {
                path: "portraits/" + portraits[hero.id],
                caption: "Portrait : " + hero.name,
              },
            }
          : {}),
      })),
    },
    image,
  );
  const warrior = classes.find((hero) => hero.id === "warrior");
  const mage = classes.find((hero) => hero.id === "mage");
  add({
    id: "classes",
    title: "Classes de héros",
    category: "Catalogue",
    summary:
      "Comparer les caractéristiques de départ du Guerrier, de l’Éclaireur et du Mage.",
    body: `<p class="lead">La classe définit les caractéristiques et les capacités de départ du héros. Le tableau compare leurs valeurs de base avant équipement et progression.</p>${classTable}<p class="table-explanation">L’attaque et la défense interviennent dans les combats. Le Commandement contribue au budget d’ordres ; le bonus d’autorité s’ajoute à la capacité d’armée et ne représente pas ce budget. Les PV indiquent la santé maximale de départ.</p><p>Les capacités propres à chaque classe complètent ces chiffres : détection et vigies pour l’Éclaireur, divination et voyage astral pour le Mage, profil militaire pour le Guerrier. <a href="pouvoirs.html">Voir les pouvoirs</a>.</p>${warrior && mage ? await renderRuleExample({ title: "Exemple : deux profils de départ", paragraphs: [`Le Guerrier commence avec ${warrior.baseStats.health} PV et ${warrior.baseStats.command} en Commandement ; le Mage avec ${mage.baseStats.health} PV et ${mage.baseStats.command} en Commandement. Cela compare leurs bases, sans prédire l’issue d’un combat.`, "Le choix de classe dépend aussi des capacités recherchées et des objectifs de l’aventure."], illustration: { path: "portraits/hero-warrior-male-anime-v2.png", caption: "Portrait du Guerrier utilisé dans cette comparaison de caractéristiques." } }, image) : ""}`,
  });
  const unitRows = await Promise.all(
    units.map(async (u) => {
      const supported = [
        "militia",
        "archer",
        "mounted-archer",
        "spearman",
        "swordsman",
        "heavy-infantry",
        "light-cavalry",
        "heavy-cavalry",
      ];
      const art = supported.includes(u.id)
        ? await image(`units/${u.id}-thumbnail.png`, u.name, "unit-thumbnail")
        : "";
      return `<tr><th scope="row">${art}${esc(u.name)}</th>${[u.faction, u.authorityCost, u.stats.attack, u.stats.defense, u.stats.healthPerSoldier, u.stats.speed, u.stats.range].map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`;
    }),
  );
  add({
    id: "unites",
    title: "Catalogue des unités",
    category: "Catalogue",
    summary:
      "Comparer les effectifs maximaux, l’autorité et les statistiques de base des unités.",
    body: `<p class="lead">Les valeurs du catalogue décrivent un type d’unité, avant les bonus du héros, du terrain et de la bataille.</p><p>L’effectif maximal dépend du grade de la troupe : Soldat 6, Caporal 10, Sergent 14, Adjudant 18, Lieutenant 24. Le coût d’autorité ci-dessous concerne le type ; le coût du grade s’y ajoute. <a href="armee.html">Comprendre recrutement, grades et autorité</a>.</p><div class="table-scroll stat-table" tabindex="0" role="region" aria-label="Catalogue des unités"><table><caption>Statistiques de base des types d’unités</caption><thead><tr>${["Unité", "Faction", "Autorité du type", "Attaque", "Défense", "PV / soldat", "Vitesse", "Portée"].map((s) => `<th scope="col">${s}</th>`).join("")}</tr></thead><tbody>${unitRows.join("")}</tbody></table></div><p class="table-explanation">La portée et la vitesse aident à comparer les usages, mais les dégâts finaux dépendent aussi du nombre de soldats aptes, du moral, des techniques et du terrain. Les PV sont ceux d’un seul soldat, pas de toute la troupe.</p>${await renderRuleExample({ title: "Exemple : composer une troupe", paragraphs: ["Une troupe de miliciens au grade Soldat peut contenir six soldats. Son coût d’autorité est le coût du type, auquel s’ajoute celui du grade ; ses soldats peuvent être blessés séparément.", "L’image montre le type d’unité, pas un effectif garanti de soldats présents ou aptes."], illustration: { path: "units/militia-thumbnail.png", caption: "Vignette des miliciens du catalogue." } }, image)}`,
  });
  const history = await versionArticles({
    root,
    note,
    articles: articles.map((a) => ({
      ...a,
      currentHref: `${a.id}.html`,
      snapshot: a.body.replace(
        /(href|src)="(?!https?:|#)([^"]+)"/g,
        '$1="../../$2"',
      ),
    })),
  });
  const navigation = [
    ...guides
      .filter((g) => (g.audience ?? "players") === "players")
      .map((g) => ({ id: g.id, title: g.title })),
    { id: "classes", title: "Classes de héros" },
    { id: "unites", title: "Unités" },
  ];
  const secondaryNavigation = `<details class="secondary-nav"><summary>Création et autres rubriques</summary>${guides
    .filter((g) => g.audience && g.audience !== "players")
    .map((g) => `<a href="${g.id}.html">${esc(g.title)}</a>`)
    .join(
      "",
    )}<a href="article-idees-et-todo.html">Idées et todo list</a><a href="article-wiki-maintenance.html">Maintenir le wiki</a></details>`;
  function shell(title, main, active) {
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${esc(title)} — Wiki RPG GPS"><title>${esc(title)} — Wiki RPG GPS</title><link rel="stylesheet" href="wiki.css"></head><body><a class="skip" href="#contenu">Aller au contenu</a><header class="site-header"><a class="brand" href="index.html">RPG GPS <span>Le wiki</span></a><a href="https://jojo8104.github.io/rpg-gps/app/">Ouvrir le jeu ↗</a></header><div class="layout"><nav aria-label="Navigation du wiki"><a href="index.html"${active ? "" : ' aria-current="page"'}>Règles par thème</a>${navigation.map((item) => `<a href="${item.id}.html"${active === item.id ? ' aria-current="page"' : ""}>${esc(item.title)}</a>`).join("")}${secondaryNavigation}</nav><main id="contenu">${main}</main></div><footer>RPG GPS · Guide du prototype · Les règles prévues et les systèmes historiques sont signalés dans leurs articles.</footer></body></html>\n`;
  }
  for (const article of articles) {
    await writeFile(
      new URL(`wiki/${article.id}.html`, root),
      shell(
        article.title,
        `<div class="breadcrumb"><a href="index.html">Wiki</a> / ${esc(article.category)}</div><article class="wiki-article"><p class="eyebrow">${esc(article.category)}</p><h1>${esc(article.title)}</h1>${article.body}${history.get(article.id)}</article>`,
        article.id,
      ),
    );
  }
  const card = (a) =>
    `<div class="index-card" id="${a.id}"><p class="eyebrow">${esc(a.category)}</p><h3><a href="${a.id}.html">${esc(a.title)}</a></h3><p>${esc(a.summary.length > 210 ? a.summary.slice(0, 207) + "…" : a.summary)}</p>${a.topics?.length ? `<ul class="theme-contents">${a.topics.map((topic) => `<li><a href="${a.id}.html#theme-${slug(topic.title)}">${esc(topic.title)}</a></li>`).join("")}</ul>` : ""}</div>`;
  const guideArticles = articles.filter(
    (a) =>
      !a.sourceFile && a.category !== "Catalogue" && a.audience === "players",
  );
  const referenceArticles = articles.filter((a) => a.id.startsWith("article-"));
  const secondaryArticles = articles.filter((a) => a.audience !== "players");
  const secondaryGroups = Object.entries(audiences)
    .filter(([id]) => id !== "players")
    .map(([id, label]) => {
      const selected = secondaryArticles.filter((a) => a.audience === id);
      return selected.length
        ? `<details class="reference-group"><summary>${esc(label)} (${selected.length})</summary><div class="cards index-cards">${selected.map(card).join("")}</div></details>`
        : "";
    })
    .join("");
  const detailedRules = referenceArticles.filter(
    (a) => a.audience === "players",
  );
  const groupedRules = new Map();
  for (const article of detailedRules) {
    const parent = guides.find(
      (g) =>
        (g.audience ?? "players") === "players" &&
        g.references?.some((r) => r.file === article.sourceFile),
    );
    const label = parent?.title ?? "Autres règles";
    if (!groupedRules.has(label)) groupedRules.set(label, []);
    groupedRules.get(label).push(article);
  }
  const referenceGroups = [...groupedRules]
    .map(
      ([label, items]) =>
        `<details class="reference-group"><summary>${esc(label)} : règles détaillées</summary><div class="cards index-cards">${items.map(card).join("")}</div></details>`,
    )
    .join("");
  await writeFile(
    new URL("wiki/index.html", root),
    shell(
      content.title,
      `<p class="eyebrow">Apprendre à jouer · Comprendre les règles</p><h1>${esc(content.title)}</h1><p class="lead">${esc(content.intro)}</p><p>Choisissez un thème : chaque page explique ce que vous pouvez faire, ses conditions et ses conséquences. Les sous-rubriques donnent accès aux différentes fonctionnalités. L’historique reste disponible en bas de chaque article.</p><h2>Les règles par thème</h2><div class="cards index-cards">${guideArticles.map(card).join("")}</div><h2>Catalogues des héros et unités</h2><div class="cards index-cards">${articles
        .filter((a) => a.category === "Catalogue")
        .map(card)
        .join(
          "",
        )}</div><h2>Approfondir une règle</h2>${referenceGroups}<h2>Création, outils et projets</h2><p>Ces rubriques complètent le guide. Les idées et systèmes historiques ne sont pas des fonctionnalités disponibles dans toutes les parties.</p>${secondaryGroups}`,
    ),
  );
  await writeFile(
    new URL("wiki/build-manifest.json", root),
    JSON.stringify(
      {
        pages: ["index.html", ...articles.map((a) => `${a.id}.html`)],
        media: [...imageManifest].sort(),
        assets,
        documents: [...documents.keys()].sort(),
        articles: articles.map((a) => ({
          id: a.id,
          audience: a.audience,
          theme: guides.some((g) => g.id === a.id) && a.audience === "players",
          topics: (a.topics ?? []).map((topic) => topic.title),
        })),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Wiki généré : ${articles.length} articles, ${documents.size} documents expliqués, ${imageManifest.size} illustrations.`,
  );
  return articles;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const index = process.argv.indexOf("--note");
  if (index !== -1 && !process.argv[index + 1]?.trim())
    throw new Error("La note de changement est vide.");
  await buildWiki({ note: index === -1 ? undefined : process.argv[index + 1] });
}
