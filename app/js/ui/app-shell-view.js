/** Éléments persistants de la page : menus, filtres et supports des notifications. */
export function createAppShellView({
  document,
  pauseElement,
  getMapLayers,
  onChange,
  onRelay,
  now = () => new Date(),
}) {
  const $ = (selector) => document.querySelector(selector);
  const royalMessengerNotice = document.createElement("aside");
  royalMessengerNotice.id = "royal-messenger-notice";
  royalMessengerNotice.className = "royal-messenger-notice";
  royalMessengerNotice.hidden = true;
  $("#game-screen").append(royalMessengerNotice);
  const ghostReturnNotice = document.createElement("aside");
  ghostReturnNotice.id = "ghost-return-notice";
  ghostReturnNotice.className = "ghost-return-notice";
  ghostReturnNotice.hidden = true;
  ghostReturnNotice.setAttribute("role", "alert");
  $("#game-screen").append(ghostReturnNotice);
  const mapChrome = document.createElement("div");
  mapChrome.className = "map-chrome";
  mapChrome.innerHTML = `
    <button id="toggle-game-menu" class="portrait-menu-toggle" type="button" aria-expanded="false" aria-controls="landscape-tools" aria-label="Menu du jeu"><span aria-hidden="true">☰</span></button>
    <aside id="landscape-tools" class="landscape-tools" aria-label="Menu de la partie">
      <strong>Partie</strong>
      <p id="game-session-code" class="game-session-code" hidden>Code de partie <strong></strong></p>
      <details id="game-debug-menu" class="game-menu-submenu">
        <summary>Développement</summary>
        <div id="game-debug-tools" class="game-menu-submenu__content">
          <button id="open-cheat-tools" type="button">Cheat / Triche</button>
          <details class="game-menu-submenu">
            <summary>Debug / Terrain et quêtes</summary>
            <div id="game-debug-actions" class="game-menu-submenu__content">
              <button id="open-field-tools" type="button">Outils de terrain</button>
              <label class="dev-quest-picker"><small>Quête à tester</small><select id="dev-quest-select" aria-label="Quête à tester"></select></label>
              <button id="start-dev-quest" type="button">Lancer la quête</button>
            </div>
          </details>
        </div>
      </details>
      <button id="save-and-end-game" type="button" hidden>Sauvegarder et quitter</button>
      <button id="destroy-game" class="game-menu-danger" type="button" hidden>Quitter sans sauvegarde<small>Détruire la partie</small></button>
      <button id="close-game-menu" class="landscape-tools__close" type="button">Fermer</button>
    </aside>
    <aside class="map-power-nav" aria-label="Pouvoirs utilisables sur la carte"><strong>Pouvoirs</strong></aside>`;
  $("#map-view").append(mapChrome);
  $("#game-debug-actions").append(pauseElement);
  const traceFilter = document.createElement("fieldset");
  traceFilter.className = "dev-trace-filter";
  traceFilter.innerHTML = `<legend>Traces visibles</legend>${[
    ["blue", "Joueur"],
    ["green", "Alliés"],
    ["red", "Ennemis"],
    ["gray", "Non reconnues"],
  ]
    .map(
      ([color, label]) =>
        `<label><input type="checkbox" value="${color}" checked><i class="is-${color}"></i><span>${label}</span></label>`,
    )
    .join("")}`;
  $("#game-debug-tools").append(traceFilter);
  traceFilter.addEventListener("change", (event) => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    if (input.checked) getMapLayers().traceVisibility.add(input.value);
    else getMapLayers().traceVisibility.delete(input.value);
    onChange();
  });
  const fogControl = document.createElement("label");
  fogControl.className = "dev-fog-control";
  fogControl.innerHTML =
    '<input type="checkbox" checked><span>Brouillard de guerre</span>';
  $("#game-debug-tools").insertBefore(fogControl, traceFilter);
  fogControl.querySelector("input").addEventListener("change", (event) => {
    getMapLayers().fogVisible = event.currentTarget.checked;
    onChange();
  });
  const heatmapControl = document.createElement("label");
  heatmapControl.className = "dev-fog-control";
  heatmapControl.innerHTML =
    '<input type="checkbox" checked><span>Heatmap</span>';
  $("#game-debug-tools").insertBefore(heatmapControl, traceFilter);
  heatmapControl.querySelector("input").addEventListener("change", (event) => {
    getMapLayers().heatmapVisible = event.currentTarget.checked;
    $("#toggle-heatmap").textContent = getMapLayers().heatmapVisible
      ? "Masquer la heatmap"
      : "Afficher la heatmap";
    onChange();
  });
  const travelRewardLayer = document.createElement("div");
  travelRewardLayer.className = "travel-reward-layer";
  travelRewardLayer.setAttribute("aria-live", "polite");
  travelRewardLayer.setAttribute("aria-atomic", "true");
  $("#game-screen").append(travelRewardLayer);
  document.addEventListener("contextmenu", (event) => {
    if (!event.target.closest("input,textarea,[contenteditable='true']"))
      event.preventDefault();
  });
  const ui = {
    presentation: $("#presentation-screen"),
    enterApp: $("#enter-app"),
    resumeApp: $("#resume-app"),
    newGameApp: $("#new-game-app"),
    loadGameApp: $("#load-game-app"),
    lobby: $("#lobby-screen"),
    setup: $("#setup-screen"),
    game: $("#game-screen"),
    create: $("#create-game"),
    status: $("#setup-status"),
    worldContent: $("#world-content"),
    heroContent: $("#hero-content"),
    armyContent: $("#army-content"),
    inventory: $("#inventory-content"),
    quests: $("#quests-content"),
    battle: $("#battle-content"),
    sheet: $("#bottom-sheet"),
    recenter: $("#recenter-map"),
    tools: $("#field-tools"),
    gpsStatus: $("#gps-status"),
    questStatus: $("#distance-quest-status"),
    questPlace: $("#place-quest-location"),
    sitesStatus: $("#dynamic-sites-status"),
    log: $("#field-log"),
    gpsSetup: $("#gps-setup-panel"),
    gpsAreaStatus: $("#gps-area-status"),
    gpsLocationButtons: $("#gps-location-buttons"),
    finishGpsSetup: $("#finish-gps-setup"),
  };

  document
    .querySelectorAll(
      "#army-view > h2, #inventory-view > h2, #quests-view > h2",
    )
    .forEach((title) => title.remove());
  const relayInboxButton = document.createElement("button");
  relayInboxButton.type = "button";
  relayInboxButton.textContent = "Courrier";
  relayInboxButton.onclick = onRelay;
  $("#landscape-tools").insertBefore(relayInboxButton, $("#close-game-menu"));
  const gpsAccuracyStatus = document.createElement("p");
  gpsAccuracyStatus.id = "gps-accuracy-log";
  gpsAccuracyStatus.className = "test-status";
  ui.gpsStatus.after(gpsAccuracyStatus);
  gpsAccuracyStatus.insertAdjacentHTML(
    "afterend",
    '<div class="tool-block cheat-launch"><strong>5. Outils de triche</strong><p>Modifiez le héros ou créez un lieu à votre position.</p><button id="open-cheats" type="button">Ouvrir Cheat</button></div>',
  );
  $("#field-tools .tool-block p").textContent =
    "Active le tracé puis touche la carte pour poser au moins 3 sommets. La validation crée des cellules de 15 m × 15 m.";

  function log(message) {
    const item = document.createElement("li");
    item.textContent = now().toLocaleTimeString("fr-FR") + " — " + message;
    ui.log.prepend(item);
  }
  function updateRelayMessages(messages) {
    relayInboxButton.textContent = `Courrier (${messages.length})`;
    relayInboxButton.title = messages.length
      ? messages.at(-1).text
      : "Aucun message reçu";
  }
  return {
    ui,
    royalMessengerNotice,
    ghostReturnNotice,
    heatmapControl,
    travelRewardLayer,
    gpsAccuracyStatus,
    log,
    updateRelayMessages,
  };
}
