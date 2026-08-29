/**
 * Contrôleur navigateur du prototype.
 *
 * Ce module relie le moteur, les adaptateurs du téléphone et les vues. Les règles
 * de jeu doivent rester dans `core/`; les fonctions ci-dessous ne font que
 * traduire des événements techniques ou des intentions d'interface.
 */
import { Game } from "./core/game.js";
import { Location } from "./core/location.js";
import { LocationEngine } from "./core/location-engine.js";
import { InteractionEngine } from "./core/interaction-engine.js";
import { LocationRangePolicy } from "./core/location-range-policy.js";
import { distanceMeters } from "./core/geo.js";
import { FieldTestSession } from "./core/field-test-session.js";
import { PlayAreaGrid } from "./core/play-area-grid.js";
import { PlayAreaPresence } from "./core/play-area-presence.js";
import { PlayArea } from "./core/play-area.js";
import {
  SetupPlacementService,
  bearingDegrees,
} from "./core/setup-placement-service.js";
import { GpsAccuracyLog } from "./core/gps-accuracy-log.js";
import { smoothHeading } from "./core/heading.js";
import { GpsTracker } from "./gps.js";
import { OrientationTracker } from "./orientation.js";
import { normalizePosition } from "./position-adapter.js";
import { loadFieldState, saveFieldState } from "./field-state-storage.js";
import { DeviceAlerts } from "./device-alerts.js";
import { ScreenAwake } from "./wake-lock.js";
import { HERO_COMMAND_RANKS, UNIT_RANKS } from "./core/rank-system.js";
import { MapView } from "./ui/map-view.js";
import {
  closeSheet,
  renderLocationSheet,
  renderLocationTab,
} from "./ui/bottom-sheet.js";
import { renderBattleView } from "./ui/battle-view.js";
import { buildLocationIntel } from "./core/location-intel.js";
import { renderLocationDetail, renderWorldDirectory } from "./ui/world-view.js";
import { renderBattleResultView } from "./ui/battle-result-view.js";
import { HeroArmyModifier } from "./core/hero-army-modifier.js";
import {
  createAutomaticHeroChoice,
  GameSetupView,
} from "./ui/game-setup-view.js";
import { renderGarrisonSheet } from "./ui/garrison-sheet.js";
import { renderUnitTypeIcon } from "./ui/unit-icon.js";
import { CheatService } from "./core/cheat-service.js";
import { renderInventoryView } from "./ui/inventory-view.js";
import { bindEquipmentView, renderEquipmentView } from "./ui/equipment-view.js";
import { renderUnitHealthBar } from "./ui/unit-health-bar.js";
import { renderUnitExperienceBar } from "./ui/unit-experience-bar.js";
import { closeDialogueView, renderDialogueView } from "./ui/dialogue-view.js";
import { AutonomousGroupTrace } from "./core/autonomous-group-trace.js";
import { AutonomousGroup } from "./core/autonomous-group.js";
import { AutonomousGroupDetectionService } from "./core/autonomous-group-detection-service.js";
import { HeroConcealmentService } from "./core/hero-concealment-service.js";
import { AmbushService } from "./core/ambush-service.js";
import {
  buildQuestHudModel,
  createQuestHud,
  renderQuestHud,
} from "./ui/quest-hud.js";
import { questPaceProfile } from "./core/quest-pace-profile.js";
import { createDebugPauseControl } from "./ui/debug-pause-control.js";
import { composeScenario } from "./core/scenario-composer.js";
import { ChaosWaveService } from "./core/chaos-wave-service.js";

// Initialisation de l'interface et des couches persistantes de la page.
const $ = (selector) => document.querySelector(selector);
const PLAYTEST_EDITION =
  new URLSearchParams(location.search).get("edition") === "playtest";
if (PLAYTEST_EDITION) {
  document.body.classList.add("playtest-edition");
  const theme = document.createElement("link");
  theme.rel = "stylesheet";
  theme.href = "../playtest/playtest.css";
  document.head.append(theme);
  document.title = "RPG GPS — Survie";
}
document.addEventListener("battle-loot-collect", () => {
  if (!game || !activeBattle || !battleResult?.battleLoot) return;
  const selection = Object.fromEntries(
    battleResult.battleLoot.entries.map((entry) => [
      entry.id,
      entry.allocations?.local ?? 0,
    ]),
  );
  const result = game.collectBattleLoot({
    battleId: activeBattle.id,
    playerId: "local",
    heroId: hero.id,
    selection,
  });
  battleLootMessage = result.success
    ? "Butin transféré dans les bagages."
    : result.reason === "insufficient_slots"
      ? "Les bagages n’ont pas assez de place."
      : `Récupération impossible : ${result.reason}.`;
  if (result.battleLoot) battleResult.battleLoot = result.battleLoot;
  renderBattle();
  render();
});
let pendingMainRender = false;
let pendingBattleRender = false;
let pendingWorldRender = false;
const debugPauseControl = createDebugPauseControl({
  onResume: () => {
    const refreshMain = pendingMainRender;
    const refreshBattle = pendingBattleRender;
    const refreshWorld = pendingWorldRender;
    pendingMainRender = pendingBattleRender = pendingWorldRender = false;
    if (refreshMain) render();
    else if (refreshWorld) renderWorld();
    if (refreshBattle) renderBattle();
  },
});
const questHud = createQuestHud($("#map-view"));
const royalMessengerNotice = document.createElement("aside");
royalMessengerNotice.id = "royal-messenger-notice";
royalMessengerNotice.className = "royal-messenger-notice";
royalMessengerNotice.hidden = true;
$("#game-screen").append(royalMessengerNotice);
const mapChrome = document.createElement("div");
mapChrome.className = "map-chrome";
mapChrome.innerHTML = `<button id="toggle-game-menu" class="portrait-menu-toggle" type="button" aria-expanded="false" aria-controls="landscape-tools">☰ <span>Menu</span></button><aside id="landscape-tools" class="landscape-tools" aria-label="Outils système et développement"><strong>Outils</strong><button id="open-field-tools" type="button"><span aria-hidden="true">⚙</span><small>Terrain</small></button><button id="open-cheat-tools" type="button"><span aria-hidden="true">✦</span><small>Triche</small></button><label class="dev-quest-picker"><small>Quête à tester</small><select id="dev-quest-select" aria-label="Quête à tester"></select></label><button id="start-dev-quest" type="button"><span aria-hidden="true">▶</span><small>Lancer</small></button><button id="close-game-menu" class="landscape-tools__close" type="button">Fermer</button></aside><aside class="map-power-nav" aria-label="Pouvoirs utilisables sur la carte"><strong>Pouvoirs</strong><button type="button" disabled title="Pouvoir à débloquer"><span aria-hidden="true">✧</span><small>Magie</small></button><button type="button" disabled title="Pouvoir à débloquer"><span aria-hidden="true">◈</span><small>Talent</small></button></aside>`;
$("#map-view").append(mapChrome);
$("#landscape-tools").insertBefore(
  debugPauseControl.element,
  $("#close-game-menu"),
);
const battleOrientationPrompt = document.createElement("aside");
battleOrientationPrompt.className = "battle-orientation-prompt";
battleOrientationPrompt.innerHTML =
  '<span aria-hidden="true">↻</span><strong>Tournez votre téléphone</strong><p>La bataille se joue en paysage. Le combat est suspendu.</p>';
$("#battle-view").append(battleOrientationPrompt);
const travelRewardLayer = document.createElement("div");
travelRewardLayer.className = "travel-reward-layer";
travelRewardLayer.setAttribute("aria-live", "polite");
travelRewardLayer.setAttribute("aria-atomic", "true");
$("#game-screen").append(travelRewardLayer);
const progressRewardQueue = [];
let progressRewardActive = false;
document.addEventListener("contextmenu", (event) => {
  if (!event.target.closest("input,textarea,[contenteditable='true']"))
    event.preventDefault();
});
const rankLabel = (ranks, id) =>
  ranks.find((rank) => rank.id === id)?.label ?? id;
const unitHealthBar = (unit) => renderUnitHealthBar(unit);
const ui = {
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
  locationTypeOptions: $("#location-type-options"),
  autonomousTypeOptions: $("#autonomous-type-options"),
  finishGpsSetup: $("#finish-gps-setup"),
};
if (PLAYTEST_EDITION) {
  ui.setup.dataset.edition = "playtest";
  ui.setup.querySelector("h1").textContent = "RPG GPS — Survie";
  ui.setup.querySelector(".eyebrow").textContent = "Partie GPS";
  ui.setup.querySelector("h1 + p").textContent =
    "Placez vos ressources, développez votre camp et survivez aux armées du Chaos.";
  ui.setup.querySelectorAll("fieldset").forEach((field) => {
    field.hidden = true;
  });
  ui.setup.querySelector('input[name="test-mode"][value="gps"]').checked = true;
  ui.create.textContent = "Nouvelle partie";
  $("#gps-setup-panel h2").textContent = "Configurer la zone de jeu";
  $("#gps-setup-panel .gps-area-step p").textContent =
    "Tracez votre zone GPS réelle, puis placez les six lieux nécessaires à la partie.";
  $("#gps-setup-panel .setup-placement-block h3").textContent = "Votre camp";
  $("#finish-gps-setup").textContent = "Commencer l’aventure";
}
document
  .querySelectorAll("#army-view > h2, #inventory-view > h2, #quests-view > h2")
  .forEach((title) => title.remove());
const setupView = new GameSetupView(ui.setup);

// Coordonnées et rayons réservés au mode de simulation à la maison.
const simulationPositions = {
  "fort-nord": [22, 22],
  "royal-capital": [50, 30],
  "village-vert": [60, 50],
  "prospector-battlefield": [74, 65],
  "camp-local": [50, 32],
  "lumber-camp-test": [58, 36],
  "stone-quarry": [27, 72],
  "iron-mine": [66, 74],
  "bandit-camp": [78, 78],
  "enemy-fort": [72, 35],
  "gold-mine": [42, 70],
  "evacuation-camp": [68, 42],
  "supply-fort": [62, 38],
  "opposite-fort": [38, 22],
  "supply-village-north": [56, 30],
  "supply-village-east": [50, 37],
  "supply-village-south": [43, 30],
  "supply-village-west": [50, 22],
  "seditious-village": [70, 55],
  "attacked-convoy": [60, 42],
  "brigand-camp-convoy": [76, 46],
  "requisition-convoy": [58, 34],
  "counsellor-guard-depot": [66, 39],
};
const simulationRadii = {
  "fort-nord": 12,
  "village-vert": 10,
  "camp-local": 9,
  "bandit-camp": 9,
  "enemy-fort": 12,
  "gold-mine": 8,
};
const simulationDetectionRadii = {
  "fort-nord": 24,
  "village-vert": 20,
  "camp-local": 18,
  "bandit-camp": 18,
  "enemy-fort": 24,
  "gold-mine": 16,
};
const simulationStartPosition = [50, 30];
const descriptions = {
  "fort-nord": "Votre refuge frontalier.",
  "village-vert": "Les habitants connaissent les menaces locales.",
  "camp-local": "Votre camp de développement expérimental.",
  "lumber-camp-test": "Un camp spécialisé qui produit du bois.",
  "bandit-camp": "Une zone de combat testable.",
  "enemy-fort": "Un fort ennemi de niveau 3 protégé par une garnison.",
  "gold-mine": "Une mine contenant de l'or.",
  "evacuation-camp": "Un camp royal menacé par l’avancée du Chaos.",
};

// État mutable du contrôleur. L'état métier durable reste détenu par `game`.
let data,
  game,
  hero,
  enemyHero,
  mapView,
  gpsTracker,
  locationEngine,
  interactionEngine,
  rangePolicy,
  activeBattle,
  battleTimer,
  productionTimer,
  chaosWaveTimer;
let mode = "simulation",
  heroPosition,
  gpsAccuracy = null,
  firstGpsFix = true,
  interactionMode = null,
  currentLocationId = null,
  locationMessage = "",
  currentEncounter = null;
let gpsSetupActive = false;
let capitalPlaced = false;
let enabledGpsLocationIds = null;
let manualSetupPlacements = new Map();
let activeGarrisonLocationId = null;
let battleLootMessage = "";
let heroHeading = 0,
  lastCompassAt = 0;
let mapFollowMode = "free";
let pendingScenarioPlacementSlotId = null;
let activeDialogue = null;
let lastReadyQuestActionId = null;
let questHudExpanded = false;
let preparedHeroAmbush = null;
let pendingRoyalMessage = null;
let highlightedQuestOfferId = null;
let firstRoyalMessengerTimer = null;
let pendingRevealedLocationId = null;
let worldMessage = "";
let worldSelectedLocationId = null;
let selectedHeroTrait = null;
let selectedHeroStat = null;
let heroLevelUpWasReady = false;
let expandedArmyUnitId = null;
const worldFilters = { search: "", type: "", owner: "", sort: "distance" };
let battleDragging = false,
  selectedBattleUnitId = null,
  selectedBattlePower = null,
  battleMessage = "",
  battleResolved = false,
  battleResult = null,
  validatedPlayArea = null;
let playAreaGrid = null,
  heatmapVisible = true,
  lastVisitedCellId = null;
const field = new FieldTestSession({ minimumQuestDistanceMeters: 300 });
const cheatService = new CheatService();
const autonomousGroupDetectionService = new AutonomousGroupDetectionService({
  distanceFn: (first, second) =>
    mode === "gps"
      ? distanceMeters(first, second)
      : Math.hypot(
          (first.latitude ?? first[0]) - (second.latitude ?? second[0]),
          (first.longitude ?? first[1]) - (second.longitude ?? second[1]),
        ),
});
const heroConcealmentService = new HeroConcealmentService();
const ambushService = new AmbushService({
  preparationDurationMs: heroConcealmentService.stationaryDurationMs,
});
const concealButton = document.createElement("button");
concealButton.id = "ambush-action";
concealButton.className = "map-power-action conceal-control";
concealButton.type = "button";
concealButton.innerHTML =
  '<span aria-hidden="true">♟</span><small>Embuscade</small>';
concealButton.hidden = true;
$(".map-power-nav").append(concealButton);
concealButton.onclick = launchPreparedAmbush;
const setupPlacementService = new SetupPlacementService({
  distanceFn: (first, second) =>
    mode === "gps"
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
    if (game)
      logTest(
        active
          ? "Écran maintenu actif."
          : "Maintien d'écran indisponible ou suspendu.",
      );
  },
});
const orientationTracker = new OrientationTracker({
  onHeading: ({ heading }) => {
    heroHeading = smoothHeading(heroHeading, heading);
    lastCompassAt = Date.now();
    if (!debugPauseControl.isPaused) mapView?.setHeroHeading(heroHeading);
    else pendingMainRender = true;
  },
  onError: () => {
    if (game) logTest("Boussole indisponible.");
  },
});
const runtimePositions = new Map();
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

// Catalogue de lancement réservé au sélecteur de quêtes du prototype.
const QUEST_SEQUENCE = Object.freeze([
  {
    id: "missing-prospectors",
    title: "Les prospecteurs disparus",
    description: "Retrouvez l’équipe royale disparue près de Valgrise.",
    startPhaseId: "reach-royal-camp",
    phaseIds: [
      "reach-royal-camp",
      "speak-to-camp-chief",
      "follow-first-trace",
      "follow-second-trace",
      "prospectors-battlefield",
      "free-gold-mine",
      "rescue-mine-geologist",
      "return-geologist-to-camp",
      "return-to-capital",
    ],
  },
  {
    id: "royal-camp-evacuation",
    title: "Le camp menacé",
    description: "Défendez le camp royal et évacuez ses habitants.",
    startPhaseId: "prologue-complete",
    phaseIds: [
      "prologue-complete",
      "reach-evacuation-camp",
      "defend-evacuation-camp",
      "prepare-evacuation",
      "return-evacuees-to-capital",
      "second-prologue-complete",
      "evacuation-failed",
    ],
  },
  {
    id: "royal-fort-supply",
    title: "Le ravitaillement",
    description:
      "Collectez puis livrez vingt rations au fortin royal de Rochegarde.",
    startPhaseId: "receive-supply-order",
    phaseIds: [
      "receive-supply-order",
      "collect-village-rations",
      "reach-supply-fort",
      "deliver-fort-rations",
    ],
  },
  {
    id: "royal-gold-convoy",
    title: "Le convoi d’or",
    description:
      "Récupérez la production de la mine royale et échappez aux voleurs.",
    startPhaseId: "receive-gold-convoy-order",
    phaseIds: [
      "receive-gold-convoy-order",
      "collect-royal-gold",
      "escape-gold-thieves",
    ],
  },
  {
    id: "royal-messenger",
    title: "Le Messager",
    description:
      "Portez un message urgent de Rochegarde au fortin opposé avant la fin du délai.",
    startPhaseId: "receive-fort-message",
    phaseIds: [
      "receive-fort-message",
      "deliver-fort-message",
      "messenger-failed",
    ],
  },
  {
    id: "repression",
    title: "La Répression",
    description:
      "Rejoignez un village assiégé, décidez de son sort et enquêtez éventuellement sur le convoi attaqué.",
    startPhaseId: "locate-village",
    phaseIds: [
      "locate-village",
      "village-arrival",
      "arrival",
      "negotiation",
      "royal-assault",
      "village-defense",
      "village-fall",
      "return-journey",
      "convoy-trace-one",
      "convoy-trace-two",
      "brigand-camp",
      "brigand-battle",
      "treasure-choice",
      "return-after-investigation",
    ],
  },
  {
    id: "granaries-of-the-king",
    title: "Les greniers du roi",
    description:
      "Résolvez la réquisition de Haut-Pré et enquêtez éventuellement sur le convoi des réserves.",
    startPhaseId: "granaries-arrival",
    phaseIds: [
      "granaries-arrival",
      "granaries-negotiation",
      "granaries-guard-assault",
      "granaries-village-defense",
      "granaries-village-fall",
      "granaries-return-journey",
      "granaries-secret-route",
      "granaries-return-after-investigation",
    ],
  },
]);
const questSelect = $("#dev-quest-select");
questSelect.innerHTML = QUEST_SEQUENCE.map(
  (quest) => `<option value="${quest.id}">${quest.title}</option>`,
).join("");

// Chargement des catalogues puis création d'une partie à partir du setup.
async function loadData() {
  const load = async (path) => (await fetch(path)).json();
  if (PLAYTEST_EDITION) {
    const [scenario, heroClasses, heroAptitudes, unitDefinitions, locations] =
      await Promise.all([
        load("../data/scenarios/verdant-frontier.json"),
        load("../data/hero-classes.json"),
        load("../data/hero-aptitudes.json"),
        load("../data/units.json"),
        load("../data/verdant-frontier-locations.json"),
      ]);
    return {
      scenario,
      heroClasses: heroClasses.map((entry) =>
        entry.id === "warrior"
          ? { ...entry, authorityBonus: Math.max(3, entry.authorityBonus ?? 0) }
          : entry,
      ),
      heroAptitudes,
      unitDefinitions,
      locations,
    };
  }
  const [
    baseScenario,
    repression,
    granaries,
    heroClasses,
    heroAptitudes,
    unitDefinitions,
    locations,
    repressionLocations,
    granariesLocations,
  ] = await Promise.all([
    load("../data/scenarios/chaos.json"),
    load("../data/scenarios/repression.json"),
    load("../data/scenarios/granaries-of-the-king.json"),
    load("../data/hero-classes.json"),
    load("../data/hero-aptitudes.json"),
    load("../data/units.json"),
    load("../data/locations.json"),
    load("../data/repression-locations.json"),
    load("../data/granaries-locations.json"),
  ]);
  return {
    scenario: composeScenario(
      composeScenario(baseScenario, repression),
      granaries,
    ),
    heroClasses,
    heroAptitudes,
    unitDefinitions,
    locations: [...locations, ...repressionLocations, ...granariesLocations],
  };
}
function start() {
  if (
    !data?.scenario ||
    !data?.heroClasses ||
    !data?.unitDefinitions ||
    !data?.locations
  ) {
    setupView.showError(
      new Error(
        "Les données du scénario ne sont pas encore chargées. Réessayez dans un instant.",
      ),
    );
    return;
  }
  let setup;
  try {
    setup = setupView.readSetup();
  } catch (error) {
    setupView.showError(error);
    return;
  }
  mode = PLAYTEST_EDITION ? "gps" : setupView.readPositionMode();
  const bindings = PLAYTEST_EDITION
    ? [
        { locationSlotId: "capital", locationId: "royal-capital" },
        { locationSlotId: "gold-mine", locationId: "gold-mine" },
        { locationSlotId: "iron-mine", locationId: "iron-mine" },
        { locationSlotId: "quarry", locationId: "stone-quarry" },
        { locationSlotId: "lumber-camp", locationId: "lumber-camp-test" },
        { locationSlotId: "village", locationId: "village-vert" },
      ]
    : [
        { locationSlotId: "refuge", locationId: "fort-nord" },
        { locationSlotId: "capital", locationId: "royal-capital" },
        { locationSlotId: "royal-camp", locationId: "village-vert" },
        {
          locationSlotId: "prospectors-battlefield",
          locationId: "prospector-battlefield",
        },
        { locationSlotId: "gold-mine", locationId: "gold-mine" },
        { locationSlotId: "bandit-camp", locationId: "bandit-camp" },
        { locationSlotId: "evacuation-camp", locationId: "evacuation-camp" },
        { locationSlotId: "supply-fort", locationId: "supply-fort" },
        { locationSlotId: "opposite-fort", locationId: "opposite-fort" },
        { locationSlotId: "royal-gold-mine", locationId: "royal-gold-mine" },
        ...["north", "east", "south", "west"].map((direction) => ({
          locationSlotId: `supply-village-${direction}`,
          locationId: `supply-village-${direction}`,
        })),
        {
          locationSlotId: "seditious-village",
          locationId: "seditious-village",
        },
        { locationSlotId: "attacked-convoy", locationId: "attacked-convoy" },
        {
          locationSlotId: "brigand-camp-convoy",
          locationId: "brigand-camp-convoy",
        },
        {
          locationSlotId: "requisition-convoy",
          locationId: "requisition-convoy",
        },
        {
          locationSlotId: "counsellor-guard-depot",
          locationId: "counsellor-guard-depot",
        },
      ];
  game = new Game({
    setup,
    scenario: data.scenario,
    heroClasses: data.heroClasses,
    heroAptitudes: data.heroAptitudes,
    unitDefinitions: data.unitDefinitions,
    locations: data.locations,
    scenarioLocationBindings: bindings,
    coordinateMode: mode,
    scenarioStartsActive: false,
  });
  if (!PLAYTEST_EDITION) game.configureQuestSequence(QUEST_SEQUENCE);
  rangePolicy = new LocationRangePolicy(game.setup.locationSetup.rangePolicy);
  hero = game.chooseHero("local", createAutomaticHeroChoice());
  if (!PLAYTEST_EDITION) {
    enemyHero = game.chooseHero("bandits", {
      name: "Rask le brigand",
      classId: "warrior",
    });
    game.getLocation("bandit-camp").addHero(enemyHero.id);
  }
  if (PLAYTEST_EDITION)
    game.locations.forEach((location) =>
      game.getPlayer("local").discoverLocation(location.id, 3),
    );
  else {
    game.getPlayer("local").discoverLocation("fort-nord", 2);
    game.getPlayer("local").discoverLocation("royal-capital", 3);
    game.getPlayer("local").discoverLocation("bandit-camp", 3);
    game.getPlayer("local").discoverLocation("camp-local", 3);
    game.getPlayer("local").discoverLocation("enemy-fort", 3);
    game.getPlayer("local").discoverLocation("lumber-camp-test", 3);
  }
  heroPosition =
    mode === "gps"
      ? { latitude: 48.8566, longitude: 2.3522 }
      : [...simulationStartPosition];
  enabledGpsLocationIds = new Set();
  game.locations.forEach((location) =>
    runtimePositions.set(
      location.id,
      mode === "gps"
        ? { ...location.position }
        : [...(simulationPositions[location.id] ?? simulationStartPosition)],
    ),
  );
  rebuildLocationEngine();
  interactionEngine = new InteractionEngine({
    locations: game.locations,
    enemyResolver: resolveLocationEnemy,
  });
  ui.setup.hidden = true;
  ui.game.hidden = false;
  mapView = new MapView({
    element: $("#map"),
    mode,
    initialPosition: heroPosition,
    onHeroMove: applyPosition,
    onLocationSelect: selectLocation,
    onTraceSelect: inspectQuestTrace,
    onAutonomousGroupSelect: selectAutonomousGroup,
    onMapClick: handleMapClick,
  });
  mapFollowMode = "centered";
  updateMapFollowButton();
  mapView.map.on("dragstart", () => {
    mapFollowMode = "free";
    updateMapFollowButton();
  });
  capitalPlaced = false;
  gpsSetupActive = true;
  ui.game.classList.add("is-gps-setup");
  ui.gpsSetup.classList.toggle("is-simulation", mode === "simulation");
  ui.gpsSetup.hidden = false;
  renderPlacementOptions();
  renderGpsLocationButtons();
  if (mode === "simulation") {
    validatedPlayArea = new PlayArea({
      id: "simulation-area",
      name: "Zone maison agrandie",
      polygon: [
        { latitude: -89, longitude: -179 },
        { latitude: -89, longitude: 179 },
        { latitude: 89, longitude: 179 },
        { latitude: 89, longitude: -179 },
      ],
    });
    game.setup.playArea = validatedPlayArea;
    mapView.setPlayArea(validatedPlayArea.polygon);
    ui.gpsAreaStatus.textContent =
      "Zone maison agrandie prête. Configure puis génère le monde.";
    render();
    setTimeout(() => mapView.map.invalidateSize(), 0);
    return;
  }
  field.clearPlayArea();
  interactionMode = "draw-area";
  startGps();
  render();
  setTimeout(() => mapView.map.invalidateSize(), 0);
}

function finishGameStart() {
  if (!capitalPlaced || manualSetupPlacements.size > 0) return;
  const capitalPosition = positionFor("royal-capital");
  heroPosition = Array.isArray(capitalPosition)
    ? [...capitalPosition]
    : { ...capitalPosition };
  hero.updatePosition(asGps(heroPosition));
  mapView.focus(heroPosition);
  if (game.status === "preparing") {
    game.start();
    const testUnits = PLAYTEST_EDITION
      ? [
          { typeId: "militia", quantity: 6, name: "Fantassins" },
          { typeId: "archer", quantity: 5, name: "Archers des Haies" },
          {
            typeId: "mounted-archer",
            quantity: 4,
            name: "Éclaireurs des Prés",
          },
        ]
      : [{ typeId: "mounted-archer", quantity: 5, name: "Cavaliers d’essai" }];
    testUnits.forEach((entry) => {
      if (
        hero.army.units.length < hero.maxUnitStacks &&
        !hero.army.units.some((unit) => unit.name === entry.name)
      )
        hero.addUnit(
          game.recruitmentService.createUnit({
            ownerPlayerId: "local",
            ...entry,
            idGenerator: game.idGenerator,
          }),
        );
    });
    const testArmyAuthority = game.getHeroAuthority(hero.id);
    if (testArmyAuthority.used > testArmyAuthority.maximum)
      hero.setLevel(
        hero.level + testArmyAuthority.used - testArmyAuthority.maximum,
      );
  }
  gpsSetupActive = false;
  ui.game.classList.remove("is-gps-setup");
  ui.gpsSetup.hidden = true;
  interactionMode = null;
  deviceAlerts
    .enable()
    .then((enabled) =>
      logTest(
        enabled ? "Alertes sonores activées." : "Son d'alerte indisponible.",
      ),
    );
  screenAwake.start();
  clearInterval(productionTimer);
  productionTimer = setInterval(runProductionCycle, 10_000);
  if (mode === "gps") {
    orientationTracker
      .start()
      .then((enabled) =>
        logTest(
          enabled
            ? "Boussole activée : le pion indique le nord."
            : "Boussole refusée ou indisponible : utilisation du cap GPS.",
        ),
      );
    applyPosition(heroPosition);
  } else {
    ui.gpsStatus.textContent =
      "Simulation : clique sur la carte ou fais glisser le pion.";
    applyPosition(heroPosition);
  }
  setTimeout(() => mapView.map.invalidateSize(), 0);
  render();
  if (PLAYTEST_EDITION) {
    clearTimeout(firstRoyalMessengerTimer);
    firstRoyalMessengerTimer = null;
    clearInterval(chaosWaveTimer);
    const waveService = new ChaosWaveService();
    const spawnWave = () => {
      if (!game || game.status !== "started" || !validatedPlayArea) return;
      const candidates = game.locations.filter((location) =>
        enabledGpsLocationIds?.has(location.id),
      );
      if (candidates.length === 0) return;
      const definition = waveService.create({
        playArea: validatedPlayArea,
        locations: candidates,
      });
      game.addAutonomousGroup(new AutonomousGroup(definition));
      deviceAlerts.notify("danger");
      logTest(
        `Une armée du Chaos marche sur ${game.getLocation(definition.mission.targetId)?.name ?? "un lieu"} (${definition.army.units[0].quantity} soldats).`,
      );
      render();
    };
    setTimeout(spawnWave, 30_000);
    chaosWaveTimer = setInterval(spawnWave, 75_000);
    logTest(
      "La partie commence. Une première armée du Chaos apparaîtra bientôt, puis de nouvelles vagues attaqueront régulièrement vos lieux.",
    );
    return;
  }
  clearTimeout(firstRoyalMessengerTimer);
  firstRoyalMessengerTimer = setTimeout(() => {
    firstRoyalMessengerTimer = null;
    game.offerQuest({
      id: "missing-prospectors",
      title: "Les prospecteurs disparus",
      description:
        "Le maréchal souhaite vous confier la recherche d’une équipe royale disparue près de Valgrise.",
      startPhaseId: "reach-royal-camp",
      briefingLines: [
        "Le maréchal vous reçoit dans la salle des cartes.",
        "Une équipe de six prospecteurs et un jeune géologue n’est pas revenue de Valgrise.",
        "Rejoignez le camp royal, interrogez son chef et retrouvez les disparus.",
      ],
    });
    announceMarshalConvocation(
      game
        .getAvailableQuests()
        .find((quest) => quest.id === "missing-prospectors"),
    );
  }, 10_000);
  logTest(
    `Mode ${mode === "gps" ? "GPS réel" : "simulation"} démarré. Le maréchal préparera ses ordres dans 10 secondes.`,
  );
}

// Adaptateurs du téléphone : GPS, précision et orientation.
function startGps() {
  ui.gpsStatus.textContent = "GPS : recherche de la position…";
  gpsTracker = new GpsTracker({
    onPosition: (position) => {
      if (
        Number.isFinite(position.heading) &&
        Date.now() - lastCompassAt > 3_000
      ) {
        heroHeading = smoothHeading(heroHeading, position.heading);
        if (!debugPauseControl.isPaused) mapView.setHeroHeading(heroHeading);
        else pendingMainRender = true;
      }
      gpsAccuracyLog.record(position);
      persistFieldState();
      applyPosition(position);
      ui.gpsStatus.textContent = `GPS actif · précision ±${Math.round(position.accuracy)} m · cap ${Math.round(heroHeading)}° · ${new Date(position.updatedAt).toLocaleTimeString("fr-FR")}`;
      renderGpsAccuracySummary();
      if (gpsAccuracyLog.samples.length % 5 === 0)
        logTest(`Précision GPS ±${Math.round(position.accuracy)} m.`);
      if (firstGpsFix) {
        firstGpsFix = false;
        if (!debugPauseControl.isPaused) mapView.focus(position);
        logTest("Premier point GPS reçu.");
      }
    },
    onError: (error) => {
      ui.gpsStatus.textContent = `Erreur GPS : ${error.message}`;
      logTest(`Erreur GPS (${error.code}).`);
    },
  });
  if (!gpsTracker.start())
    ui.gpsStatus.textContent = "Géolocalisation indisponible sur cet appareil.";
}

// Conversion des coordonnées et politiques de portée communes aux deux modes.
function distance(a, b) {
  return mode === "gps"
    ? distanceMeters(a, b)
    : Math.hypot(a[0] - b[0], a[1] - b[1]);
}
function asGps(position) {
  return Array.isArray(position)
    ? { latitude: position[0], longitude: position[1] }
    : { latitude: position.latitude, longitude: position.longitude };
}
function positionFor(id) {
  return runtimePositions.get(id);
}
function baseRangesFor(location) {
  return mode === "gps"
    ? rangePolicy.resolve(location, game.setup.playArea)
    : {
        interactionRadius: simulationRadii[location.id] ?? 8,
        detectionRadius: simulationDetectionRadii[location.id] ?? 16,
      };
}
function rangesFor(location) {
  const base = baseRangesFor(location);
  return {
    interactionRadius: game.heroClassFeatureService.interactionRadius(
      hero,
      base.interactionRadius,
      location.id,
    ),
    detectionRadius: game.heroClassFeatureService.detectionRadius(
      hero,
      base.detectionRadius,
    ),
  };
}
function resolveLocationEnemy({ location }) {
  return location.features.battle &&
    game.getLocationRelation("local", location.id) === "enemy"
    ? {
        name: location.ownerId === "chaos" ? "Créatures du Chaos" : "Brigands",
        danger: 2,
        aggressive: false,
      }
    : null;
}
function radiusFor(location) {
  return rangesFor(location).interactionRadius;
}
function isLocationEnabled(location) {
  if (
    location.visibility === "hidden" &&
    !game?.getPlayer("local")?.knowsLocation(location.id)
  )
    return false;
  if (
    location.id === "evacuation-camp" &&
    !game?.getPlayer("local")?.knowsLocation(location.id)
  )
    return false;
  if (location.id === "prospector-battlefield") {
    const phaseId = game?.scenarioState?.currentPhaseId;
    if (
      ![
        "prospectors-battlefield",
        "free-gold-mine",
        "rescue-mine-geologist",
        "return-geologist-to-camp",
        "return-to-capital",
        "prologue-complete",
      ].includes(phaseId)
    )
      return false;
  }
  const binding = game?.scenarioLocationBindings.find(
    (candidate) => candidate.locationId === location.id,
  );
  const placement = binding
    ? game.scenarioRuntime?.placements[binding.locationSlotId]
    : null;
  if (placement && placement.status !== "placed") return false;
  return (
    location.state !== "destroyed" &&
    (enabledGpsLocationIds === null || enabledGpsLocationIds.has(location.id))
  );
}
function rebuildLocationEngine() {
  locationEngine = new LocationEngine({
    locations: game.locations.filter(isLocationEnabled).map((location) => ({
      id: location.id,
      position: positionFor(location.id),
      interactionRadius: radiusFor(location),
    })),
    cooldownMs: 2_000,
    exitMarginMeters: mode === "gps" ? 10 : 1,
    distanceFn: distance,
    validatePositionFn: () => {},
  });
}
function unitDefenseSummary(unit, source, hero = null) {
  return {
    id: unit.id,
    name: unit.name ?? unit.typeId,
    type: unit.typeId,
    quantity: unit.quantity,
    ownerPlayerId: unit.ownerPlayerId,
    source,
    heroId: hero?.id ?? null,
    heroName: hero?.name ?? null,
  };
}
function locationDefenseSnapshot(location) {
  const units = location.garrison.units.map((unit) =>
    unitDefenseSummary(unit, "garrison"),
  );
  const reinforcements = location.heroIds.flatMap((heroId) => {
    const presentHero = game.getHero(heroId);
    if (
      !presentHero ||
      presentHero.id === hero.id ||
      !game.locationAccessPolicy.isDefender(presentHero.playerId, location)
    )
      return [];
    return presentHero.army.units.map((unit) =>
      unitDefenseSummary(unit, "hero", presentHero),
    );
  });
  return {
    slots: location.defenseSlots,
    units,
    reinforcements,
    defenders: [...units, ...reinforcements],
  };
}

function mappedLocations({ knownOnly = true } = {}) {
  const player = game.getPlayer("local");
  const heroClass = data.heroClasses.find(
    (definition) => definition.id === hero.classId,
  );
  return game.locations
    .filter(
      (location) =>
        isLocationEnabled(location) &&
        (!knownOnly || player.knowsLocation(location.id)),
    )
    .map((location) => {
      const position = positionFor(location.id);
      const d = distance(heroPosition, position);
      const ranges = rangesFor(location);
      const baseRanges = baseRangesFor(location);
      const nearby = d <= ranges.interactionRadius;
      const relation = game.getLocationRelation(player.id, location.id);
      const can = (action) =>
        hero.state === "active" &&
        game.canPerformLocationAction({
          playerId: player.id,
          locationId: location.id,
          action,
        });
      const actions = [];
      if (can("recruit")) {
        const totalAvailable = Object.values(location.recruitment.stock).reduce(
          (sum, amount) => sum + amount,
          0,
        );
        location.recruitment.availableUnitTypeIds.forEach((type) => {
          const definition = game.unitDefinitions.get(type);
          actions.push({
            id: `recruit:${type}`,
            label: `Recruter ${definition?.name ?? type}`,
            details: {
              name: definition?.name ?? type,
              available: location.recruitment.stock[type] ?? 0,
              totalAvailable,
              capacity: location.recruitment.capacity,
              stats: definition ? { ...definition.stats } : {},
              costs: definition ? { ...definition.costs } : {},
            },
          });
        });
      }
      if (
        can("reinforce") &&
        hero.army.units.some(
          (unit) =>
            unit.missingQuantity > 0 &&
            (location.recruitment.stock[unit.typeId] ?? 0) > 0,
        )
      )
        actions.push({ id: "complete-units", label: "Compléter les unités" });
      if (
        can("heal") &&
        hero.army.units.some((unit) =>
          unit.soldierHealth.some((health) => health < unit.healthPerSoldier),
        )
      )
        actions.push({ id: "heal-units", label: "Soigner (1 unité de temps)" });
      if (can("manageReserves")) {
        const resourceIds = new Set(
          [
            ...Object.keys(hero.resources),
            ...Object.keys(location.resources.stock),
          ].filter((id) => id !== "population"),
        );
        resourceIds.forEach((id) => {
          const carried = Math.floor(hero.getResourceAmount(id));
          const stored = Math.floor(location.resources.stock[id] ?? 0);
          if (carried + stored > 0)
            actions.push({
              id: `reserve-balance:${id}`,
              label: `Répartir ${id}`,
              details: {
                resourceName: id,
                heroAmount: carried,
                locationAmount: stored,
                total: carried + stored,
                heroSlotCapacity: hero.bagSlotCount,
                locationSlotCapacity: location.storageSlotCapacity,
              },
            });
        });
        Object.entries(location.resources.production).forEach(([id]) =>
          actions.push({
            id: `production-stock:${id}`,
            label: `Production de ${id}`,
            details: {
              resourceName: id,
              productionAmount: Math.floor(
                location.resources.productionStock[id] ?? 0,
              ),
              productionSlotCapacity: 4,
            },
          }),
        );
        if ((location.population ?? 0) > 0)
          actions.push({
            id: "prepare-population",
            label: "Préparer de la population",
            details: {
              population: location.population,
              bundleSize: 5,
              storageSlotCapacity: location.storageSlotCapacity,
            },
          });
        if ((location.resources.stock.population ?? 0) > 0)
          actions.push({
            id: "stored-population",
            label: "Population en réserve",
            details: { quantity: location.resources.stock.population },
          });
        hero.carriedLoot
          .filter((entry) => entry.itemId === "population")
          .forEach((entry) =>
            actions.push({
              id: `settle-population:${entry.id}`,
              label: `Installer ${entry.quantity} habitant(s)`,
              details: { packageId: entry.id, quantity: entry.quantity },
            }),
          );
      }
      if (can("attack")) {
        const captureRequirement = game.getLocationCaptureRequirement({
          playerId: player.id,
          locationId: location.id,
        });
        actions.push({
          id: "battle",
          label:
            captureRequirement.state === "can_capture"
              ? "Capturer"
              : "Attaquer",
        });
      }
      const questInteractions = game.getQuestInteractionsForLocation(
        location.id,
      );
      const chiefConversation = can("talkChief")
        ? game.getLocationChiefConversation({
            playerId: player.id,
            locationId: location.id,
          })
        : null;
      if (chiefConversation) {
        chiefConversation.options.unshift(
          ...questInteractions.map((interaction) => ({
            id: `quest-interaction:${interaction.interactionId}`,
            kind: "quest_interaction",
            label: interaction.label,
            responseLines: interaction.responseLines,
          })),
        );
        const marshalHasQuest =
          location.id === "royal-capital" &&
          game.getAvailableQuests().length > 0;
        actions.push({
          id: "talk-chief",
          label: marshalHasQuest
            ? "Se rendre chez le maréchal (quête)"
            : location.id === "royal-capital"
              ? "Parler au maréchal"
              : "Parler",
          details: chiefConversation,
        });
      } else if (can("trade"))
        actions.push({ id: "trade", label: "Commercer" });
      if (!chiefConversation)
        questInteractions.forEach((interaction) =>
          actions.push({
            id: `quest-interaction:${interaction.interactionId}`,
            label: interaction.label,
          }),
        );
      if (
        location.id === "evacuation-camp" &&
        nearby &&
        game.scenarioState?.currentPhaseId === "defend-evacuation-camp"
      ) {
        const vanguard = game.getAutonomousGroup("chaos-column-vanguard");
        if (
          vanguard &&
          !["destroyed"].includes(vanguard.status) &&
          vanguard.army.units.some((unit) => unit.combatantCount > 0)
        )
          actions.push({
            id: "engage-evacuation-vanguard",
            label: "Sortir affronter l’avant-garde (quête)",
          });
      }
      if (
        location.id === "evacuation-camp" &&
        nearby &&
        ["defend-evacuation-camp", "prepare-evacuation"].includes(
          game.scenarioState?.currentPhaseId,
        ) &&
        ((location.population ?? 0) > 0 ||
          (location.resources.stock.population ?? 0) > 0 ||
          Object.keys(location.infrastructure).length >
            location.dismantlings.length)
      )
        actions.push({
          id: "organize-evacuation",
          label: "Évacuer les habitants et démanteler le camp (quête)",
        });
      const campDevelopment =
        location.type === "camp" ? game.getCampDevelopment(location.id) : null;
      if (campDevelopment && can("build") && nearby) {
        campDevelopment.improvements
          .filter((entry) => entry.available)
          .forEach((entry) =>
            actions.push({
              id: `build-improvement:${entry.id}`,
              label: `${entry.name} ${entry.nextLevel}`,
              details: {
                ...entry.next,
                currentLevel: entry.level,
                nextLevel: entry.nextLevel,
                slotType: entry.slotType,
              },
            }),
          );
        if (campDevelopment.levelUp.eligible)
          actions.push({
            id: "level-up-camp",
            label: `Élever au Camp ${location.level + 1}`,
          });
        if (location.level >= 3)
          campDevelopment.evolutions.forEach((branch) =>
            actions.push({
              id: `evolve-camp:${branch.id}`,
              label: branch.eligible
                ? branch.name
                : `${branch.name} (conditions manquantes)`,
              details: { costs: branch.costs, blockers: branch.blockers },
            }),
          );
      }
      const defense = locationDefenseSnapshot(location);
      const structures = Object.entries(location.infrastructure).map(
        ([id, level]) => {
          const task = location.dismantlings.find(
            (entry) => entry.structureId === id,
          );
          return {
            id,
            level,
            dismantling: task ? { completesAt: task.deadline.expiresAt } : null,
            canDismantle: nearby && can("dismantle") && !task,
          };
        },
      );
      return {
        id: location.id,
        name: location.name,
        type: location.type,
        position,
        radius: ranges.interactionRadius,
        interactionRadius: ranges.interactionRadius,
        detectionRadius: ranges.detectionRadius,
        distance: d,
        nearby,
        relation,
        state: "DISCOVERED",
        description:
          descriptions[location.id] ?? "Lieu créé pendant le test terrain.",
        defense,
        structures,
        canDismantle: nearby && can("dismantle"),
        campDevelopment,
        actions,
      };
    });
}

// Horloge du monde, production et comportement des groupes autonomes.
function runProductionCycle() {
  game.update();
  checkSimulationAutonomousAggression();
  syncAutonomousBattle();
  game.cleanupDynamicSites();
  const cycle = game.advanceCycle(1);
  const mine = cycle.locations.find(
    (result) => result.locationId === "gold-mine",
  );
  const recovery = cycle.heroes.find(
    (result) => result.heroId === hero.id && result.restoredHealth > 0,
  );
  if (mine) logTest(`La mine produit ${mine.produced.gold ?? 0} or.`);
  if (cycle.recoveredUnits.length > 0)
    logTest(`${cycle.recoveredUnits.length} unité(s) récupèrent des PV.`);
  if (recovery?.revived)
    logTest(
      `Retour à la base : héros actif avec ${recovery.restoredHealth} PV.`,
    );
  else if (recovery?.locationHealing > 0)
    logTest(`Soins de localisation : +${recovery.restoredHealth} PV.`);
  render();
  if (
    !activeGarrisonLocationId &&
    currentLocationId &&
    !ui.sheet.hidden &&
    cycle.locations.some((result) => result.locationId === currentLocationId)
  )
    selectLocation(currentLocationId);
}

function visibleAutonomousGroups() {
  return autonomousGroupDetectionService
    .detect({
      observer: {
        position: asGps(heroPosition),
        detectionMultiplier:
          game.heroClassFeatureService.detectionMultiplier(hero),
      },
      groups: game.autonomousGroups,
      baseRadius: mode === "gps" ? 15 : 22,
    })
    .map((group) => ({
      ...group,
      position:
        mode === "simulation"
          ? [group.position.latitude, group.position.longitude]
          : group.position,
    }));
}
function visibleAutonomousTraces() {
  const questIds = new Set(["prospectors-trace-1", "prospectors-trace-2", "convoy-trace-1", "convoy-trace-2"]);
  const now = Date.now();
  const detectedGroups = new Map(
    visibleAutonomousGroups().map((group) => [group.id, group]),
  );
  const observer = asGps(heroPosition);
  const detectionMultiplier =
    game.heroClassFeatureService.detectionMultiplier(hero);
  return game.autonomousGroupTraces
    .filter((trace) => {
      if (questIds.has(trace.id)) return false;
      const traceDistance =
        mode === "gps"
          ? distanceMeters(observer, trace.position)
          : Math.hypot(
              observer.latitude - trace.position.latitude,
              observer.longitude - trace.position.longitude,
            );
      return trace.isDetectable({
        at: now,
        minimumScore: 1,
        distance: traceDistance,
        distancePerPoint: mode === "gps" ? 50 : 5,
        detectionMultiplier,
      });
    })
    .map((trace) => ({
      id: trace.id,
      position:
        mode === "simulation"
          ? [trace.position.latitude, trace.position.longitude]
          : trace.position,
      groupId: trace.groupId,
      createdAt: trace.createdAt,
      directionDegrees: trace.directionDegrees,
      color:
        trace.owner.kind === "player" && trace.owner.id === "local"
          ? "blue"
          : !detectedGroups.has(trace.groupId)
            ? "gray"
            : trace.owner.id === "chaos"
              ? "red"
              : trace.owner.kind === "independent"
                ? "yellow"
                : "gray",
    }));
}
function beginAutonomousBattle(group, { ambushResult = null } = {}) {
  if (
    (activeBattle && activeBattle.status !== "finished") ||
    group.status === "destroyed"
  )
    return false;
  group.status = "interrupted";
  const battle = game.createBattle({
    teamParticipants: [
      { id: "heroes", heroIds: [hero.id] },
      {
        id: `autonomous-${group.id}`,
        heroIds: [],
        autonomousGroupId: group.id,
      },
    ],
    position: group.position,
    config:
      ambushResult?.level !== "cancelled" ? { ambushTeamId: "heroes" } : {},
  });
  if (ambushResult?.effects.durationMs > 0)
    applyAmbushEffects(battle, ambushResult.effects);
  closeSheet(ui.sheet);
  activateBattle(battle, { ambushTeamId: battle.config.ambushTeamId });
  return true;
}

function preparedAmbushTarget() {
  if (
    !preparedHeroAmbush ||
    (activeBattle && activeBattle.status !== "finished")
  )
    return null;
  const maximumDistance = preparedHeroAmbush.maximumDistance;
  const candidate = game.autonomousGroups
    .filter(
      (group) =>
        group.owner.id !== "local" &&
        !["destroyed", "mission_failed"].includes(group.status),
    )
    .map((group) => ({
      group,
      distance: distance(
        heroPosition,
        mode === "gps"
          ? group.position
          : [group.position.latitude, group.position.longitude],
      ),
    }))
    .filter((entry) => entry.distance <= maximumDistance)
    .sort((first, second) => first.distance - second.distance)[0];
  return candidate ? { ...candidate, maximumDistance } : null;
}

function launchPreparedAmbush() {
  if (!preparedHeroAmbush) {
    if (!heroConcealmentService.confirm()) return;
    const baseRange =
      mode === "gps" ? game.setup.rules.engagementRadiusMeters : 8;
    const maximumDistance = ambushService.engagementRange({
      baseRange,
      attackerUnits: hero.army.units,
      unitDefinitions: game.unitDefinitions,
    });
    preparedHeroAmbush = {
      preparedAt: Date.now(),
      preparationMs: heroConcealmentService.preparationMs(),
      maximumDistance,
    };
    hero.classFeatureState.gpsConcealmentMultiplier =
      heroConcealmentService.signatureMultiplier;
    logTest(
      `Embuscade préparée : signature réduite et portée d’attaque portée à ${Math.round(maximumDistance)}${mode === "gps" ? " m" : " unités"}.`,
    );
    render();
    return;
  }
  triggerPreparedAmbush();
}

function triggerPreparedAmbush() {
  const target = preparedAmbushTarget();
  if (!target) return false;
  const bag = game.inventoryService.getHeroBagState(hero);
  const result = ambushService.resolve({
    attacker: {
      signatureMultiplier: heroConcealmentService.signatureMultiplier,
      units: hero.army.units,
      unitDefinitions: game.unitDefinitions,
      passiveIds: hero.skillIds,
      trainLoad: bag.usedSlots,
      trainCapacity: bag.slotCapacity,
    },
    defender: {
      perception: 0,
      passiveIds: [],
      moving: target.group.status === "moving",
      trainLoad: target.group.cargo.length,
    },
    distance: target.distance,
    maximumDistance: target.maximumDistance,
    preparationMs: preparedHeroAmbush.preparationMs,
  });
  preparedHeroAmbush = null;
  const labels = {
    cancelled: "déjouée",
    light: "légère",
    success: "réussie",
    perfect: "parfaite",
  };
  logTest(
    `Embuscade ${labels[result.level]} · score ${result.attackScore} contre ${result.defenseScore}.`,
  );
  return beginAutonomousBattle(target.group, { ambushResult: result });
}

function applyAmbushEffects(battle, effects) {
  battle.teams[0].units.forEach((unit) =>
    unit.activeEffects.push({
      id: `ambush-attack:${unit.id}`,
      kind: "stat_modifier",
      stat: "attack",
      operation: "multiply",
      value: effects.attackerAttackMultiplier,
      sourceId: hero.id,
      appliedAtMs: 0,
      expiresAtMs: effects.durationMs,
    }),
  );
  battle.teams[1].units.forEach((unit) =>
    unit.activeEffects.push({
      id: `ambush-defense:${unit.id}`,
      kind: "stat_modifier",
      stat: "defense",
      operation: "multiply",
      value: effects.defenderDefenseMultiplier,
      sourceId: hero.id,
      appliedAtMs: 0,
      expiresAtMs: effects.durationMs,
    }),
  );
}
function selectAutonomousGroup(groupId) {
  const group = game.getAutonomousGroup(groupId);
  if (!group) return;
  const snapshot = visibleAutonomousGroups().find(
    (item) => item.id === groupId,
  );
  if (!snapshot) return;
  if (
    group.type === "messenger" &&
    group.message?.id === pendingRoyalMessage?.id
  ) {
    ui.sheet.hidden = false;
    ui.sheet.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Messager du royaume</span><h2>${group.message.title}</h2><p>${group.message.text}</p><div class="sheet-actions"><button data-read-royal-order>Recevoir l’ordre</button></div>`;
    ui.sheet.querySelector(".sheet-close").onclick = () => closeSheet(ui.sheet);
    ui.sheet.querySelector("[data-read-royal-order]").onclick = () => {
      closeSheet(ui.sheet);
      receiveRoyalQuestMessage();
    };
    return;
  }
  const attackRange = 8;
  const canAttack = snapshot.distance <= attackRange;
  ui.sheet.hidden = false;
  ui.sheet.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Groupe autonome détecté</span><h2>Armée du Chaos</h2><p>${snapshot.soldiers} soldats · distance ${Math.round(snapshot.distance)}${mode === "gps" ? " m" : ""}</p><div class="sheet-actions"><button data-autonomous-attack ${canAttack ? "" : "disabled"}>Attaquer</button></div>${canAttack ? "" : `<p class="sheet-feedback">Approchez-vous à moins de ${attackRange}${mode === "gps" ? " m" : " unités"}.</p>`}`;
  ui.sheet.querySelector(".sheet-close").onclick = () => closeSheet(ui.sheet);
  ui.sheet.querySelector("[data-autonomous-attack]").onclick = () =>
    beginAutonomousBattle(group);
}
function checkSimulationAutonomousAggression() {
  if (mode !== "simulation" || activeBattle?.status === "active") return;
  const target = visibleAutonomousGroups().find(
    (group) => group.behavior === "aggressive" && group.distance <= 8,
  );
  if (target) beginAutonomousBattle(game.getAutonomousGroup(target.id));
}
// Une position normalisée alimente successivement le moteur, les présences et la vue.
function applyPosition(position) {
  heroPosition = normalizePosition(position, mode);
  gpsAccuracy = mode === "gps" ? (position.accuracy ?? null) : null;
  if (mode === "gps" && !gpsSetupActive) {
    const travel = game.recordHeroTravel({
      heroId: hero.id,
      position: asGps(heroPosition),
      accuracy: gpsAccuracy ?? 0,
    });
    if (travel.experienceGained > 0) {
      showTravelReward(travel);
      logTest(
        `Marche : +${travel.experienceGained} XP (${Math.round(travel.totalDistanceMeters)} m parcourus).`,
      );
    }
  }
  hero.updatePosition(asGps(heroPosition));
  const motion = heroConcealmentService.update({
    position: asGps(heroPosition),
    accuracy: gpsAccuracy ?? 0,
    at: Date.now(),
  });
  hero.classFeatureState.gpsConcealmentMultiplier =
    heroConcealmentService.signatureMultiplier;
  if (motion.concealmentCancelled) {
    preparedHeroAmbush = null;
    logTest("Embuscade annulée : déplacement confirmé.");
  }
  if (mapView && mapFollowMode !== "free" && !debugPauseControl.isPaused)
    mapView.follow(heroPosition);
  if (gpsSetupActive) {
    render();
    return;
  }
  const playAreaEvent = playAreaPresence.update(asGps(heroPosition));
  if (playAreaEvent?.type === "PlayAreaExited") {
    lastVisitedCellId = null;
    deviceAlerts.notify("danger");
    logTest("⚠ Sortie de la zone de jeu.");
  }
  if (playAreaEvent?.type === "PlayAreaEntered") {
    deviceAlerts.notify("notice");
    logTest("Retour dans la zone de jeu.");
  }
  const quest = field.updatePosition(asGps(heroPosition));
  if (quest) {
    ui.questStatus.textContent = `${Math.round(quest.distanceMeters)} / 300 m ${quest.completed ? "· objectif atteint" : ""}`;
    ui.questPlace.disabled = !quest.completed;
  }
  const scenarioPlacements = game.updateScenarioPosition({
    position: asGps(heroPosition),
    accuracy: gpsAccuracy,
  });
  const readyPlacement = scenarioPlacements.find(
    (placement) => placement.status === "ready",
  );
  if (readyPlacement) {
    pendingScenarioPlacementSlotId = readyPlacement.slotId;
    const alertId = `${game.scenarioState.currentPhaseId}:${readyPlacement.slotId}`;
    if (lastReadyQuestActionId !== alertId) {
      lastReadyQuestActionId = alertId;
      deviceAlerts.notify("notice");
      logTest("Objectif atteint : une nouvelle action est disponible.");
    }
  }
  if (playAreaGrid) {
    const cell = playAreaGrid.getCellAt(asGps(heroPosition));
    if (!cell) lastVisitedCellId = null;
    else if (cell.id !== lastVisitedCellId) {
      const passage = playAreaGrid.recordVisit(asGps(heroPosition));
      lastVisitedCellId = cell.id;
      persistFieldState();
      logTest(`Passage ${passage.visits} dans ${cell.id}.`);
    }
  }
  syncEvacuationCampSearch();
  updatePresence();
  locationEngine
    .update({ actorId: hero.id, position: heroPosition })
    .forEach(handleLocationEvent);
  if (activeBattle?.status === "active" && activeBattle.engagementContext)
    game.updateBattleHeroPosition({
      battleId: activeBattle.id,
      heroId: hero.id,
      position: asGps(heroPosition),
    });
  render();
}
function showTravelReward(travel) {
  deviceAlerts.reward({ kilometer: travel.completedKilometers > 0 });
  showProgressReward({
    caption:
      travel.completedKilometers > 0
        ? `${travel.completed100MeterSteps * 100} m · bonus 1 km`
        : `${travel.completed100MeterSteps * 100} m`,
    title: `+${travel.experienceGained} XP`,
    className: travel.completedKilometers > 0 ? "is-kilometer" : "",
  });
}
function showProgressReward({ caption, title, className = "" }) {
  progressRewardQueue.push({ caption, title, className });
  showNextProgressReward();
}
function showNextProgressReward() {
  if (progressRewardActive || progressRewardQueue.length === 0) return;
  progressRewardActive = true;
  const { caption, title, className } = progressRewardQueue.shift();
  const reward = document.createElement("div");
  reward.className = `travel-reward ${className}`.trim();
  const captionElement = document.createElement("span");
  captionElement.className = "travel-reward__distance";
  captionElement.textContent = caption;
  const titleElement = document.createElement("strong");
  titleElement.className = "travel-reward__xp";
  titleElement.textContent = title;
  reward.append(captionElement, titleElement);
  travelRewardLayer.append(reward);
  reward.addEventListener(
    "animationend",
    () => {
      reward.remove();
      progressRewardActive = false;
      showNextProgressReward();
    },
    { once: true },
  );
}
function announceHeroLevelUp(progress) {
  if (!progress.canLevelUp) {
    heroLevelUpWasReady = false;
    return;
  }
  if (heroLevelUpWasReady) return;
  heroLevelUpWasReady = true;
  deviceAlerts.notify("notice");
  showProgressReward({
    caption: "Progression prête",
    title: "Niveau disponible",
    className: "is-hero-level",
  });
}
function openHeroProgressDialog() {
  let progress = game.getHeroProgress(hero.id);
  let pending = hero.pendingLevelUps[0];
  if (!pending && progress.canLevelUp) {
    const result = game.levelUpHero({ heroId: hero.id });
    if (!result.success) {
      logTest(`Evolution impossible : ${result.reason}.`);
      return;
    }
    pending = result.pending;
    progress = game.getHeroProgress(hero.id);
    deviceAlerts.reward({ kind: "hero" });
    showProgressReward({
      caption: "Niveau supérieur",
      title: `Niveau ${pending.level}`,
      className: "is-hero-level",
    });
    render();
  }
  const statLabels = {
    attack: "Attaque",
    defense: "Défense",
    morale: "Moral",
    mobility: "Mobilité",
    command: "Commandement",
    health: "Points de vie",
  };
  const grade = pending?.gradeUnlocked
    ? HERO_COMMAND_RANKS.find((item) => item.id === pending.gradeUnlocked)
    : null;
  const dialog = document.createElement("dialog");
  dialog.className = "hero-progress-dialog";
  const content = pending
    ? `<p class="eyebrow">LvL ${pending.level}</p><h2>LEVEL UP</h2><div class="level-up-summary">${grade ? `<p>(Nouveau grade : ${grade.label})</p>` : ""}<strong>Autorité +${pending.authorityIncrease ?? 1}</strong><strong>${statLabels[pending.statIncrease.stat] ?? pending.statIncrease.stat} +${pending.statIncrease.amount}</strong></div><h3>Choisir une amélioration</h3><div class="level-up-options">${pending.proposals.map((proposal) => `<button type="button" data-level-up="${pending.id}" data-upgrade="${proposal.id}"><strong>${proposal.name} · ${proposal.rank}</strong><span>${proposal.description}</span><small>${proposal.type} · ${proposal.scope}</small></button>`).join("")}</div>`
    : `<p class="eyebrow">LvL ${hero.level}</p><h2>Progression du héros</h2><p>${progress.maximumLevelReached ? "LvL max" : `${progress.currentLevelXp}/${progress.xpToNextLevel} XP avant le prochain niveau.`}</p>`;
  dialog.innerHTML = `<form method="dialog" class="hero-progress-dialog__panel"><button class="sheet-close" value="close" aria-label="Fermer">Fermer</button>${content}</form>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.querySelectorAll("[data-level-up]").forEach((button) =>
    button.addEventListener("click", () => {
      if (
        !window.confirm(
          `Choisir définitivement ${button.querySelector("strong").textContent} ?`,
        )
      )
        return;
      game.selectHeroLevelUp({
        heroId: hero.id,
        pendingId: button.dataset.levelUp,
        upgradeId: button.dataset.upgrade,
      });
      dialog.close();
      render();
    }),
  );
  dialog.showModal();
}
// Présentation narrative et progression des quêtes de scénario.
function summonRoyalQuestMessenger({
  id,
  title,
  text,
  focusLocationId = null,
  questId = null,
}) {
  if (
    pendingRoyalMessage?.id === id ||
    game.getAutonomousGroup(`royal-messenger-${id}`)
  )
    return false;
  const origin = asGps(heroPosition);
  const position =
    mode === "simulation"
      ? { latitude: origin.latitude + 3, longitude: origin.longitude + 2 }
      : {
          latitude: origin.latitude,
          longitude:
            origin.longitude +
            12 /
              (111_320 *
                Math.max(0.01, Math.cos((origin.latitude * Math.PI) / 180))),
        };
  const groupId = `royal-messenger-${id}`;
  game.addAutonomousGroup(
    new AutonomousGroup({
      id: groupId,
      type: "messenger",
      owner: { kind: "faction", id: "kingdom" },
      factionId: "kingdom",
      position,
      behavior: "passive",
      message: { id, title, text, focusLocationId, questId },
      history: [{ type: "royal_quest_notification", at: Date.now() }],
    }),
  );
  pendingRoyalMessage = { id, groupId, title, text, focusLocationId, questId };
  royalMessengerNotice.hidden = false;
  royalMessengerNotice.innerHTML = `<span aria-hidden="true">➤</span><div><small>Un messager royal vous rejoint</small><strong>${title}</strong></div><button type="button">Lire l’ordre</button>`;
  royalMessengerNotice.querySelector("button").onclick =
    receiveRoyalQuestMessage;
  deviceAlerts.notify("notice");
  logTest(`Messager royal : ${title}.`);
  render();
  return true;
}
function receiveRoyalQuestMessage() {
  if (!pendingRoyalMessage) return false;
  const message = pendingRoyalMessage;
  pendingRoyalMessage = null;
  royalMessengerNotice.hidden = true;
  game.removeAutonomousGroup(message.groupId);
  locationMessage = `${message.title}\n\n${message.text}`;
  logTest(locationMessage);
  highlightedQuestOfferId = message.questId;
  if (message.focusLocationId) {
    const position = positionFor(message.focusLocationId);
    if (position) mapView.focus(position);
  }
  render();
  switchView("quests");
  return true;
}
function isHeroAtCapital() {
  const capital = game.getLocation("royal-capital");
  const position = positionFor("royal-capital");
  return Boolean(
    capital &&
      position &&
      distance(heroPosition, position) <= rangesFor(capital).interactionRadius,
  );
}
function announceMarshalConvocation(offer) {
  if (!offer) return false;
  if (isHeroAtCapital()) {
    locationMessage = `Le maréchal est prêt à vous recevoir pour la mission « ${offer.title} ».`;
    deviceAlerts.notify("notice");
    logTest(locationMessage);
    render();
    if (currentLocationId === "royal-capital") selectLocation("royal-capital");
    return true;
  }
  return summonRoyalQuestMessenger({
    id: `marshal-convocation-${offer.id}`,
    title: "Convocation du maréchal",
    text: `Le maréchal vous convoque à la capitale pour vous confier une nouvelle mission : « ${offer.title} ».`,
    focusLocationId: "royal-capital",
    questId: offer.id,
  });
}
function updatePresence() {
  if (!game) return;
  const player = game.getPlayer("local");
  mappedLocations({ knownOnly: false }).forEach((item) => {
    const location = game.getLocation(item.id);
    if (item.distance <= item.detectionRadius)
      player.discoverLocation(item.id, item.nearby ? 3 : 1);
    if (item.nearby) {
      location.addHero(hero.id);
      const revival = game.reviveHeroAtBase({
        heroId: hero.id,
        locationId: location.id,
      });
      if (revival.success) {
        locationMessage = `Le héros reprend forme avec ${revival.health}/${revival.maximumHealth} PV.`;
        logTest(`Retour à la base : héros actif avec ${revival.health} PV.`);
      }
    } else location.removeHero(hero.id);
  });
}
function handleLocationEvent(event) {
  const questProgress = game.dispatchQuestEvent(event);
  if (questProgress) applyQuestFeedback(questProgress);
  const interaction = interactionEngine.handle(event);
  if (!interaction) return;
  if (event.type === "LocationExited") {
    if (currentLocationId === event.locationId) {
      currentLocationId = null;
      activeGarrisonLocationId = null;
      locationMessage = "";
      if (currentEncounter?.locationId === event.locationId)
        currentEncounter = null;
      closeSheet(ui.sheet);
    }
    return;
  }
  currentLocationId = event.locationId;
  if (interaction.type === "encounter") {
    currentEncounter = interaction.encounter;
    interaction.autoBattle
      ? openBattle({ ambushTeamId: "bandits" })
      : renderEncounter();
  } else {
    selectLocation(event.locationId);
  }
}

function applyQuestFeedback(progress) {
  const narration = progress.appliedEvents
    .flatMap((entry) => entry.appliedEffects)
    .find((effect) => effect.type === "narration");
  const scenarioReport = progress.appliedEvents
    .flatMap((entry) => entry.appliedEffects)
    .find((effect) => effect.type === "scenario_report");
  const evacuationResult = progress.appliedEvents
    .flatMap((entry) => entry.appliedEffects)
    .find((effect) => effect.type === "evacuation_completed");
  const offeredQuest = progress.appliedEvents
    .flatMap((entry) => entry.appliedEffects)
    .find((effect) => effect.type === "quest_offered" && effect.offered);
  const revealedLocations = progress.appliedEvents
    .flatMap((entry) => entry.appliedEffects)
    .filter((effect) => effect.type === "location_revealed");
  revealedLocations.forEach((effect) => {
    alignRevealedQuestLocation(effect.locationId);
    ensureRevealedLocationInsidePlayArea(effect.locationId);
    game.getPlayer("local").discoverLocation(effect.locationId, 2);
    if (enabledGpsLocationIds !== null)
      enabledGpsLocationIds.add(effect.locationId);
  });
  if (revealedLocations.length > 0) rebuildLocationEngine();
  const revealed = revealedLocations[0]
    ? game.getLocation(revealedLocations[0].locationId)
    : null;
  const nextQuest = progress.nextPhaseId ? game.getActiveQuest() : null;
  const nextObjective =
    nextQuest?.objectives.find((objective) => objective.state === "active") ??
    null;
  const nextObjectiveMessage = nextObjective
    ? `\n\nNouvel objectif — ${nextQuest.title} : ${nextObjective.text}.`
    : "";
  locationMessage = `${narration?.text ?? scenarioReport?.text ?? "Objectif accompli."}${revealed ? `\n\n${revealed.name} révélée sur la carte.` : ""}${nextObjectiveMessage}${evacuationResult ? `\n\nBilan : ${evacuationResult.result.score}/100 · ${evacuationResult.result.grade} · ${evacuationResult.people} habitant(s) sauvés.` : ""}`;
  showQuestProgressFeedback(progress);
  logTest(locationMessage);
  if (progress.nextPhaseId)
    game.startCurrentScenarioPlacements(asGps(heroPosition));
  syncQuestTrace();
  syncQuestBattlefield();
  syncEvacuationCampSearch();
  if (offeredQuest)
    announceMarshalConvocation(
      game
        .getAvailableQuests()
        .find((quest) => quest.id === offeredQuest.questId),
    );
  if (revealed) {
    pendingRevealedLocationId = revealed.id;
    mapView.focus(positionFor(revealed.id));
  }
}

function applyQuestChoiceFeedback(result) {
  game.startCurrentScenarioPlacements(asGps(heroPosition));
  const effects = result.appliedEvent?.appliedEffects ?? [];
  const narration = effects.find((effect) => effect.type === "narration");
  const revealed = effects.filter(
    (effect) => effect.type === "location_revealed",
  );
  revealed.forEach((effect) => {
    ensureRevealedLocationInsidePlayArea(effect.locationId);
    game.getPlayer("local").discoverLocation(effect.locationId, 2);
    enabledGpsLocationIds?.add(effect.locationId);
  });
  if (revealed.length) rebuildLocationEngine();
  locationMessage = narration?.text ?? "Votre décision est prise.";
  syncQuestTrace();
  render();
}

function showQuestProgressFeedback(progress) {
  const phase = game.scenario?.getPhase(progress.phaseId);
  const completedState =
    game.scenarioState?.phaseStates?.[progress.phaseId]?.status;
  const questCompleted =
    progress.phaseCompleted &&
    progress.nextPhaseId === null &&
    completedState === "completed";
  const experienceGained = progress.appliedEvents
    .flatMap((entry) => entry.appliedEffects ?? [])
    .filter((effect) => effect.type === "hero_experience_awarded")
    .reduce((total, effect) => total + effect.amount, 0);
  const experienceTitle =
    experienceGained > 0 ? `+${experienceGained} XP` : null;
  if (questCompleted) {
    deviceAlerts.reward({ kind: "quest" });
    showProgressReward({
      caption: "Félicitations · Quête terminée !",
      title: experienceTitle ?? "Quête terminée !",
      className: "is-quest-complete",
    });
    return;
  }
  const completedLabels = progress.completedObjectiveIds
    .map(
      (id) => phase?.objectives.find((objective) => objective.id === id)?.text,
    )
    .filter(Boolean);
  deviceAlerts.reward({ kind: "questStep" });
  const objectiveCaption =
    completedLabels.join(" · ") || "Progression de la quête";
  showProgressReward({
    caption: `Objectif accompli · ${objectiveCaption}`,
    title: experienceTitle ?? "Objectif accompli",
    className: "is-quest-step",
  });
}

function startOfferedQuest(questId) {
  const offer = game.getAvailableQuests().find((quest) => quest.id === questId);
  if (!offer) return false;
  const accepted = game.acceptAvailableQuest(questId);
  if (!accepted.success) {
    locationMessage = `Impossible de démarrer la quête : ${accepted.reason}.`;
    render();
    return false;
  }
  game.startCurrentScenarioPlacements(asGps(heroPosition));
  highlightedQuestOfferId = null;
  questHudExpanded = true;
  locationMessage = `Quête démarrée avec votre accord — ${offer.title}.`;
  logTest(locationMessage);
  render();
  return true;
}

function syncEvacuationCampSearch() {
  if (game?.scenarioState?.currentPhaseId !== "reach-evacuation-camp")
    return false;
  const location = game.getLocation("evacuation-camp");
  const player = game.getPlayer("local");
  if (!location || player.knowsLocation(location.id)) return false;
  const position = asGps(positionFor(location.id) ?? location.position);
  const evacuation = game.evacuationStates["royal-camp-evacuation"];
  if (playAreaGrid && evacuation && !evacuation.searchTargetCellId) {
    const signal = playAreaGrid.setQuestSignal(position, { radiusCells: 1 });
    evacuation.searchTargetCellId = signal?.targetCellId ?? null;
    heatmapVisible = true;
    const toggle = $("#toggle-heatmap");
    toggle.disabled = false;
    toggle.textContent = "Masquer la heatmap";
    persistFieldState();
  }
  const currentCell = playAreaGrid?.getCellAt(asGps(heroPosition));
  const foundByCell =
    currentCell && currentCell.id === evacuation?.searchTargetCellId;
  const target =
    mode === "simulation" ? [position.latitude, position.longitude] : position;
  const foundByProximity =
    distance(heroPosition, target) <= (mode === "simulation" ? 8 : 12);
  if (!foundByCell && !foundByProximity) return false;
  player.discoverLocation(location.id, 2);
  if (enabledGpsLocationIds !== null) enabledGpsLocationIds.add(location.id);
  playAreaGrid?.clearQuestSignal();
  if (evacuation) evacuation.campDiscoveredAt = Date.now();
  rebuildLocationEngine();
  persistFieldState();
  deviceAlerts.notify("notice");
  logTest("Camp royal localisé : approchez-vous pour entrer dans le camp.");
  return true;
}

function syncQuestTrace() {
  const pace = questPaceProfile(game.setup.rules.travelPaceMode);
  const phaseId = game.scenarioState?.currentPhaseId;
  const definitions = {
    "follow-first-trace": {
          id: "prospectors-trace-1",
          gpsDistance: pace.firstTraceMeters,
          simulationDistance: 9,
          direction: 55,
          kind: "passage",
          groupId: "missing-royal-prospectors",
          groupType: "prospecting",
          ownerId: "kingdom",
          soldierCount: 6,
        },
    "follow-second-trace": {
            id: "prospectors-trace-2",
            gpsDistance: pace.secondTraceMeters,
            simulationDistance: 10,
            direction: 52,
            kind: "struggle",
            groupId: "missing-royal-prospectors",
            groupType: "prospecting",
            ownerId: "kingdom",
            soldierCount: 6,
          },
    "convoy-trace-one": {
      id: "convoy-trace-1",
      gpsDistance: Math.max(90, Math.round(pace.firstTraceMeters * 0.7)),
      simulationDistance: 8,
      direction: 38,
      kind: "plunder",
      groupId: "convoy-raiders",
      groupType: "rogue",
      ownerId: "bandits",
      soldierCount: 6,
    },
    "convoy-trace-two": {
      id: "convoy-trace-2",
      gpsDistance: Math.max(110, Math.round(pace.secondTraceMeters * 0.75)),
      simulationDistance: 9,
      direction: 42,
      kind: "passage",
      groupId: "convoy-raiders",
      groupType: "rogue",
      ownerId: "bandits",
      soldierCount: 6,
    },
  };
  const definition = definitions[phaseId] ?? null;
  if (
    !definition ||
    game.autonomousGroupTraces.some((trace) => trace.id === definition.id)
  )
    return;
  const position = setupPlacementService.findPosition({
    playArea: validatedPlayArea ?? game.setup.playArea,
    origin: asGps(heroPosition),
    preferredDistance:
      mode === "simulation"
        ? definition.simulationDistance
        : definition.gpsDistance,
    preferredDirectionDegrees: definition.direction,
    occupied: game.autonomousGroupTraces.map((trace) => trace.position),
    minimumSpacing: mode === "simulation" ? 3 : 30,
  });
  game.autonomousGroupTraces.push(
    new AutonomousGroupTrace({
      id: definition.id,
      groupId: definition.groupId,
      groupType: definition.groupType,
      owner: { kind: "faction", id: definition.ownerId },
      kind: definition.kind,
      position,
      soldierCount: definition.soldierCount,
      directionDegrees: definition.direction,
      createdAt: Date.now(),
      decayPerMinute: 0.001,
    }),
  );
}

function visibleQuestTraces() {
  syncQuestTrace();
  const visibleTraceId = ({
    "follow-first-trace": "prospectors-trace-1",
    "follow-second-trace": "prospectors-trace-2",
    "convoy-trace-one": "convoy-trace-1",
    "convoy-trace-two": "convoy-trace-2",
  })[game.scenarioState?.currentPhaseId] ?? null;
  return game.autonomousGroupTraces
    .filter(
      (trace) => trace.id === visibleTraceId && trace.getScore(Date.now()) > 0,
    )
    .map((trace) => ({
      id: trace.id,
      position:
        mode === "simulation"
          ? [trace.position.latitude, trace.position.longitude]
          : trace.position,
    }));
}
function syncQuestBattlefield() {
  if (game.scenarioState?.currentPhaseId !== "prospectors-battlefield") return;
  const player = game.getPlayer("local");
  if (player.knowsLocation("prospector-battlefield")) return;
  const targetGps = setupPlacementService.findPosition({
    playArea: validatedPlayArea ?? game.setup.playArea,
    origin: asGps(heroPosition),
    preferredDistance:
      mode === "simulation"
        ? 13
        : questPaceProfile(game.setup.rules.travelPaceMode).battlefieldMeters,
    preferredDirectionDegrees: 40,
    occupied: game.autonomousGroupTraces.map((trace) => trace.position),
    minimumSpacing: mode === "simulation" ? 3 : 30,
  });
  const target =
    mode === "simulation"
      ? [targetGps.latitude, targetGps.longitude]
      : targetGps;
  player.discoverLocation("prospector-battlefield", 2);
  if (enabledGpsLocationIds !== null)
    enabledGpsLocationIds.add("prospector-battlefield");
  moveLocation("prospector-battlefield", target);
  rebuildLocationEngine();
}
function ensureRevealedLocationInsidePlayArea(locationId) {
  const location = game.getLocation(locationId);
  const playArea = validatedPlayArea ?? game.setup.playArea;
  if (!location || !playArea) return;
  const current = asGps(positionFor(locationId) ?? location.position);
  if (playArea.contains(current)) return;
  const origin = asGps(heroPosition);
  const safe = setupPlacementService.findPosition({
    playArea,
    origin,
    preferredDistance: mode === "simulation" ? 12 : 160,
    preferredDirectionDegrees: 50,
    occupied: game.locations
      .filter((item) => item.id !== locationId && isLocationEnabled(item))
      .map((item) => asGps(positionFor(item.id))),
    minimumSpacing: mode === "simulation" ? 3 : 30,
  });
  moveLocation(
    locationId,
    mode === "simulation" ? [safe.latitude, safe.longitude] : safe,
  );
}
function alignRevealedQuestLocation(locationId) {
  if (locationId !== "gold-mine") return false;
  const firstTrace = game.autonomousGroupTraces.find(
    (trace) => trace.id === "prospectors-trace-1",
  );
  const secondTrace = game.autonomousGroupTraces.find(
    (trace) => trace.id === "prospectors-trace-2",
  );
  const battlefield = game.getLocation("prospector-battlefield");
  const origin = battlefield
    ? asGps(positionFor(battlefield.id) ?? battlefield.position)
    : null;
  if (!firstTrace || !secondTrace || !origin) return false;
  const direction = bearingDegrees(firstTrace.position, secondTrace.position);
  const targetGps = setupPlacementService.findPosition({
    playArea: validatedPlayArea ?? game.setup.playArea,
    origin,
    preferredDistance:
      mode === "simulation"
        ? 14
        : questPaceProfile(game.setup.rules.travelPaceMode).mineMeters,
    preferredDirectionDegrees: direction,
    occupied: game.locations
      .filter(
        (location) => location.id !== locationId && isLocationEnabled(location),
      )
      .map((location) => asGps(positionFor(location.id))),
    minimumSpacing: mode === "simulation" ? 3 : 30,
  });
  moveLocation(
    locationId,
    mode === "simulation"
      ? [targetGps.latitude, targetGps.longitude]
      : targetGps,
  );
  return true;
}
function inspectQuestTrace(traceId) {
  const trace = game.autonomousGroupTraces.find((item) => item.id === traceId);
  if (!trace) return;
  const tracePosition =
    mode === "simulation"
      ? [trace.position.latitude, trace.position.longitude]
      : trace.position;
  if (
    distance(heroPosition, tracePosition) > (mode === "simulation" ? 8 : 25)
  ) {
    locationMessage = "Approchez-vous pour examiner cette trace.";
    logTest(locationMessage);
    return;
  }
  const progress = game.dispatchQuestEvent({ type: "TraceInspected", traceId });
  if (progress) {
    applyQuestFeedback(progress);
    render();
  }
}

function confirmScenarioPlacement() {
  if (!pendingScenarioPlacementSlotId) return;
  if (validatedPlayArea?.contains(asGps(heroPosition)) !== true) {
    locationMessage =
      "Impossible de placer ce lieu de quête hors de la zone de jeu.";
    logTest(locationMessage);
    render();
    return;
  }
  const result = game.placeScenarioLocation({
    locationSlotId: pendingScenarioPlacementSlotId,
    position: asGps(heroPosition),
  });
  if (!result.success)
    return logTest(`Placement impossible : ${result.reason}.`);
  const slotId = pendingScenarioPlacementSlotId;
  pendingScenarioPlacementSlotId = null;
  runtimePositions.set(
    result.locationId,
    mode === "gps" ? { ...result.position } : [...heroPosition],
  );
  if (enabledGpsLocationIds !== null)
    enabledGpsLocationIds.add(result.locationId);
  game.getPlayer("local").discoverLocation(result.locationId, 3);
  interactionEngine = new InteractionEngine({
    locations: game.locations,
    enemyResolver: resolveLocationEnemy,
  });
  rebuildLocationEngine();
  if (result.quest) applyQuestFeedback(result.quest);
  logTest(`Lieu de scénario placé : ${slotId}.`);
  render();
  selectLocation(result.locationId);
}

// Placement de setup et interactions issues de la carte.
function handleMapClick(position) {
  const point =
    mode === "gps" ? position : [position.latitude, position.longitude];
  if (interactionMode?.startsWith("setup-manual:")) {
    const key = interactionMode.slice("setup-manual:".length);
    const task = manualSetupPlacements.get(key);
    const gpsPoint = asGps(point);
    if (!task || validatedPlayArea?.contains(gpsPoint) !== true) {
      ui.gpsAreaStatus.textContent =
        "Le placement doit rester à l’intérieur de la zone de jeu.";
      return;
    }
    if (task.kind === "location") {
      enabledGpsLocationIds.add(task.id);
      moveLocation(task.id, point);
      if (task.id === "royal-capital") capitalPlaced = true;
    } else addSetupAutonomousGroup(task.type, task.index, gpsPoint);
    manualSetupPlacements.delete(key);
    interactionMode = null;
    renderGpsLocationButtons();
    updateSetupCompletion();
    render();
    return;
  }
  if (interactionMode === "place-start-capital") {
    if (validatedPlayArea?.contains(asGps(point)) !== true) {
      ui.gpsAreaStatus.textContent =
        "La capitale doit être placée à l’intérieur de la zone validée.";
      return;
    }
    moveLocation("royal-capital", point);
    capitalPlaced = true;
    if (enabledGpsLocationIds !== null)
      enabledGpsLocationIds.add("royal-capital");
    interactionMode = null;
    ui.gpsAreaStatus.textContent = "Capitale placée. Le héros commencera ici.";
    ui.finishGpsSetup.disabled = false;
    renderGpsLocationButtons();
    return;
  }
  if (interactionMode === "draw-area") {
    field.addPlayAreaPoint(asGps(point));
    if (gpsSetupActive)
      ui.gpsAreaStatus.textContent = `${field.playAreaPoints.length} sommet(s) posé(s).`;
    logTest(`Sommet ${field.playAreaPoints.length} ajouté.`);
    render();
    return;
  }
  if (interactionMode?.startsWith("place-location:")) {
    const id = interactionMode.slice("place-location:".length);
    if (validatedPlayArea?.contains(asGps(point)) !== true) {
      ui.gpsAreaStatus.textContent = validatedPlayArea
        ? "Ce lieu doit être placé à l’intérieur de la zone de jeu."
        : "Valide d’abord la zone de jeu avant de placer un lieu.";
      return;
    }
    enabledGpsLocationIds.add(id);
    moveLocation(id, point);
    interactionMode = null;
    renderGpsLocationButtons();
    logTest(`${game.getLocation(id).name} placé sur la carte.`);
    return;
  }
  if (interactionMode === "place-location") {
    if (validatedPlayArea?.contains(asGps(point)) !== true) {
      logTest("Placement refusé hors de la zone de jeu.");
      return;
    }
    moveLocation("bandit-camp", point);
    interactionMode = null;
    logTest("Camp placé manuellement sans QR code.");
    return;
  }
  if (!ui.sheet.hidden) {
    currentLocationId = null;
    activeGarrisonLocationId = null;
    closeSheet(ui.sheet);
    return;
  }
  if (mode === "simulation") applyPosition(point);
}
function moveLocation(id, position) {
  const result = game.updateLocationPosition({
    locationId: id,
    position: asGps(position),
  });
  if (!result.success) {
    logTest(`Déplacement de lieu refusé : ${result.reason}.`);
    return false;
  }
  runtimePositions.set(
    id,
    Array.isArray(position) ? [...position] : { ...position },
  );
  if (id === "bandit-camp") enemyHero.updatePosition(asGps(position));
  rebuildLocationEngine();
  render();
  mapView.focus(position);
  return true;
}
function renderPlacementOptions() {
  const requiredIds = new Set(
    game.scenarioLocationBindings.map((binding) => binding.locationId),
  );
  const types = [
    ...new Set(
      game.locations
        .filter(
          (location) =>
            location.id !== "royal-capital" &&
            !["capital", "quest"].includes(location.type),
        )
        .map((location) => location.type),
    ),
  ];
  const locationLabels = {
    camp: "Camps",
    city: "Villes",
    forest: "Forêts",
    fort: "Forts",
    gold_mine: "Mines d’or",
    iron_mine: "Mines de fer",
    "lumber-camp": "Camps de bûcherons",
    mine: "Mines",
    quarry: "Carrières",
    resource: "Ressources",
    ruins: "Ruines",
    village: "Villages",
  };
  ui.locationTypeOptions.innerHTML = types
    .map((type) => {
      const minimum = Math.max(
        1,
        game.locations.filter(
          (location) => location.type === type && requiredIds.has(location.id),
        ).length,
      );
      return `<div class="placement-option" data-location-type="${type}"><strong>${locationLabels[type] ?? type}</strong><label>Nombre<input type="number" min="${minimum}" max="10" value="${minimum}"></label><label>Placement<select><option value="auto">Automatique</option><option value="manual">Manuel</option></select></label></div>`;
    })
    .join("");
  const labels = {
    rogue: "Rôdeurs",
    army: "Armée",
    messenger: "Messagers",
    convoy: "Convoi",
    prospecting: "Prospecteurs",
  };
  ui.autonomousTypeOptions.innerHTML = [
    "rogue",
    "army",
    "messenger",
    "convoy",
    "prospecting",
  ]
    .map(
      (type) =>
        `<div class="placement-option" data-autonomous-type="${type}"><strong>${labels[type]}</strong><label>Nombre<input type="number" min="0" max="10" value="0"></label><label>Placement<select><option value="auto">Automatique</option><option value="manual">Manuel</option></select></label></div>`,
    )
    .join("");
  if (PLAYTEST_EDITION) {
    $("#capital-placement-mode").value = "manual";
    ui.locationTypeOptions.querySelectorAll("select").forEach((select) => {
      select.value = "manual";
    });
    ui.locationTypeOptions.querySelectorAll("input").forEach((input) => {
      input.readOnly = true;
    });
    ui.autonomousTypeOptions.closest(".setup-placement-block").hidden = true;
    $("#apply-world-setup").textContent = "Préparer les six placements";
  }
}
function placementRows(selector, attribute) {
  return [...document.querySelectorAll(selector)].map((row) => {
    const input = row.querySelector("input");
    const count = Math.max(
      Number(input.min || 0),
      Math.min(Number(input.max || Infinity), Number(input.value) || 0),
    );
    input.value = count;
    return {
      type: row.dataset[attribute],
      count,
      placement: row.querySelector("select").value,
    };
  });
}
function addSetupAutonomousGroup(type, index, position) {
  const id = `setup-${type}-${index + 1}`;
  if (game.getAutonomousGroup(id)) game.removeAutonomousGroup(id);
  const hostile = type === "army" || type === "rogue";
  const unitTypeId = type === "army" ? "chaos-raider" : "militia";
  game.addAutonomousGroup(
    new AutonomousGroup({
      id,
      type,
      owner: hostile
        ? {
            kind: type === "rogue" ? "independent" : "faction",
            id: type === "rogue" ? id : "chaos",
          }
        : { kind: "faction", id: "kingdom" },
      factionId: hostile ? "chaos" : "kingdom",
      position,
      behavior: hostile ? "aggressive" : "passive",
      morale: 5,
      army: hostile
        ? {
            units: [
              {
                id: `${id}-unit`,
                ownerPlayerId: hostile ? "chaos" : "kingdom",
                typeId: unitTypeId,
                quantity: 5,
              },
            ],
          }
        : {},
      history: [{ type: "placed_during_setup", at: Date.now() }],
    }),
  );
}
function applyWorldSetup() {
  if (!validatedPlayArea) {
    ui.gpsAreaStatus.textContent = "Valide d’abord la zone de jeu.";
    return;
  }
  enabledGpsLocationIds.clear();
  manualSetupPlacements.clear();
  game.autonomousGroups
    .filter((group) => group.id.startsWith("setup-"))
    .map((group) => group.id)
    .forEach((id) => game.removeAutonomousGroup(id));
  const occupied = [];
  const minimumDistance = mode === "gps" ? 60 : 24;
  const placeAutomatically = () =>
    setupPlacementService.generate({
      playArea: validatedPlayArea,
      count: 1,
      occupied,
      minimumDistance,
    })[0];
  if ($("#capital-placement-mode").value === "auto") {
    const position = placeAutomatically();
    occupied.push(position);
    enabledGpsLocationIds.add("royal-capital");
    moveLocation(
      "royal-capital",
      mode === "simulation"
        ? [position.latitude, position.longitude]
        : position,
    );
    capitalPlaced = true;
  } else {
    capitalPlaced = false;
    manualSetupPlacements.set("capital", {
      kind: "location",
      id: "royal-capital",
      label: PLAYTEST_EDITION ? "Camp principal" : "Capitale royale",
    });
  }
  const requiredIds = new Set(
    game.scenarioLocationBindings.map((binding) => binding.locationId),
  );
  for (const config of placementRows("[data-location-type]", "locationType")) {
    const templates = game.locations
      .filter((location) => location.type === config.type)
      .sort(
        (a, b) => Number(requiredIds.has(b.id)) - Number(requiredIds.has(a.id)),
      );
    while (templates.length < config.count) {
      const source = templates[0];
      const clone = new Location({
        ...source.toJSON(),
        id: `setup-${config.type}-${templates.length + 1}`,
        name: `${source.name} ${templates.length + 1}`,
        heroIds: [],
        garrison: {
          units: source.garrison.toJSON().units.map((unit, index) => ({
            ...unit,
            id: `setup-${config.type}-${templates.length + 1}-guard-${index + 1}`,
          })),
        },
      });
      game.locations.push(clone);
      runtimePositions.set(clone.id, { ...clone.position });
      templates.push(clone);
    }
    templates.slice(0, config.count).forEach((location, index) => {
      if (config.placement === "auto") {
        const position = placeAutomatically();
        occupied.push(position);
        enabledGpsLocationIds.add(location.id);
        moveLocation(
          location.id,
          mode === "simulation"
            ? [position.latitude, position.longitude]
            : position,
        );
      } else
        manualSetupPlacements.set(`location:${location.id}`, {
          kind: "location",
          id: location.id,
          label: `${location.name}${config.count > 1 ? ` ${index + 1}` : ""}`,
        });
    });
  }
  for (const config of placementRows(
    "[data-autonomous-type]",
    "autonomousType",
  ))
    for (let index = 0; index < config.count; index += 1) {
      if (config.placement === "auto") {
        const position = placeAutomatically();
        occupied.push(position);
        addSetupAutonomousGroup(config.type, index, position);
      } else
        manualSetupPlacements.set(`autonomous:${config.type}:${index}`, {
          kind: "autonomous",
          type: config.type,
          index,
          label: `${config.type} ${index + 1}`,
        });
    }
  interactionEngine = new InteractionEngine({
    locations: game.locations,
    enemyResolver: resolveLocationEnemy,
  });
  rebuildLocationEngine();
  renderGpsLocationButtons();
  updateSetupCompletion();
  render();
}
function renderGpsLocationButtons() {
  ui.gpsLocationButtons.innerHTML = [...manualSetupPlacements]
    .map(
      ([key, task]) =>
        `<button type="button" class="secondary-button" data-manual-placement="${key}">Placer ${task.label}</button>`,
    )
    .join("");
  ui.gpsLocationButtons.querySelectorAll("[data-manual-placement]").forEach(
    (button) =>
      (button.onclick = () => {
        interactionMode = `setup-manual:${button.dataset.manualPlacement}`;
        ui.gpsAreaStatus.textContent = `Touche la carte pour placer ${manualSetupPlacements.get(button.dataset.manualPlacement).label}.`;
      }),
  );
}
function updateSetupCompletion() {
  ui.finishGpsSetup.disabled = !capitalPlaced || manualSetupPlacements.size > 0;
  if (!ui.finishGpsSetup.disabled)
    ui.gpsAreaStatus.textContent =
      "Monde prêt : tous les éléments demandés sont placés.";
}
function validatePlayArea() {
  validatedPlayArea = field.createPlayArea();
  game.setup.playArea = validatedPlayArea;
  playAreaGrid = new PlayAreaGrid({
    playArea: validatedPlayArea,
    cellSizeMeters: mode === "gps" ? 15 : 15_000,
  });
  playAreaPresence.setPlayArea(validatedPlayArea, asGps(heroPosition));
  rebuildLocationEngine();
  interactionMode = null;
  lastVisitedCellId = null;
  persistFieldState();
  $("#toggle-heatmap").disabled = false;
  mapView.setPlayArea(validatedPlayArea.polygon);
  applyPosition(heroPosition);
  const message = `Zone validée · ${(validatedPlayArea.getAreaSquareMeters() / 10_000).toFixed(1)} ha · ${playAreaGrid.cells.length} cellules de 15 m × 15 m.`;
  if (gpsSetupActive) {
    ui.gpsAreaStatus.textContent = `${message} Configure puis génère les placements.`;
    ui.finishGpsSetup.disabled = true;
    renderGpsLocationButtons();
  }
  logTest(message);
}
function openCheats() {
  const dialog = $("#cheat-dialog");
  const form = dialog.querySelector("form");
  form.elements["hero-level"].value = hero.level;
  form.elements["hero-health"].value = hero.health;
  ["attack", "defense", "morale", "mobility", "command", "health"].forEach(
    (stat) => {
      form.elements[`stat-${stat}`].value = hero.temporaryModifiers[stat];
    },
  );
  ["gold", "wood", "stone", "iron"].forEach((resource) => {
    form.elements[`resource-${resource}`].value =
      hero.getResourceAmount(resource);
  });
  $("#cheat-status").textContent = "";
  dialog.showModal();
}
function applyHeroCheats() {
  const form = $("#cheat-dialog form");
  try {
    cheatService.applyHeroChanges(hero, {
      level: form.elements["hero-level"].value,
      health: form.elements["hero-health"].value,
      stats: Object.fromEntries(
        ["attack", "defense", "morale", "mobility", "command", "health"].map(
          (stat) => [stat, form.elements[`stat-${stat}`].value],
        ),
      ),
      resources: Object.fromEntries(
        ["gold", "wood", "stone", "iron"].map((resource) => [
          resource,
          form.elements[`resource-${resource}`].value,
        ]),
      ),
    });
    $("#cheat-status").textContent = "Modifications appliquées au héros.";
    logTest("Cheat : statistiques du héros modifiées.");
    render();
  } catch (error) {
    $("#cheat-status").textContent = error.message;
  }
}
function createCheatLocation() {
  const form = $("#cheat-dialog form");
  const value = (name) => form.elements[name].value;
  try {
    if (game.getLocation(value("location-id")))
      throw new Error("Cet identifiant de localisation existe déjà.");
    const location = cheatService.createLocation(
      {
        id: value("location-id"),
        name: value("location-name"),
        type: value("location-type"),
        ownerId: value("location-owner"),
        level: value("location-level"),
        population: value("location-population"),
        defenseSlots: value("location-defense-slots"),
        productionResource: value("location-production-resource"),
        productionAmount: value("location-production-amount"),
      },
      asGps(heroPosition),
    );
    game.locations.push(location);
    runtimePositions.set(
      location.id,
      Array.isArray(heroPosition) ? [...heroPosition] : { ...heroPosition },
    );
    game.getPlayer("local").discoverLocation(location.id, 3);
    interactionEngine = new InteractionEngine({
      locations: game.locations,
      enemyResolver: resolveLocationEnemy,
    });
    rebuildLocationEngine();
    render();
    $("#cheat-status").textContent = `${location.name} créé à votre position.`;
    logTest(`Cheat : ${location.name} créé.`);
  } catch (error) {
    $("#cheat-status").textContent = error.message;
  }
}
function placeQuestLocation() {
  const gps = asGps(heroPosition);
  if (!field.canPlaceQuestLocation(gps, validatedPlayArea)) {
    locationMessage =
      "Le lieu de quête doit respecter la distance demandée et rester dans la zone de jeu.";
    logTest(locationMessage);
    render();
    return;
  }
  let location = game.getLocation("quest-beacon-300m");
  if (!location) {
    location = new Location({
      id: "quest-beacon-300m",
      name: "Balise des 300 mètres",
      type: "quest",
      roles: ["quest"],
      source: "quest",
      position: gps,
      interactionRadius: 40,
      visibility: "discovered",
      features: {},
      qr: { enabled: false },
    });
    game.locations.push(location);
  }
  runtimePositions.set(location.id, mode === "gps" ? gps : [...heroPosition]);
  rebuildLocationEngine();
  logTest(
    `Lieu de quête posé à ${Math.round(field.questDistanceMeters)} m du départ.`,
  );
  render();
}

function renderEncounter() {
  ui.sheet.hidden = false;
  ui.sheet.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Rencontre</span><h2>Ennemi détecté</h2><p>${currentEncounter.enemy.name}</p><div class="sheet-actions"><button data-encounter="fight">Combattre</button><button class="secondary-button" data-encounter="avoid">Éviter</button></div>`;
  ui.sheet.querySelector(".sheet-close").onclick = () => closeSheet(ui.sheet);
  ui.sheet.querySelectorAll("[data-encounter]").forEach(
    (button) =>
      (button.onclick = () => {
        currentEncounter.choose(button.dataset.encounter);
        button.dataset.encounter === "fight"
          ? openBattle()
          : closeSheet(ui.sheet);
      }),
  );
}
function selectLocation(id) {
  const location = mappedLocations().find((item) => item.id === id);
  if (!location) return;
  activeGarrisonLocationId = null;
  currentLocationId = id;
  if (window.matchMedia("(orientation: landscape)").matches) {
    if (!location.nearby) {
      currentLocationId = null;
      closeSheet(ui.sheet);
      return;
    }
    renderLocationTab({
      element: ui.sheet,
      location,
      onOpen: () => openLocationDetail(id),
    });
    return;
  }
  renderLocationSheet({
    element: ui.sheet,
    location,
    onClose: () => {
      currentLocationId = null;
      activeGarrisonLocationId = null;
      closeSheet(ui.sheet);
    },
    onAction: runAction,
    onOpenWorld: () => openLocationDetail(id),
    onOpenReserves: () => openLocationDetail(id, "reserves"),
    onOpenGarrison: () => openGarrisonManager(id),
  });
}
function prepareQuestInteraction(interactionId) {
  if (interactionId !== "receive-evacuation-order" || mode !== "simulation")
    return;
  const campPosition = positionFor("evacuation-camp");
  if (campPosition)
    game.updateLocationPosition({
      locationId: "evacuation-camp",
      position: asGps(campPosition),
    });
}
// Les vues émettent des intentions ; cette couche appelle l'API publique de Game.
function runAction(action, { returnToWorld = false } = {}) {
  const location = game.getLocation(currentLocationId);
  if (action === "astral-travel") {
    const baseRadius = baseRangesFor(location).interactionRadius;
    const targetDistance = distance(heroPosition, positionFor(location.id));
    const reachBonus =
      mode === "gps"
        ? (data.heroClasses.find((definition) => definition.id === hero.classId)
            ?.features?.astralReachBonus ?? 0)
        : 10;
    const result = game.heroClassFeatureService.activateAstralTravel(hero, {
      locationId: location.id,
      distance: targetDistance,
      baseRadius,
      reachBonus,
    });
    locationMessage = result.success
      ? `Voyage astral actif pendant 5 minutes : ${location.name} est accessible.`
      : `Voyage astral impossible : ${result.reason}.`;
    if (result.success) rebuildLocationEngine();
  } else if (action === "talk-chief") {
    openChiefDialogue(location.id);
    return;
  } else if (action.startsWith("quest-interaction:")) {
    const interactionId = action.slice("quest-interaction:".length);
    prepareQuestInteraction(interactionId);
    const result = game.dispatchQuestEvent({
      type: "InteractionCompleted",
      interactionId,
      locationId: location.id,
    });
    locationMessage = result
      ? "Départ enregistré : le bilan des habitants et ressources sauvés sera établi à la capitale."
      : "Cette interaction n'a aucun effet.";
    if (result) applyQuestFeedback(result);
  } else if (action === "engage-evacuation-vanguard") {
    const vanguard = game.getAutonomousGroup("chaos-column-vanguard");
    if (!vanguard || vanguard.status === "destroyed")
      locationMessage = "L’avant-garde a déjà été neutralisée.";
    else {
      beginAutonomousBattle(vanguard);
      return;
    }
  } else if (action === "organize-evacuation") {
    const result = game.organizeLocationEvacuation({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
    });
    locationMessage = result.success
      ? `${result.people} habitant(s) embarqué(s) · ${result.dismantlings.length} bâtiment(s) en cours de démontage.`
      : result.reason === "insufficient_slots"
        ? `Évacuation impossible : ${result.requiredSlots} emplacement(s) libre(s) requis, ${result.freeSlots} disponible(s).`
        : `Évacuation impossible : ${result.reason}.`;
  } else if (action.startsWith("dismantle:")) {
    const structureId = action.slice("dismantle:".length);
    const result = game.startLocationDismantling({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
      structureId,
    });
    locationMessage = result.success
      ? `Démantèlement de ${structureId} commencé. Fin à ${new Date(result.task.deadline.expiresAt).toLocaleTimeString("fr-FR")}.`
      : `Démantèlement impossible : ${result.reason}.`;
  } else if (action.startsWith("dismantling:")) {
    locationMessage = "Ce bâtiment est déjà en cours de démantèlement.";
  } else if (action.startsWith("recruit:")) {
    const result = game.recruitUnit({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
      unitTypeId: action.split(":")[1],
    });
    locationMessage = result.success
      ? "Unité recrutée."
      : `Impossible : ${result.reason}.`;
  } else if (action === "complete-units") {
    const result = game.completeHeroUnits({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
    });
    const added = result.reinforced.reduce((sum, unit) => sum + unit.added, 0);
    locationMessage = result.success
      ? `${added} soldat(s) ont complété vos unités.`
      : `Renfort impossible : ${result.reason}.`;
  } else if (action === "heal-units") {
    const result = game.healHeroUnits({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
      timeUnits: 1,
    });
    locationMessage = result.success
      ? `${result.restoredHealth} PV restauré(s) aux soldats.`
      : `Soin impossible : ${result.reason}.`;
  } else if (action.startsWith("reserve-balance:")) {
    const [, resourceName, targetHeroAmount] = action.split(":");
    const currentHeroAmount = Math.floor(hero.getResourceAmount(resourceName));
    const difference = Number(targetHeroAmount) - currentHeroAmount;
    if (difference === 0) {
      locationMessage = "La répartition est déjà appliquée.";
      render();
      return returnToWorld ? renderWorld() : selectLocation(currentLocationId);
    }
    const direction = difference > 0 ? "to_hero" : "to_location";
    const result = game.transferLocationResource({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
      resourceName,
      amount: Math.abs(difference),
      direction,
    });
    const mood =
      result.contentmentDelta > 0
        ? ` · contentement +${result.contentmentDelta}`
        : result.contentmentDelta < 0
          ? ` · contentement ${result.contentmentDelta}`
          : "";
    locationMessage = result.success
      ? `${result.transferred} ${resourceName} transféré${mood}.`
      : `Transfert impossible : ${result.reason}.`;
  } else if (action.startsWith("production-transfer:")) {
    const [, resourceName, destination, amount] = action.split(":");
    const result = game.transferLocationProduction({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
      resourceName,
      amount: Number(amount),
      destination,
    });
    locationMessage = result.success
      ? `${result.transferred} ${resourceName} déplacé vers ${destination === "hero" ? "les bagages" : "les réserves"}.`
      : `Transfert impossible : ${result.reason}.`;
  } else if (action.startsWith("prepare-population:")) {
    const result = game.preparePopulationPackages({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
      people: Number(action.split(":")[1]),
    });
    locationMessage = result.success
      ? `${result.people} habitant(s) placés dans les réserves universelles.`
      : `Préparation impossible : ${result.reason}.`;
  } else if (action.startsWith("take-population:")) {
    const result = game.takeLocationPopulationPackage({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
      people: Number(action.split(":")[1]),
    });
    locationMessage = result.success
      ? `${result.people} habitant(s) placés dans les bagages.`
      : `Retrait impossible : ${result.reason}.`;
  } else if (action.startsWith("settle-population:")) {
    const result = game.settlePopulationPackage({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
      packageId: action.slice("settle-population:".length),
    });
    locationMessage = result.success
      ? `${result.people} habitant(s) installé(s).`
      : `Installation impossible : ${result.reason}.`;
  } else if (action.startsWith("deposit-resource:")) {
    const [resourceName, requestedAmount] = action
      .slice("deposit-resource:".length)
      .split(":");
    const amount =
      requestedAmount === undefined ? undefined : Number(requestedAmount);
    const result = game.depositLocationResource({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
      resourceName,
      amount,
    });
    locationMessage = result.success
      ? `${result.deposited} ${resourceName} déposé.`
      : `Dépôt impossible : ${result.reason}.`;
  } else if (action.startsWith("deposit-item:")) {
    const result = game.depositLocationItem({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
      lootId: action.slice("deposit-item:".length),
    });
    locationMessage = result.success
      ? `${result.item.quantity} ${result.item.itemId} déposé.`
      : `Dépôt impossible : ${result.reason}.`;
  } else if (action.startsWith("build-improvement:")) {
    const result = game.buildCampImprovement({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
      improvementId: action.slice("build-improvement:".length),
    });
    locationMessage = result.success
      ? `Amélioration construite · niveau ${result.level} · +${result.experienceGained} XP.`
      : `Construction impossible : ${result.reason}.`;
  } else if (action === "level-up-camp") {
    const result = game.levelUpCamp({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
    });
    locationMessage = result.success
      ? `Le camp atteint le niveau ${result.level}.`
      : `Évolution impossible : ${result.status?.blockers?.join(" · ") || result.reason}.`;
  } else if (action.startsWith("evolve-camp:")) {
    const result = game.evolveCamp({
      playerId: "local",
      heroId: hero.id,
      locationId: location.id,
      branchId: action.slice("evolve-camp:".length),
    });
    locationMessage = result.success
      ? `${location.name} est devenu ${result.evolvedTo === "village" ? "un village" : "un fort"}.`
      : `Transformation impossible : ${result.status?.blockers?.join(" · ") || result.reason}.`;
  } else if (action === "trade")
    locationMessage =
      "Le commerce est disponible ici ; les offres et quotas seront ajoutés avec le système d’objets.";
  else if (action === "battle") {
    const requirement = game.getLocationCaptureRequirement({
      playerId: "local",
      locationId: location.id,
    });
    if (requirement.state === "can_capture") {
      const capture = game.attemptLocationCapture({
        playerId: "local",
        heroId: hero.id,
        locationId: location.id,
      });
      locationMessage = capture.success
        ? "Lieu capturé sans combat."
        : `Capture impossible : ${capture.reason}.`;
      if (capture.success) {
        deviceAlerts.notify("notice");
        logTest(`${location.name} passe sous votre contrôle.`);
        render();
        if (returnToWorld) {
          worldMessage = locationMessage;
          renderWorld();
        } else selectLocation(location.id);
        return;
      }
    } else if (requirement.state === "quest_required")
      locationMessage = `Capture protégée par la quête ${requirement.objectiveId}.`;
    else openBattle();
  }
  render();
  if (action !== "battle") {
    if (pendingRevealedLocationId) {
      const revealedLocationId = pendingRevealedLocationId;
      pendingRevealedLocationId = null;
      currentLocationId = revealedLocationId;
      const revealedPosition = positionFor(revealedLocationId);
      if (revealedPosition) mapView.focus(revealedPosition);
      if (revealedLocationId === "evacuation-camp") {
        currentLocationId = null;
        closeSheet(ui.sheet);
        switchView("map");
      } else selectLocation(revealedLocationId);
    } else if (returnToWorld) {
      worldMessage = locationMessage;
      renderWorld();
    } else selectLocation(currentLocationId);
  }
}

function openChiefDialogue(locationId) {
  const conversation = conversationFor(locationId);
  if (!conversation) return;
  closeSheet(ui.sheet);
  activeDialogue = {
    locationId,
    conversation,
    lines: [...conversation.openingLines],
    lineIndex: 0,
    showChoices: false,
  };
  renderActiveDialogue();
}

function conversationFor(locationId) {
  const conversation = game.getLocationChiefConversation({
    playerId: "local",
    locationId,
  });
  if (!conversation) return null;
  const questInteractions = game.getQuestInteractionsForLocation(locationId);
  conversation.options.unshift(
    ...questInteractions.map((interaction) => ({
      id: `quest-interaction:${interaction.interactionId}`,
      kind: "quest_interaction",
      label: interaction.label,
      responseLines: interaction.responseLines,
    })),
  );
  if (locationId === "royal-capital")
    conversation.options.unshift(
      ...game.getAvailableQuests().map((quest) => ({
        id: `accept-marshal-quest:${quest.id}`,
        kind: "quest_offer",
        label: `Recevoir les ordres : ${quest.title}`,
      })),
    );
  return conversation;
}

function renderActiveDialogue() {
  if (!activeDialogue) return closeDialogueView($("#dialogue-layer"));
  renderDialogueView({
    element: $("#dialogue-layer"),
    conversation: activeDialogue.conversation,
    lines: activeDialogue.lines,
    lineIndex: activeDialogue.lineIndex,
    showChoices: activeDialogue.showChoices,
    onClose: closeActiveDialogue,
    onAdvance: () => {
      if (activeDialogue.lineIndex + 1 < activeDialogue.lines.length)
        activeDialogue.lineIndex += 1;
      else activeDialogue.showChoices = true;
      renderActiveDialogue();
    },
    onChoose: chooseDialogueOption,
  });
}

function chooseDialogueOption(optionId) {
  if (!activeDialogue) return;
  let lines,
    nextOptions = null;
  if (optionId.startsWith("accept-marshal-quest:")) {
    const questId = optionId.slice("accept-marshal-quest:".length);
    const offer = game
      .getAvailableQuests()
      .find((quest) => quest.id === questId);
    const accepted = offer
      ? game.acceptAvailableQuest(questId)
      : { success: false };
    if (accepted.success) {
      game.startCurrentScenarioPlacements(asGps(heroPosition));
      lines = offer.briefingLines.length
        ? [
            ...offer.briefingLines,
            `Nouvelle quête — ${offer.title} : ${offer.description}`,
          ]
        : [offer.description, `Nouvelle quête — ${offer.title}.`];
      locationMessage = `Nouvelle quête reçue du maréchal : ${offer.title}.`;
      logTest(locationMessage);
      if (questId === "royal-camp-evacuation") {
        prepareQuestInteraction("receive-evacuation-order");
        const progress = game.dispatchQuestEvent({
          type: "InteractionCompleted",
          interactionId: "receive-evacuation-order",
          locationId: activeDialogue.locationId,
        });
        if (progress) {
          questHudExpanded = true;
          applyQuestFeedback(progress);
          lines.push(locationMessage);
        }
      }
    } else lines = ["Le maréchal n’a aucun nouvel ordre à vous confier."];
  } else if (optionId.startsWith("quest-interaction:")) {
    const selectedOption = activeDialogue.conversation.options.find(
      (option) => option.id === optionId,
    );
    const interactionId = optionId.slice("quest-interaction:".length);
    prepareQuestInteraction(interactionId);
    const progress = game.dispatchQuestEvent({
      type: "InteractionCompleted",
      interactionId,
      locationId: activeDialogue.locationId,
    });
    const narration = progress?.appliedEvents
      .flatMap((entry) => entry.appliedEffects)
      .find((effect) => effect.type === "narration");
    lines = selectedOption?.responseLines?.length
      ? [...selectedOption.responseLines]
      : [
          narration?.text ??
            (progress
              ? "Votre mission est mise à jour."
              : "Nous avons déjà parlé de cela."),
        ];
    if (progress) {
      applyQuestFeedback(progress);
      lines = selectedOption?.responseLines?.length
        ? [...selectedOption.responseLines, locationMessage]
        : [locationMessage];
    }
  } else {
    const result = game.selectLocationChiefOption({
      playerId: "local",
      heroId: hero.id,
      locationId: activeDialogue.locationId,
      optionId,
    });
    lines = result.success
      ? (result.lines ?? [result.message])
      : [`Conversation impossible : ${result.reason}.`];
    if (result.options) nextOptions = result.options;
  }
  activeDialogue.conversation =
    conversationFor(activeDialogue.locationId) ?? activeDialogue.conversation;
  if (nextOptions) activeDialogue.conversation.options = nextOptions;
  activeDialogue.lines = lines;
  activeDialogue.lineIndex = 0;
  activeDialogue.showChoices = false;
  render();
  renderActiveDialogue();
}

function closeActiveDialogue() {
  activeDialogue = null;
  closeDialogueView($("#dialogue-layer"));
  if (pendingRevealedLocationId) {
    const locationId = pendingRevealedLocationId;
    pendingRevealedLocationId = null;
    const position = positionFor(locationId);
    if (position) mapView.focus(position);
    if (locationId === "evacuation-camp") {
      currentLocationId = null;
      closeSheet(ui.sheet);
      switchView("map");
    } else selectLocation(locationId);
  }
  render();
}

// Cycle de vie de la bataille : création, rendu, résolution et retour au monde.
function openBattle({ ambushTeamId = null } = {}) {
  if (activeBattle && activeBattle.status !== "finished") return;
  closeSheet(ui.sheet);
  enemyHero.updatePosition(asGps(heroPosition));
  const sourceLocationId = currentEncounter?.locationId ?? currentLocationId;
  if (
    ambushTeamId === null &&
    sourceLocationId &&
    !game.canPerformLocationAction({
      playerId: "local",
      locationId: sourceLocationId,
      action: "attack",
    })
  ) {
    locationMessage = "Attaque interdite par la relation avec ce lieu.";
    return selectLocation(sourceLocationId);
  }
  const battleLocationId =
    currentEncounter?.locationId ?? currentLocationId ?? "bandit-camp";
  const battleLocation = game.getLocation(battleLocationId);
  const defenderHeroIds = battleLocation?.heroIds.filter(
    (id) => game.getHero(id)?.playerId !== hero.playerId,
  ) ?? [enemyHero.id];
  const battle = game.createBattle({
    teamParticipants: [
      { id: "heroes", heroIds: [hero.id] },
      { id: "bandits", heroIds: defenderHeroIds, locationId: battleLocationId },
    ],
    position: asGps(heroPosition),
    sourceLocationId: battleLocationId,
    sourceEnemyTeamId: "bandits",
    config: { ambushTeamId, ambushDefenderRevealDelayMs: 1_500 },
    loot: [
      {
        id: "bandit-gold",
        itemId: "gold",
        quantity: 12,
        portable: true,
        valuePerUnit: 1,
      },
    ],
  });
  activateBattle(battle, { ambushTeamId });
}

function syncAutonomousBattle() {
  if (activeBattle && activeBattle.status !== "finished") return;
  const battle = [...game.battles]
    .reverse()
    .find(
      (candidate) =>
        candidate.status !== "finished" &&
        candidate.teams.some((team) =>
          team.heroes.some((item) => item.sourceId === hero.id),
        ),
    );
  if (battle)
    activateBattle(battle, { ambushTeamId: battle.config.ambushTeamId });
}

function activateBattle(battle, { ambushTeamId = null } = {}) {
  activeBattle = battle;
  activeBattle.teams[0].units.forEach((unit) => {
    unit.lane = null;
    unit.progress = 0;
  });
  activeBattle.teams[1].units.forEach((unit, index) => {
    unit.lane = index % 3;
    unit.progress = 0;
  });
  battleResolved = false;
  battleResult = null;
  selectedBattlePower = null;
  battleMessage = ambushTeamId
    ? "Embuscade ! Réagissez immédiatement."
    : "Placez vos unités avant le début.";
  setBattleNavigationLocked(true);
  const revealBattle = () => {
    closeSheet(ui.sheet);
    switchView("battle");
    renderBattle();
  };
  const revealDelay =
    ambushTeamId !== null && ambushTeamId !== "heroes"
      ? game.heroClassFeatureService.ambushRevealDelay(
          hero,
          activeBattle.config.ambushDefenderRevealDelayMs,
        )
      : 0;
  if (revealDelay > 0) {
    ui.sheet.hidden = false;
    ui.sheet.innerHTML = `<span class="sheet-state">Alerte</span><h2>Vous êtes attaqué !</h2><p>Le combat a déjà commencé.</p>`;
    setTimeout(revealBattle, revealDelay);
  } else revealBattle();
  logTest(
    `${ambushTeamId ? "Embuscade" : "Combat"} déclenché à la position du joueur.`,
  );
  clearInterval(battleTimer);
  battleTimer = setInterval(() => {
    if (!isBattleLandscape()) return;
    activeBattle.tick(500);
    resolveFinishedBattle();
    if (!battleDragging) renderBattle();
    render();
    if (activeBattle.status === "finished") clearInterval(battleTimer);
  }, 500);
}
function isBattleLandscape() {
  return window.innerWidth > window.innerHeight;
}
function renderBattle() {
  if (debugPauseControl.isPaused) {
    pendingBattleRender = true;
    return;
  }
  if (battleResult) {
    renderBattleResultView({
      element: ui.battle,
      battle: activeBattle,
      result: battleResult,
      playerId: "local",
      playerTeamId: "heroes",
      onReturnToMap: () => {
        switchView("map");
        render();
      },
    });
    return;
  }
  renderBattleView({
    element: ui.battle,
    battle: activeBattle,
    playerTeamId: "heroes",
    message: battleMessage,
    selectedUnitId: selectedBattleUnitId,
    selectedPower: selectedBattlePower,
    onSelectUnit: (id) => {
      selectedBattlePower = null;
      selectedBattleUnitId = id;
      renderBattle();
    },
    onDragState: (active) => {
      battleDragging = active;
    },
    onAssign: (unitId, lane) => {
      const heroId = activeBattle.teams[0].heroes.find(
        (item) => item.state === "active",
      )?.id;
      const result = heroId
        ? activeBattle.assignUnit(unitId, heroId, lane)
        : { success: false };
      selectedBattleUnitId = null;
      battleMessage = result.success
        ? `Unité sur la ligne ${lane + 1}.`
        : "Placement impossible.";
      renderBattle();
    },
    onRetreatLine: (lane) => {
      selectedBattlePower = null;
      const result = activeBattle.orderRetreat("heroes", lane);
      battleMessage = result.success
        ? `Retraite ordonnée ligne ${lane + 1} · commandement dépensé.`
        : result.reason === "insufficient_command_points"
          ? "Commandement insuffisant pour ordonner la retraite."
          : `Aucune unité disponible ligne ${lane + 1}.`;
      renderBattle();
    },
    onSelectPower: (power) => {
      selectedBattleUnitId = null;
      selectedBattlePower = power;
      battleMessage = `${power.name} : choisissez une cible.`;
      renderBattle();
    },
    onCancelPower: () => {
      selectedBattlePower = null;
      battleMessage = "Pouvoir annulé.";
      renderBattle();
    },
    onActivatePower: ({
      userId,
      powerId,
      cost,
      targetId = null,
      name = null,
    }) => {
      const result = activeBattle.activateSpecialPower({
        teamId: "heroes",
        userId,
        powerId,
        cost,
        targetId,
      });
      const label =
        name ??
        activeBattle.getSpecialPowerDefinition(powerId)?.name ??
        powerId;
      selectedBattlePower = null;
      battleMessage = result.success
        ? `${label} appliqué (${result.appliedEffects?.length ?? 0} effet(s)) · ◆ ${result.remainingCommandPoints}.`
        : result.reason === "insufficient_command_points"
          ? "Commandement insuffisant pour ce pouvoir."
          : result.reason === "invalid_target"
            ? "Cette cible n’est pas valide."
            : "Pouvoir indisponible.";
      renderBattle();
    },
    onFlee: () => {
      if (
        !window.confirm(
          "Fuir avec l’armée ? Une poursuite ennemie pourra infliger des dégâts supplémentaires.",
        )
      )
        return;
      selectedBattlePower = null;
      const result = game.fleeBattleHero({
        battleId: activeBattle.id,
        heroId: hero.id,
      });
      battleMessage = result.success
        ? "Fuite engagée : l’armée quitte le champ de bataille."
        : "La fuite est impossible.";
      resolveFinishedBattle();
      renderBattle();
      render();
    },
    onSurrender: () => {
      if (
        !window.confirm(
          "Se rendre ? Le héros survivra, mais perdra son armée et tous ses bagages.",
        )
      )
        return;
      selectedBattlePower = null;
      game.surrenderBattle({ battleId: activeBattle.id, teamId: "heroes" });
      resolveFinishedBattle();
      renderBattle();
      render();
    },
  });
}
function resolveFinishedBattle() {
  if (activeBattle.status !== "finished" || battleResolved) return;
  const result = game.resolveBattle(activeBattle.id);
  battleResolved = true;
  battleResult = result;
  setBattleNavigationLocked(false);
  if (activeBattle.winnerTeamId === "heroes" && activeBattle.sourceLocationId) {
    const quest = game.dispatchQuestEvent({
      type: "BattleWon",
      locationId: activeBattle.sourceLocationId,
      battleId: activeBattle.id,
    });
    if (quest) applyQuestFeedback(quest);
  } else if (activeBattle.sourceLocationId) {
    const failure = game.dispatchQuestEvent({
      type: "BattleLost",
      locationId: activeBattle.sourceLocationId,
      battleId: activeBattle.id,
    });
    const effects = failure?.appliedEvent?.appliedEffects ?? [];
    const narration = effects.find((effect) => effect.type === "narration");
    if (narration) { locationMessage = narration.text; logTest(locationMessage); }
    if (failure?.nextPhaseId) game.startCurrentScenarioPlacements(asGps(heroPosition));
  }
  if (result.destroyedLocationId) {
    rebuildLocationEngine();
    interactionEngine = new InteractionEngine({
      locations: game.locations.filter(
        (location) => location.state !== "destroyed",
      ),
      enemyResolver: resolveLocationEnemy,
    });
    currentEncounter = null;
    currentLocationId = null;
  }
  if (result.capturedLocationId) {
    currentEncounter = null;
    locationMessage = "Lieu capturé après la victoire.";
  }
  battleMessage = `Bataille terminée · vainqueur ${activeBattle.winnerTeamId ?? "aucun"}.`;
  logTest(
    `Champ de bataille créé${result.lootSite ? " et butin calculé" : ", sans butin"}${result.destroyedLocationId ? " · camp ennemi détruit" : ""}${result.capturedLocationId ? " · lieu capturé" : ""}.`,
  );
}

// Projection des données persistantes vers les vues et le stockage terrain.
function visibleSites() {
  if (!game || !heroPosition) return [];
  return game
    .getVisibleDynamicSites({
      playerId: "local",
      position: asGps(heroPosition),
    })
    .map((site) =>
      mode === "simulation"
        ? { ...site, interactionRadius: site.kind === "battlefield" ? 8 : 6 }
        : site,
    );
}
function persistFieldState() {
  saveFieldState({ mode, gpsAccuracyLog });
}
function renderGpsAccuracySummary() {
  const summary = gpsAccuracyLog.getSummary();
  gpsAccuracyStatus.textContent = summary.count
    ? `Journal GPS · ${summary.count} relevé(s) · moyenne ±${Math.round(summary.average)} m · min ${Math.round(summary.minimum)} m · max ${Math.round(summary.maximum)} m`
    : "Journal GPS : aucun relevé.";
}
function directoryLocations() {
  const player = game.getPlayer("local");
  return mappedLocations().map((snapshot) => {
    const location = game.getLocation(snapshot.id);
    const ownerPlayer = location.ownerId
      ? game.getPlayer(location.ownerId)
      : null;
    const ownerName =
      location.ownerId === "kingdom"
        ? "Royaume"
        : (ownerPlayer?.name ?? location.ownerId);
    const owner = location.ownerId
      ? {
          id: location.ownerId,
          name: ownerName,
          color:
            location.ownerId === "local"
              ? "#62a8ff"
              : location.ownerId === "bandits"
                ? "#d86868"
                : "#d8b862",
        }
      : null;
    const heroes = location.heroIds
      .map((id) => game.getHero(id))
      .filter((item) => item && item.playerId !== player.id)
      .map((item) => ({
        ...item,
        className:
          data.heroClasses.find((heroClass) => heroClass.id === item.classId)
            ?.name ?? item.classId,
      }));
    return {
      ...buildLocationIntel({
        location,
        snapshot,
        knowledgeLevel: game.heroClassFeatureService.informationLevel(
          hero,
          player.getLocationKnowledge(location.id),
        ),
        owner,
        heroes,
        description:
          descriptions[location.id] ??
          "Un lieu dont l'histoire reste à découvrir.",
      }),
      campDevelopment: snapshot.campDevelopment,
    };
  });
}
function useDivination() {
  const radius =
    mode === "gps"
      ? (game.heroClasses.get(hero.classId)?.features.divinationRadius ?? 0)
      : 30;
  const locations = game.locations
    .filter(isLocationEnabled)
    .map((location) => ({
      id: location.id,
      position: asGps(positionFor(location.id)),
    }));
  const result = game.heroClassFeatureService.divine(hero, {
    player: game.getPlayer("local"),
    locations,
    distanceFn: (first, second) =>
      mode === "gps"
        ? distanceMeters(first, second)
        : Math.hypot(
            first.latitude - second.latitude,
            first.longitude - second.longitude,
          ),
    radius,
  });
  logTest(
    result.success
      ? `Divination : ${result.revealedLocationIds.length} nouveau(x) lieu(x) révélé(s).`
      : `Divination impossible : ${result.reason}.`,
  );
  render();
}
function useAstralTravel() {
  const reachBonus =
    mode === "gps"
      ? (game.heroClasses.get(hero.classId)?.features.astralReachBonus ?? 0)
      : 10;
  const player = game.getPlayer("local");
  const target = game.locations
    .filter(
      (location) =>
        isLocationEnabled(location) && player.knowsLocation(location.id),
    )
    .map((location) => {
      const baseRadius = baseRangesFor(location).interactionRadius;
      const targetDistance = distance(heroPosition, positionFor(location.id));
      return { location, baseRadius, targetDistance };
    })
    .filter(
      (entry) =>
        entry.targetDistance > entry.baseRadius &&
        entry.targetDistance <= entry.baseRadius + reachBonus,
    )
    .sort((first, second) => first.targetDistance - second.targetDistance)[0];
  if (!target) {
    logTest(
      "Voyage astral : aucun lieu connu n’est actuellement à portée astrale.",
    );
    return render();
  }
  const result = game.heroClassFeatureService.activateAstralTravel(hero, {
    locationId: target.location.id,
    distance: target.targetDistance,
    baseRadius: target.baseRadius,
    reachBonus,
  });
  if (result.success) {
    rebuildLocationEngine();
    logTest(
      `Voyage astral actif vers ${target.location.name} pendant 5 minutes.`,
    );
    selectLocation(target.location.id);
  } else logTest(`Voyage astral impossible : ${result.reason}.`);
  render();
}
function filteredDirectoryLocations() {
  const search = worldFilters.search.trim().toLocaleLowerCase("fr");
  const locations = directoryLocations().filter(
    (location) =>
      (!search || location.name.toLocaleLowerCase("fr").includes(search)) &&
      (!worldFilters.type || location.nature === worldFilters.type) &&
      (!worldFilters.owner ||
        (worldFilters.owner === "known"
          ? location.owner.id
          : !location.owner.id)),
  );
  const compare =
    worldFilters.sort === "name"
      ? (a, b) => a.name.localeCompare(b.name, "fr")
      : worldFilters.sort === "type"
        ? (a, b) => a.nature.localeCompare(b.nature, "fr")
        : worldFilters.sort === "owner"
          ? (a, b) => a.owner.name.localeCompare(b.owner.name, "fr")
          : (a, b) => a.distance - b.distance;
  return locations.sort(compare);
}
let initialWorldActionMenu = null;
function openLocationDetail(id, actionMenu = null) {
  activeGarrisonLocationId = null;
  worldSelectedLocationId = id;
  worldMessage = "";
  initialWorldActionMenu = actionMenu;
  closeSheet(ui.sheet);
  switchView("world");
}
function showLocationOnMap(id) {
  const location = directoryLocations().find((item) => item.id === id);
  const position = location?.position ?? positionFor(id);
  if (!position) return;
  switchView("map");
  mapView.focus(position);
}

function questLocationTargets(quest) {
  if (!quest) return [];
  const targets = new Map();
  quest.objectives.forEach((objective) => {
    const slotId = objective.trigger?.locationSlotId;
    if (!slotId) return;
    const location = game.getLocationForScenarioSlot(slotId);
    const position = location ? positionFor(location.id) : null;
    if (location && position)
      targets.set(location.id, { id: location.id, name: location.name });
  });
  return [...targets.values()];
}
function openGarrisonManager(locationId, message = "") {
  const location = game.getLocation(locationId);
  if (!location) return;
  activeGarrisonLocationId = locationId;
  currentLocationId = locationId;
  renderGarrisonSheet({
    element: ui.sheet,
    location,
    hero,
    playerId: "local",
    unitDefinitions: game.unitDefinitions,
    message,
    onClose: () => {
      activeGarrisonLocationId = null;
      closeSheet(ui.sheet);
    },
    onTransfer: ({ direction, unitId }) => {
      const success =
        direction === "deposit"
          ? game.garrisonUnit({
              playerId: "local",
              heroId: hero.id,
              locationId,
              unitId,
            })
          : game.withdrawGarrisonUnit({
              playerId: "local",
              heroId: hero.id,
              locationId,
              unitId,
            });
      renderWorld();
      openGarrisonManager(
        locationId,
        success
          ? direction === "deposit"
            ? "Unité affectée à la garnison."
            : "Unité reprise dans votre armée."
          : "Transfert impossible : vérifiez les slots, la capacité de l’armée et le propriétaire de l’unité.",
      );
    },
  });
}
// Rendus principaux. Aucun de ces helpers ne doit décider d'une règle métier.
function renderWorld() {
  if (debugPauseControl.isPaused) {
    pendingWorldRender = true;
    return;
  }
  if (!game || !ui.worldContent) return;
  const locations = filteredDirectoryLocations();
  if (!worldSelectedLocationId)
    return renderWorldDirectory({
      element: ui.worldContent,
      locations,
      types: [
        ...new Set(directoryLocations().map((location) => location.nature)),
      ].sort(),
      filters: worldFilters,
      onFilter: (key, value) => {
        worldFilters[key] = value;
        renderWorld();
        if (key === "search") {
          const input = ui.worldContent.querySelector('[data-filter="search"]');
          input?.focus();
          input?.setSelectionRange(value.length, value.length);
        }
      },
      onOpen: openLocationDetail,
      onShowMap: showLocationOnMap,
    });
  const allLocations = directoryLocations().sort((a, b) =>
    a.name.localeCompare(b.name, "fr"),
  );
  const index = Math.max(
    0,
    allLocations.findIndex((item) => item.id === worldSelectedLocationId),
  );
  const location = allLocations[index];
  if (!location) {
    worldSelectedLocationId = null;
    return renderWorld();
  }
  const initialActionMenu = initialWorldActionMenu;
  initialWorldActionMenu = null;
  renderLocationDetail({
    element: ui.worldContent,
    location,
    index,
    total: allLocations.length,
    initialActionMenu,
    onBack: () => {
      worldSelectedLocationId = null;
      worldMessage = "";
      renderWorld();
    },
    onPrevious: () => {
      if (index > 0) {
        worldSelectedLocationId = allLocations[index - 1].id;
        worldMessage = "";
        renderWorld();
      }
    },
    onNext: () => {
      if (index < allLocations.length - 1) {
        worldSelectedLocationId = allLocations[index + 1].id;
        worldMessage = "";
        renderWorld();
      }
    },
    onShowMap: () => showLocationOnMap(location.id),
    onAction: (action) => {
      currentLocationId = location.id;
      runAction(action, { returnToWorld: true });
    },
    onOpenGarrison: () => openGarrisonManager(location.id),
  });
}
function render() {
  if (debugPauseControl.isPaused) {
    pendingMainRender = true;
    return;
  }
  if (!game || !mapView) return;
  syncQuestBattlefield();
  const sites = visibleSites();
  mapView.render({
    heroPosition,
    heroHeading,
    accuracy: gpsAccuracy,
    locations: mappedLocations(),
    autonomousGroups: visibleAutonomousGroups(),
    autonomousTraces: visibleAutonomousTraces(),
    playAreaPoints: field.playAreaPoints,
    dynamicSites: sites,
    questTraces: visibleQuestTraces(),
    gridCells: playAreaGrid?.cells ?? [],
    heatmapVisible,
  });
  const ambushTarget = preparedAmbushTarget();
  const ambushAvailable =
    preparedHeroAmbush !== null ||
    (heroConcealmentService.canConceal() &&
      (!activeBattle || activeBattle.status === "finished"));
  concealButton.hidden = !ambushAvailable;
  concealButton.disabled = preparedHeroAmbush !== null && ambushTarget === null;
  concealButton.classList.toggle("is-active", preparedHeroAmbush !== null);
  concealButton.textContent = ambushTarget
    ? "Attaquer en embuscade"
    : preparedHeroAmbush
      ? "Embuscade préparée"
      : "Préparer l’embuscade";
  const player = game.getPlayer("local");
  const heroClass = data.heroClasses.find((item) => item.id === hero.classId);
  const heroModifiers = HeroArmyModifier.calculate({
    hero,
    units: hero.army.units,
    unitDefinitions: game.unitDefinitions,
    moraleMode: game.setup.rules.moraleMode,
  });
  const usedBagSlots = heroModifiers.details.speed.usedSlots;
  const bagSlotCapacity = heroModifiers.details.speed.slotCapacity;
  const signed = (value) =>
    `${value >= 0 ? "+" : ""}${Number(value.toFixed(2))}`;
  const healthPercent = Math.max(
    0,
    Math.min(100, (hero.health / hero.maxHealth) * 100),
  );
  const progress = game.getHeroProgress(hero.id);
  announceHeroLevelUp(progress);
  const authority = game.getHeroAuthority(hero.id);
  const levelExperience = progress.currentLevelXp;
  const experiencePercent = progress.maximumLevelReached
    ? 100
    : Math.max(
        0,
        Math.min(100, (levelExperience / progress.xpToNextLevel) * 100),
      );
  const statLabels = {
    attack: "Attaque",
    defense: "Défense",
    morale: "Moral",
    mobility: "Mobilité",
    command: "Commande",
    health: "Points de vie",
    discretion: "Discrétion",
    detection: "Détection",
  };
  const statButton = (stat, value) =>
    `<button type="button" class="hero-stat-button ${selectedHeroStat === stat ? "is-selected" : ""}" data-hero-stat="${stat}" aria-expanded="${selectedHeroStat === stat}"><strong>${value}</strong><span>${statLabels[stat]}</span></button>`;
  const contextualMorale = heroModifiers.details.morale.reduce(
    (total, factor) => total + factor.value,
    0,
  );
  const mobilityStatFactor = (hero.finalStats.mobility ?? 3) / 3;
  const armySpeedMultiplier =
    mobilityStatFactor === 0
      ? 0
      : heroModifiers.speedMultiplier / mobilityStatFactor;
  const classFeatures = game.heroClassFeatureService.featuresFor(hero);
  const detectionMultiplier =
    game.heroClassFeatureService.detectionMultiplier(hero);
  const classSignatureMultiplier = classFeatures.concealmentMultiplier ?? 1;
  const temporarySignatureMultiplier =
    hero.classFeatureState.gpsConcealmentMultiplier ?? 1;
  const signatureMultiplier =
    game.heroClassFeatureService.signatureMultiplier(hero);
  const discretionPercent = Math.round((1 - signatureMultiplier) * 100);
  const standardStatDetail = (stat) =>
    `<aside class="stat-detail" role="status"><header><strong>${statLabels[stat]}</strong><span>Valeur finale : ${hero.finalStats[stat]}</span></header><div class="stat-detail-grid"><span>Base<strong>${hero.baseStats[stat]}</strong></span><span>Progression<strong>${signed(hero.statGrowth[stat])}</strong></span><span>Équipement<strong>${signed(hero.equipmentModifiers[stat])}</strong></span><span>Temporaire<strong>${signed(hero.temporaryModifiers[stat])}</strong></span></div>${stat === "health" ? `<p>PV actuels : ${hero.health}/${hero.maxHealth}</p>` : ""}${stat === "command" ? `<p>Points disponibles : ${hero.commandPoints}/${hero.maxCommandPoints}</p>` : ""}${stat === "morale" && contextualMorale !== 0 ? `<p>Contexte actuel : ${signed(contextualMorale)} · bonus effectif ${signed(heroModifiers.moraleBonus)}</p>` : ""}${stat === "mobility" ? `<p>Train de l’armée : ×${armySpeedMultiplier.toFixed(2)} · multiplicateur effectif ×${heroModifiers.speedMultiplier.toFixed(2)}</p>` : ""}</aside>`;
  const perceptionStatDetail =
    selectedHeroStat === "detection"
      ? `<aside class="stat-detail" role="status"><header><strong>Détection</strong><span>Portée effective : ×${detectionMultiplier.toFixed(2)}</span></header><div class="stat-detail-grid"><span>Base<strong>×1</strong></span><span>Classe<strong>×${(classFeatures.detectionMultiplier ?? 1).toFixed(2)}</strong></span></div><p>Multiplie la portée à laquelle le héros repère les lieux et les groupes.</p></aside>`
      : selectedHeroStat === "discretion"
        ? `<aside class="stat-detail" role="status"><header><strong>Discrétion</strong><span>${discretionPercent}% plus difficile à détecter</span></header><div class="stat-detail-grid"><span>Classe<strong>${Math.round((1 - classSignatureMultiplier) * 100)}%</strong></span><span>Dissimulation<strong>${Math.round((1 - temporarySignatureMultiplier) * 100)}%</strong></span><span>Signature finale<strong>×${signatureMultiplier.toFixed(2)}</strong></span></div><p>Une discrétion élevée réduit la distance à laquelle les ennemis peuvent intercepter le héros.</p></aside>`
        : "";
  const statDetail = selectedHeroStat
    ? perceptionStatDetail || standardStatDetail(selectedHeroStat)
    : "";
  const traitButton = (id, type) => {
    const aptitude = data.heroAptitudes.find((item) => item.id === id);
    const rank = hero.aptitudeRanks[id];
    const name = aptitude?.name ?? id.replaceAll("_", " ").replaceAll("-", " ");
    return `<button type="button" class="trait-chip ${selectedHeroTrait?.id === id && selectedHeroTrait.type === type ? "is-selected" : ""}" data-trait-id="${id}" data-trait-type="${type}" aria-label="${name}${rank ? `, ${rank}` : ""}"><span class="trait-icon" aria-hidden="true">${type === "skill" ? "✦" : "◆"}</span><span>${name}${rank ? `<small>${rank}</small>` : ""}</span></button>`;
  };
  const heroTraits = [
    ...hero.skillIds.map((id) => ({ id, type: "skill" })),
    ...hero.specialPowerIds.map((id) => ({ id, type: "power" })),
  ];
  const traitSlots = heroTraits
    .map(({ id, type }) => traitButton(id, type))
    .concat(
      Array.from(
        { length: Math.max(0, 9 - heroTraits.length) },
        () => '<span class="trait-chip is-empty" aria-hidden="true">＋</span>',
      ),
    )
    .join("");
  const traitDetail = selectedHeroTrait
    ? `<aside class="trait-detail"><span class="trait-icon" aria-hidden="true">${selectedHeroTrait.type === "skill" ? "✦" : "◆"}</span><div><strong>${selectedHeroTrait.id.replaceAll("_", " ").replaceAll("-", " ")}</strong><small>${selectedHeroTrait.type === "skill" ? "Compétence passive" : "Pouvoir spécial"}</small><p>${selectedHeroTrait.type === "skill" ? "Bonus permanent appliqué automatiquement, sans dépense de commandement." : "Action utilisable en combat contre une dépense de points de commandement."}</p><code>${selectedHeroTrait.id}</code></div></aside>`
    : "";
  const classActions =
    hero.classId === "mage"
      ? `<section class="trait-section"><h4>Pouvoirs de carte</h4><div class="trait-list"><button type="button" class="trait-chip" data-class-action="divination"><span class="trait-icon">◉</span><span>Divination<small>Révèle la zone</small></span></button><button type="button" class="trait-chip" data-class-action="astral-travel"><span class="trait-icon">✧</span><span>Voyage astral<small>Portée temporaire</small></span></button></div><p class="text-muted">Aura : +1 PV par cycle aux héros alliés à moins de 100 m.</p></section>`
      : "";
  ui.heroContent.innerHTML = `<article class="hero-card compact-hero-card"><section class="hero-bars"><button type="button" class="hero-progress health-progress hero-stat-trigger ${selectedHeroStat === "health" ? "is-selected" : ""}" data-hero-stat="health" aria-expanded="${selectedHeroStat === "health"}" aria-label="${hero.health} PV sur ${hero.maxHealth}"><span style="width:${healthPercent}%"></span><small>PV ${hero.health}/${hero.maxHealth}</small></button><button type="button" class="hero-progress experience-progress ${progress.canLevelUp || hero.pendingLevelUps.length ? "is-level-up-ready" : ""}" data-open-hero-progress aria-label="${progress.canLevelUp ? "Niveau disponible" : `${levelExperience} XP sur ${progress.xpToNextLevel}`}"><span style="width:${experiencePercent}%"></span><small>${progress.canLevelUp ? "✦ Niveau disponible" : `XP ${levelExperience}/${progress.xpToNextLevel || levelExperience}`}</small></button></section><section class="hero-identity"><img class="hero-portrait" src="assets/portraits/hero-wanderer.png" alt="Portrait de ${hero.name}"><header><div><h3>${hero.name}</h3><span class="eyebrow hero-rank"><span>${heroClass?.name ?? hero.classId}</span><span>${rankLabel(HERO_COMMAND_RANKS, hero.commandRank)}- LvL ${hero.level}</span></span></div><span class="hero-state">${hero.state}</span></header></section><section class="hero-stat-panel" aria-label="Statistiques du héros"><div class="compact-hero-stats">${statButton("attack", signed(heroModifiers.attackBonus))}${statButton("defense", signed(heroModifiers.defenseBonus))}${statButton("morale", signed(heroModifiers.moraleBonus))}${statButton("mobility", `×${heroModifiers.speedMultiplier.toFixed(2)}`)}${statButton("command", `◆ ${hero.commandPoints}/${hero.maxCommandPoints}`)}<div><strong>${hero.army.units.length}/${hero.maxUnitStacks}</strong><span>Unités</span></div><div><strong>${usedBagSlots}/${bagSlotCapacity}</strong><span>Bagages</span></div></div>${statDetail}</section><section class="hero-aptitudes" aria-label="Aptitudes et pouvoirs du héros"><div class="trait-list">${traitSlots}</div>${traitDetail}</section><div class="hero-equipment" aria-label="Équipement du héros"></div></article>`;
  ui.heroContent
    .querySelector(".compact-hero-stats")
    .insertAdjacentHTML(
      "beforeend",
      `${statButton("discretion", `${discretionPercent}%`)}${statButton("detection", `×${detectionMultiplier.toFixed(2)}`)}`,
    );
  if (classActions)
    ui.heroContent
      .querySelector(".hero-aptitudes")
      .insertAdjacentHTML("beforeend", classActions);
  if (hero.state === "ghost")
    ui.heroContent
      .querySelector(".hero-bars")
      .insertAdjacentHTML(
        "afterend",
        `<aside class="ghost-notice"><strong>Héros fantôme</strong><span>Retournez à ${game.getHeroBaseLocation(hero.id)?.name ?? "votre base"} pour revenir avec la moitié de vos PV.</span></aside>`,
      );
  ui.heroContent
    .querySelector(".compact-hero-stats")
    .insertAdjacentHTML(
      "beforeend",
      `<div><strong>${authority.used}/${authority.maximum}</strong><span>Autorité</span></div>`,
    );
  ui.heroContent.querySelector(".hero-equipment").innerHTML =
    renderEquipmentView({ hero });
  const pending = hero.pendingLevelUps[0];
  if (pending)
    ui.heroContent.querySelector(".experience-progress small").textContent =
      "✦ Amélioration à choisir";
  ui.heroContent
    .querySelector("[data-open-hero-progress]")
    ?.addEventListener("click", openHeroProgressDialog);
  ui.heroContent.querySelectorAll("[data-hero-stat]").forEach((button) =>
    button.addEventListener("click", () => {
      selectedHeroStat =
        selectedHeroStat === button.dataset.heroStat
          ? null
          : button.dataset.heroStat;
      selectedHeroTrait = null;
      render();
    }),
  );
  ui.heroContent.querySelectorAll("[data-trait-id]").forEach((button) =>
    button.addEventListener("click", () => {
      const next = {
        id: button.dataset.traitId,
        type: button.dataset.traitType,
      };
      selectedHeroTrait =
        selectedHeroTrait?.id === next.id &&
        selectedHeroTrait.type === next.type
          ? null
          : next;
      selectedHeroStat = null;
      render();
    }),
  );
  ui.heroContent
    .querySelector('[data-class-action="divination"]')
    ?.addEventListener("click", useDivination);
  ui.heroContent
    .querySelector('[data-class-action="astral-travel"]')
    ?.addEventListener("click", useAstralTravel);
  bindEquipmentView(ui.heroContent, {
    onEquip: (packageId, slot) => {
      const result = game.equipHeroItem({
        playerId: hero.playerId,
        heroId: hero.id,
        packageId,
        slot,
      });
      logTest(
        result.success
          ? `${result.itemId} équipé sur ${result.slot}.`
          : `Équipement impossible : ${result.reason}.`,
      );
      render();
    },
    onUnequip: (slot) => {
      const result = game.unequipHeroItem({
        playerId: hero.playerId,
        heroId: hero.id,
        slot,
      });
      logTest(
        result.success
          ? `${result.itemId} replacé dans les bagages.`
          : `Retrait impossible : ${result.reason}.`,
      );
      render();
    },
  });
  ui.heroContent.onclick = (event) => {
    let changed = false;
    if (
      selectedHeroTrait &&
      !event.target.closest("[data-trait-id], .trait-detail")
    ) {
      selectedHeroTrait = null;
      changed = true;
    }
    if (
      selectedHeroStat &&
      !event.target.closest("[data-hero-stat], .stat-detail")
    ) {
      selectedHeroStat = null;
      changed = true;
    }
    if (changed) render();
  };
  ui.armyContent.innerHTML = `<div class="army-list">${
    hero.army.units
      .map((unit) => {
        const definition = game.unitDefinitions.get(unit.typeId);
        const unitName = unit.name ?? definition?.name ?? unit.typeId;
        const stats = definition?.stats;
        const illustration = renderUnitTypeIcon({
          typeId: unit.typeId,
          tags: definition?.tags ?? [],
          range: stats?.range ?? 1,
        });
        const expanded = expandedArmyUnitId === unit.id;
        const currentHealth = unit.soldierHealth.reduce(
          (total, health) => total + health,
          0,
        );
        const maximumHealth = unit.maxQuantity * unit.healthPerSoldier;
        return `<article class="army-card${expanded ? " is-expanded" : ""}" data-army-unit="${unit.id}" role="button" tabindex="0" aria-expanded="${expanded}" aria-label="${expanded ? "Réduire" : "Afficher les détails de"} ${unitName}"><div class="army-illustration" aria-hidden="true">${illustration}</div><div class="army-card__content"><p class="eyebrow">${rankLabel(UNIT_RANKS, unit.rank)} · niveau ${unit.level}</p><div class="army-card__heading"><h3>${unitName}</h3><span class="army-card__chevron" aria-hidden="true">⌄</span></div>${unitHealthBar(unit)}<div class="army-card__summary"><strong>${unit.combatantCount}/${unit.maxQuantity} aptes</strong><span>${currentHealth}/${maximumHealth} PV</span></div><div class="army-card__details" ${expanded ? "" : "hidden"}><div class="army-card__stats"><div><strong>${unit.quantity}/${unit.maxQuantity}</strong><span>Effectif</span></div><div><strong>${unit.combatantCount}</strong><span>Apte(s)</span></div><div><strong>${unit.woundedCount}</strong><span>Blessé(s)</span></div><div><strong>${unit.experience}</strong><span>Expérience</span></div>${stats ? `<div><strong>${stats.attack}</strong><span>Attaque</span></div><div><strong>${stats.defense}</strong><span>Défense</span></div><div><strong>${stats.speed}</strong><span>Vitesse</span></div>` : ""}</div><div class="army-card__meta"></div><div class="army-card__actions"><button type="button" class="disband-unit-button" data-disband-unit="${unit.id}" aria-label="Dissoudre ${unitName}">Dissoudre</button></div></div></div></article>`;
      })
      .join("") || '<p class="text-muted">Aucune unité.</p>'
  }</div>`;
  renderInventoryView({
    element: ui.inventory,
    hero,
    slotCount: hero.bagSlotCount,
  });
  ui.armyContent
    .querySelector(".army-card.is-expanded .army-card__details")
    ?.insertAdjacentHTML(
      "afterbegin",
      '<button type="button" class="army-detail-back secondary-button" data-army-back>← Retour aux armées</button>',
    );
  if (hero.classId === "ranger")
    ui.armyContent
      .querySelectorAll(".army-card__actions")
      .forEach((actions) =>
        actions.insertAdjacentHTML(
          "afterbegin",
          `<button type="button" class="secondary-button" data-prepare-ambush="${actions.closest("[data-army-unit]").dataset.armyUnit}">Cacher en embuscade</button>`,
        ),
      );
  const toggleArmyCard = (card) => {
    expandedArmyUnitId =
      card.getAttribute("aria-expanded") === "true"
        ? null
        : card.dataset.armyUnit;
    render();
  };
  ui.armyContent
    .querySelector("[data-army-back]")
    ?.addEventListener("click", () => {
      expandedArmyUnitId = null;
      render();
    });
  ui.armyContent.querySelectorAll("[data-army-unit]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (!event.target.closest("button")) toggleArmyCard(card);
    });
    card.addEventListener("keydown", (event) => {
      if (
        (event.key === "Enter" || event.key === " ") &&
        event.target === card
      ) {
        event.preventDefault();
        toggleArmyCard(card);
      }
    });
  });
  ui.armyContent.querySelectorAll("[data-disband-unit]").forEach((button) =>
    button.addEventListener("click", () => {
      const unit = hero.army.getUnit(button.dataset.disbandUnit);
      if (unit === null) return;
      if (
        !window.confirm(
          `Dissoudre définitivement ${unit.name ?? unit.typeId} ? Aucun remboursement ne sera accordé.`,
        )
      )
        return;
      const result = game.disbandUnit({
        playerId: hero.playerId,
        heroId: hero.id,
        unitId: unit.id,
      });
      if (result.success) {
        logTest(`${result.unit.name ?? result.unit.typeId} a été dissoute.`);
        render();
      }
    }),
  );
  ui.armyContent.querySelectorAll("[data-prepare-ambush]").forEach((button) =>
    button.addEventListener("click", () => {
      const unit = hero.army.getUnit(button.dataset.prepareAmbush);
      if (
        !unit ||
        !window.confirm(
          `Cacher ${unit.name ?? unit.typeId} ici pendant 30 minutes ? L’unité quittera temporairement l’armée et attaquera automatiquement un ennemi entrant dans la zone.`,
        )
      )
        return;
      const result = game.prepareHeroAmbush({
        playerId: hero.playerId,
        heroId: hero.id,
        unitId: unit.id,
        position: asGps(heroPosition),
        radius: mode === "gps" ? 75 : 8,
      });
      logTest(
        result.success
          ? `${unit.name ?? unit.typeId} est caché en embuscade.`
          : `Embuscade impossible : ${result.reason}.`,
      );
      render();
    }),
  );
  [...ui.armyContent.querySelectorAll(".army-card")].forEach((card, index) => {
    const unit = hero.army.units[index];
    if (!unit) return;
    card
      .querySelector(".army-card__summary")
      ?.insertAdjacentHTML("afterend", renderUnitExperienceBar(unit));
    card
      .querySelector(".army-card__details")
      ?.insertAdjacentHTML(
        "afterbegin",
        renderUnitExperienceBar(unit, { detailed: true }),
      );
    const stats = game.unitDefinitions.get(unit.typeId)?.stats;
    if (stats)
      card
        .querySelector(".army-card__stats")
        ?.insertAdjacentHTML(
          "beforeend",
          `<div><strong>${stats.morale}</strong><span>Moral</span></div>`,
        );
    const currentCost = game.getUnitAuthorityCost(unit);
    const nextCost = unit.nextRank
      ? game.getUnitAuthorityCost(unit, unit.nextRank.id)
      : currentCost;
    card
      .querySelector(".army-card__meta")
      ?.insertAdjacentHTML("beforeend", `<span>Autorité ${currentCost}</span>`);
    if (!unit.canPromote) return;
    const allowed =
      authority.used - currentCost + nextCost <= authority.maximum;
    card
      .querySelector(".army-card__actions")
      ?.insertAdjacentHTML(
        "afterbegin",
        `<button type="button" class="promote-unit-button" data-promote-unit="${unit.id}" ${allowed ? "" : "disabled"}>Promouvoir ${rankLabel(UNIT_RANKS, unit.nextRank.id)} · Autorité ${currentCost} → ${nextCost}${allowed ? "" : " · insuffisante"}</button>`,
      );
  });
  ui.armyContent.querySelectorAll("[data-promote-unit]").forEach((button) =>
    button.addEventListener("click", () => {
      const unit = hero.army.getUnit(button.dataset.promoteUnit);
      const result = game.promoteUnit({
        heroId: hero.id,
        unitId: button.dataset.promoteUnit,
      });
      if (!result.success) logTest(`Promotion impossible : ${result.reason}.`);
      else {
        const name =
          unit?.name ?? game.unitDefinitions.get(unit?.typeId)?.name ?? "Unité";
        deviceAlerts.reward({ kind: "unit" });
        showProgressReward({
          caption: `${name} · ${rankLabel(UNIT_RANKS, result.rank)}`,
          title: `Niveau ${result.level}`,
          className: "is-unit-level",
        });
      }
      render();
    }),
  );
  const heroNotices = progress.availableLevelUps + hero.pendingLevelUps.length;
  const unitNotices = hero.army.units.filter((unit) => unit.canPromote).length;
  [
    ["hero", heroNotices],
    ["army", unitNotices],
  ].forEach(([view, count]) => {
    const button = document.querySelector(`[data-view="${view}"]`);
    button?.classList.toggle("has-notice", count > 0);
    if (button) button.dataset.notice = count > 9 ? "9+" : String(count);
  });
  const activeQuest = game.getActiveQuest();
  const availableQuests = game.getAvailableQuests();
  const questsButton = document.querySelector('[data-view="quests"]');
  const hasAvailableQuest = availableQuests.length > 0;
  questsButton?.classList.toggle("has-notice", hasAvailableQuest);
  if (questsButton) {
    questsButton.dataset.notice = "";
    questsButton.setAttribute(
      "aria-label",
      hasAvailableQuest ? "Quêtes — nouvelle quête disponible" : "Quêtes",
    );
  }
  const questResult = game.getLastQuestResult();
  const activeQuestLocations = questLocationTargets(activeQuest);
  const placement = activeQuest
    ? Object.values(game.scenarioRuntime?.placements ?? {}).find(
        (candidate) =>
          candidate.status === "walking" || candidate.status === "ready",
      )
    : null;
  const activeDeadlines = [
    ...Object.values(game.evacuationStates),
    ...Object.values(game.questDeadlines),
  ].map((deadline) => ({
    ...deadline,
    label:
      deadline.label ??
      (deadline.id === "royal-camp-evacuation"
        ? "Arrivée de l’avant-garde"
        : "Temps restant"),
    endedAt:
      deadline.completedAt ?? deadline.failedAt ?? deadline.attackedAt ?? null,
  }));
  const questHudModel = buildQuestHudModel({
    quest: activeQuest,
    placement,
    actionSlotId: pendingScenarioPlacementSlotId,
    locations: activeQuestLocations,
    deadlines: activeDeadlines,
    now: Date.now(),
  });
  renderQuestHud({
    element: questHud,
    model: questHudModel,
    expanded: questHudExpanded,
    onToggle: () => {
      questHudExpanded = !questHudExpanded;
      render();
    },
    onAction: confirmScenarioPlacement,
    onShowLocation: showLocationOnMap,
    onChoice: (choiceId) => {
      const result = game.selectQuestChoice(choiceId);
      if (result.success) applyQuestChoiceFeedback(result);
    },
  });
  const objectives =
    activeQuest?.objectives
      .map(
        (objective) =>
          `<li class="${objective.state === "completed" ? "is-completed" : objective.state === "failed" ? "is-failed" : ""}">${objective.state === "completed" ? "✓" : objective.state === "failed" ? "✕" : "○"} ${objective.text}</li>`,
      )
      .join("") ?? "";
  const distanceProgress = placement
    ? `<p>${Math.round(placement.distanceMeters)} / ${placement.minimumDistanceMeters} m parcourus${placement.minimumDistanceFromOriginMeters > 0 ? ` · ${Math.round(placement.distanceFromOriginMeters)} / ${placement.minimumDistanceFromOriginMeters} m d'éloignement du départ` : ""}</p>`
    : "";
  const placementAction = questHudModel?.ready
    ? `<button type="button" id="confirm-scenario-placement">${questHudModel.actionLabel}</button>`
    : "";
  const evacuation = game.evacuationStates["royal-camp-evacuation"];
  const evacuationClock =
    evacuation && !evacuation.completedAt && !evacuation.attackedAt
      ? `<p class="quest-deadline">Armée principale : arrivée estimée dans ${Math.max(0, Math.ceil((evacuation.expiresAt - Date.now()) / 60_000))} min (aucun échec automatique)</p>`
      : "";
  const messageDeadline = game.questDeadlines["fort-message-delivery"];
  const messageClock =
    messageDeadline && !messageDeadline.completedAt && !messageDeadline.failedAt
      ? `<p class="quest-deadline">Message urgent : ${Math.max(0, Math.ceil((messageDeadline.expiresAt - Date.now()) / 60_000))} min restantes</p>`
      : "";
  const abandonAction =
    activeQuest?.status === "active" && activeQuest.objectives.length
      ? '<button type="button" class="secondary-button" id="abandon-current-quest">Abandonner la quête</button>'
      : "";
  const failureNotice =
    activeQuest?.status === "failed"
      ? '<p class="quest-deadline">Quête échouée</p>'
      : "";
  const availableAction = availableQuests
    .map((offer) => {
      const highlighted =
        offer.id === highlightedQuestOfferId ? " is-highlighted" : "";
      return `<article class="quest-card quest-offer${highlighted}"><small>Quête disponible — rendez-vous à la capitale</small><strong>${offer.title}</strong><p>${offer.description}</p><button type="button" class="quest-location-button secondary-button" data-show-convocation-map aria-label="Afficher la capitale sur la carte">⌖ Afficher la capitale</button></article>`;
    })
    .join("");
  const resultLabels = {
    completed: ["Quête réussie", "Tous les objectifs ont été accomplis."],
    abandoned: ["Quête annulée", "Vous avez abandonné cette mission."],
    deadline_expired: ["Quête échouée", "Le délai de la mission est dépassé."],
    failed: ["Quête échouée", "La mission n’a pas été accomplie."],
    battle_lost: ["Quête échouée", "La mission a échoué après la bataille."],
  };
  const [resultTitle, resultText] = resultLabels[questResult?.outcome] ?? [
    "Quête échouée",
    "La mission n’a pas été accomplie.",
  ];
  const resultCard = questResult
    ? `<article class="quest-card quest-result quest-result--${questResult.outcome === "completed" ? "success" : "failure"}"><small>Résultat de la dernière quête</small><strong>${resultTitle} — ${questResult.title}</strong><p>${resultText}</p><p>${questResult.nextQuestId ? "La quête suivante attend votre confirmation." : "Aucune nouvelle quête n’est disponible pour le moment."}</p></article>`
    : "";
  const activeLocationActions = activeQuestLocations.length
    ? `<div class="quest-location-actions">${activeQuestLocations.map((location) => `<button type="button" class="quest-location-button secondary-button" data-show-quest-location="${location.id}">⌖ ${location.name}</button>`).join("")}</div>`
    : "";
  ui.quests.innerHTML = `${resultCard}${activeQuest ? `<article class="quest-card"><small>Quête en cours</small><strong>${activeQuest.title}</strong><p>${activeQuest.description}</p>${failureNotice}${evacuationClock}${messageClock}${distanceProgress}<ul>${objectives}</ul>${activeLocationActions}${placementAction}${abandonAction}</article>` : ""}${availableAction || (!activeQuest && !resultCard ? '<p class="text-muted">Aucune quête active.</p>' : "")}`;
  ui.quests
    .querySelector("#confirm-scenario-placement")
    ?.addEventListener("click", confirmScenarioPlacement);
  ui.quests
    .querySelectorAll("[data-show-convocation-map]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showLocationOnMap("royal-capital"),
      ),
    );
  ui.quests
    .querySelectorAll("[data-show-quest-location]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showLocationOnMap(button.dataset.showQuestLocation),
      ),
    );
  ui.quests
    .querySelector("#abandon-current-quest")
    ?.addEventListener("click", () => {
      if (
        !window.confirm(
          "Abandonner cette quête ? Ses objectifs seront marqués comme échoués.",
        )
      )
        return;
      const result = game.abandonCurrentQuest();
      if (!result) return;
      const narration = result.appliedEvent?.appliedEffects?.find(
        (effect) => effect.type === "narration",
      );
      locationMessage =
        narration?.text ??
        (result.nextQuestId
          ? "Quête annulée. La suivante attend votre accord."
          : "Quête annulée. Aucune nouvelle quête n’est disponible.");
      deviceAlerts.notify("notice");
      switchView("quests");
      render();
    });
  ui.sitesStatus.textContent = `${game.battleSites.length} trace(s) de bataille · ${sites.length} visible(s)`;
  $("#grid-status").textContent = playAreaGrid
    ? `${playAreaGrid.cells.length} cellule(s) · ${playAreaGrid.cells.filter((cell) => cell.visits > 0).length} visitée(s) · ${playAreaGrid.cells.reduce((sum, cell) => sum + cell.visits, 0)} passage(s)`
    : "Aucune grille.";
  if ($("#world-view").classList.contains("is-active")) renderWorld();
}
function logTest(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString("fr-FR")} — ${message}`;
  ui.log.prepend(item);
}
function updateMapFollowButton() {
  const states = {
    free: { icon: "◎", label: "Recentrer sur le joueur" },
    centered: {
      icon: "◉",
      label:
        mode === "gps"
          ? "Orienter la carte selon le joueur"
          : "Carte centrée sur le joueur",
    },
    bearing: { icon: "➤", label: "Revenir au nord" },
  };
  const state = states[mapFollowMode];
  ui.recenter.textContent = state.icon;
  ui.recenter.setAttribute("aria-label", state.label);
  ui.recenter.title = state.label;
  ui.recenter.dataset.followMode = mapFollowMode;
}
function setBattleNavigationLocked(locked) {
  $(".bottom-nav").classList.toggle("is-locked", locked);
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.disabled = locked;
  });
}
function switchView(name) {
  if (activeBattle?.status === "active" && name !== "battle") return false;
  document
    .querySelectorAll(".view")
    .forEach((view) =>
      view.classList.toggle("is-active", view.id === `${name}-view`),
    );
  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.classList.toggle("is-active", button.dataset.view === name),
    );
  if (name === "map") setTimeout(() => mapView.map.invalidateSize(), 0);
  else closeSheet(ui.sheet);
  if (name === "world") renderWorld();
  return true;
}

ui.create.disabled = true;
ui.create.onclick = start;
ui.recenter.onclick = () => {
  if (mapFollowMode === "free") {
    mapFollowMode = mapView.bearingEnabled ? "bearing" : "centered";
  } else if (mapFollowMode === "centered" && mode === "gps") {
    mapView.setBearingEnabled(true);
    mapFollowMode = "bearing";
  } else {
    mapView.setBearingEnabled(false);
    mapFollowMode = "centered";
  }
  mapView.focus(heroPosition);
  updateMapFollowButton();
};
$("#toggle-field-tools").onclick = () => {
  ui.tools.hidden = false;
};
$("#close-field-tools").onclick = () => {
  ui.tools.hidden = true;
};
const closeGameMenu = () => {
  $("#landscape-tools").classList.remove("is-open");
  $("#toggle-game-menu").setAttribute("aria-expanded", "false");
};
$("#toggle-game-menu").onclick = () => {
  const open = $("#landscape-tools").classList.toggle("is-open");
  $("#toggle-game-menu").setAttribute("aria-expanded", String(open));
};
$("#close-game-menu").onclick = closeGameMenu;
$("#open-field-tools").onclick = () => {
  closeGameMenu();
  ui.tools.hidden = false;
};
$("#open-cheat-tools").onclick = () => {
  closeGameMenu();
  openCheats();
};
$("#start-dev-quest").onclick = () => {
  const quest = QUEST_SEQUENCE.find(
    (candidate) => candidate.id === questSelect.value,
  );
  if (!game || !quest) return;
  const activeQuest = game.getActiveQuest();
  if (
    activeQuest &&
    !window.confirm(
      `Interrompre « ${activeQuest.title} » et lancer « ${quest.title} » ?`,
    )
  )
    return;
  clearTimeout(firstRoyalMessengerTimer);
  firstRoyalMessengerTimer = null;
  if (activeQuest) game.abandonCurrentQuest();
  if (!game.getAvailableQuests().some((offer) => offer.id === quest.id))
    game.offerQuest(quest);
  closeGameMenu();
  if (startOfferedQuest(quest.id)) {
    switchView("quests");
    logTest(`Sélecteur dev : quête « ${quest.title} » lancée.`);
  }
};
$("#draw-area").onclick = () => {
  interactionMode = interactionMode === "draw-area" ? null : "draw-area";
  logTest(
    interactionMode ? "Tracé actif : touchez la carte." : "Tracé suspendu.",
  );
};
$("#clear-area").onclick = () => {
  field.clearPlayArea();
  validatedPlayArea = null;
  playAreaGrid = null;
  playAreaPresence.setPlayArea(null);
  lastVisitedCellId = null;
  persistFieldState();
  $("#toggle-heatmap").disabled = true;
  mapView.setPlayArea([]);
  render();
  logTest("Zone et grille effacées.");
};
$("#validate-area").onclick = () => {
  try {
    validatePlayArea();
  } catch (error) {
    logTest(error.message);
  }
};
$("#toggle-heatmap").onclick = () => {
  heatmapVisible = !heatmapVisible;
  $("#toggle-heatmap").textContent = heatmapVisible
    ? "Masquer la heatmap"
    : "Afficher la heatmap";
  render();
};
$("#place-location").onclick = () => {
  interactionMode = "place-location";
  logTest("Touchez la carte pour poser le camp.");
};
$("#gps-draw-area").onclick = () => {
  interactionMode = "draw-area";
  ui.gpsAreaStatus.textContent =
    "Tracé actif : touche la carte pour poser les sommets.";
};
$("#gps-clear-area").onclick = () => {
  field.clearPlayArea();
  validatedPlayArea = null;
  game.setup.playArea = null;
  playAreaGrid = null;
  playAreaPresence.setPlayArea(null);
  manualSetupPlacements.clear();
  enabledGpsLocationIds.clear();
  capitalPlaced = false;
  ui.finishGpsSetup.disabled = true;
  ui.gpsAreaStatus.textContent = "Zone non définie.";
  interactionMode = "draw-area";
  mapView.setPlayArea([]);
  renderGpsLocationButtons();
  render();
};
$("#gps-validate-area").onclick = () => {
  try {
    validatePlayArea();
  } catch (error) {
    ui.gpsAreaStatus.textContent = error.message;
  }
};
$("#apply-world-setup").onclick = applyWorldSetup;
ui.finishGpsSetup.onclick = () => {
  if (!capitalPlaced || manualSetupPlacements.size > 0 || !validatedPlayArea)
    return;
  finishGameStart();
};
$("#start-distance-quest").onclick = () => {
  field.startDistanceQuest(asGps(heroPosition));
  ui.questPlace.disabled = true;
  logTest("Départ de la quête 300 m enregistré.");
  render();
};
ui.questPlace.onclick = placeQuestLocation;
$("#test-battle").onclick = openBattle;
$("#search-battlefield")?.remove();
$("#collect-loot")?.remove();
$("#open-cheats").onclick = openCheats;
$("#apply-hero-cheats").onclick = applyHeroCheats;
$("#create-cheat-location").onclick = createCheatLocation;
document
  .querySelectorAll("[data-view]")
  .forEach(
    (button) => (button.onclick = () => switchView(button.dataset.view)),
  );
document.addEventListener("visibilitychange", () => {
  if (!game) return;
  if (document.visibilityState === "hidden") {
    persistFieldState();
    logTest(
      "Application suspendue : le suivi GPS peut être interrompu par iOS.",
    );
  } else logTest("Application de nouveau active : reprise du suivi GPS.");
});
window.addEventListener("resize", () => {
  if (mapView && $("#map-view").classList.contains("is-active")) {
    setTimeout(() => mapView.map.invalidateSize(), 0);
    if (currentLocationId && !activeGarrisonLocationId && !ui.sheet.hidden)
      selectLocation(currentLocationId);
  }
  if (activeBattle && $("#battle-view").classList.contains("is-active"))
    renderBattle();
});

try {
  data = await loadData();
  ui.status.textContent = PLAYTEST_EDITION
    ? "La partie est prête."
    : "Le banc d'essai terrain est prêt.";
  ui.create.disabled = false;
} catch (error) {
  ui.status.textContent = `Chargement impossible : ${error.message}`;
  ui.create.disabled = true;
}

if ("serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker
      .register("../service-worker.js", { scope: "../" })
      .catch(() => {}),
  );
