// Rendu du sous-ensemble Markdown utilisé dans docs/, sans HTML exécutable.
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

export function slug(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function renderMarkdown(source, { resolveLink = () => null } = {}) {
  const headings = [];
  const counts = new Map();
  function inline(text) {
    const pattern =
      /(`+)([\s\S]*?)\1|\[([^\]]+)\]\(([^\s)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*/g;
    let html = "",
      cursor = 0;
    for (const match of text.matchAll(pattern)) {
      html += escapeHtml(text.slice(cursor, match.index));
      if (match[1]) html += `<code>${escapeHtml(match[2])}</code>`;
      else if (match[3]) {
        const href = resolveLink(match[4]);
        html +=
          href &&
          /^(https?:|#|[a-zA-Z0-9_.-]+(?:\/|\.html|#))/.test(href) &&
          !/^(javascript|data):/i.test(href)
            ? `<a href="${escapeHtml(href)}">${escapeHtml(match[3])}</a>`
            : escapeHtml(match[3]);
      } else if (match[5]) html += `<strong>${inline(match[5])}</strong>`;
      else html += `<em>${inline(match[6])}</em>`;
      cursor = match.index + match[0].length;
    }
    return html + escapeHtml(text.slice(cursor));
  }
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const listMatch = (line) => /^(\s*)([-+*]|\d+[.)])\s+(.*)$/.exec(line);
  const tableSeparator = (line) =>
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line ?? "");
  const cells = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, "")
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, "|"));
  function blocks(input) {
    let result = "";
    for (let i = 0; i < input.length; ) {
      const line = input[i];
      if (!line.trim()) {
        i++;
        continue;
      }
      const fence = /^\s*(`{3,}|~{3,})([\w-]*)\s*$/.exec(line);
      if (fence) {
        const code = [];
        i++;
        while (
          i < input.length &&
          !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(
            input[i],
          )
        )
          code.push(input[i++]);
        i++;
        result += `<pre><code${fence[2] ? ` class="language-${fence[2]}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`;
        continue;
      }
      const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        const base = slug(heading[2]) || "rubrique";
        const n = counts.get(base) ?? 0;
        counts.set(base, n + 1);
        const id = `ref-${base}${n ? `-${n}` : ""}`;
        const level = Math.min(6, heading[1].length + 1);
        headings.push({ id, title: heading[2].replace(/[`*]/g, ""), level });
        result += `<h${level} id="${id}">${inline(heading[2])}</h${level}>`;
        i++;
        continue;
      }
      if (line.includes("|") && tableSeparator(input[i + 1])) {
        const headers = cells(line);
        i += 2;
        const rows = [];
        while (i < input.length && input[i].trim() && input[i].includes("|"))
          rows.push(cells(input[i++]));
        result += `<div class="table-scroll" tabindex="0" role="region" aria-label="Tableau de référence"><table><thead><tr>${headers.map((cell) => `<th scope="col">${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, j) => `<td>${inline(row[j] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
        continue;
      }
      if (/^\s*>/.test(line)) {
        const quote = [];
        while (i < input.length && /^\s*>/.test(input[i]))
          quote.push(input[i++].replace(/^\s*>\s?/, ""));
        result += `<blockquote>${blocks(quote)}</blockquote>`;
        continue;
      }
      const first = listMatch(line);
      if (first) {
        const indent = first[1].length,
          ordered = /^\d/.test(first[2]);
        const tag = ordered ? "ol" : "ul";
        const start =
          ordered && parseInt(first[2]) !== 1
            ? ` start="${parseInt(first[2])}"`
            : "";
        let items = "";
        while (i < input.length) {
          const current = listMatch(input[i]);
          if (
            !current ||
            current[1].length !== indent ||
            /^\d/.test(current[2]) !== ordered
          )
            break;
          const body = [current[3]],
            continuationIndent = current[1].length + current[2].length + 1;
          i++;
          while (i < input.length) {
            if (!input[i].trim()) {
              if (
                i + 1 < input.length &&
                /^\s+\S/.test(input[i + 1]) &&
                input[i + 1].search(/\S/) > indent
              ) {
                body.push("");
                i++;
                continue;
              }
              break;
            }
            if (input[i].search(/\S/) <= indent) break;
            body.push(input[i++].slice(continuationIndent));
          }
          items += `<li>${blocks(body)}</li>`;
          while (i < input.length && !input[i].trim()) i++;
        }
        result += `<${tag}${start}>${items}</${tag}>`;
        continue;
      }
      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        result += "<hr>";
        i++;
        continue;
      }
      const paragraph = [line.trim()];
      i++;
      while (
        i < input.length &&
        input[i].trim() &&
        !/^(#{1,6}\s|\s*```|\s*~~~|\s*>)/.test(input[i]) &&
        !listMatch(input[i]) &&
        !tableSeparator(input[i + 1])
      )
        paragraph.push(input[i++].trim());
      result += `<p>${inline(paragraph.join(" "))}</p>`;
    }
    return result;
  }
  return { html: blocks(lines), headings };
}
