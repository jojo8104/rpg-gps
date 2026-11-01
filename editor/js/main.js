import { createStrategicView } from "./strategic-view.js";
import { bindServerInstallation } from "./server-installation.js";
import { bindMediaEditor } from "./media-view.js";
import { bindStructuredFields } from "./structured-fields.js";
import { generateRandomContent } from "./random-content.js";
import { bindInspectorResize } from "./inspector-resize.js";
import { imageArchiveFiles } from "./media-model.js";
import {
  ACTION_META,
  newProject,
  importProject,
  arrangeMissing,
  addAction,
  addLink,
  removeAction,
  addLocation,
  uniqueId,
} from "./project.js";
import { createGraphView } from "./graph-view.js";
import { createMapView } from "./map-view.js";
import { createInspector } from "./inspector.js";
import { branchExample } from "./branch-example.js";
import { createZip } from "./zip.js";
import { createAssetView } from "./asset-view.js";
import { createCampaignView } from "./campaign-view.js";

const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const storageKey = "rpg-gps-editor-draft-v1";
let project = importProject(branchExample()),
  selection = null,
  tab = "graph",
  catalog,
  graph,
  map,
  inspector,
  assets,
  campaign,
  strategic;
let report = null,
  revision = 0,
  toastTimeout,
  saveTimeout,
  lastSnapshot,
  undo = [],
  redo = [];

function notify(message, error = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(
    () => {
      element.hidden = true;
    },
    error ? 6500 : 3500,
  );
}
function remember() {
  const snapshot = JSON.stringify(project);
  if (snapshot !== lastSnapshot) {
    if (lastSnapshot) undo.push(lastSnapshot);
    undo = undo.slice(-50);
    while (
      undo.length > 1 &&
      undo.reduce((total, snapshot) => total + snapshot.length, 0) > 16_777_216
    )
      undo.shift();
    redo = [];
    lastSnapshot = snapshot;
  }
}
function saveDraft() {
  clearTimeout(saveTimeout);
  try {
    localStorage.setItem(storageKey, JSON.stringify(project));
    $("#save-state").textContent = "● Brouillon enregistré";
  } catch {
    $("#save-state").textContent =
      "Brouillon non enregistré : téléchargez le projet";
  }
}
function changed(content = true, refreshInspector = true) {
  if (content) {
    revision++;
    report = null;
    $("#validation-count").textContent = "—";
  }
  remember();
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveDraft, 300);
  $("#project-title").textContent = project.quest.title || "Quête sans titre";
  if (content) {
    arrangeMissing(project);
    render(refreshInspector);
  }
}
function render(refreshInspector = true) {
  if (!graph) return;
  $("#project-title").textContent = project.quest.title || "Quête sans titre";
  graph.render();
  if (tab === "map") map.render();
  if (refreshInspector) inspector.render(tab);
  if (tab === "validation") renderReport();
  if (tab === "assets" && refreshInspector) assets.render();
  if (tab === "campaign" && refreshInspector) campaign.render();
  if (tab === "strategic" && refreshInspector) strategic.render();
  $("#selection-status").textContent = selection
    ? { action: "Action", link: "Lien", location: "Lieu" }[selection.kind] +
      " · " +
      selection.id
    : "Sélectionnez un bloc pour modifier sa fiche.";
}
function select(value) {
  selection = value;
  render();
}
function setTab(next) {
  tab = next;
  selection = null;
  for (const panel of [
    "graph",
    "map",
    "validation",
    "assets",
    "campaign",
    "strategic",
  ])
    $("#" + panel + "-panel").hidden = panel !== tab;
  for (const button of document.querySelectorAll("[data-tab]"))
    button.classList.toggle("active", button.dataset.tab === tab);
  render();
  if (tab === "map") requestAnimationFrame(() => map.render());
  if (tab === "validation") renderReport();
}
function download(data, name, type = "application/json") {
  const blob =
    data instanceof Blob
      ? data
      : new Blob(
          [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
          { type },
        );
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function replaceProject(next) {
  const dialog = $("#replace-dialog");
  dialog.showModal();
  const answer = await new Promise((resolve) =>
    dialog.addEventListener("close", () => resolve(dialog.returnValue), {
      once: true,
    }),
  );
  if (answer === "cancel" || !answer) return;
  if (answer === "save") download(project, project.quest.id + ".project.json");
  project = importProject(next);
  selection = null;
  revision++;
  report = null;
  undo = [];
  redo = [];
  lastSnapshot = JSON.stringify(project);
  setTab("graph");
  saveDraft();
  requestAnimationFrame(() => graph.fit());
  notify("Projet ouvert. Vos modifications restent dans ce brouillon.");
}
function remove(value) {
  if (!value) return;
  if (value.kind === "action") removeAction(project, value.id);
  else if (value.kind === "link")
    project.quest.links = project.quest.links.filter(
      (entry) => entry.id !== value.id,
    );
  else if (value.kind === "location") {
    project.world.locations = project.world.locations.filter(
      (entry) => entry.id !== value.id,
    );
    project.world.locationSlots = project.world.locationSlots.filter(
      (entry) => entry.id !== value.id,
    );
  }
  selection = null;
  changed(true);
  notify("Élément retiré. Ctrl+Z pour annuler.");
}
function duplicate(id) {
  const source = project.quest.actions.find((entry) => entry.id === id),
    action = structuredClone(source),
    point = project.editor.positions[id];
  action.id = uniqueId(source.action.toLowerCase(), project.quest.actions);
  action.label = (action.label || action.id) + " · copie";
  if (action.dialogue && project.dialogues[action.dialogue.id]) {
    const before = action.dialogue.id;
    action.dialogue.id = "dialogue-" + action.id;
    project.dialogues[action.dialogue.id] = structuredClone(
      project.dialogues[before],
    );
  }
  project.quest.actions.push(action);
  project.editor.positions[action.id] = { x: point.x + 35, y: point.y + 200 };
  selection = { kind: "action", id: action.id };
  changed(true);
}
async function validate() {
  const at = revision,
    snapshot = JSON.stringify(project);
  $("#revalidate").disabled = true;
  $("#validate-button").disabled = true;
  try {
    const response = await fetch("/api/editor/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: snapshot,
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "La validation a échoué.");
    if (at !== revision) {
      notify(
        "Le projet a changé pendant la vérification. Relancez la validation.",
        true,
      );
      return null;
    }
    report = result;
    $("#validation-count").textContent = result.valid
      ? "✓"
      : result.errors.length;
    $("#connection-status").textContent = "Serveur connecté";
    setTab("validation");
    renderReport();
    return result;
  } catch (issue) {
    notify("Validation indisponible : " + issue.message, true);
    return null;
  } finally {
    $("#revalidate").disabled = false;
    $("#validate-button").disabled = false;
  }
}
function renderReport() {
  if (!report) {
    $("#validation-content").innerHTML =
      '<div class="validation-intro"><span>✓</span><h3>Votre prochain chapitre commence ici.</h3><p>Vérifiez la définition avec le serveur avant d’exporter les fichiers du moteur.</p><button class="button primary" id="run-report">Vérifier le projet</button></div>';
    $("#run-report").onclick = validate;
    return;
  }
  const summary = report.summary;
  $("#validation-content").innerHTML =
    `<div class="validation-result ${report.valid ? "" : "invalid"}"><span class="result-icon">${report.valid ? "✓" : "!"}</span><div><h3>${report.valid ? "Votre définition est valide." : "Quelques points à ajuster."}</h3><p>${report.valid ? "Le serveur accepte la structure. Vérifiez les remarques avant l’intégration au jeu." : `${report.errors.length} erreur(s) à corriger avant l’export moteur.`}</p></div></div>${summary ? `<div class="validation-stats"><div><strong>${summary.actions}</strong>actions</div><div><strong>${summary.links}</strong>liens</div><div><strong>${summary.locations}</strong>lieux</div>${summary.areaSquareMeters ? `<div><strong>${Math.round(summary.areaSquareMeters).toLocaleString("fr-FR")}</strong>m² de terrain</div>` : ""}</div>` : ""}${report.errors.map((issue, index) => `<div class="issue error"><span>!</span><button data-issue="error:${index}">${escape(issue.message)}<small>${escape(issue.path)}</small></button></div>`).join("")}${report.warnings.map((issue, index) => `<div class="issue warning"><span>△</span><button data-issue="warning:${index}">${escape(issue.message)}<small>${escape(issue.path)}</small></button></div>`).join("")}<div class="export-actions"><button id="download-project" class="button">Télécharger le projet</button>${report.valid ? '<button id="download-engine" class="button primary">↓ Fichiers du moteur (.zip)</button>' : ""}</div><details class="form-section"><summary>Aperçu de la fiche de quête JSON</summary><pre class="json-preview">${escape(JSON.stringify(report.project?.quest ?? project.quest, null, 2))}</pre></details>`;
  $("#download-project").onclick = () =>
    download(project, project.quest.id + ".project.json");
  if (report.valid) $("#download-engine").onclick = exportEngine;
  for (const button of document.querySelectorAll("[data-issue]"))
    button.onclick = () => {
      const [kind, index] = button.dataset.issue.split(":"),
        issue = (kind === "error" ? report.errors : report.warnings)[index];
      if (issue.path.startsWith("action:")) {
        setTab("graph");
        select({ kind: "action", id: issue.path.slice(7).split(".")[0] });
      } else if (issue.path.startsWith("link:")) {
        setTab("graph");
        select({ kind: "link", id: issue.path.slice(5) });
      } else if (issue.path.startsWith("campaign")) setTab("campaign");
      else if (
        issue.path.startsWith("assets") ||
        issue.path.startsWith("media")
      )
        setTab("assets");
      else if (issue.path.startsWith("world")) setTab("map");
      else {
        setTab("graph");
        select(null);
      }
    };
}
async function exportEngine() {
  const validReport = report ?? (await validate());
  if (!validReport?.valid) return;
  const files = Object.values(validReport.files).map((file) => ({
    name: file.name,
    content: JSON.stringify(file.data, null, 2),
  }));
  files.push(...imageArchiveFiles(validReport.project));
  files.push({
    name: "editor-project.json",
    content: JSON.stringify(validReport.project, null, 2),
  });
  files.push({
    name: "README.txt",
    content:
      "Scénario de quêtes : quests/*.json contient les définitions ; quest-campaign.json indique scenarioId, questIds et initialQuestIds. Charger toutes les définitions et publier uniquement les quêtes de départ au lancement. Les transitions publient les suivantes après leur issue, sans acceptation automatique.\n\n" +
      "Catalogues supplémentaires : npcs.json contient des fiches narratives liées aux dialogues ; autonomous-groups.json contient des définitions AutonomousGroup ; items.json contient les fiches createUniqueItemDefinition. Les raccorder aux services et catalogues serveur avant utilisation. Ils ne sont pas installés automatiquement.\n\n" +
      "RPG GPS — Export de conception\n\nLa quête et ses dialogues sont des définitions pour QuestService. Le scénario, les lieux, les placements et la play area sont séparés. Les lieux sans position imposée utilisent une position neutre dans le catalogue et une stratégie random dans le scénario ; le serveur doit les placer dans le terrain de la partie.\n\nCet export ne modifie pas le catalogue du jeu ni les parties en cours. Intégrer ces fichiers dans le catalogue serveur, puis tester les parcours en GPS et simulation. Les preuves de combat et positions sont toujours validées en partie.\n\nRemarques de validation :\n" +
      validReport.warnings.map((issue) => "- " + issue.message).join("\n"),
  });
  download(createZip(files), project.quest.id + ".zip");
  notify("Archive exportée : quête, dialogues, monde et catalogues.");
}
async function boot() {
  try {
    const response = await fetch("/api/editor/catalog", {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Le catalogue n’est pas disponible.");
    catalog = await response.json();
    $("#connection-status").textContent = "Serveur connecté";
  } catch (issue) {
    catalog = {
      resources: ["gold", "wood", "stone", "iron", "food"],
      items: [],
      samples: [],
      locations: [],
      locationTypes: ["capital", "village", "fort", "camp", "mine", "quest"],
    };
    $("#connection-status").textContent = "Serveur indisponible";
    notify(
      "Le brouillon reste éditable. Démarrez le serveur pour valider et charger la bibliothèque.",
      true,
    );
  }
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) project = importProject(JSON.parse(saved));
  } catch {
    notify("Le brouillon précédent n’a pas pu être restauré.", true);
  }
  lastSnapshot = JSON.stringify(project);
  const shared = {
    getProject: () => project,
    getSelection: () => selection,
    select,
    changed,
    notify,
  };
  graph = createGraphView({
    ...shared,
    canvas: $("#graph-canvas"),
    connect(from, output, to) {
      const link = addLink(project, from, output, to);
      selection = { kind: "link", id: link.id };
      changed(true);
    },
  });
  map = createMapView({ ...shared, canvas: $("#map-canvas") });
  bindInspectorResize({
    element: $(".inspector"),
    workspace: $(".workspace"),
    onResize: () => {
      if (tab === "map") map.render();
    },
  });
  inspector = createInspector({
    ...shared,
    element: $("#inspector-content"),
    catalog,
    remove,
    duplicate,
  });
  assets = createAssetView({
    element: $("#assets-content"),
    getProject: () => project,
    changed,
    notify,
  });
  bindStructuredFields(document.body, {
    getProject: () => project,
    changed,
    notify,
  });
  bindMediaEditor(document.body, {
    getProject: () => project,
    changed,
    notify,
  });
  strategic = createStrategicView({
    element: $("#strategic-content"),
    getProject: () => project,
    changed,
    notify,
  });
  campaign = createCampaignView({
    element: $("#campaign-content"),
    getProject: () => project,
    catalog,
    changed,
    notify,
    openGraph() {
      setTab("graph");
      graph.fit();
    },
  });
  $("#palette").innerHTML = Object.entries(ACTION_META)
    .map(
      ([type, meta]) =>
        `<button class="palette-action" data-add-action="${type}" style="--node-color:var(--${meta.color})"><span class="action-icon">${meta.icon}</span><span>${type}</span><small>+</small></button>`,
    )
    .join("");
  for (const button of document.querySelectorAll("[data-add-action]"))
    button.onclick = () => {
      if (tab !== "graph") setTab("graph");
      const action = addAction(
        project,
        button.dataset.addAction,
        graph.insertionPoint(),
      );
      selection = { kind: "action", id: action.id };
      changed(true);
    };
  $("#samples").innerHTML = catalog.samples
    .map(
      (sample, index) =>
        `<button class="example-button" data-sample="${index}">▤ <span>${escape(sample.title)}<small>Fiche actuelle du jeu</small></span></button>`,
    )
    .join("");
  for (const button of document.querySelectorAll("[data-sample]"))
    button.onclick = () =>
      replaceProject(catalog.samples[Number(button.dataset.sample)].project);
  for (const button of document.querySelectorAll("[data-tab]"))
    button.onclick = () => setTab(button.dataset.tab);
  $("#branch-example").onclick = () => replaceProject(branchExample());
  $("#new-project").onclick = () => replaceProject(newProject());
  $("#empty-add").onclick = () =>
    document.querySelector('[data-add-action="Parler"]').click();
  $("#save-button").onclick = () => {
    saveDraft();
    download(project, project.quest.id + ".project.json");
    notify("Brouillon enregistré et projet téléchargé.");
  };
  bindServerInstallation($("#install-button"), {
    getProject: () => project,
    validate,
    notify,
  });
  $("#export-button").onclick = async () => {
    const result = await validate();
    if (result?.valid)
      notify(
        "Projet valide : choisissez le téléchargement des fichiers du moteur.",
      );
  };
  for (const id of ["#validate-button", "#revalidate"])
    $(id).onclick = validate;
  $("#quest-settings").onclick = () => select(null);
  $("#close-selection").onclick = () => select(null);
  $("#auto-layout").onclick = () => {
    arrangeMissing(project, true);
    changed(true);
    graph.fit();
  };
  $("#fit-graph").onclick = graph.fit;
  $("#zoom-in").onclick = () => graph.zoom(1.15);
  $("#zoom-out").onclick = () => graph.zoom(1 / 1.15);
  $("#add-location").onclick = () => {
    const location = addLocation(project);
    selection = { kind: "location", id: location.id };
    changed(true);
  };
  $("#generate-location").onclick = () => {
    const location = generateRandomContent(project, "locations");
    selection = { kind: "location", id: location.id };
    changed(true);
    notify("Lieu généré : fiche modifiable, placement aléatoire au lancement.");
  };
  $("#area-tool").onclick = () => map.startPolygon("area");
  $("#exclusion-tool").onclick = () => map.startPolygon("exclusion");
  $("#finish-polygon").onclick = map.finishPolygon;
  $("#map-center").onclick = () =>
    map.center(
      Number($("#map-latitude").value),
      Number($("#map-longitude").value),
    );
  $("#map-fit").onclick = map.fit;
  $("#map-tiles").onchange = (event) => map.tiles(event.target.checked);
  $("#map-zoom-in").onclick = () => map.zoom(1);
  $("#map-zoom-out").onclick = () => map.zoom(-1);
  $("#import-button").onclick = () => $("#import-file").click();
  $("#import-file").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 16_777_216) throw new Error("Le projet dépasse 16 Mo.");
      const data = JSON.parse(await file.text());
      if (data.polygon) {
        project.world.playArea = data;
        setTab("map");
        changed(true);
        map.fit();
        notify("Play area importée.");
      } else if (
        !data.actions &&
        !data.quest &&
        Object.values(data).length &&
        Object.values(data).every((value) => value?.nodes)
      ) {
        Object.assign(project.dialogues, data);
        changed(true);
        notify("Catalogue de dialogues importé.");
      } else
        await replaceProject(
          importProject(data, {
            ...newProject().world,
            locationSlots: catalog.locations.map((entry) => entry.slot),
            locations: catalog.locations.map((entry) => entry.location),
          }),
        );
    } catch (issue) {
      notify("Import impossible : " + issue.message, true);
    }
    event.target.value = "";
  };
  document.addEventListener("keydown", (event) => {
    const editing = event.target.closest(
      "input,textarea,select,[contenteditable=true]",
    );
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveDraft();
      notify("Brouillon enregistré.");
    }
    if (
      !editing &&
      (event.ctrlKey || event.metaKey) &&
      ["z", "y"].includes(event.key.toLowerCase())
    ) {
      event.preventDefault();
      const backwards = event.key.toLowerCase() === "z" && !event.shiftKey,
        source = backwards ? undo : redo,
        destination = backwards ? redo : undo;
      if (source.length) {
        destination.push(JSON.stringify(project));
        project = importProject(JSON.parse(source.pop()));
        lastSnapshot = JSON.stringify(project);
        selection = null;
        revision++;
        report = null;
        saveDraft();
        render();
      }
    }
    if (!editing && ["Delete", "Backspace"].includes(event.key) && selection) {
      event.preventDefault();
      remove(selection);
    }
    if (event.key === "Escape") graph.cancelLink();
  });
  new ResizeObserver(() => {
    if (tab === "map") map.render();
  }).observe($("#map-canvas"));
  render();
  requestAnimationFrame(() => graph.fit());
}
boot().catch((issue) =>
  notify("Impossible d’initialiser l’atelier : " + issue.message, true),
);
