import { createCampInstallationController } from "./controllers/camp-installation-controller.js";
import { createExceptionalExpeditionController } from "./controllers/exceptional-expedition-controller.js";
import { createExteriorSearchController } from "./controllers/exterior-search-controller.js";
import { createLocationInteractionPolicy } from "./core/location-interaction-policy.js";
import { createEncounterController } from "./controllers/encounter-controller.js";
import { createLocationFlowController } from "./controllers/location-flow-controller.js";
import { createApplicationRenderController } from "./controllers/application-render-controller.js";
import {
  isManagementOpen as managementOpen,
  renderGpsAccuracySummary as showGpsAccuracySummary,
} from "./ui/world-status-view.js";
import { createAppShellView } from "./ui/app-shell-view.js";
import { createAppNavigationController } from "./controllers/app-navigation-controller.js";

import {
  createGameSession,
  createSessionContext,
  resetGameSession,
  adoptSessionGame,
} from "./session/game-session.js";
import { createGameStartController } from "./controllers/game-start-controller.js";
import { createWorldSetupController } from "./controllers/world-setup-controller.js";
import { createGameToolsController } from "./controllers/game-tools-controller.js";
import { loadData } from "./game-data-loader.js";
import {
  simulationPositions,
  simulationStartPosition,
  descriptions,
} from "./core/simulation-config.js";
import { createHeroAbilityController } from "./controllers/hero-ability-controller.js";
import { formatCooldown } from "./ui/cooldown-format.js";
import { createQuestController } from "./controllers/quest-controller.js";
import { createScenarioWorldController } from "./controllers/scenario-world-controller.js";
import { createQuestDebugView } from "./ui/quest-debug-view.js";

import { createPlayerInterfaceController } from "./controllers/player-interface-controller.js";
import { createPlayerInteractionController } from "./controllers/player-interaction-controller.js";
import { createMultiplayerController } from "./controllers/multiplayer-controller.js";
import { createCommandFeedbackView } from "./ui/command-feedback-view.js";
import { createMapInteractionController } from "./controllers/map-interaction-controller.js";
import { createGpsController } from "./controllers/gps-controller.js";
import { createMapController } from "./controllers/map-controller.js";
import { createPositionController } from "./controllers/position-controller.js";
import { createLocationMapModel } from "./controllers/location-map-model.js";
import { createMapLayerModel } from "./controllers/map-layer-model.js";
import { createLocationLogisticsController } from "./controllers/location-logistics-controller.js";
import { createRelayController } from "./controllers/relay-controller.js";
import { createLocationActionController } from "./controllers/location-action-controller.js";
import { createScenarioActionController } from "./controllers/scenario-action-controller.js";
import { createLocationController } from "./controllers/location-controller.js";

import { createBattleController } from "./controllers/battle-controller.js";
import { createDialogueController } from "./controllers/dialogue-controller.js";
/**
 * Contrôleur navigateur du prototype.
 *
 * Ce module relie le moteur, les adaptateurs du téléphone et les vues. Les règles
 * de jeu doivent rester dans `core/`; les fonctions ci-dessous ne font que
 * traduire des événements techniques ou des intentions d'interface.
 */

import { InteractionEngine } from "./core/interaction-engine.js";

import { distanceMeters } from "./core/geo.js";
import { FieldTestSession } from "./core/field-test-session.js";

import { PlayAreaPresence } from "./core/play-area-presence.js";

import { SetupPlacementService } from "./core/setup-placement-service.js";
import { GpsAccuracyLog } from "./core/gps-accuracy-log.js";
import { loadFieldState, saveFieldState } from "./field-state-storage.js";

import { DeviceAlerts } from "./device-alerts.js";
import { ScreenAwake } from "./wake-lock.js";
import { closeSheet } from "./ui/bottom-sheet.js";

import { GameSetupView } from "./ui/game-setup-view.js";

import { CheatService } from "./core/cheat-service.js";
import { HeroTraceService } from "./core/hero-trace-service.js";

import { AutonomousGroupDetectionService } from "./core/autonomous-group-detection-service.js";
import { createQuestHud } from "./ui/quest-hud.js";
import { createDebugPauseControl } from "./ui/debug-pause-control.js";

// Initialisation de l'interface et des couches persistantes de la page.
const $ = (selector) => document.querySelector(selector);
document.addEventListener(
  "battle-loot-collect",
  async () => await battles.collectLoot(),
);
let pendingMainRender = false;
let pendingWorldRender = false;
const debugPauseControl = createDebugPauseControl({
  onResume: () => {
    const refreshMain = pendingMainRender;
    const refreshWorld = pendingWorldRender;
    pendingMainRender = pendingWorldRender = false;
    if (refreshMain) render();
    else if (refreshWorld) renderWorld();
    battles.resume();
  },
});
const questHud = createQuestHud($("#map-view"));

const appShell = createAppShellView({
  document,
  pauseElement: debugPauseControl.element,
  getMapLayers: () => worldMap.layers,
  onChange: render,
  onRelay: openRelayInbox,
});
const {
  ui,
  royalMessengerNotice,
  ghostReturnNotice,
  heatmapControl,
  travelRewardLayer,
  gpsAccuracyStatus,
} = appShell;
const setupView = new GameSetupView(ui.setup, {
  onSimulationStart: () => start(),
});
setupView.initialize();
// Contexte de la partie active ; les catalogues restent partagés.
const session = createGameSession();
let data;
const field = new FieldTestSession({ minimumQuestDistanceMeters: 300 });
const cheatService = new CheatService();
const autonomousGroupDetectionService = new AutonomousGroupDetectionService({
  distanceFn: (first, second) =>
    session.mode === "gps"
      ? distanceMeters(first, second)
      : Math.hypot(
          (first.latitude ?? first[0]) - (second.latitude ?? second[0]),
          (first.longitude ?? first[1]) - (second.longitude ?? second[1]),
        ),
});
const heroTraceService = new HeroTraceService();
const setupPlacementService = new SetupPlacementService({
  distanceFn: (first, second) =>
    session.mode === "gps"
      ? distanceMeters(first, second)
      : Math.hypot(
          first.latitude - second.latitude,
          first.longitude - second.longitude,
        ),
});
const savedFieldState = loadFieldState();
const gpsAccuracyLog = new GpsAccuracyLog(
  savedFieldState?.gpsAccuracyLog ?? {},
);
const playAreaPresence = new PlayAreaPresence(null, { confirmations: 2 });
const deviceAlerts = new DeviceAlerts();
const screenAwake = new ScreenAwake({
  onChange: (active) => {
    if (session.game)
      logTest(
        active
          ? "Écran maintenu actif."
          : "Maintien d'écran indisponible ou suspendu.",
      );
  },
});
// Chargement des catalogues puis création d'une partie à partir du setup.

const scenarioWorld = createScenarioWorldController({
  getSession: () => ({
    game: session.game,
    hero: session.hero,
    mode: session.mode,
    localPlayerId: session.localPlayerId,
    positioning,
    validatedPlayArea: session.validatedPlayArea,
    playAreaGrid: session.playAreaGrid,
    enabledGpsLocationIds: session.enabledGpsLocationIds,
    field,
  }),
  asGps,
  distance,
  positionFor,
  moveLocation,
  setupPlacementService,
  rebuildLocationEngine,
  persistFieldState,
  resetInteractions: () => {
    session.interactionEngine = new InteractionEngine({
      locations: session.game.locations,
      enemyResolver: resolveLocationEnemy,
    });
  },
  showSearchHeatmap: () => {
    worldMap.layers.heatmapVisible = true;
    const toggle = $("#toggle-heatmap");
    toggle.disabled = false;
    toggle.textContent = "Masquer la heatmap";
  },
  onProgress: async (progress) => await quests.applyQuestFeedback(progress),
  onPlaced: () => quests.clearPlacement(),
  onChange: () => render(),
  onMessage: (message) => {
    session.locationMessage = message;
  },
  selectLocation,
  logTest,
  deviceAlerts,
});
const quests = createQuestController({
  getSession: () => ({
    game: session.game,
    hero: session.hero,
    mode: session.mode,
    localPlayerId: session.localPlayerId,
    positioning,
    enabledGpsLocationIds: session.enabledGpsLocationIds,
    activeAdventureId: session.activeAdventureId,
    multiplayer,
    selectedLocationId: locations.selectedId,
  }),
  world: scenarioWorld,
  elements: {
    journal: ui.quests,
    hud: questHud,
    notice: royalMessengerNotice,
    button: $('[data-view="quests"]'),
    sheet: ui.sheet,
  },
  asGps,
  distance,
  positionFor,
  rangesFor,
  rebuildLocationEngine,
  onChange: () => render(),
  onMessage: (message) => {
    session.locationMessage = message;
  },
  logTest,
  deviceAlerts,
  showProgressReward,
  openScenario: (narrations) => dialogues.openScenario(narrations),
  selectScenarioChoice: async (id) => await dialogues.selectScenarioChoice(id),
  focusLocation: (id) => {
    const position = positionFor(id);
    if (position) worldMap.view.focus(position);
  },
  selectLocation,
  showLocationOnMap,
  switchView,
  closeGroupSheet: () => closeSheet(ui.sheet),
  closeGameMenu,
  bootstrap: bootstrapAuthoritativeGame,
});
createQuestDebugView({
  element: $("#dev-quest-select"),
  launchButton: $("#start-dev-quest"),
  onLaunch: quests.startDevQuest,
});
const commandFeedback = createCommandFeedbackView({
  element: travelRewardLayer,
  alerts: deviceAlerts,
});
const multiplayer = createMultiplayerController({
  commandFeedback,
  lobbyElement: ui.lobby,
  getSession: () => ({
    game: session.game,
    mode: session.mode,
    locationPositions: positioning.locationPositions,
    ready: Boolean(session.game && worldMap.view),
  }),
  adoptGame: adoptServerGame,
  rebuildWorld: rebuildNetworkWorld,
  onRender: renderNetworkWorld,
  onPositions: () => worldMap.view?.setAlliedHeroes(playerMapIntel()),
  onQrLocation: (locationId) => selectLocation(locationId),
  onResume: () => {
    if (multiplayer.resuming && session.gpsSetupActive) {
      session.enabledGpsLocationIds = null;
      session.manualSetupPlacements.clear();
      session.capitalPlaced = true;
      finishGameStart();
    }
  },
  onSolo: () => {
    $("#game-session-code").hidden = true;
    ui.lobby.hidden = true;
    ui.setup.hidden = false;
    setupView.showPage(1);
  },
  onLaunch: (launch, lobby) => {
    $("#game-session-code strong").textContent = lobby.code;
    $("#game-session-code").hidden = false;
    if (data) start(launch);
    else $("#lobby-status").textContent = "Chargement du monde…";
  },
  onSaved: (notice) => {
    quests.reset();
    gps.reset();
    battles.reset();
    playerInteractions.reset();
    playerInterface.reset();
    exteriorSearch.reset();
    exceptionalExpeditions.reset();
    campInstallation.reset();
    heroAbilities.reset();
    dialogues.reset();
    logistics.reset();
    relay.reset();
    worldMap.reset();
    locations.reset();
    locationActions.reset();
    mapInteractions.reset();
    positioning.reset();
    screenAwake.stop();
    resetGameSession(session);
    playAreaPresence.setPlayArea(null);
    closeSheet(ui.sheet);
    window.alert(notice?.message ?? "La partie a été sauvegardée.");
    ui.game.hidden = true;
    ui.lobby.hidden = false;
  },
  onUnavailable: (error) => {
    $("#choose-multiplayer").disabled = true;
    $("#lobby-status").textContent = error.message;
  },
  onLog: logTest,
});

const worldMap = createMapController({
  element: $("#map"),
  getSession: () => ({
    game: session.game,
    hero: session.hero,
    playerId: session.localPlayerId,
    mode: session.mode,
    position: positioning.displayPosition,
    setupActive: session.gpsSetupActive,
  }),
  isPaused: () => debugPauseControl.isPaused,
  onDeferredRender: () => {
    pendingMainRender = true;
  },
  onFollowState: ({ icon, label, mode: followMode }) => {
    ui.recenter.textContent = icon;
    ui.recenter.setAttribute("aria-label", label);
    ui.recenter.title = label;
    ui.recenter.dataset.followMode = followMode;
  },
});
const gps = createGpsController({
  accuracyLog: gpsAccuracyLog,
  onPosition: applyPosition,
  onHeading: (heading) => worldMap.setHeading(heading),
  onFirstFix: (position) => {
    if (!debugPauseControl.isPaused && !session.gpsSetupActive)
      worldMap.view?.focus(position);
  },
  onSample: persistFieldState,
  onStatus: (message) => {
    ui.gpsStatus.textContent = message;
  },
  onAccuracySummary: renderGpsAccuracySummary,
  onLog: logTest,
});
const heroAbilities = createHeroAbilityController({
  getSession: () => ({
    game: session.game,
    hero: session.hero,
    mode: session.mode,
    localPlayerId: session.localPlayerId,
    positioning,
    playAreaGrid: session.playAreaGrid,
    battle: battles.active,
  }),
  powerNav: $(".map-power-nav"),
  mapElement: $("#map-view"),
  targeting: {
    get mode() {
      return mapInteractions.mode;
    },
    set mode(value) {
      mapInteractions.mode = value;
    },
  },
  asGps,
  distance,
  worldDistance,
  isLocationEnabled: scenarioWorld.isLocationEnabled,
  positionFor,
  baseRangesFor,
  rebuildLocationEngine,
  persistFieldState,
  selectLocation,
  switchView,
  beginAutonomousBattle,
  onChange: () => render(),
  logTest,
  deviceAlerts,
  focusAlert: (position) => {
    worldMap.view.focus(position);
    worldMap.view.showTemporaryAlert(position);
  },
});
const positioning = createPositionController({
  onDisplayPosition: (...args) => worldMap.displayPosition(...args),
  getSession: () => ({
    game: session.game,
    hero: session.hero,
    playerId: session.localPlayerId,
    mode: session.mode,
    setupActive: session.gpsSetupActive,
    authoritative: multiplayer.active,
    client: multiplayer.active ? multiplayer.client : null,
    heading: gps.heading,
    field,
    playAreaPresence,
    grid: session.playAreaGrid,
    battle: battles.active,
  }),
  heroTraceService,
  heroConcealmentService: heroAbilities.concealment,
  mappedLocations,
  isLocationEnabled: scenarioWorld.isLocationEnabled,
  positionFor,
  radiusFor,
  distance,
  asGps,
  onTravelReward: showTravelReward,
  onWatchEvents: heroAbilities.handleWatchBeaconEvents,
  onAmbushCancelled: heroAbilities.cancelAmbush,
  onFollow: (position) => worldMap.follow(position),
  onChange: (...args) => render(...args),
  onAreaEvent: (kind) => deviceAlerts.notify(kind),
  onFieldQuest: (quest) => {
    ui.questStatus.textContent = `${Math.round(quest.distanceMeters)} / 300 m ${quest.completed ? "· objectif atteint" : ""}`;
    ui.questPlace.disabled = !quest.completed;
  },
  onScenarioPlacements: quests.handleScenarioPositionUpdates,
  onPersist: persistFieldState,
  onQuestSearch: scenarioWorld.syncEvacuationCampSearch,
  onLocationEvent: handleLocationEvent,
  onMessage: (message) => {
    session.locationMessage = message;
  },
  onLog: logTest,
});
const locationMapModel = createLocationMapModel({
  getSession: () => ({
    game: session.game,
    hero: session.hero,
    playerId: session.localPlayerId,
    data,
    position: positioning.position,
  }),
  isLocationEnabled: scenarioWorld.isLocationEnabled,
  positionFor,
  distance,
  rangesFor,
  baseRangesFor,
  descriptions,
});
const mapLayers = createMapLayerModel({
  getSession: () => ({
    game: session.game,
    hero: session.hero,
    playerId: session.localPlayerId,
    mode: session.mode,
    position: positioning.position,
    traceVisibility: worldMap.layers.traceVisibility,
  }),
  autonomousGroupDetectionService,
  asGps,
  mappedLocations,
  visibleQuestTraces: scenarioWorld.visibleQuestTraces,
});
function mappedLocations(...args) {
  return locationMapModel.locations(...args);
}

function worldDistance(...args) {
  return mapLayers.distance(...args);
}
async function applyPosition(position) {
  return await positioning.apply(position);
}
function rebuildLocationEngine() {
  return positioning.rebuild();
}

const mapInteractions = createMapInteractionController({
  getSession: () => ({
    mode: session.mode,
    field,
    tasks: session.manualSetupPlacements,
    playArea: session.validatedPlayArea,
    enabledLocationIds: session.enabledGpsLocationIds,
    setupActive: session.gpsSetupActive,
    game: session.game,
  }),
  asGps,
  activateDivinationAt: (...args) =>
    heroAbilities.activateDivinationAt(...args),
  moveLocation,
  addSetupAutonomousGroup,
  renderGpsLocationButtons,
  updateSetupCompletion,
  onChange: () => render(),
  onLog: logTest,
  onExclusionReady: (ready) => {
    $("#gps-finish-exclusion").disabled = !ready;
  },
  onAreaStatus: (message) => {
    ui.gpsAreaStatus.textContent = message;
  },
  onCapitalPlaced: () => {
    session.capitalPlaced = true;
  },
  onSetupReady: () => {
    ui.finishGpsSetup.disabled = false;
  },
  isSheetOpen: () => !ui.sheet.hidden,
  onCloseLocation: () => {
    locations.selectedId = locations.garrisonId = null;
    closeSheet(ui.sheet);
  },
  applyPosition,
});

const locations = createLocationController({
  sheet: ui.sheet,
  worldContent: ui.worldContent,
  getSession: () => ({
    game: session.game,
    hero: session.hero,
    playerId: session.localPlayerId,
    data,
    authoritative: multiplayer.authoritative,
    client: multiplayer.active ? multiplayer.client : null,
  }),
  mappedLocations,
  descriptions,
  positionFor,
  switchView,
  focusMap: (position) => worldMap.view.focus(position),
  onAction: runAction,
  onChange: () => render(),
  applyAuthoritativeGameState,
  isPaused: () => debugPauseControl.isPaused,
  isLandscape: () => window.matchMedia("(orientation: landscape)").matches,
  isWorldVisible: () => $("#world-view").classList.contains("is-active"),
  onDeferredRender: () => {
    pendingWorldRender = true;
  },
});
function selectLocation(...args) {
  return locations.select(...args);
}

function showLocationOnMap(...args) {
  return locations.showOnMap(...args);
}

function openMarket(...args) {
  return locations.openMarket(...args);
}
function refreshOpenResourceViews() {
  return locations.refreshResources();
}
function renderWorld() {
  return locations.renderWorld();
}

const battles = createBattleController({
  element: ui.battle,
  getSession: () => ({
    game: session.game,
    heroId: session.hero?.id,
    playerId: session.localPlayerId,
    multiplayer: multiplayer.active,
    authoritative: multiplayer.authoritative,
    isHost: multiplayer.isHost,
    client: multiplayer.active ? multiplayer.client : null,
  }),
  applyServerState: applyAuthoritativeGameState,
  onEnter: () => {
    closeSheet(ui.sheet);
    switchView("battle");
  },
  onReturnToMap: () => switchView("map"),
  onNavigationLocked: setBattleNavigationLocked,
  onResolved: handleBattleResolved,
  onChange: () => render(),
  onPublish: queueMultiplayerWorldPublish,
  onAttackDenied: (locationId) => {
    session.locationMessage = "Attaque interdite par la relation avec ce lieu.";
    selectLocation(locationId);
  },
  onLog: logTest,
  isPaused: () => debugPauseControl.isPaused,
});

const dialogues = createDialogueController({
  element: $("#dialogue-layer"),
  getSession: () => ({
    game: session.game,
    heroId: session.hero?.id,
    playerId: session.localPlayerId,
    position: positioning.position ? asGps(positioning.position) : null,
    locationId: locations.selectedId,
  }),
  beforeOpen: () => closeSheet(ui.sheet),
  prepareInteraction: scenarioWorld.prepareQuestInteraction,
  onQuestProgress: async (progress, { expandHud = false } = {}) => {
    if (expandHud) quests.expandHud();
    await quests.applyQuestFeedback(progress);
    return session.locationMessage;
  },
  onQuestChoice: quests.applyQuestChoiceFeedback,
  onQuestAccepted: quests.onQuestAccepted,
  onMessage: (message) => {
    session.locationMessage = message;
  },
  onChange: () => render(),
  onClose: handleDialogueClosed,
});

const logistics = createLocationLogisticsController({
  element: ui.sheet,
  getSession: () => ({
    game: session.game,
    hero: session.hero,
    playerId: session.localPlayerId,
    data,
    authoritative: multiplayer.authoritative,
    client: multiplayer.active ? multiplayer.client : null,
  }),
  applyServerState: applyAuthoritativeGameState,
  onChange: () => render(),
});
const relay = createRelayController({
  element: ui.sheet,
  getSession: () => ({
    game: session.game,
    hero: session.hero,
    playerId: session.localPlayerId,
    authoritative: multiplayer.authoritative,
    client: multiplayer.active ? multiplayer.client : null,
  }),
  applyServerState: applyAuthoritativeGameState,
  beforeOpen: ({ inbox }) => {
    closeGameMenu();
    if (inbox) locations.selectedId = null;
  },
});

const playerInterface = createPlayerInterfaceController({
  elements: {
    hero: ui.heroContent,
    army: ui.armyContent,
    inventory: ui.inventory,
    rewardLayer: travelRewardLayer,
    ghostNotice: ghostReturnNotice,
    notices: { hero: $('[data-view="hero"]'), army: $('[data-view="army"]') },
  },
  getSession: () => ({ game: session.game, hero: session.hero, data }),
  isInventoryActive: () => $("#inventory-view").classList.contains("is-active"),
  formatCooldown,
  onChange: () => render(),
  log: logTest,
  alerts: deviceAlerts,
  classActions: {
    divination: heroAbilities.useDivination,
    "astral-travel": heroAbilities.useAstralTravel,
    "watch-beacon": heroAbilities.placeWatchBeacon,
  },
});
const campInstallation = createCampInstallationController({
  host: $("#map-view"),
  getSession: () => ({ game: session.game, hero: session.hero }),
  onChange: () => render(),
});
const exceptionalExpeditions = createExceptionalExpeditionController({
  host: $("#map-view"),
  getSession: () => ({ game: session.game, hero: session.hero }),
  onChange: () => render(),
});
const exteriorSearch = createExteriorSearchController({
  host: $("#map-view"),
  getSession: () => ({ game: session.game, hero: session.hero }),
  onChange: () => render(),
  log: logTest,
});
const playerInteractions = createPlayerInteractionController({
  commandFeedback,
  element: ui.sheet,
  getSession: () => ({
    game: session.game,
    hero: session.hero,
    playerId: session.localPlayerId,
    position: positioning.position,
    active: multiplayer.active,
    positions: multiplayer.positions,
    authoritative: multiplayer.authoritative,
    client: multiplayer.client,
  }),
  asGps,
  worldDistance,
  applyServerState: applyAuthoritativeGameState,
  activateBattle: (battle) => battles.activate(battle),
  onLog: logTest,
});

const scenarioActions = createScenarioActionController({
  getSession: () => ({ game: session.game }),
  selectChoice: async (id) => await dialogues.selectScenarioChoice(id),
  openDialogue: () => dialogues.openScenario([]),
  openBattle: async () => await openBattle(),
  prepareInteraction: scenarioWorld.prepareQuestInteraction,
  onQuestFeedback: quests.applyQuestFeedback,
  onMessage: (message) => {
    session.locationMessage = message;
  },
  beginAutonomousBattle,
});
const locationActions = createLocationActionController({
  getSession: () => ({
    game: session.game,
    hero: session.hero,
    playerId: session.localPlayerId,
    locationId: locations.selectedId,
  }),
  handleScenarioAction: async (action, id) =>
    await scenarioActions.run(action, id),
  getAstralContext: (location) => ({
    baseRadius: baseRangesFor(location).interactionRadius,
    distance: distance(positioning.position, positionFor(location.id)),
  }),
  openDialogue: async (...args) => await dialogues.openLocation(...args),
  onReachChanged: rebuildLocationEngine,
  onChange: () => render(),
  onMessage: (message) => {
    session.locationMessage = message;
  },
  onLog: logTest,
  onCapture: () => deviceAlerts.notify("notice"),
  onBattle: async () => await openBattle(),
  openMarket,
  openTradingConvoyManager,
  openProspectingManager,
  openRelayMessage,
  executeLocationCommand,
  renderWorld,
  selectLocation,
  afterAction: finishLocationAction,
});

const navigation = createAppNavigationController({
  document,
  ui,
  isBattleActive: () => battles.active?.status === "active",
  onMap: () => worldMap.invalidateSize(),
  onInventory: renderInventory,
  onWorld: renderWorld,
  hasSavedSession: () => Boolean(multiplayer.client?.hasStoredSession()),
  onResume: () => multiplayer.resume(),
  onNewGame: () => multiplayer.showNewGame(),
  onLoadGame: (onLoaded) => multiplayer.showSavedGames(onLoaded),
});

const interactionPolicy = createLocationInteractionPolicy(session);
const encounters = createEncounterController({
  session,
  ui,
  quests,
  locations,
  visibleAutonomousGroups,
  beginAutonomousBattle,
  openBattle,
  isManagementOpen,
  selectLocation,
});
const locationFlow = createLocationFlowController({
  session,
  quests,
  locations,
  positionFor,
  worldMap,
  ui,
  switchView,
  selectLocation,
  renderWorld,
  render,
  openBattle,
  rebuildLocationEngine,
  resolveLocationEnemy,
});
const applicationRender = createApplicationRenderController({
  exteriorSearch,
  exceptionalExpeditions,
  campInstallation,
  session,
  appShell,
  relayMessages,
  isManagementOpen,
  refreshOpenResourceViews,
  debugPauseControl,
  deferRender: () => {
    pendingMainRender = true;
  },
  worldMap,
  scenarioWorld,
  multiplayer,
  queueMultiplayerWorldPublish,
  mapLayers,
  gps,
  positioning,
  field,
  playerMapIntel,
  playerInterface,
  heroAbilities,
  quests,
  ui,
  $,
  renderWorld,
});
function baseRangesFor(...args) {
  return interactionPolicy.baseRangesFor(...args);
}
function rangesFor(...args) {
  return interactionPolicy.rangesFor(...args);
}
function resolveLocationEnemy(...args) {
  return interactionPolicy.resolveLocationEnemy(...args);
}
function selectAutonomousGroup(...args) {
  return encounters.selectAutonomousGroup(...args);
}
function handleLocationEvent(...args) {
  return encounters.handleLocationEvent(...args);
}
function finishLocationAction(...args) {
  return locationFlow.finishLocationAction(...args);
}
function handleDialogueClosed(...args) {
  return locationFlow.handleDialogueClosed(...args);
}
function renderGpsAccuracySummary() {
  showGpsAccuracySummary({ gpsAccuracyLog, gpsAccuracyStatus });
}
function isManagementOpen() {
  return managementOpen({ ui, document });
}
function render(...args) {
  return applicationRender.render(...args);
}

// Dépendances vivantes : les contrôleurs voient aussi les parties restaurées.
const startupContext = createSessionContext(session, {
  resetSession: () => {
    resetGameSession(session);
    playAreaPresence.setPlayArea(null);
  },
  $,
  applyAuthoritativeGameState,
  applyPosition,
  applyReceivedMultiplayerWorld,
  applyWorldSetup,
  asGps,
  battles,
  cheatService,
  get data() {
    return data;
  },
  set data(value) {
    data = value;
  },
  deviceAlerts,
  dialogues,
  field,
  finishGameStart,
  gps,
  handleMapClick,
  heatmapControl,
  heroAbilities,
  initializePlayAreaGrid,
  locationActions,
  locations,
  logTest,
  logistics,
  mapInteractions,
  moveLocation,
  multiplayer,
  openBattle,
  persistFieldState,
  playAreaPresence,
  playerInteractions,
  playerInterface,
  playerMapIntel,
  positionFor,
  positioning,
  quests,
  rebuildLocationEngine,
  relay,
  render,
  renderGpsLocationButtons,
  resolveLocationEnemy,

  scenarioWorld,
  screenAwake,
  selectAutonomousGroup,
  selectLocation,
  selectPlayerInteraction,
  setupPlacementService,
  setupView,
  simulationPositions,
  simulationStartPosition,
  startGps,
  ui,
  validatePlayArea,
  worldMap,
});
const gameStart = createGameStartController(startupContext);
const worldSetup = createWorldSetupController(startupContext);
const gameTools = createGameToolsController(startupContext);

function closeGameMenu() {
  gameTools.closeGameMenu();
}

function start(...args) {
  return gameStart.start(...args);
}

function finishGameStart(...args) {
  return gameStart.finishGameStart(...args);
}

// Adaptateurs du téléphone : GPS, précision et orientation.
function startGps() {
  return gps.start();
}

// Conversion des coordonnées et politiques de portée communes aux deux modes.
function distance(a, b) {
  return session.mode === "gps"
    ? distanceMeters(a, b)
    : Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function asGps(position) {
  return Array.isArray(position)
    ? { latitude: position[0], longitude: position[1] }
    : { latitude: position.latitude, longitude: position.longitude };
}
function positionFor(id) {
  return positioning.locationPositions.get(id);
}

function radiusFor(location) {
  return rangesFor(location).interactionRadius;
}

function applyReceivedMultiplayerWorld(...args) {
  return multiplayer.applyWorld(...args);
}
function bootstrapAuthoritativeGame() {
  return multiplayer.bootstrap();
}
function applyAuthoritativeGameState(...args) {
  return multiplayer.applyGame(...args);
}
function queueMultiplayerWorldPublish() {
  return multiplayer.queuePublish();
}

function adoptServerGame(restored) {
  adoptSessionGame(session, restored);
  positioning.syncOfficialPosition();
}

function rebuildNetworkWorld() {
  session.interactionEngine = new InteractionEngine({
    locations: session.game.locations,
    enemyResolver: resolveLocationEnemy,
  });
  rebuildLocationEngine();
  return battles.sync();
}
function renderNetworkWorld({ authoritative, battleViewChanged }) {
  render({ background: true });
  if (authoritative) {
    if (battles.active && !ui.battle.hidden && battleViewChanged)
      battles.render();
    socialView().sync();
  }
}
// Interactions avec les groupes autonomes projetés par le serveur.

function visibleAutonomousGroups() {
  return mapLayers.groups();
}
async function beginAutonomousBattle(group, options = {}) {
  return await battles.openAutonomous(group, {
    ...options,
    heroIds: nearbyMultiplayerHeroIds(),
  });
}

// Raccord des récompenses affichées par l’interface du joueur.
function showTravelReward(travel) {
  return playerInterface.showTravelReward(travel);
}
function showProgressReward(reward) {
  playerInterface.showReward(reward);
}

// Placement de setup et interactions issues de la carte.
function handleMapClick(position) {
  return mapInteractions.click(position);
}
function moveLocation(...args) {
  return worldSetup.moveLocation(...args);
}

function addSetupAutonomousGroup(...args) {
  return worldSetup.addSetupAutonomousGroup(...args);
}
function applyWorldSetup(...args) {
  return worldSetup.applyWorldSetup(...args);
}
function renderGpsLocationButtons(...args) {
  return worldSetup.renderGpsLocationButtons(...args);
}
function updateSetupCompletion(...args) {
  return worldSetup.updateSetupCompletion(...args);
}
function validatePlayArea(...args) {
  return worldSetup.validatePlayArea(...args);
}
function initializePlayAreaGrid(...args) {
  return worldSetup.initializePlayAreaGrid(...args);
}

function runAction(...args) {
  return locationActions.run(...args);
}

function openProspectingManager(...args) {
  return logistics.openProspecting(...args);
}
function openTradingConvoyManager(...args) {
  return logistics.openConvoys(...args);
}

// Cycle de vie de la bataille : création, rendu, résolution et retour au monde.
async function openBattle(options = {}) {
  return await battles.openLocation({
    ...options,
    locationId: session.currentEncounter?.locationId ?? locations.selectedId,
    position: asGps(positioning.position),
    defenderHeroId: session.enemyHero?.id,
  });
}

function nearbyMultiplayerHeroIds() {
  return playerInteractions.nearbyHeroIds();
}
function playerMapIntel() {
  return playerInteractions.mapIntel();
}
function selectPlayerInteraction(id) {
  return playerInteractions.select(id);
}
function socialView() {
  return playerInteractions.social();
}

function handleBattleResolved(...args) {
  return locationFlow.handleBattleResolved(...args);
}

// Projection des données persistantes vers les vues et le stockage terrain.
function persistFieldState() {
  saveFieldState({ mode: session.mode, gpsAccuracyLog });
}

// Rendus principaux. Aucun de ces helpers ne doit décider d'une règle métier.

function logTest(message) {
  appShell.log(message);
}
function setBattleNavigationLocked(locked) {
  navigation.setBattleLocked(locked);
}
function switchView(name) {
  return navigation.switchView(name);
}

function renderInventory() {
  playerInterface.renderInventory();
}

ui.create.disabled = true;
ui.create.onclick = () => start();
ui.recenter.onclick = () => worldMap.recenter();
gameTools.initialize();
navigation.initialize();

document.addEventListener("visibilitychange", () => {
  if (!session.game) return;
  if (document.visibilityState === "hidden") {
    persistFieldState();
    logTest(
      "Application suspendue : le suivi GPS peut être interrompu par iOS.",
    );
  } else {
    logTest("Application de nouveau active : reprise du suivi GPS.");
    if (multiplayer.active)
      void multiplayer.client
        .resume()
        .catch((error) =>
          logTest(`Reconnexion non confirmée : ${error.message}`),
        );
    if (session.mode === "gps") gps.resume();
  }
});
window.addEventListener("resize", () => {
  if (worldMap.view && $("#map-view").classList.contains("is-active")) {
    worldMap.invalidateSize();
    if (
      locations.selectedId &&
      !locations.garrisonId &&
      !ui.sheet.hidden &&
      !isManagementOpen()
    )
      selectLocation(locations.selectedId);
  }
  if (battles.active && $("#battle-view").classList.contains("is-active"))
    battles.render();
});

// Le cache hors ligne attend l’entrée dans les menus pour alléger l’accueil.
if ("serviceWorker" in navigator) {
  const registerWorker = () =>
    navigator.serviceWorker
      .register("../service-worker.js", { scope: "../" })
      .catch(() => {});
  ui.enterApp.addEventListener("click", registerWorker, { once: true });
}

export async function initializeGameData() {
  data ??= await loadData();
  setupView.setHeroClasses(data.heroClasses);
  multiplayer.setHeroClasses(data.heroClasses);
  ui.status.textContent = "";
  ui.create.disabled = false;
  if (multiplayer.pendingLaunch) start(multiplayer.pendingLaunch);
}

function openRelayMessage(...args) {
  return relay.openCompose(...args);
}

function executeLocationCommand(...args) {
  return multiplayer.execute(...args);
}

function relayMessages() {
  return relay.messages();
}
function openRelayInbox() {
  return relay.openInbox();
}

multiplayer.initialize();
navigation.refreshSavedSession();
