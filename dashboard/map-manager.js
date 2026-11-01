import { mapCardPreview } from "./map-card-preview.js";
const bytes = (value) =>
  value >= 1024 * 1024
    ? `${(value / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mio`
    : `${Math.ceil(value / 1024)} Kio`;
function node(tag, text = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

/** Chargement explicite du catalogue, sans extraction lors de la consultation. */
export function mountMapManager(
  root,
  { api, confirmAction = (message) => confirm(message) },
) {
  const title = node("summary", "Cartes sauvegardées et banque géographique");
  const content = node("div");
  content.className = "map-manager-content";
  const toolbar = node("div");
  toolbar.className = "toolbar";
  const refresh = node("button", "Actualiser la banque"),
    purge = node("button", "Vider les données inutilisées");
  refresh.type = purge.type = "button";
  toolbar.append(refresh, purge);
  const status = node("p");
  status.setAttribute("role", "status");
  const metrics = node("div");
  metrics.className = "metrics";
  const help = node(
    "p",
    "Le fond OpenStreetMap charge des tuiles d’affichage, sans extraction des données du jeu. Les fichiers utilisés sont protégés : leurs usages sont indiqués dans la rubrique Conservation. Supprimer une carte nommée retire sa référence ; ses données restent protégées si une partie ou une sauvegarde les utilise encore.",
  );
  const preview = node("div");
  preview.className = "bank-preview";
  preview.setAttribute("aria-label", "Aperçu des couvertures géographiques");
  const saved = node("div"),
    files = node("div");
  saved.className = "bank-card-grid";
  files.className = "bank-table-wrap";
  const browser = node("div");
  browser.className = "bank-browser";
  const library = node("section");
  library.className = "bank-library";
  library.append(node("h3", "Cartes sauvegardées"), saved);
  const previewPanel = node("section");
  previewPanel.className = "bank-preview-panel";
  const previewTitle = node("h3", "Aperçu des zones enregistrées");
  previewPanel.append(previewTitle, preview);
  browser.append(library, previewPanel);
  content.append(
    toolbar,
    status,
    metrics,
    browser,
    node("h3", "Fichiers de la banque"),
    files,
    help,
  );
  root.replaceChildren(title, content);
  let authenticated = false,
    busy = false,
    revision = 0,
    map = null,
    layer = null;
  const show = (geometry, polygon) => {
    if (!globalThis.L) return;
    if (!map) {
      map = L.map(preview).setView([46.5, 2.5], 5);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
    }
    layer ??= L.layerGroup().addTo(map);
    layer.clearLayers();
    const points = [];
    for (const shape of geometry ?? []) {
      const rings = shape.map((ring) => ring.map(([lng, lat]) => [lat, lng]));
      L.polygon(rings, {
        color: "#40cbb9",
        weight: 2,
        fillOpacity: 0.18,
      }).addTo(layer);
      points.push(...rings[0]);
    }
    if (polygon) {
      const ring = polygon.map((p) => [p.latitude, p.longitude]);
      L.polygon(ring, { color: "#f6bf65", fillOpacity: 0.07 }).addTo(layer);
      points.push(...ring);
    }
    map.invalidateSize();
    if (points.length)
      map.fitBounds(points, { padding: [20, 20], maxZoom: 17 });
  };
  function button(label, action, disabled = false) {
    const element = node("button", label);
    element.type = "button";
    element.disabled = disabled;
    element.onclick = action;
    return element;
  }
  function table(container, headings, rows) {
    const table = node("table"),
      head = node("thead"),
      tr = node("tr");
    headings.forEach((text) => tr.append(node("th", text)));
    head.append(tr);
    table.append(head);
    const body = node("tbody");
    rows.forEach((cells) => {
      const tr = node("tr");
      cells.forEach((cell) => {
        const td = node("td");
        if (typeof cell === "string") td.textContent = cell;
        else td.append(cell);
        tr.append(td);
      });
      body.append(tr);
    });
    table.append(body);
    container.replaceChildren(table);
    if (!rows.length) container.append(node("p", "Aucune entrée."));
  }
  async function mutate(path, method, id, message) {
    if (busy || !authenticated || !confirmAction(message)) return;
    busy = true;
    refresh.disabled = purge.disabled = true;
    status.textContent = "Opération en cours…";
    const current = revision;
    let outcome = "Opération terminée.";
    try {
      await api(path, { method, headers: { "X-Dashboard-Confirm": id } });
      if (current === revision) status.textContent = "Opération terminée.";
    } catch (error) {
      outcome = error.message;
    } finally {
      busy = false;
      if (current === revision) {
        await load();
        status.textContent = outcome;
      }
    }
  }
  async function load() {
    if (!authenticated || busy) return;
    busy = true;
    const current = revision;
    refresh.disabled = purge.disabled = true;
    status.textContent = "Lecture de la banque…";
    try {
      const data = await api("/api/dashboard/maps");
      if (current !== revision || !authenticated) return;
      const { bank, savedMaps } = data;
      metrics.replaceChildren(
        ...[
          ["Volume stocké", bytes(bank.bytes)],
          ["Budget", bytes(bank.maxBytes)],
          ["Données protégées", bytes(bank.protectedBytes)],
          ["Fichiers", String(bank.files.length)],
        ].map(([label, value]) => {
          const box = node("div");
          box.className = "metric";
          box.append(node("span", label), node("strong", value));
          return box;
        }),
      );
      saved.replaceChildren(
        ...savedMaps.map((entry) => {
          const actions = node("div");
          actions.className = "bank-actions";
          const sources = bank.files.filter((file) =>
            entry.sourceIds.includes(file.id),
          );
          actions.append(
            button("Voir", () => {
              previewTitle.textContent = entry.name;
              show(
                sources.flatMap((file) => file.coveragePolygons),
                entry.playArea.polygon,
              );
            }),
            button(
              "Compléter les données",
              () =>
                mutate(
                  `/api/dashboard/saved-map/prepare?id=${encodeURIComponent(entry.id)}`,
                  "POST",
                  entry.id,
                  `Télécharger uniquement les données manquantes de « ${entry.name} » ?`,
                ),
              entry.complete || bank.busy,
            ),
            button("Supprimer la carte", () =>
              mutate(
                `/api/dashboard/saved-map?id=${encodeURIComponent(entry.id)}`,
                "DELETE",
                entry.id,
                `Supprimer la référence « ${entry.name} » ? Les parties existantes et les données de la banque sont conservées.`,
              ),
            ),
          );
          const card = node("article");
          card.className = "bank-map-card";
          const thumbnail = node("img");
          thumbnail.src = mapCardPreview([], entry.playArea.polygon);
          thumbnail.alt = `Contour de ${entry.name}`;
          const name = node("h4", entry.name);
          name.title = entry.name;
          const coverage = entry.complete
            ? "Complète"
            : `${entry.coveragePercent.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
          card.append(
            thumbnail,
            name,
            node(
              "p",
              `${coverage} · ${entry.sourceCount} fichier(s) · ${bytes(entry.sourceBytes)}`,
            ),
            actions,
          );
          return card;
        }),
      );
      if (!savedMaps.length)
        saved.append(node("p", "Aucune carte sauvegardée."));
      table(
        files,
        ["Fichier", "Type", "Taille", "Conservation", "Actions"],
        bank.files.map((file) => {
          const actions = node("div");
          actions.className = "bank-actions";
          actions.append(
            button("Voir", () => show(file.coveragePolygons)),
            button(
              "Supprimer",
              () =>
                mutate(
                  `/api/dashboard/maps?id=${encodeURIComponent(file.id)}`,
                  "DELETE",
                  file.id,
                  "Supprimer ce fichier inutilisé de la banque ? Une future carte pourrait devoir le télécharger à nouveau.",
                ),
              file.protected || bank.busy,
            ),
          );
          if (file.protected) {
            const reason = `Utilisé par : ${file.usedBy.join(", ") || "une zone conservée"}. Retirez les références concernées avant de supprimer le fichier.`;
            actions.lastChild.title = reason;
            actions.append(node("small", reason));
          }
          return [
            file.id.replace(/\.json$/, "").slice(0, 22),
            file.type === "map" ? "Carte" : "Portion",
            bytes(file.bytes),
            file.protected
              ? "Protégé · " + (file.usedBy.join(", ") || "utilisé")
              : "Réutilisable",
            actions,
          ];
        }),
      );
      purge.disabled = bank.busy || !bank.files.some((file) => !file.protected);
      status.textContent = bank.busy
        ? "Une préparation est en cours ; les suppressions de données sont désactivées."
        : bank.bytes > bank.maxBytes
          ? "Le volume protégé peut dépasser le budget. Aucune donnée utile n’est supprimée."
          : "Banque à jour. Aucun téléchargement déclenché.";
      previewTitle.textContent = "Aperçu des zones enregistrées";
      show(bank.files.flatMap((file) => file.coveragePolygons));
    } catch (error) {
      if (current === revision) status.textContent = error.message;
    } finally {
      busy = false;
      if (current === revision) refresh.disabled = false;
    }
  }
  refresh.onclick = () => void load();
  purge.onclick = () =>
    void mutate(
      "/api/dashboard/maps/unused",
      "DELETE",
      "unused",
      "Supprimer tous les fichiers inutilisés de la banque ? Les fichiers protégés resteront conservés.",
    );
  root.addEventListener("toggle", () => {
    if (root.open) void load();
  });
  return {
    setAuthenticated(value) {
      if (authenticated === value) return;
      authenticated = value;
      revision++;
      root.hidden = !value;
      if (!value) {
        saved.replaceChildren();
        files.replaceChildren();
        metrics.replaceChildren();
        layer?.clearLayers();
        status.textContent = "";
      } else if (root.open) void load();
    },
  };
}
