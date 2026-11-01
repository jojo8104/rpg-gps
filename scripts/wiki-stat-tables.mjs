import { escapeHtml as esc } from "./wiki-markdown.mjs";

export async function renderStatTable(table, image) {
  if (
    !table?.caption ||
    !Array.isArray(table.columns) ||
    table.columns.length < 2 ||
    !Array.isArray(table.rows) ||
    !table.rows.length
  )
    throw new Error("Tableau de règles incomplet.");
  const rows = await Promise.all(
    table.rows.map(async (row) => {
      if (
        !row.label ||
        !Array.isArray(row.values) ||
        row.values.length !== table.columns.length - 1
      )
        throw new Error(
          `Colonnes incohérentes pour ${row.label ?? "la ligne"}.`,
        );
      const art = row.illustration
        ? await image(
            row.illustration.path,
            row.illustration.caption,
            "stat-thumbnail",
          )
        : "";
      return `<tr><th scope="row">${art}<span>${esc(row.label)}</span></th>${row.values.map((value) => `<td>${esc(value)}</td>`).join("")}</tr>`;
    }),
  );
  return `<div class="table-scroll stat-table" tabindex="0" role="region" aria-label="${esc(table.caption)}"><table><caption>${esc(table.caption)}</caption><thead><tr>${table.columns.map((label) => `<th scope="col">${esc(label)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

export async function renderRuleExample(example, image) {
  if (!example) return "";
  if (
    !example.title ||
    !Array.isArray(example.paragraphs) ||
    !example.paragraphs.length
  )
    throw new Error("Exemple de règle incomplet.");
  const art = example.illustration
    ? await image(
        example.illustration.path,
        example.illustration.caption,
        "example-art",
      )
    : "";
  return `<section class="rule-example"><h2>${esc(example.title)}</h2>${art}<div>${example.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}</div></section>`;
}
