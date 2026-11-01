import { mountDashboardWorkspace } from "./workspace.js";
import {
  coordinates,
  playAreaPoints,
  mapFramePoints,
  isOutsidePlayArea,
} from "./map-geometry.js";
import { buildHistoryMap } from "./history-map.js";
import { createDashboardCharts } from "./history-charts.js";
import { renderEntityDetails, renderReadable } from "./entity-details.js";
import { renderObservationLayers } from "./observation-map.js";
import { mountMapManager } from "./map-manager.js";
let selectionRef = null,
  perspective = "";
const $ = (id) => document.getElementById(id);
const charts = createDashboardCharts($("history-charts"));
const mapManager = mountMapManager($("map-manager"), { api });
let historyCode = null,
  historySamples = [];
let token = sessionStorage.getItem("rpg-dashboard-token") ?? "";
let selected = null,
  party = null,
  map = null,
  layers = null,
  base = null,
  mode = null,
  running = false,
  deleting = false;
const workspace = mountDashboardWorkspace({
  api,
  onShow: () => map?.invalidateSize(),
});
const colors = ["#007eac", "#b14a8b", "#188652", "#c07112"];
function text(tag, value) {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401) {
      token = "";
      sessionStorage.removeItem("rpg-dashboard-token");
      $("login").hidden = false;
      mapManager.setAuthenticated(false);
      workspace.setAuthenticated(false);
    }
    const details = await response.json().catch(() => ({}));
    throw new Error(
      response.status === 401
        ? "Clé administrateur invalide ou expirée. Après un redémarrage, utilisez la clé du journal du serveur."
        : (details.error ?? `Erreur serveur (${response.status}).`),
    );
  }
  return response.json();
}
function metric(label, value) {
  const node = text("div", "");
  node.className = "metric";
  node.append(text("span", label), text("strong", value));
  return node;
}
function entityMarker(position, label, color, symbol, entity, kind) {
  const point = coordinates(position);
  if (!point) return;
  const icon = L.divIcon({
    className: "entity-icon",
    html: `<span style="color:${color}">${symbol}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
  const marker = L.marker(point, { icon }).addTo(layers);
  marker.bindTooltip(text("span", label));
  marker.on("click", () => showEntity(label, entity, kind));
}
function showEntity(label, entity, kind, syncMap = true) {
  selectionRef = { kind, id: entity.id ?? entity.playerId, label };
  if (kind === "players") perspective = entity.id;
  if (kind === "heroes") perspective = entity.playerId;
  let box = $("selection");
  if (!box) {
    box = text("section", "");
    box.id = "selection";
    $("details").prepend(box);
  }
  box.replaceChildren(
    renderEntityDetails({
      kind,
      entity,
      party,
      onSelect: (nextKind, next) => showEntity(next.name, next, nextKind),
    }),
  );
  if (kind === "players" || kind === "heroes")
    $("perspective").value = perspective;
  if (syncMap && party) renderMap();
}
function section(label, items, kind) {
  const node = text("details", "");
  node.dataset.section = label;
  node.append(text("summary", `${label} (${items.length})`));
  const query = $("entity-search").value.trim().toLocaleLowerCase("fr");
  for (const item of items.filter(
    (item) =>
      !query ||
      [item.name, item.id, item.type].some((value) =>
        String(value ?? "")
          .toLocaleLowerCase("fr")
          .includes(query),
      ),
  )) {
    const article = text("article", "");
    const button = text(
      "button",
      `${item.name ?? item.id ?? item.playerId ?? "Détail"}${label.startsWith("Lieux") && isOutsidePlayArea(party, item.position) ? " · hors zone" : ""}`,
    );
    button.onclick = () => showEntity(button.textContent, item, kind);
    article.append(button);
    if (item.connected !== undefined)
      article.append(
        text("small", item.connected ? " Connecté" : " Déconnecté"),
      );
    node.append(article);
  }
  return node;
}
function renderDetails() {
  const opened = new Set(
    [...$("details").querySelectorAll("details[open]")].map(
      (node) => node.dataset.section,
    ),
  );
  const expanded = [...($("selection")?.querySelectorAll("details") ?? [])]
    .map((entry, index) => (entry.open ? index : -1))
    .filter((index) => index >= 0);
  const scroll = $("details").parentElement.scrollTop;
  const selector = $("perspective");
  selector.replaceChildren(
    new Option("Vue administrateur", ""),
    ...party.players.map((player) => new Option(player.name, player.id)),
  );
  selector.value = perspective;
  const connected = party.players.filter((p) => p.connected).length;
  $("party-title").textContent =
    `Partie ${party.code} · ${(party.coordinateMode ?? party.configuration.positionMode) === "simulation" ? "Carte fictive" : "GPS"}`;
  $("summary").textContent =
    `${party.active ? "En cours" : party.status === "started" ? "Simulation arrêtée — aucun joueur" : "En préparation / terminée"} · ${connected}/${party.players.length} joueur(s) connecté(s) · Révision ${party.revision}${party.sampledAt ? " · Relevé " + new Date(party.sampledAt).toLocaleTimeString("fr-FR") : ""}`;
  const outside = party.locations.filter((location) =>
    isOutsidePlayArea(party, location.position),
  ).length;
  if (outside)
    $("summary").textContent +=
      ` · ${outside} lieu(x) hors zone (positions officielles ; placement à vérifier)`;
  $("details").replaceChildren(
    section("Joueurs", party.players, "players"),
    section("Héros / équipement / inventaire", party.heroes, "heroes"),
    section("Lieux / ressources / garnisons", party.locations, "locations"),
    section("Groupes autonomes", party.groups, "groups"),
    section("Combats", party.battles, "battles"),
    section("Zones de ressources", party.zones, "zones"),
    section("Catalogue des objets", party.itemTypes ?? [], "items"),
    section("Butins et objets au sol", party.loot ?? [], "loot"),
    section("Sites du monde", party.sites ?? [], "sites"),
  );
  for (const [label, data] of [
    ["Quêtes", party.quests],
    ["Scénario", party.scenario],
    ["Monde", party.world],
    ["Derniers événements", party.events],
  ]) {
    const node = text("details", "");
    node.dataset.section = label;
    node.append(text("summary", label), renderReadable(data));
    $("details").append(node);
  }
  for (const node of $("details").querySelectorAll("details"))
    node.open = opened.has(node.dataset.section);
  if (selectionRef) {
    const entity = (
      party[selectionRef.kind] ??
      (selectionRef.kind === "items" ? party.itemTypes : []) ??
      []
    ).find((e) => (e.id ?? e.playerId) === selectionRef.id);
    if (entity) {
      showEntity(selectionRef.label, entity, selectionRef.kind, false);
      const details = $("selection").querySelectorAll("details");
      for (const index of expanded)
        if (details[index]) details[index].open = true;
      $("details").parentElement.scrollTop = scroll;
    } else {
      const absent = text(
        "p",
        "Cet élément n’est plus présent dans l’état courant. Son parcours enregistré reste consultable.",
      );
      $("details").prepend(absent);
    }
  }
}
function renderMap(recenter = false) {
  const historical = buildHistoryMap(
    party,
    historySamples,
    $("timeline").value,
  );
  $("history-time").textContent = historical.label;
  const nextMode = party.coordinateMode ?? party.configuration.positionMode;
  if (!map || mode !== nextMode) {
    map?.remove();
    mode = nextMode;
    map = L.map("map", {
      crs: mode === "simulation" ? L.CRS.Simple : L.CRS.EPSG3857,
      minZoom: mode === "simulation" ? -4 : 1,
    });
    layers = L.layerGroup().addTo(map);
    base = null;
    if (mode !== "simulation")
      base = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
    recenter = true;
  }
  layers.clearLayers();
  const polygon = playAreaPoints(party);
  if (mode !== "simulation" && polygon.length > 2)
    L.polygon(polygon, { color: "#14675f", fillOpacity: 0.04 }).addTo(layers);
  if ($("heat").checked) {
    const maximum = Math.max(1, ...historical.heatmap.map((c) => c.visits));
    for (const cell of historical.heatmap)
      L.rectangle(cell.bounds, {
        color: "#ee8d21",
        weight: 1,
        fillOpacity: 0.1 + (0.55 * cell.visits) / maximum,
      })
        .bindTooltip(text("span", `${cell.visits} mesure(s) de position`))
        .addTo(layers);
  }
  renderObservationLayers({
    map,
    layers,
    party,
    history: historySamples,
    percent: $("timeline").value,
    playerId: perspective,
    vision: $("vision").checked,
    fog: $("fog").checked,
    borders: $("borders").checked,
  });
  $("perspective-note").textContent = perspective
    ? `Vision du joueur et exploration supervisée${party.perception?.players?.[perspective]?.since ? " depuis le " + new Date(party.perception.players[perspective].since).toLocaleString("fr-FR") : " : aucun relevé antérieur disponible"}. Marqueurs administrateur visibles ; frontières actuelles.`
    : "Choisissez un joueur pour voir son champ de vision et son exploration.";
  party.players.forEach((player, index) => {
    const hero = party.heroes.find((h) => h.playerId === player.id);
    const position =
      historical.players.get(player.id) ?? player.position ?? hero?.position;
    const color = colors[index % colors.length];
    if ($("trails").checked && (!perspective || perspective === player.id)) {
      const points = historical.samples
        .filter((s) => s.playerId === player.id)
        .map((s) => coordinates(s.position))
        .filter(Boolean);
      if (points.length > 1)
        L.polyline(points, { color, weight: 2, opacity: 0.65 }).addTo(layers);
    }
    entityMarker(
      position,
      `${player.name} · ${player.connected ? "connecté" : "absent"}`,
      color,
      "●",
      player,
      "players",
    );
    if (mode !== "simulation" && player.position?.accuracy)
      L.circle(coordinates(player.position), {
        radius: player.position.accuracy,
        color,
        weight: 1,
        fillOpacity: 0.08,
      }).addTo(layers);
  });
  for (const location of party.locations.filter(
    (location) =>
      $("outside").checked || !isOutsidePlayArea(party, location.position),
  ))
    entityMarker(
      location.position,
      `${location.name} · ${location.type}`,
      "#76553b",
      "◆",
      location,
      "locations",
    );
  for (const hero of party.heroes.filter(
    (h) => !party.players.some((p) => p.id === h.playerId),
  ))
    entityMarker(hero.position, hero.name, "#8a3e44", "●", hero, "heroes");
  if ($("trails").checked) {
    for (const points of historical.groupTrails.values())
      if (points.length > 1)
        L.polyline(points, {
          color: "#d49352",
          weight: 2,
          dashArray: "5 5",
        }).addTo(layers);
  }
  for (const group of historical.groups ?? party.groups)
    entityMarker(
      group.position,
      group.name ?? group.type,
      "#aa442d",
      "▲",
      group,
      "groups",
    );
  if (recenter) {
    const points = mapFramePoints(party);
    if (points.length)
      map.fitBounds(L.latLngBounds(points).pad(0.15), {
        maxZoom: mode === "simulation" ? 3 : 17,
      });
    else
      map.setView(
        mode === "simulation" ? [50, 50] : [48.8566, 2.3522],
        mode === "simulation" ? 1 : 12,
      );
  }
}
async function refresh() {
  if (!token || running || deleting || document.hidden) return;
  running = true;
  try {
    const data = await api("/api/dashboard/parties");
    $("login").hidden = true;
    mapManager.setAuthenticated(true);
    workspace.setAuthenticated(true);
    $("metrics").replaceChildren(
      metric(
        "PARTIES ACTIVES",
        `${data.parties.filter((p) => p.status === "started" && p.connected).length} / ${data.server.activeLimit}`,
      ),
      metric(
        "MÉMOIRE NODE",
        `${Math.round(data.server.memory.rss / 1048576)} Mio`,
      ),
      metric(
        "MÉMOIRE JAVASCRIPT",
        `${Math.round(data.server.memory.heapUsed / 1048576)} Mio`,
      ),
      metric("CPU DU PROCESSUS", `${data.server.cpuPercent.toFixed(1)} %`),
      metric("DISPONIBILITÉ", `${Math.floor(data.server.uptime / 60)} min`),
    );
    const old = selected;
    if (!data.parties.some((p) => p.code === selected))
      selected = data.parties[0]?.code ?? null;
    $("tabs").replaceChildren(
      ...data.parties.map((p) => {
        const button = text(
          "button",
          `${p.code} · ${p.mode === "simulation" ? "Test" : "GPS"} · ${p.connected}/${p.players}`,
        );
        button.setAttribute("aria-selected", String(p.code === selected));
        button.onclick = () => {
          selected = p.code;
          party = null;
          $("details").replaceChildren();
          void refresh();
        };
        const tab = text("div", "");
        tab.className = "party-tab";
        const remove = text("button", "Effacer");
        remove.className = "delete-party";
        remove.setAttribute("aria-label", `Effacer la partie ${p.code}`);
        remove.onclick = async () => {
          if (running || deleting) return;
          if (
            !confirm(
              `Effacer définitivement la partie ${p.code} et son historique ? ${p.connected} joueur(s) connecté(s) seront sortis de cette partie. Les comptes et sauvegardes manuelles sont conservés.`,
            )
          )
            return;
          deleting = true;
          remove.disabled = true;
          try {
            await api(
              `/api/dashboard/party?code=${encodeURIComponent(p.code)}`,
              { method: "DELETE", headers: { "X-Dashboard-Confirm": p.code } },
            );
            if (selected === p.code) {
              selected = null;
              party = null;
            }
          } catch (error) {
            alert(error.message);
          } finally {
            deleting = false;
            await refresh();
          }
        };
        tab.append(button, remove);
        return tab;
      }),
    );
    if (selected) {
      const requestedCode = selected;
      const detail = await api(
        `/api/dashboard/party?code=${encodeURIComponent(selected)}`,
      );
      if (selected !== requestedCode || !token) return;
      const changed =
        !party || party.code !== detail.party.code || old !== selected;
      if (changed) {
        $("details").replaceChildren();
        selectionRef = null;
        perspective = "";
      }
      party = detail.party;
      renderDetails();

      if (historyCode !== selected) {
        historyCode = selected;
        historySamples = [];
        charts.clear();
      }
      const history = await api(
        `/api/dashboard/history?code=${encodeURIComponent(selected)}&scope=all&since=${historySamples.at(-1)?.at ?? 0}`,
      );
      if (selected !== requestedCode || !token) return;
      historySamples = [...historySamples, ...history.samples];
      renderMap(changed);
      charts.render(historySamples, party);
    } else {
      party = null;
      layers?.clearLayers();
      $("party-title").textContent = "Aucune partie";
      $("summary").textContent = "Aucune partie conservée sur le serveur.";
      $("details").replaceChildren();
      charts.clear();
      historyCode = null;
      historySamples = [];
    }
    $("connection").textContent =
      `À jour · ${new Date(data.at).toLocaleTimeString("fr-FR")}`;
  } catch (error) {
    $("connection").textContent = error.message;
  } finally {
    running = false;
  }
}
$("entity-search").oninput = () => {
  if (party) renderDetails();
};
$("login").onsubmit = (event) => {
  event.preventDefault();
  token = $("token").value.trim();
  sessionStorage.setItem("rpg-dashboard-token", token);
  $("token").value = "";
  void refresh();
};
$("timeline").oninput = () => {
  if (party) renderMap();
};
$("center").onclick = () => {
  if (party) renderMap(true);
};
$("perspective").onchange = () => {
  perspective = $("perspective").value;
  if (party) renderMap();
};
$("vision").onchange =
  $("fog").onchange =
  $("borders").onchange =
    () => {
      if (party) renderMap();
    };
$("heat").onchange =
  $("trails").onchange =
  $("outside").onchange =
    () => {
      if (party) renderMap();
    };
$("refresh").onclick = () => void refresh();
$("logout").onclick = () => {
  mapManager.setAuthenticated(false);
  workspace.setAuthenticated(false);
  token = "";
  sessionStorage.removeItem("rpg-dashboard-token");
  party = null;
  selectionRef = null;
  perspective = "";
  charts.clear();
  historyCode = null;
  historySamples = [];
  layers?.clearLayers();
  $("metrics").replaceChildren();
  $("tabs").replaceChildren();
  $("details").replaceChildren();
  $("summary").textContent = "Connexion requise.";
  $("login").hidden = false;
  $("connection").textContent = "Déconnecté";
};
setInterval(() => void refresh(), 4000);
document.addEventListener("visibilitychange", () => void refresh());
void refresh();
