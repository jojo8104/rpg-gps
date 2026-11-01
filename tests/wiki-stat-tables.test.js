import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  renderStatTable,
  renderRuleExample,
} from "../scripts/wiki-stat-tables.mjs";

test("les tableaux illustrés conservent les valeurs, échappent le texte et refusent les colonnes incohérentes", async () => {
  const image = async (path, caption) =>
    `<figure><img src="${path}" alt="${caption}"></figure>`;
  const html = await renderStatTable(
    {
      caption: "PV < maximum",
      columns: ["Héros", "PV"],
      rows: [
        {
          label: "Mage <script>",
          values: [20],
          illustration: { path: "mage.png", caption: "Mage" },
        },
      ],
    },
    image,
  );
  assert.match(html, /<caption>PV &lt; maximum<\/caption>/);
  assert.match(html, /<th scope="row"><figure>/);
  assert.match(html, /Mage &lt;script&gt;/);
  assert.match(html, /<td>20<\/td>/);
  await assert.rejects(
    renderStatTable(
      {
        caption: "Invalide",
        columns: ["Nom", "PV"],
        rows: [{ label: "Mage", values: [] }],
      },
      image,
    ),
    /Colonnes incohérentes/,
  );
  const example = await renderRuleExample(
    {
      title: "Exemple",
      paragraphs: ["20 PV maximum"],
      illustration: { path: "mage.png", caption: "Mage" },
    },
    image,
  );
  assert.match(example, /class="rule-example"/);
  assert.match(example, /<img/);
});

test("les concepts chiffrés suivent introduction, tableau, explication et exemple", async () => {
  const root = new URL("../", import.meta.url);
  const content = JSON.parse(
    await readFile(new URL("docs/wiki-content.json", root), "utf8"),
  );
  let tables = 0;
  for (const guide of content.sections) {
    const html = await readFile(new URL(`wiki/${guide.id}.html`, root), "utf8");
    for (const topic of guide.topics ?? []) {
      if (!topic.table) continue;
      tables++;
      const start = html.indexOf(`<h2>${topic.title}</h2>`);
      const intro = html.indexOf("<p>", start);
      const table = html.indexOf('class="table-scroll stat-table"', start);
      const explanation = html.indexOf('class="table-explanation"', table);
      assert.ok(
        start >= 0 && intro > start && table > intro && explanation > table,
        `${guide.id}: ${topic.title}`,
      );
      assert.ok(
        topic.table.rows.every((row) => row.illustration?.path),
        guide.id,
      );
      if (topic.example)
        assert.ok(
          html.indexOf('class="rule-example"', explanation) > explanation,
        );
    }
  }
  assert.ok(tables >= 8);
  for (const page of ["classes", "unites"]) {
    const html = await readFile(new URL(`wiki/${page}.html`, root), "utf8");
    const table = html.indexOf("<table>");
    assert.ok(html.indexOf('class="lead"') < table);
    assert.ok(html.indexOf('class="table-explanation"', table) > table);
    assert.ok(html.indexOf('class="rule-example"', table) > table);
  }
});
