import { Game } from "./core/game.js";
import { Location } from "./core/location.js";
import { LocationEngine } from "./core/location-engine.js";
import { InteractionEngine } from "./core/interaction-engine.js";
import { LocationRangePolicy } from "./core/location-range-policy.js";
import { distanceMeters } from "./core/geo.js";
import { FieldTestSession } from "./core/field-test-session.js";
import { PlayAreaGrid } from "./core/play-area-grid.js";
import { PlayAreaPresence } from "./core/play-area-presence.js";
import { DynamicSitePresence } from "./core/dynamic-site-presence.js";
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
import { closeSheet, renderLocationSheet } from "./ui/bottom-sheet.js";
import { renderBattleView } from "./ui/battle-view.js";
import { buildLocationIntel } from "./core/location-intel.js";
import { renderLocationDetail, renderWorldDirectory } from "./ui/world-view.js";
import { renderBattleResultView } from "./ui/battle-result-view.js";
import { HeroArmyModifier } from "./core/hero-army-modifier.js";
import { createAutomaticHeroChoice, GameSetupView, isLocationPlacementAllowed } from "./ui/game-setup-view.js";
import { renderGarrisonSheet } from "./ui/garrison-sheet.js";
import { renderUnitTypeIcon } from "./ui/unit-icon.js";
import { CheatService } from "./core/cheat-service.js";
import { renderInventoryView } from "./ui/inventory-view.js";
import { bindEquipmentView, renderEquipmentView } from "./ui/equipment-view.js";
import { renderLootStockSheet } from "./ui/loot-stock-sheet.js";
import { renderUnitHealthBar } from "./ui/unit-health-bar.js";
import { renderUnitExperienceBar } from "./ui/unit-experience-bar.js";
import { closeDialogueView, renderDialogueView } from "./ui/dialogue-view.js";
import { AutonomousGroupTrace } from "./core/autonomous-group-trace.js";
import { AutonomousGroup } from "./core/autonomous-group.js";
import { AutonomousGroupDetectionService } from "./core/autonomous-group-detection-service.js";

const $ = (selector) => document.querySelector(selector);
document.addEventListener("contextmenu", (event) => {
  if (!event.target.closest("input,textarea,[contenteditable='true']")) event.preventDefault();
});
const rankLabel = (ranks, id) => ranks.find((rank) => rank.id === id)?.label ?? id;
const unitHealthBar = (unit) => renderUnitHealthBar(unit);
const ui = { setup: $("#setup-screen"), game: $("#game-screen"), create: $("#create-game"), status: $("#setup-status"), mode: $("#top-mode"), health: $("#top-health"), army: $("#top-army"), gold: $("#top-gold"), worldContent: $("#world-content"), heroContent: $("#hero-content"), armyContent: $("#army-content"), inventory: $("#inventory-content"), quests: $("#quests-content"), battle: $("#battle-content"), sheet: $("#bottom-sheet"), recenter: $("#recenter-map"), tools: $("#field-tools"), gpsStatus: $("#gps-status"), questStatus: $("#distance-quest-status"), questPlace: $("#place-quest-location"), sitesStatus: $("#dynamic-sites-status"), log: $("#field-log"), gpsSetup: $("#gps-setup-panel"), gpsAreaStatus: $("#gps-area-status"), gpsLocationButtons: $("#gps-location-buttons"), finishGpsSetup: $("#finish-gps-setup") };
const setupView = new GameSetupView(ui.setup);
const simulationPositions = { "fort-nord": [22, 22], "royal-capital": [50, 30], "village-vert": [60, 50], "prospector-battlefield": [74, 65], "camp-local": [50, 32], "lumber-camp-test": [58, 36], "stone-quarry": [27, 72], "iron-mine": [66, 74], "bandit-camp": [78, 78], "enemy-fort": [72, 35], "gold-mine": [42, 70] };
const simulationRadii = { "fort-nord": 12, "village-vert": 10, "camp-local": 9, "bandit-camp": 9, "enemy-fort": 12, "gold-mine": 8 };
const simulationDetectionRadii = { "fort-nord": 24, "village-vert": 20, "camp-local": 18, "bandit-camp": 18, "enemy-fort": 24, "gold-mine": 16 };
const simulationStartPosition = [50, 30];
const descriptions = { "fort-nord": "Votre refuge frontalier.", "village-vert": "Les habitants connaissent les menaces locales.", "camp-local": "Votre camp de développement expérimental.", "lumber-camp-test": "Un camp spécialisé qui produit du bois.", "bandit-camp": "Une zone de combat testable.", "enemy-fort": "Un fort ennemi de niveau 3 protégé par une garnison.", "gold-mine": "Une mine contenant de l'or." };
let data, game, hero, enemyHero, mapView, gpsTracker, locationEngine, interactionEngine, rangePolicy, dynamicSitePresence, activeBattle, battleTimer, productionTimer;
let mode = "simulation", heroPosition, gpsAccuracy = null, firstGpsFix = true, interactionMode = null, currentLocationId = null, locationMessage = "", currentEncounter = null;
let gpsSetupActive = false;
let capitalPlaced = false;
let enabledGpsLocationIds = null;
let activeGarrisonLocationId = null;
let currentDynamicSiteId = null;
let heroHeading = 0, lastCompassAt = 0;
let mapFollowMode = "free";
let pendingScenarioPlacementSlotId = null;
let activeDialogue = null;
let worldMessage = "";
let worldSelectedLocationId = null;
let selectedHeroTrait = null;
let selectedHeroStat = null;
let expandedArmyUnitId = null;
const worldFilters = { search: "", type: "", owner: "", sort: "distance" };
let battleDragging = false, selectedBattleUnitId = null, selectedBattlePower = null, battleMessage = "", battleResolved = false, battleResult = null, validatedPlayArea = null;
let playAreaGrid = null, heatmapVisible = true, lastVisitedCellId = null;
const field = new FieldTestSession({ minimumQuestDistanceMeters: 300 });
const cheatService = new CheatService();
const autonomousGroupDetectionService = new AutonomousGroupDetectionService({ distanceFn: (first, second) => mode === "gps" ? distanceMeters(first, second) : Math.hypot((first.latitude ?? first[0]) - (second.latitude ?? second[0]), (first.longitude ?? first[1]) - (second.longitude ?? second[1])) });
const savedFieldState = loadFieldState();
const gpsAccuracyLog = new GpsAccuracyLog(savedFieldState?.gpsAccuracyLog ?? {});
const playAreaPresence = new PlayAreaPresence(null, { confirmations: 2 });
const deviceAlerts = new DeviceAlerts();
const screenAwake = new ScreenAwake({ onChange: (active) => { if (game) logTest(active ? "Écran maintenu actif." : "Maintien d'écran indisponible ou suspendu."); } });
const orientationTracker = new OrientationTracker({ onHeading: ({ heading }) => { heroHeading = smoothHeading(heroHeading, heading); lastCompassAt = Date.now(); mapView?.setHeroHeading(heroHeading); }, onError: () => { if (game) logTest("Boussole indisponible."); } });
const runtimePositions = new Map();
const gpsAccuracyStatus = document.createElement("p"); gpsAccuracyStatus.id = "gps-accuracy-log"; gpsAccuracyStatus.className = "test-status"; ui.gpsStatus.after(gpsAccuracyStatus);
gpsAccuracyStatus.insertAdjacentHTML("afterend", '<div class="tool-block cheat-launch"><strong>5. Outils de triche</strong><p>Modifiez le héros ou créez un lieu à votre position.</p><button id="open-cheats" type="button">Ouvrir Cheat</button></div>');
$("#field-tools .tool-block p").textContent = "Active le tracé puis touche la carte pour poser au moins 3 sommets. La validation crée des cellules de 15 m × 15 m.";

async function loadData() { const load = async (path) => (await fetch(path)).json(); const [scenario, heroClasses, heroAptitudes, unitDefinitions, locations] = await Promise.all([load("../data/scenarios/chaos.json"), load("../data/hero-classes.json"), load("../data/hero-aptitudes.json"), load("../data/units.json"), load("../data/locations.json")]); return { scenario, heroClasses, heroAptitudes, unitDefinitions, locations }; }
function start() {
  let setup;
  try { setup = setupView.readSetup(); } catch (error) { setupView.showError(error); return; }
  mode = setupView.readPositionMode();
  dynamicSitePresence = new DynamicSitePresence({ distanceFn: dynamicSiteDistance, exitMargin: mode === "gps" ? 10 : 1 });
  const bindings = [{ locationSlotId: "refuge", locationId: "fort-nord" }, { locationSlotId: "capital", locationId: "royal-capital" }, { locationSlotId: "royal-camp", locationId: "village-vert" }, { locationSlotId: "prospectors-battlefield", locationId: "prospector-battlefield" }, { locationSlotId: "gold-mine", locationId: "gold-mine" }, { locationSlotId: "bandit-camp", locationId: "bandit-camp" }];
  game = new Game({ setup, scenario: data.scenario, heroClasses: data.heroClasses, heroAptitudes: data.heroAptitudes, unitDefinitions: data.unitDefinitions, locations: data.locations, scenarioLocationBindings: bindings });
  rangePolicy = new LocationRangePolicy(game.setup.locationSetup.rangePolicy);
  hero = game.chooseHero("local", createAutomaticHeroChoice());
  enemyHero = game.chooseHero("bandits", { name: "Rask le brigand", classId: "warrior" }); game.getLocation("bandit-camp").addHero(enemyHero.id);
  game.getPlayer("local").discoverLocation("fort-nord", 2);
  game.getPlayer("local").discoverLocation("royal-capital", 3);
  game.getPlayer("local").discoverLocation("bandit-camp", 3);
  game.getPlayer("local").discoverLocation("camp-local", 3);
  game.getPlayer("local").discoverLocation("enemy-fort", 3);
  game.getPlayer("local").discoverLocation("lumber-camp-test", 3);
  heroPosition = mode === "gps" ? { latitude: 48.8566, longitude: 2.3522 } : [...simulationStartPosition];
  enabledGpsLocationIds = mode === "gps" ? new Set() : null;
  game.locations.forEach((location) => runtimePositions.set(location.id, mode === "gps" ? { ...location.position } : [...(simulationPositions[location.id] ?? simulationStartPosition)]));
  rebuildLocationEngine();
  interactionEngine = new InteractionEngine({ locations: game.locations, enemyResolver: resolveLocationEnemy });
  ui.setup.hidden = true; ui.game.hidden = false;
  mapView = new MapView({ element: $("#map"), mode, initialPosition: heroPosition, onHeroMove: applyPosition, onLocationSelect: selectLocation, onDynamicSiteSelect: selectDynamicSite, onTraceSelect: inspectQuestTrace, onAutonomousGroupSelect: selectAutonomousGroup, onMapClick: handleMapClick });
  mapFollowMode = "centered"; updateMapFollowButton(); mapView.map.on("dragstart", () => { mapView.setBearingEnabled(false); mapFollowMode = "free"; updateMapFollowButton(); });
  capitalPlaced = false; gpsSetupActive = true; ui.game.classList.add("is-gps-setup"); ui.gpsSetup.classList.toggle("is-simulation", mode === "simulation"); ui.gpsSetup.hidden = false; renderGpsLocationButtons();
  if (mode === "simulation") { restoreFieldTestState(); ui.gpsAreaStatus.textContent = "Sélectionne la capitale, puis touche son emplacement sur la carte."; render(); setTimeout(() => mapView.map.invalidateSize(), 0); return; }
  field.clearPlayArea(); interactionMode = "draw-area"; startGps(); render(); setTimeout(() => mapView.map.invalidateSize(), 0);
}

function finishGameStart() {
  if (!capitalPlaced) return;
  const capitalPosition = positionFor("royal-capital"); heroPosition = Array.isArray(capitalPosition) ? [...capitalPosition] : { ...capitalPosition }; hero.updatePosition(asGps(heroPosition)); mapView.focus(heroPosition);
  if (game.status === "preparing") game.start();
  createRoamingChaosArmy();
  game.startScenarioRuntime(asGps(heroPosition));
  gpsSetupActive = false; ui.game.classList.remove("is-gps-setup"); ui.gpsSetup.hidden = true; interactionMode = null;
  deviceAlerts.enable().then((enabled) => logTest(enabled ? "Alertes sonores activées." : "Son d'alerte indisponible."));
  screenAwake.start();
  clearInterval(productionTimer); productionTimer = setInterval(runProductionCycle, 10_000);
  if (mode === "gps") { orientationTracker.start().then((enabled) => logTest(enabled ? "Boussole activée : le pion indique le nord." : "Boussole refusée ou indisponible : utilisation du cap GPS.")); applyPosition(heroPosition); }
  else { ui.gpsStatus.textContent = "Simulation : clique sur la carte ou fais glisser le pion."; applyPosition(heroPosition); }
  setTimeout(() => mapView.map.invalidateSize(), 0);
  render(); logTest(`Mode ${mode === "gps" ? "GPS réel" : "simulation"} démarré.`);
}

function startGps() {
  ui.gpsStatus.textContent = "GPS : recherche de la position…";
  gpsTracker = new GpsTracker({ onPosition: (position) => { if (Number.isFinite(position.heading) && Date.now() - lastCompassAt > 3_000) { heroHeading = smoothHeading(heroHeading, position.heading); mapView.setHeroHeading(heroHeading); } gpsAccuracyLog.record(position); persistFieldState(); applyPosition(position); ui.gpsStatus.textContent = `GPS actif · précision ±${Math.round(position.accuracy)} m · cap ${Math.round(heroHeading)}° · ${new Date(position.updatedAt).toLocaleTimeString("fr-FR")}`; renderGpsAccuracySummary(); if (gpsAccuracyLog.samples.length % 5 === 0) logTest(`Précision GPS ±${Math.round(position.accuracy)} m.`); if (firstGpsFix) { firstGpsFix = false; mapView.focus(position); logTest("Premier point GPS reçu."); } }, onError: (error) => { ui.gpsStatus.textContent = `Erreur GPS : ${error.message}`; logTest(`Erreur GPS (${error.code}).`); } });
  if (!gpsTracker.start()) ui.gpsStatus.textContent = "Géolocalisation indisponible sur cet appareil.";
}

function distance(a, b) { return mode === "gps" ? distanceMeters(a, b) : Math.hypot(a[0] - b[0], a[1] - b[1]); }
function asGps(position) { return Array.isArray(position) ? { latitude: position[0], longitude: position[1] } : { latitude: position.latitude, longitude: position.longitude }; }
function positionFor(id) { return runtimePositions.get(id); }
function rangesFor(location) { return mode === "gps" ? rangePolicy.resolve(location, game.setup.playArea) : { interactionRadius: simulationRadii[location.id] ?? 8, detectionRadius: simulationDetectionRadii[location.id] ?? 16 }; }
function resolveLocationEnemy({ location }) { return location.features.battle && game.getLocationRelation("local", location.id) === "enemy" ? { name: location.ownerId === "chaos" ? "Créatures du Chaos" : "Brigands", danger: 2, aggressive: false } : null; }
function radiusFor(location) { return rangesFor(location).interactionRadius; }
function isLocationEnabled(location) {
  if (location.id === "prospector-battlefield") {
    const phaseId = game?.scenarioState?.currentPhaseId;
    if (!["prospectors-battlefield", "free-gold-mine", "return-to-capital", "prologue-complete"].includes(phaseId)) return false;
  }
  const binding = game?.scenarioLocationBindings.find((candidate) => candidate.locationId === location.id);
  const placement = binding ? game.scenarioRuntime?.placements[binding.locationSlotId] : null;
  if (placement && placement.status !== "placed") return false;
  return location.state !== "destroyed" && (enabledGpsLocationIds === null || enabledGpsLocationIds.has(location.id));
}
function rebuildLocationEngine() { locationEngine = new LocationEngine({ locations: game.locations.filter(isLocationEnabled).map((location) => ({ id: location.id, position: positionFor(location.id), interactionRadius: radiusFor(location) })), cooldownMs: 2_000, exitMarginMeters: mode === "gps" ? 10 : 1, distanceFn: distance, validatePositionFn: () => {} }); }
function unitDefenseSummary(unit, source, hero = null) { return { id: unit.id, name: unit.name ?? unit.typeId, type: unit.typeId, quantity: unit.quantity, ownerPlayerId: unit.ownerPlayerId, source, heroId: hero?.id ?? null, heroName: hero?.name ?? null }; }
function locationDefenseSnapshot(location) {
  const units = location.garrison.units.map((unit) => unitDefenseSummary(unit, "garrison"));
  const reinforcements = location.heroIds.flatMap((heroId) => {
    const presentHero = game.getHero(heroId);
    if (!presentHero || presentHero.id === hero.id || !game.locationAccessPolicy.isDefender(presentHero.playerId, location)) return [];
    return presentHero.army.units.map((unit) => unitDefenseSummary(unit, "hero", presentHero));
  });
  return { slots: location.defenseSlots, units, reinforcements, defenders: [...units, ...reinforcements] };
}

function mappedLocations({ knownOnly = true } = {}) {
  const player = game.getPlayer("local");
  return game.locations.filter((location) => isLocationEnabled(location) && (!knownOnly || player.knowsLocation(location.id))).map((location) => {
    const position = positionFor(location.id); const d = distance(heroPosition, position); const ranges = rangesFor(location); const nearby = d <= ranges.interactionRadius;
    const relation = game.getLocationRelation(player.id, location.id); const can = (action) => hero.state === "active" && game.canPerformLocationAction({ playerId: player.id, locationId: location.id, action }); const actions = [];
    if (can("recruit")) { const totalAvailable = Object.values(location.recruitment.stock).reduce((sum, amount) => sum + amount, 0); location.recruitment.availableUnitTypeIds.forEach((type) => { const definition = game.unitDefinitions.get(type); actions.push({ id: `recruit:${type}`, label: `Recruter ${definition?.name ?? type}`, details: { name: definition?.name ?? type, available: location.recruitment.stock[type] ?? 0, totalAvailable, capacity: location.recruitment.capacity, stats: definition ? { ...definition.stats } : {}, costs: definition ? { ...definition.costs } : {} } }); }); }
    if (can("reinforce") && hero.army.units.some((unit) => unit.missingQuantity > 0 && (location.recruitment.stock[unit.typeId] ?? 0) > 0)) actions.push({ id: "complete-units", label: "Compléter les unités" });
    if (can("heal") && hero.army.units.some((unit) => unit.soldierHealth.some((health) => health < unit.healthPerSoldier))) actions.push({ id: "heal-units", label: "Soigner (1 unité de temps)" });
    if (can("manageReserves")) {
      const resourceIds = new Set([...Object.keys(hero.resources), ...Object.keys(location.resources.stock)].filter((id) => id !== "population"));
      resourceIds.forEach((id) => {
        const carried = Math.floor(hero.getResourceAmount(id)); const stored = Math.floor(location.resources.stock[id] ?? 0);
        if (carried + stored > 0) actions.push({ id: `reserve-balance:${id}`, label: `Répartir ${id}`, details: { resourceName: id, heroAmount: carried, locationAmount: stored, total: carried + stored, heroSlotCapacity: hero.bagSlotCount, locationSlotCapacity: location.storageSlotCapacity } });
      });
      Object.entries(location.resources.production).forEach(([id]) => actions.push({ id: `production-stock:${id}`, label: `Production de ${id}`, details: { resourceName: id, productionAmount: Math.floor(location.resources.productionStock[id] ?? 0), productionSlotCapacity: 4 } }));
      if ((location.population ?? 0) > 0) actions.push({ id: "prepare-population", label: "Préparer de la population", details: { population: location.population, bundleSize: 5, storageSlotCapacity: location.storageSlotCapacity } });
      if ((location.resources.stock.population ?? 0) > 0) actions.push({ id: "stored-population", label: "Population en réserve", details: { quantity: location.resources.stock.population } });
      hero.carriedLoot.filter((entry) => entry.itemId === "population").forEach((entry) => actions.push({ id: `settle-population:${entry.id}`, label: `Installer ${entry.quantity} habitant(s)`, details: { packageId: entry.id, quantity: entry.quantity } }));
    }
    if (can("attack")) { const captureRequirement = game.getLocationCaptureRequirement({ playerId: player.id, locationId: location.id }); actions.push({ id: "battle", label: captureRequirement.state === "can_capture" ? "Capturer" : "Attaquer" }); }
    const questInteractions = game.getQuestInteractionsForLocation(location.id);
    const chiefConversation = can("talkChief") ? game.getLocationChiefConversation({ playerId: player.id, locationId: location.id }) : null;
    if (chiefConversation) {
      chiefConversation.options.unshift(...questInteractions.map((interaction) => ({ id: `quest-interaction:${interaction.interactionId}`, kind: "quest_interaction", label: interaction.label, responseLines: interaction.responseLines })));
      actions.push({ id: "talk-chief", label: "Parler", details: chiefConversation });
    }
    else if (can("trade")) actions.push({ id: "trade", label: "Commercer" });
    if (!chiefConversation) questInteractions.forEach((interaction) => actions.push({ id: `quest-interaction:${interaction.interactionId}`, label: interaction.label }));
    const campDevelopment = location.type === "camp" ? game.getCampDevelopment(location.id) : null;
    if (campDevelopment && can("build") && nearby) {
      campDevelopment.improvements.filter((entry) => entry.available).forEach((entry) => actions.push({ id: `build-improvement:${entry.id}`, label: `${entry.name} ${entry.nextLevel}`, details: { ...entry.next, currentLevel: entry.level, nextLevel: entry.nextLevel, slotType: entry.slotType } }));
      if (campDevelopment.levelUp.eligible) actions.push({ id: "level-up-camp", label: `Élever au Camp ${location.level + 1}` });
    }
    const defense = locationDefenseSnapshot(location);
    return { id: location.id, name: location.name, type: location.type, position, radius: ranges.interactionRadius, interactionRadius: ranges.interactionRadius, detectionRadius: ranges.detectionRadius, distance: d, nearby, relation, state: "DISCOVERED", description: descriptions[location.id] ?? "Lieu créé pendant le test terrain.", defense, campDevelopment, actions };
  });
}

function runProductionCycle() { const siteCount = game.battleSites.length; game.update(); checkSimulationAutonomousAggression(); syncAutonomousBattle(); game.cleanupDynamicSites(); const siteExpired = game.battleSites.length < siteCount; if (siteExpired) updateDynamicSitePresence(); const cycle = game.advanceCycle(1); const mine = cycle.locations.find((result) => result.locationId === "gold-mine"); const recovery = cycle.heroes.find((result) => result.heroId === hero.id && result.restoredHealth > 0); if (mine) logTest(`La mine produit ${mine.produced.gold ?? 0} or.`); if (cycle.recoveredUnits.length > 0) logTest(`${cycle.recoveredUnits.length} unité(s) récupèrent des PV.`); if (recovery?.revived) logTest(`Retour à la base : héros actif avec ${recovery.restoredHealth} PV.`); else if (recovery?.locationHealing > 0) logTest(`Soins de localisation : +${recovery.restoredHealth} PV.`); render(); if (!activeGarrisonLocationId && currentLocationId && !ui.sheet.hidden && cycle.locations.some((result) => result.locationId === currentLocationId)) selectLocation(currentLocationId); }

function createRoamingChaosArmy() {
  if (game.getAutonomousGroup("chaos-roaming-test") !== null) return;
  const polygon = game.setup.playArea.polygon;
  const center = { latitude: polygon.reduce((sum, point) => sum + point.latitude, 0) / polygon.length, longitude: polygon.reduce((sum, point) => sum + point.longitude, 0) / polygon.length };
  const playerPosition = asGps(heroPosition);
  const candidate = mode === "simulation"
    ? { latitude: playerPosition.latitude + 15, longitude: playerPosition.longitude + 10 }
    : { latitude: playerPosition.latitude, longitude: playerPosition.longitude + 180 / (111_320 * Math.max(.01, Math.cos(playerPosition.latitude * Math.PI / 180))) };
  const spawn = game.setup.playArea.contains(candidate) ? candidate : center;
  game.addAutonomousGroup(new AutonomousGroup({
    id: "chaos-roaming-test", type: "army", owner: { kind: "faction", id: "chaos" }, factionId: "chaos",
    position: spawn, status: "idle", behavior: "aggressive", morale: 6,
    mission: { kind: "roam", center: spawn, radiusMeters: mode === "simulation" ? 600_000 : 500, speedMetersPerSecond: mode === "simulation" ? 12_000 : undefined },
    army: { units: [{ id: "chaos-roaming-raiders", ownerPlayerId: "chaos", typeId: "chaos-raider", quantity: 6, healthPerSoldier: 10, combatHealthThreshold: 4 }] },
    history: [{ type: "spawned_for_field_test", at: Date.now() }],
  }));
  logTest("Armée du Chaos autonome créée en mission d’errance.");
}

function visibleAutonomousGroups() {
  return autonomousGroupDetectionService.detect({ observer: { position: asGps(heroPosition), classId: hero.classId, skillIds: hero.skillIds }, groups: game.autonomousGroups, baseRadius: mode === "gps" ? 250 : 22 }).map((group) => ({ ...group, position: mode === "simulation" ? [group.position.latitude, group.position.longitude] : group.position }));
}
function visibleAutonomousTraces() {
  const questIds = new Set(["prospectors-trace-1", "prospectors-trace-2"]); const now = Date.now();
  const detectedGroups = new Map(visibleAutonomousGroups().map((group) => [group.id, group]));
  const observer = asGps(heroPosition); const scoutBonus = hero.classId === "ranger" || hero.skillIds.includes("scouting") ? 2 : 0;
  return game.autonomousGroupTraces.filter((trace) => {
    if (questIds.has(trace.id)) return false;
    const traceDistance = mode === "gps" ? distanceMeters(observer, trace.position) : Math.hypot(observer.latitude - trace.position.latitude, observer.longitude - trace.position.longitude);
    return trace.isDetectable({ at: now, minimumScore: 1, distance: traceDistance, distancePerPoint: mode === "gps" ? 50 : 5, detectionBonus: scoutBonus });
  }).map((trace) => ({
    id: trace.id, position: mode === "simulation" ? [trace.position.latitude, trace.position.longitude] : trace.position,
    color: trace.owner.kind === "player" && trace.owner.id === "local" ? "blue" : !detectedGroups.has(trace.groupId) ? "gray" : trace.owner.id === "chaos" ? "red" : trace.owner.kind === "independent" ? "yellow" : "gray",
  }));
}
function beginAutonomousBattle(group) {
  if (activeBattle?.status === "active" || group.status === "destroyed") return false;
  group.status = "interrupted";
  const battle = game.createBattle({ teamParticipants: [{ id: "heroes", heroIds: [hero.id] }, { id: `autonomous-${group.id}`, heroIds: [], autonomousGroupId: group.id }], position: group.position });
  closeSheet(ui.sheet); activateBattle(battle); return true;
}
function selectAutonomousGroup(groupId) {
  const group = game.getAutonomousGroup(groupId); if (!group) return;
  const snapshot = visibleAutonomousGroups().find((item) => item.id === groupId); if (!snapshot) return;
  const attackRange = mode === "gps" ? game.setup.rules.engagementRadiusMeters : 8; const canAttack = snapshot.distance <= attackRange;
  ui.sheet.hidden = false; ui.sheet.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Groupe autonome détecté</span><h2>Armée du Chaos</h2><p>${snapshot.soldiers} soldats · distance ${Math.round(snapshot.distance)}${mode === "gps" ? " m" : ""}</p><div class="sheet-actions"><button data-autonomous-attack ${canAttack ? "" : "disabled"}>Attaquer</button></div>${canAttack ? "" : `<p class="sheet-feedback">Approchez-vous à moins de ${attackRange}${mode === "gps" ? " m" : " unités"}.</p>`}`;
  ui.sheet.querySelector(".sheet-close").onclick = () => closeSheet(ui.sheet); ui.sheet.querySelector("[data-autonomous-attack]").onclick = () => beginAutonomousBattle(group);
}
function checkSimulationAutonomousAggression() {
  if (mode !== "simulation" || activeBattle?.status === "active") return;
  const target = visibleAutonomousGroups().find((group) => group.behavior === "aggressive" && group.distance <= 8);
  if (target) beginAutonomousBattle(game.getAutonomousGroup(target.id));
}
function applyPosition(position) {
  heroPosition = normalizePosition(position, mode); gpsAccuracy = mode === "gps" ? position.accuracy ?? null : null; hero.updatePosition(asGps(heroPosition));
  if (mapView && mapFollowMode !== "free") mapView.follow(heroPosition);
  if (gpsSetupActive) { render(); return; }
  const playAreaEvent = playAreaPresence.update(asGps(heroPosition));
  if (playAreaEvent?.type === "PlayAreaExited") { lastVisitedCellId = null; deviceAlerts.notify("danger"); logTest("⚠ Sortie de la zone de jeu."); }
  if (playAreaEvent?.type === "PlayAreaEntered") { deviceAlerts.notify("notice"); logTest("Retour dans la zone de jeu."); }
  const quest = field.updatePosition(asGps(heroPosition)); if (quest) { ui.questStatus.textContent = `${Math.round(quest.distanceMeters)} / 300 m ${quest.completed ? "· objectif atteint" : ""}`; ui.questPlace.disabled = !quest.completed; }
  const scenarioPlacements = game.updateScenarioPosition({ position: asGps(heroPosition), accuracy: gpsAccuracy });
  const readyPlacement = scenarioPlacements.find((placement) => placement.status === "ready");
  if (readyPlacement) pendingScenarioPlacementSlotId = readyPlacement.slotId;
  if (playAreaGrid) { const cell = playAreaGrid.getCellAt(asGps(heroPosition)); if (!cell) lastVisitedCellId = null; else if (cell.id !== lastVisitedCellId) { const passage = playAreaGrid.recordVisit(asGps(heroPosition)); lastVisitedCellId = cell.id; persistFieldState(); logTest(`Passage ${passage.visits} dans ${cell.id}.`); } }
  updatePresence(); locationEngine.update({ actorId: hero.id, position: heroPosition }).forEach(handleLocationEvent);
  updateDynamicSitePresence();
  if (activeBattle?.status === "active" && activeBattle.engagementContext) game.updateBattleHeroPosition({ battleId: activeBattle.id, heroId: hero.id, position: asGps(heroPosition) });
  render();
}
function updatePresence() { if (!game) return; const player = game.getPlayer("local"); mappedLocations({ knownOnly: false }).forEach((item) => { const location = game.getLocation(item.id); if (item.distance <= item.detectionRadius) player.discoverLocation(item.id, item.nearby ? 3 : 1); if (item.nearby) { location.addHero(hero.id); const revival = game.reviveHeroAtBase({ heroId: hero.id, locationId: location.id }); if (revival.success) { locationMessage = `Le héros reprend forme avec ${revival.health}/${revival.maximumHealth} PV.`; logTest(`Retour à la base : héros actif avec ${revival.health} PV.`); } } else location.removeHero(hero.id); }); }
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
      if (currentEncounter?.locationId === event.locationId) currentEncounter = null;
      closeSheet(ui.sheet);
    }
    return;
  }
  currentLocationId = event.locationId;
  if (interaction.type === "encounter") {
    currentEncounter = interaction.encounter;
    interaction.autoBattle ? openBattle({ ambushTeamId: "bandits" }) : renderEncounter();
  } else {
    selectLocation(event.locationId);
  }
}

function applyQuestFeedback(progress) {
  const narration = progress.appliedEvents.flatMap((entry) => entry.appliedEffects).find((effect) => effect.type === "narration");
  progress.appliedEvents.flatMap((entry) => entry.appliedEffects).filter((effect) => effect.type === "location_revealed").forEach((effect) => { game.getPlayer("local").discoverLocation(effect.locationId, 2); if (enabledGpsLocationIds !== null) enabledGpsLocationIds.add(effect.locationId); });
  locationMessage = narration?.text ?? "Objectif accompli.";
  deviceAlerts.notify("notice");
  logTest(locationMessage);
  if (progress.nextPhaseId) game.startCurrentScenarioPlacements(asGps(heroPosition));
  syncQuestTrace();
  syncQuestBattlefield();
}

function syncQuestTrace() {
  const phaseId = game.scenarioState?.currentPhaseId; const definition = phaseId === "follow-first-trace" ? { id: "prospectors-trace-1", eastMeters: 100, northMeters: 65, simDx: 8, simDy: 5, kind: "passage" } : phaseId === "follow-second-trace" ? { id: "prospectors-trace-2", eastMeters: 105, northMeters: 75, simDx: 9, simDy: 6, kind: "struggle" } : null;
  if (!definition || game.autonomousGroupTraces.some((trace) => trace.id === definition.id)) return;
  const base = Array.isArray(heroPosition) ? heroPosition : [heroPosition.latitude, heroPosition.longitude];
  const position = mode === "simulation" ? { latitude: base[0] + definition.simDx, longitude: base[1] + definition.simDy } : { latitude: base[0] + definition.northMeters / 111320, longitude: base[1] + definition.eastMeters / (111320 * Math.max(.01, Math.cos(base[0] * Math.PI / 180))) };
  game.autonomousGroupTraces.push(new AutonomousGroupTrace({ id: definition.id, groupId: "missing-royal-prospectors", groupType: "prospecting", owner: { kind: "faction", id: "kingdom" }, kind: definition.kind, position, soldierCount: 6, directionDegrees: 45, createdAt: Date.now(), decayPerMinute: .001 }));
}

function visibleQuestTraces() { syncQuestTrace(); return game.autonomousGroupTraces.filter((trace) => ["prospectors-trace-1", "prospectors-trace-2"].includes(trace.id) && trace.getScore(Date.now()) > 0).map((trace) => ({ id: trace.id, position: mode === "simulation" ? [trace.position.latitude, trace.position.longitude] : trace.position })); }
function syncQuestBattlefield() {
  if (game.scenarioState?.currentPhaseId !== "prospectors-battlefield") return;
  const player = game.getPlayer("local"); if (player.knowsLocation("prospector-battlefield")) return;
  const base = Array.isArray(heroPosition) ? heroPosition : [heroPosition.latitude, heroPosition.longitude];
  const target = mode === "simulation" ? [base[0] + 11, base[1] + 7] : { latitude: base[0] + 140 / 111320, longitude: base[1] + 110 / (111320 * Math.max(.01, Math.cos(base[0] * Math.PI / 180))) };
  player.discoverLocation("prospector-battlefield", 2); if (enabledGpsLocationIds !== null) enabledGpsLocationIds.add("prospector-battlefield"); moveLocation("prospector-battlefield", target); rebuildLocationEngine();
}
function inspectQuestTrace(traceId) {
  const trace = game.autonomousGroupTraces.find((item) => item.id === traceId); if (!trace) return;
  const tracePosition = mode === "simulation" ? [trace.position.latitude, trace.position.longitude] : trace.position;
  if (distance(heroPosition, tracePosition) > (mode === "simulation" ? 8 : 25)) { locationMessage = "Approchez-vous pour examiner cette trace."; logTest(locationMessage); return; }
  const progress = game.dispatchQuestEvent({ type: "TraceInspected", traceId });
  if (progress) { game.autonomousGroupTraces = game.autonomousGroupTraces.filter((item) => item.id !== traceId); applyQuestFeedback(progress); render(); }
}

function confirmScenarioPlacement() {
  if (!pendingScenarioPlacementSlotId) return;
  const result = game.placeScenarioLocation({ locationSlotId: pendingScenarioPlacementSlotId, position: asGps(heroPosition) });
  if (!result.success) return logTest(`Placement impossible : ${result.reason}.`);
  const slotId = pendingScenarioPlacementSlotId;
  pendingScenarioPlacementSlotId = null;
  runtimePositions.set(result.locationId, mode === "gps" ? { ...result.position } : [...heroPosition]);
  if (enabledGpsLocationIds !== null) enabledGpsLocationIds.add(result.locationId);
  game.getPlayer("local").discoverLocation(result.locationId, 3);
  interactionEngine = new InteractionEngine({ locations: game.locations, enemyResolver: resolveLocationEnemy });
  rebuildLocationEngine();
  if (result.quest) applyQuestFeedback(result.quest);
  logTest(`Lieu de scénario placé : ${slotId}.`);
  render();
  selectLocation(result.locationId);
}

function handleMapClick(position) {
  const point = mode === "gps" ? position : [position.latitude, position.longitude];
  if (interactionMode === "place-start-capital") {
    if (mode === "gps" && !isLocationPlacementAllowed({ playArea: validatedPlayArea, position: asGps(point) })) { ui.gpsAreaStatus.textContent = "La capitale doit être placée à l’intérieur de la zone validée."; return; }
    moveLocation("royal-capital", point); capitalPlaced = true; if (enabledGpsLocationIds !== null) enabledGpsLocationIds.add("royal-capital"); interactionMode = null; ui.gpsAreaStatus.textContent = "Capitale placée. Le héros commencera ici."; ui.finishGpsSetup.disabled = false; renderGpsLocationButtons(); return;
  }
  if (interactionMode === "draw-area") { field.addPlayAreaPoint(asGps(point)); if (gpsSetupActive) ui.gpsAreaStatus.textContent = `${field.playAreaPoints.length} sommet(s) posé(s).`; logTest(`Sommet ${field.playAreaPoints.length} ajouté.`); render(); return; }
  if (interactionMode?.startsWith("place-location:")) {
    const id = interactionMode.slice("place-location:".length);
    if (!isLocationPlacementAllowed({ playArea: validatedPlayArea, position: asGps(point) })) { ui.gpsAreaStatus.textContent = validatedPlayArea ? "Ce lieu doit être placé à l’intérieur de la zone de jeu." : "Valide d’abord la zone de jeu avant de placer un lieu."; return; }
    enabledGpsLocationIds.add(id); moveLocation(id, point); interactionMode = null; renderGpsLocationButtons(); logTest(`${game.getLocation(id).name} placé sur la carte.`); return;
  }
  if (interactionMode === "place-location") { moveLocation("bandit-camp", point); interactionMode = null; logTest("Camp placé manuellement sans QR code."); return; }
  if (mode === "simulation") applyPosition(point);
}
function moveLocation(id, position) { runtimePositions.set(id, Array.isArray(position) ? [...position] : { ...position }); const location = game.getLocation(id); location.position = asGps(position); const binding = game.scenarioLocationBindings.find((candidate) => candidate.locationId === id); const placement = binding ? game.scenarioRuntime?.placements[binding.locationSlotId] : null; if (placement?.status === "placed") placement.position = { ...location.position }; if (id === "bandit-camp") enemyHero.updatePosition(asGps(position)); rebuildLocationEngine(); render(); mapView.focus(position); }
function renderGpsLocationButtons() {
  const location = game.getLocation("royal-capital"); const allowed = mode === "simulation" || validatedPlayArea !== null;
  ui.gpsLocationButtons.innerHTML = `<button type="button" class="secondary-button ${capitalPlaced ? "is-placed" : ""}" data-start-capital ${allowed ? "" : "disabled"}>${capitalPlaced ? "✓ Replacer" : "Placer"} ${location.name}</button>`;
  ui.gpsLocationButtons.querySelector("[data-start-capital]").onclick = () => { interactionMode = "place-start-capital"; ui.gpsAreaStatus.textContent = "Touche la carte à l’endroit où la partie doit commencer."; };
}
function validatePlayArea() {
  validatedPlayArea = field.createPlayArea(); game.setup.playArea = validatedPlayArea;
  playAreaGrid = new PlayAreaGrid({ playArea: validatedPlayArea, cellSizeMeters: mode === "gps" ? 15 : 15_000 });
  playAreaPresence.setPlayArea(validatedPlayArea, asGps(heroPosition)); rebuildLocationEngine(); interactionMode = null; lastVisitedCellId = null; persistFieldState();
  $("#toggle-heatmap").disabled = false; mapView.setPlayArea(validatedPlayArea.polygon); applyPosition(heroPosition);
  const message = `Zone validée · ${(validatedPlayArea.getAreaSquareMeters() / 10_000).toFixed(1)} ha · ${playAreaGrid.cells.length} cellules de 15 m × 15 m.`;
  if (gpsSetupActive) { ui.gpsAreaStatus.textContent = `${message} Place maintenant la capitale.`; ui.finishGpsSetup.disabled = !capitalPlaced; renderGpsLocationButtons(); }
  logTest(message);
}
function openCheats() {
  const dialog = $("#cheat-dialog"); const form = dialog.querySelector("form");
  form.elements["hero-level"].value = hero.level; form.elements["hero-health"].value = hero.health;
  ["attack", "defense", "morale", "mobility", "command", "health"].forEach((stat) => { form.elements[`stat-${stat}`].value = hero.temporaryModifiers[stat]; });
  ["gold", "wood", "stone", "iron"].forEach((resource) => { form.elements[`resource-${resource}`].value = hero.getResourceAmount(resource); });
  $("#cheat-status").textContent = ""; dialog.showModal();
}
function applyHeroCheats() {
  const form = $("#cheat-dialog form");
  try {
    cheatService.applyHeroChanges(hero, { level: form.elements["hero-level"].value, health: form.elements["hero-health"].value, stats: Object.fromEntries(["attack", "defense", "morale", "mobility", "command", "health"].map((stat) => [stat, form.elements[`stat-${stat}`].value])), resources: Object.fromEntries(["gold", "wood", "stone", "iron"].map((resource) => [resource, form.elements[`resource-${resource}`].value])) });
    $("#cheat-status").textContent = "Modifications appliquées au héros."; logTest("Cheat : statistiques du héros modifiées."); render();
  } catch (error) { $("#cheat-status").textContent = error.message; }
}
function createCheatLocation() {
  const form = $("#cheat-dialog form"); const value = (name) => form.elements[name].value;
  try {
    if (game.getLocation(value("location-id"))) throw new Error("Cet identifiant de localisation existe déjà.");
    const location = cheatService.createLocation({ id: value("location-id"), name: value("location-name"), type: value("location-type"), ownerId: value("location-owner"), level: value("location-level"), population: value("location-population"), defenseSlots: value("location-defense-slots"), productionResource: value("location-production-resource"), productionAmount: value("location-production-amount") }, asGps(heroPosition));
    game.locations.push(location); runtimePositions.set(location.id, Array.isArray(heroPosition) ? [...heroPosition] : { ...heroPosition }); game.getPlayer("local").discoverLocation(location.id, 3); interactionEngine = new InteractionEngine({ locations: game.locations, enemyResolver: resolveLocationEnemy }); rebuildLocationEngine(); render();
    $("#cheat-status").textContent = `${location.name} créé à votre position.`; logTest(`Cheat : ${location.name} créé.`);
  } catch (error) { $("#cheat-status").textContent = error.message; }
}
function placeQuestLocation() {
  const gps = asGps(heroPosition); if (!field.canPlaceQuestLocation(gps)) return;
  let location = game.getLocation("quest-beacon-300m");
  if (!location) { location = new Location({ id: "quest-beacon-300m", name: "Balise des 300 mètres", type: "quest", roles: ["quest"], source: "quest", position: gps, interactionRadius: 40, visibility: "discovered", features: {}, qr: { enabled: false } }); game.locations.push(location); }
  runtimePositions.set(location.id, mode === "gps" ? gps : [...heroPosition]); rebuildLocationEngine(); logTest(`Lieu de quête posé à ${Math.round(field.questDistanceMeters)} m du départ.`); render();
}

function renderEncounter() { ui.sheet.hidden = false; ui.sheet.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Rencontre</span><h2>Ennemi détecté</h2><p>${currentEncounter.enemy.name}</p><div class="sheet-actions"><button data-encounter="fight">Combattre</button><button class="secondary-button" data-encounter="avoid">Éviter</button></div>`; ui.sheet.querySelector(".sheet-close").onclick = () => closeSheet(ui.sheet); ui.sheet.querySelectorAll("[data-encounter]").forEach((button) => button.onclick = () => { currentEncounter.choose(button.dataset.encounter); button.dataset.encounter === "fight" ? openBattle() : closeSheet(ui.sheet); }); }
function selectLocation(id) { const location = mappedLocations().find((item) => item.id === id); if (!location) return; activeGarrisonLocationId = null; currentLocationId = id; renderLocationSheet({ element: ui.sheet, location, message: locationMessage, onClose: () => { currentLocationId = null; activeGarrisonLocationId = null; closeSheet(ui.sheet); }, onAction: runAction, onOpenWorld: () => openLocationDetail(id), onOpenReserves: () => openLocationDetail(id, "reserves"), onOpenGarrison: () => openGarrisonManager(id) }); }
function dynamicSiteDistance(position, sitePosition) { return mode === "gps" ? distanceMeters(position, sitePosition) : Math.hypot(position[0] - sitePosition.latitude, position[1] - sitePosition.longitude); }
function dynamicSiteInteractionRadius(site) { return mode === "gps" ? site.interactionRadius : 8; }
function updateDynamicSitePresence() {
  if (!dynamicSitePresence || !game || !heroPosition) return;
  const sites = game.battleSites.filter((site) => site.status === "FINISHED" && !site.isExpired()).map((site) => ({ id: site.id, position: site.position, interactionRadius: dynamicSiteInteractionRadius(site) }));
  dynamicSitePresence.update({ position: heroPosition, sites }).forEach((event) => {
    if (event.type === "SiteEntered" && activeBattle?.status !== "active") selectDynamicSite(event.siteId, { approached: true });
    if (event.type === "SiteExited" && currentDynamicSiteId === event.siteId) { currentDynamicSiteId = null; closeSheet(ui.sheet); }
  });
}
function selectDynamicSite(id, { approached = false } = {}) {
  const lootSite = game.lootSites.find((item) => item.id === id);
  if (lootSite?.isKnownBy("local")) return openLootStock(id);
  const site = game.battleSites.find((item) => item.id === id); if (!site || site.status !== "FINISHED" || site.isExpired()) return;
  const nearby = dynamicSiteDistance(heroPosition, site.position) <= dynamicSiteInteractionRadius(site);
  if (nearby) { game.visitBattlefield({ battleSiteId: id, playerId: "local" }); render(); }
  currentDynamicSiteId = id; currentLocationId = null; activeGarrisonLocationId = null;
  const remainingMinutes = Math.max(1, Math.ceil((site.expiresAt - Date.now()) / 60_000));
  ui.sheet.hidden = false; ui.sheet.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Champ de bataille · éphémère</span><h2>Traces du combat</h2><p>Disparition dans environ ${remainingMinutes} min.</p>${approached ? '<p class="sheet-feedback">Vous entrez dans le champ de bataille.</p>' : ""}<div class="sheet-actions">${nearby ? '<button data-site-search="loot">Chercher du butin</button><button data-site-search="information">Chercher des informations</button><button data-site-search="survivors">Chercher des survivants</button>' : "Approchez-vous pour examiner les traces."}</div>`;
  ui.sheet.querySelector(".sheet-close").onclick = () => { currentDynamicSiteId = null; closeSheet(ui.sheet); };
  ui.sheet.querySelectorAll("[data-site-search]").forEach((button) => button.onclick = () => { const stockOpened = searchBattlefield(button.dataset.siteSearch, site.id); currentDynamicSiteId = null; if (!stockOpened) closeSheet(ui.sheet); });
}
function runAction(action, { returnToWorld = false } = {}) {
  const location = game.getLocation(currentLocationId);
  if (action === "talk-chief") {
    openChiefDialogue(location.id);
    return;
  } else if (action.startsWith("quest-interaction:")) {
    const result = game.dispatchQuestEvent({ type: "InteractionCompleted", interactionId: action.slice("quest-interaction:".length), locationId: location.id });
    locationMessage = result ? "Objectif accompli." : "Cette interaction n'a aucun effet.";
    if (result) applyQuestFeedback(result);
  } else if (action.startsWith("recruit:")) {
    const result = game.recruitUnit({ playerId: "local", heroId: hero.id, locationId: location.id, unitTypeId: action.split(":")[1] });
    locationMessage = result.success ? "Unité recrutée." : `Impossible : ${result.reason}.`;
  } else if (action === "complete-units") {
    const result = game.completeHeroUnits({ playerId: "local", heroId: hero.id, locationId: location.id });
    const added = result.reinforced.reduce((sum, unit) => sum + unit.added, 0);
    locationMessage = result.success ? `${added} soldat(s) ont complété vos unités.` : `Renfort impossible : ${result.reason}.`;
  } else if (action === "heal-units") {
    const result = game.healHeroUnits({ playerId: "local", heroId: hero.id, locationId: location.id, timeUnits: 1 });
    locationMessage = result.success ? `${result.restoredHealth} PV restauré(s) aux soldats.` : `Soin impossible : ${result.reason}.`;
  } else if (action.startsWith("reserve-balance:")) {
    const [, resourceName, targetHeroAmount] = action.split(":"); const currentHeroAmount = Math.floor(hero.getResourceAmount(resourceName)); const difference = Number(targetHeroAmount) - currentHeroAmount;
    if (difference === 0) { locationMessage = "La répartition est déjà appliquée."; render(); return returnToWorld ? renderWorld() : selectLocation(currentLocationId); }
    const direction = difference > 0 ? "to_hero" : "to_location";
    const result = game.transferLocationResource({ playerId: "local", heroId: hero.id, locationId: location.id, resourceName, amount: Math.abs(difference), direction });
    const mood = result.contentmentDelta > 0 ? ` · contentement +${result.contentmentDelta}` : result.contentmentDelta < 0 ? ` · contentement ${result.contentmentDelta}` : "";
    locationMessage = result.success ? `${result.transferred} ${resourceName} transféré${mood}.` : `Transfert impossible : ${result.reason}.`;
  } else if (action.startsWith("production-transfer:")) {
    const [, resourceName, destination, amount] = action.split(":");
    const result = game.transferLocationProduction({ playerId: "local", heroId: hero.id, locationId: location.id, resourceName, amount: Number(amount), destination });
    locationMessage = result.success ? `${result.transferred} ${resourceName} déplacé vers ${destination === "hero" ? "les bagages" : "les réserves"}.` : `Transfert impossible : ${result.reason}.`;
  } else if (action.startsWith("prepare-population:")) {
    const result = game.preparePopulationPackages({ playerId: "local", heroId: hero.id, locationId: location.id, people: Number(action.split(":")[1]) });
    locationMessage = result.success ? `${result.people} habitant(s) placés dans les réserves universelles.` : `Préparation impossible : ${result.reason}.`;
  } else if (action.startsWith("take-population:")) {
    const result = game.takeLocationPopulationPackage({ playerId: "local", heroId: hero.id, locationId: location.id, people: Number(action.split(":")[1]) });
    locationMessage = result.success ? `${result.people} habitant(s) placés dans les bagages.` : `Retrait impossible : ${result.reason}.`;
  } else if (action.startsWith("settle-population:")) {
    const result = game.settlePopulationPackage({ playerId: "local", heroId: hero.id, locationId: location.id, packageId: action.slice("settle-population:".length) });
    locationMessage = result.success ? `${result.people} habitant(s) installé(s).` : `Installation impossible : ${result.reason}.`;
  } else if (action.startsWith("deposit-resource:")) {
    const [resourceName, requestedAmount] = action.slice("deposit-resource:".length).split(":"); const amount = requestedAmount === undefined ? undefined : Number(requestedAmount); const result = game.depositLocationResource({ playerId: "local", heroId: hero.id, locationId: location.id, resourceName, amount }); locationMessage = result.success ? `${result.deposited} ${resourceName} déposé.` : `Dépôt impossible : ${result.reason}.`;
  } else if (action.startsWith("deposit-item:")) {
    const result = game.depositLocationItem({ playerId: "local", heroId: hero.id, locationId: location.id, lootId: action.slice("deposit-item:".length) }); locationMessage = result.success ? `${result.item.quantity} ${result.item.itemId} déposé.` : `Dépôt impossible : ${result.reason}.`;
  } else if (action.startsWith("build-improvement:")) {
    const result = game.buildCampImprovement({ playerId: "local", heroId: hero.id, locationId: location.id, improvementId: action.slice("build-improvement:".length) });
    locationMessage = result.success ? `Amélioration construite · niveau ${result.level} · +${result.experienceGained} XP.` : `Construction impossible : ${result.reason}.`;
  } else if (action === "level-up-camp") {
    const result = game.levelUpCamp({ playerId: "local", heroId: hero.id, locationId: location.id });
    locationMessage = result.success ? `Le camp atteint le niveau ${result.level}.` : `Évolution impossible : ${result.status?.blockers?.join(" · ") || result.reason}.`;
  } else if (action === "trade") locationMessage = "Le commerce est disponible ici ; les offres et quotas seront ajoutés avec le système d’objets.";
  else if (action === "battle") {
    const requirement = game.getLocationCaptureRequirement({ playerId: "local", locationId: location.id });
    if (requirement.state === "can_capture") {
      const capture = game.attemptLocationCapture({ playerId: "local", heroId: hero.id, locationId: location.id });
      locationMessage = capture.success ? "Lieu capturé sans combat." : `Capture impossible : ${capture.reason}.`;
      if (capture.success) { deviceAlerts.notify("notice"); logTest(`${location.name} passe sous votre contrôle.`); render(); if (returnToWorld) { worldMessage = locationMessage; renderWorld(); } else selectLocation(location.id); return; }
    } else if (requirement.state === "quest_required") locationMessage = `Capture protégée par la quête ${requirement.objectiveId}.`;
    else openBattle();
  }
  render();
  if (action !== "battle") { if (returnToWorld) { worldMessage = locationMessage; renderWorld(); } else selectLocation(currentLocationId); }
}

function openChiefDialogue(locationId) {
  const conversation = conversationFor(locationId);
  if (!conversation) return;
  closeSheet(ui.sheet);
  activeDialogue = { locationId, conversation, lines: [...conversation.openingLines], lineIndex: 0, showChoices: false };
  renderActiveDialogue();
}

function conversationFor(locationId) {
  const conversation = game.getLocationChiefConversation({ playerId: "local", locationId });
  if (!conversation) return null;
  const questInteractions = game.getQuestInteractionsForLocation(locationId);
  conversation.options.unshift(...questInteractions.map((interaction) => ({ id: `quest-interaction:${interaction.interactionId}`, kind: "quest_interaction", label: interaction.label, responseLines: interaction.responseLines })));
  return conversation;
}

function renderActiveDialogue() {
  if (!activeDialogue) return closeDialogueView($("#dialogue-layer"));
  renderDialogueView({
    element: $("#dialogue-layer"), conversation: activeDialogue.conversation, lines: activeDialogue.lines,
    lineIndex: activeDialogue.lineIndex, showChoices: activeDialogue.showChoices,
    onClose: closeActiveDialogue,
    onAdvance: () => {
      if (activeDialogue.lineIndex + 1 < activeDialogue.lines.length) activeDialogue.lineIndex += 1;
      else activeDialogue.showChoices = true;
      renderActiveDialogue();
    },
    onChoose: chooseDialogueOption,
  });
}

function chooseDialogueOption(optionId) {
  if (!activeDialogue) return;
  let lines, nextOptions = null;
  if (optionId.startsWith("quest-interaction:")) {
    const selectedOption = activeDialogue.conversation.options.find((option) => option.id === optionId);
    const progress = game.dispatchQuestEvent({ type: "InteractionCompleted", interactionId: optionId.slice("quest-interaction:".length), locationId: activeDialogue.locationId });
    const narration = progress?.appliedEvents.flatMap((entry) => entry.appliedEffects).find((effect) => effect.type === "narration");
    lines = selectedOption?.responseLines?.length ? [...selectedOption.responseLines] : [narration?.text ?? (progress ? "Votre mission est mise à jour." : "Nous avons déjà parlé de cela.")];
    if (progress) { deviceAlerts.notify("notice"); logTest(lines[0]); }
  } else {
    const result = game.selectLocationChiefOption({ playerId: "local", heroId: hero.id, locationId: activeDialogue.locationId, optionId });
    lines = result.success ? result.lines ?? [result.message] : [`Conversation impossible : ${result.reason}.`];
    if (result.options) nextOptions = result.options;
  }
  activeDialogue.conversation = conversationFor(activeDialogue.locationId) ?? activeDialogue.conversation;
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
  render();
}

function openBattle({ ambushTeamId = null } = {}) {
  if (activeBattle && activeBattle.status !== "finished") return; closeSheet(ui.sheet); enemyHero.updatePosition(asGps(heroPosition));
  const sourceLocationId = currentEncounter?.locationId ?? currentLocationId;
  if (ambushTeamId === null && sourceLocationId && !game.canPerformLocationAction({ playerId: "local", locationId: sourceLocationId, action: "attack" })) { locationMessage = "Attaque interdite par la relation avec ce lieu."; return selectLocation(sourceLocationId); }
  const battleLocationId = currentEncounter?.locationId ?? currentLocationId ?? "bandit-camp"; const battleLocation = game.getLocation(battleLocationId); const defenderHeroIds = battleLocation?.heroIds.filter((id) => game.getHero(id)?.playerId !== hero.playerId) ?? [enemyHero.id];
  const battle = game.createBattle({ teamParticipants: [{ id: "heroes", heroIds: [hero.id] }, { id: "bandits", heroIds: defenderHeroIds, locationId: battleLocationId }], position: asGps(heroPosition), sourceLocationId: battleLocationId, sourceEnemyTeamId: "bandits", config: { ambushTeamId, ambushDefenderRevealDelayMs: 1_500 }, loot: [{ id: "bandit-gold", itemId: "gold", quantity: 12, portable: true, valuePerUnit: 1 }] });
  activateBattle(battle, { ambushTeamId });
}

function syncAutonomousBattle() {
  if (activeBattle && activeBattle.status !== "finished") return;
  const battle = [...game.battles].reverse().find((candidate) => candidate.status !== "finished" && candidate.teams.some((team) => team.heroes.some((item) => item.sourceId === hero.id)));
  if (battle) activateBattle(battle, { ambushTeamId: battle.config.ambushTeamId });
}

function activateBattle(battle, { ambushTeamId = null } = {}) {
  activeBattle = battle;
  activeBattle.teams[0].units.forEach((unit) => { unit.lane = null; unit.progress = 0; }); activeBattle.teams[1].units.forEach((unit, index) => { unit.lane = index % 3; unit.progress = 0; }); battleResolved = false; battleResult = null; selectedBattlePower = null; battleMessage = ambushTeamId ? "Embuscade ! Réagissez immédiatement." : "Placez vos unités avant le début."; setBattleNavigationLocked(true);
  const revealBattle = () => { closeSheet(ui.sheet); switchView("battle"); renderBattle(); };
  const revealDelay = ambushTeamId !== null && ambushTeamId !== "heroes" ? activeBattle.config.ambushDefenderRevealDelayMs : 0;
  if (revealDelay > 0) { ui.sheet.hidden = false; ui.sheet.innerHTML = `<span class="sheet-state">Alerte</span><h2>Vous êtes attaqué !</h2><p>Le combat a déjà commencé.</p>`; setTimeout(revealBattle, revealDelay); } else revealBattle();
  logTest(`${ambushTeamId ? "Embuscade" : "Combat"} déclenché à la position du joueur.`);
  clearInterval(battleTimer); battleTimer = setInterval(() => { activeBattle.tick(500); resolveFinishedBattle(); if (!battleDragging) renderBattle(); render(); if (activeBattle.status === "finished") clearInterval(battleTimer); }, 500);
}
function renderBattle() { if (battleResult) { renderBattleResultView({ element: ui.battle, battle: activeBattle, result: battleResult, playerId: "local", playerTeamId: "heroes", onReturnToMap: () => { switchView("map"); render(); updateDynamicSitePresence(); } }); return; } renderBattleView({ element: ui.battle, battle: activeBattle, playerTeamId: "heroes", message: battleMessage, selectedUnitId: selectedBattleUnitId, selectedPower: selectedBattlePower, onSelectUnit: (id) => { selectedBattlePower = null; selectedBattleUnitId = id; renderBattle(); }, onDragState: (active) => { battleDragging = active; }, onAssign: (unitId, lane) => { const heroId = activeBattle.teams[0].heroes.find((item) => item.state === "active")?.id; const result = heroId ? activeBattle.assignUnit(unitId, heroId, lane) : { success: false }; selectedBattleUnitId = null; battleMessage = result.success ? `Unité sur la ligne ${lane + 1}.` : "Placement impossible."; renderBattle(); }, onRetreatLine: (lane) => { selectedBattlePower = null; const result = activeBattle.orderRetreat("heroes", lane); battleMessage = result.success ? `Retraite ordonnée ligne ${lane + 1} · commandement dépensé.` : result.reason === "insufficient_command_points" ? "Commandement insuffisant pour ordonner la retraite." : `Aucune unité disponible ligne ${lane + 1}.`; renderBattle(); }, onSelectPower: (power) => { selectedBattleUnitId = null; selectedBattlePower = power; battleMessage = `${power.name} : choisissez une cible.`; renderBattle(); }, onCancelPower: () => { selectedBattlePower = null; battleMessage = "Pouvoir annulé."; renderBattle(); }, onActivatePower: ({ userId, powerId, cost, targetId = null, name = null }) => { const result = activeBattle.activateSpecialPower({ teamId: "heroes", userId, powerId, cost, targetId }); const label = name ?? activeBattle.getSpecialPowerDefinition(powerId)?.name ?? powerId; selectedBattlePower = null; battleMessage = result.success ? `${label} appliqué (${result.appliedEffects?.length ?? 0} effet(s)) · ◆ ${result.remainingCommandPoints}.` : result.reason === "insufficient_command_points" ? "Commandement insuffisant pour ce pouvoir." : result.reason === "invalid_target" ? "Cette cible n’est pas valide." : "Pouvoir indisponible."; renderBattle(); }, onFlee: () => { if (!window.confirm("Fuir avec l’armée ? Une poursuite ennemie pourra infliger des dégâts supplémentaires.")) return; selectedBattlePower = null; const result = game.fleeBattleHero({ battleId: activeBattle.id, heroId: hero.id }); battleMessage = result.success ? "Fuite engagée : l’armée quitte le champ de bataille." : "La fuite est impossible."; resolveFinishedBattle(); renderBattle(); render(); }, onSurrender: () => { if (!window.confirm("Se rendre ? Le héros survivra, mais perdra son armée et tous ses bagages.")) return; selectedBattlePower = null; game.surrenderBattle({ battleId: activeBattle.id, teamId: "heroes" }); resolveFinishedBattle(); renderBattle(); render(); } }); }
function resolveFinishedBattle() { if (activeBattle.status !== "finished" || battleResolved) return; const result = game.resolveBattle(activeBattle.id); battleResolved = true; battleResult = result; setBattleNavigationLocked(false); if (activeBattle.winnerTeamId === "heroes" && activeBattle.sourceLocationId) { const quest = game.dispatchQuestEvent({ type: "BattleWon", locationId: activeBattle.sourceLocationId, battleId: activeBattle.id }); if (quest) applyQuestFeedback(quest); } if (result.destroyedLocationId) { rebuildLocationEngine(); interactionEngine = new InteractionEngine({ locations: game.locations.filter((location) => location.state !== "destroyed"), enemyResolver: resolveLocationEnemy }); currentEncounter = null; currentLocationId = null; } if (result.capturedLocationId) { currentEncounter = null; locationMessage = "Lieu capturé après la victoire."; } battleMessage = `Bataille terminée · vainqueur ${activeBattle.winnerTeamId ?? "aucun"}.`; logTest(`Champ de bataille créé${result.lootSite ? " et butin calculé" : ", sans butin"}${result.destroyedLocationId ? " · camp ennemi détruit" : ""}${result.capturedLocationId ? " · lieu capturé" : ""}.`); }

function searchBattlefield(searchType = "loot", battleSiteId = null) { const site = battleSiteId ? game.battleSites.find((item) => item.id === battleSiteId) : game.battleSites.at(-1); if (!site) { logTest("Aucun champ de bataille à chercher."); return false; } const result = game.searchBattlefield({ battleSiteId: site.id, playerId: "local", heroId: hero.id, position: asGps(heroPosition), searchType }); const detail = searchType === "loot" ? `${result.discoveredLootSiteIds?.length ?? 0} butin(s) découvert(s)` : searchType === "information" ? `vainqueur : ${result.information?.winnerTeamId ?? "inconnu"}` : `${result.survivors?.length ?? 0} survivant(s)`; logTest(result.success ? `Recherche réussie · ${detail}.` : `Recherche impossible : ${result.reason}.`); render(); const knownLoot = searchType === "loot" ? game.lootSites.find((item) => item.battleId === site.battleId && item.isKnownBy("local")) : null; if (knownLoot && (result.success || result.reason === "already_searched")) { openLootStock(knownLoot.id); return true; } return false; }
function openLootStock(lootSiteId, message = "") { const site = game.lootSites.find((item) => item.id === lootSiteId); if (!site) return closeSheet(ui.sheet); renderLootStockSheet({ element: ui.sheet, site, playerId: "local", bag: game.inventoryService.getHeroBagState(hero), message, onClose: () => closeSheet(ui.sheet), onCollect: (selection) => { const result = game.collectLoot({ lootSiteId, playerId: "local", heroId: hero.id, position: asGps(heroPosition), selection }); logTest(result.success ? `Butin collecté : ${result.collected.map((item) => `${item.quantity} ${item.itemId}`).join(", ")}.` : `Collecte impossible : ${result.reason}.`); render(); if (result.depleted) closeSheet(ui.sheet); else openLootStock(lootSiteId, result.success ? "Sélection transférée dans vos bagages." : `Collecte impossible : ${result.reason}.`); } }); }
function collectLoot() { const site = game.lootSites.find((item) => item.isKnownBy("local")); if (!site) return logTest("Aucun butin découvert."); openLootStock(site.id); }

function visibleSites() { if (!game || !heroPosition) return []; return game.getVisibleDynamicSites({ playerId: "local", position: asGps(heroPosition) }).map((site) => mode === "simulation" ? { ...site, interactionRadius: site.kind === "battlefield" ? 8 : 6 } : site); }
function persistFieldState() { saveFieldState({ mode, playAreaGrid, gpsAccuracyLog }); }
function restoreFieldTestState() {
  if (!savedFieldState?.playAreaGrid || savedFieldState.mode !== mode) { renderGpsAccuracySummary(); return; }
  try {
    playAreaGrid = new PlayAreaGrid(savedFieldState.playAreaGrid); validatedPlayArea = playAreaGrid.playArea; game.setup.playArea = validatedPlayArea;
    field.clearPlayArea(); validatedPlayArea.polygon.forEach((point) => field.addPlayAreaPoint(point));
    playAreaPresence.setPlayArea(validatedPlayArea, asGps(heroPosition)); mapView.setPlayArea(validatedPlayArea.polygon); rebuildLocationEngine();
    $("#toggle-heatmap").disabled = false; logTest(`Heatmap restaurée · ${playAreaGrid.cells.reduce((sum, cell) => sum + cell.visits, 0)} passage(s).`);
  } catch { playAreaGrid = null; validatedPlayArea = null; }
  renderGpsAccuracySummary();
}
function renderGpsAccuracySummary() { const summary = gpsAccuracyLog.getSummary(); gpsAccuracyStatus.textContent = summary.count ? `Journal GPS · ${summary.count} relevé(s) · moyenne ±${Math.round(summary.average)} m · min ${Math.round(summary.minimum)} m · max ${Math.round(summary.maximum)} m` : "Journal GPS : aucun relevé."; }
function directoryLocations() { const player = game.getPlayer("local"); return mappedLocations().map((snapshot) => { const location = game.getLocation(snapshot.id); const ownerPlayer = location.ownerId ? game.getPlayer(location.ownerId) : null; const owner = location.ownerId ? { id: location.ownerId, name: ownerPlayer?.name ?? location.ownerId, color: location.ownerId === "local" ? "#62a8ff" : location.ownerId === "bandits" ? "#d86868" : "#d8b862" } : null; const heroes = location.heroIds.map((id) => game.getHero(id)).filter((item) => item && item.playerId !== player.id).map((item) => ({ ...item, className: data.heroClasses.find((heroClass) => heroClass.id === item.classId)?.name ?? item.classId })); return { ...buildLocationIntel({ location, snapshot, knowledgeLevel: player.getLocationKnowledge(location.id), owner, heroes, description: descriptions[location.id] ?? "Un lieu dont l'histoire reste à découvrir." }), campDevelopment: snapshot.campDevelopment }; }); }
function filteredDirectoryLocations() { const search = worldFilters.search.trim().toLocaleLowerCase("fr"); const locations = directoryLocations().filter((location) => (!search || location.name.toLocaleLowerCase("fr").includes(search)) && (!worldFilters.type || location.nature === worldFilters.type) && (!worldFilters.owner || (worldFilters.owner === "known" ? location.owner.id : !location.owner.id))); const compare = worldFilters.sort === "name" ? (a, b) => a.name.localeCompare(b.name, "fr") : worldFilters.sort === "type" ? (a, b) => a.nature.localeCompare(b.nature, "fr") : worldFilters.sort === "owner" ? (a, b) => a.owner.name.localeCompare(b.owner.name, "fr") : (a, b) => a.distance - b.distance; return locations.sort(compare); }
let initialWorldActionMenu = null;
function openLocationDetail(id, actionMenu = null) { activeGarrisonLocationId = null; worldSelectedLocationId = id; worldMessage = ""; initialWorldActionMenu = actionMenu; closeSheet(ui.sheet); switchView("world"); }
function showLocationOnMap(id) { const location = directoryLocations().find((item) => item.id === id); if (!location) return; switchView("map"); mapView.focus(location.position); }
function openGarrisonManager(locationId, message = "") {
  const location = game.getLocation(locationId); if (!location) return;
  activeGarrisonLocationId = locationId; currentLocationId = locationId;
  renderGarrisonSheet({ element: ui.sheet, location, hero, playerId: "local", unitDefinitions: game.unitDefinitions, message, onClose: () => { activeGarrisonLocationId = null; closeSheet(ui.sheet); }, onTransfer: ({ direction, unitId }) => {
    const success = direction === "deposit" ? game.garrisonUnit({ playerId: "local", heroId: hero.id, locationId, unitId }) : game.withdrawGarrisonUnit({ playerId: "local", heroId: hero.id, locationId, unitId });
    renderWorld(); openGarrisonManager(locationId, success ? (direction === "deposit" ? "Unité affectée à la garnison." : "Unité reprise dans votre armée.") : "Transfert impossible : vérifiez les slots, la capacité de l’armée et le propriétaire de l’unité.");
  } });
}
function renderWorld() {
  if (!game || !ui.worldContent) return;
  const locations = filteredDirectoryLocations();
  if (!worldSelectedLocationId) return renderWorldDirectory({ element: ui.worldContent, locations, types: [...new Set(directoryLocations().map((location) => location.nature))].sort(), filters: worldFilters, onFilter: (key, value) => { worldFilters[key] = value; renderWorld(); if (key === "search") { const input = ui.worldContent.querySelector('[data-filter="search"]'); input?.focus(); input?.setSelectionRange(value.length, value.length); } }, onOpen: openLocationDetail, onShowMap: showLocationOnMap });
  const allLocations = directoryLocations().sort((a, b) => a.name.localeCompare(b.name, "fr")); const index = Math.max(0, allLocations.findIndex((item) => item.id === worldSelectedLocationId)); const location = allLocations[index]; if (!location) { worldSelectedLocationId = null; return renderWorld(); }
  const initialActionMenu = initialWorldActionMenu; initialWorldActionMenu = null;
  renderLocationDetail({ element: ui.worldContent, location, index, total: allLocations.length, message: worldMessage, initialActionMenu, onBack: () => { worldSelectedLocationId = null; worldMessage = ""; renderWorld(); }, onPrevious: () => { if (index > 0) { worldSelectedLocationId = allLocations[index - 1].id; worldMessage = ""; renderWorld(); } }, onNext: () => { if (index < allLocations.length - 1) { worldSelectedLocationId = allLocations[index + 1].id; worldMessage = ""; renderWorld(); } }, onShowMap: () => showLocationOnMap(location.id), onAction: (action) => { currentLocationId = location.id; runAction(action, { returnToWorld: true }); }, onOpenGarrison: () => openGarrisonManager(location.id) });
}
function render() {
  if (!game || !mapView) return; syncQuestBattlefield(); const sites = visibleSites(); mapView.render({ heroPosition, heroHeading, accuracy: gpsAccuracy, locations: mappedLocations(), autonomousGroups: visibleAutonomousGroups(), autonomousTraces: visibleAutonomousTraces(), playAreaPoints: field.playAreaPoints, dynamicSites: sites, questTraces: visibleQuestTraces(), gridCells: playAreaGrid?.cells ?? [], heatmapVisible });
  const player = game.getPlayer("local"); ui.mode.textContent = mode === "gps" ? "GPS réel" : "Maison"; ui.health.textContent = `PV ${hero.health}/${hero.maxHealth}`; ui.army.textContent = `Armée ${hero.army.units.length}`; ui.gold.textContent = `Or ${hero.getResourceAmount("gold")}`;
  const heroClass = data.heroClasses.find((item) => item.id === hero.classId);
  const heroModifiers = HeroArmyModifier.calculate({ hero, units: hero.army.units, unitDefinitions: game.unitDefinitions, moraleMode: game.setup.rules.moraleMode });
  const usedBagSlots = heroModifiers.details.speed.usedSlots;
  const bagSlotCapacity = heroModifiers.details.speed.slotCapacity;
  const signed = (value) => `${value >= 0 ? "+" : ""}${Number(value.toFixed(2))}`;
  const healthPercent = Math.max(0, Math.min(100, hero.health / hero.maxHealth * 100));
  const progress = game.getHeroProgress(hero.id);
  const authority = game.getHeroAuthority(hero.id);
  const levelExperience = progress.currentLevelXp;
  const experiencePercent = progress.maximumLevelReached ? 100 : Math.max(0, Math.min(100, levelExperience / progress.xpToNextLevel * 100));
  const statLabels = { attack: "Attaque", defense: "Défense", morale: "Moral", mobility: "Mobilité", command: "Commandement", health: "Points de vie" };
  const statButton = (stat, value) => `<button type="button" class="hero-stat-button ${selectedHeroStat === stat ? "is-selected" : ""}" data-hero-stat="${stat}" aria-expanded="${selectedHeroStat === stat}"><strong>${value}</strong><span>${statLabels[stat]}</span></button>`;
  const contextualMorale = heroModifiers.details.morale.reduce((total, factor) => total + factor.value, 0);
  const mobilityStatFactor = (hero.finalStats.mobility ?? 3) / 3;
  const armySpeedMultiplier = mobilityStatFactor === 0 ? 0 : heroModifiers.speedMultiplier / mobilityStatFactor;
  const statDetail = selectedHeroStat ? `<aside class="stat-detail" role="status"><header><strong>${statLabels[selectedHeroStat]}</strong><span>Valeur finale : ${hero.finalStats[selectedHeroStat]}</span></header><div class="stat-detail-grid"><span>Base<strong>${hero.baseStats[selectedHeroStat]}</strong></span><span>Progression<strong>${signed(hero.statGrowth[selectedHeroStat])}</strong></span><span>Équipement<strong>${signed(hero.equipmentModifiers[selectedHeroStat])}</strong></span><span>Temporaire<strong>${signed(hero.temporaryModifiers[selectedHeroStat])}</strong></span></div>${selectedHeroStat === "health" ? `<p>PV actuels : ${hero.health}/${hero.maxHealth}</p>` : ""}${selectedHeroStat === "command" ? `<p>Points disponibles : ${hero.commandPoints}/${hero.maxCommandPoints}</p>` : ""}${selectedHeroStat === "morale" && contextualMorale !== 0 ? `<p>Contexte actuel : ${signed(contextualMorale)} · bonus effectif ${signed(heroModifiers.moraleBonus)}</p>` : ""}${selectedHeroStat === "mobility" ? `<p>Train de l’armée : ×${armySpeedMultiplier.toFixed(2)} · multiplicateur effectif ×${heroModifiers.speedMultiplier.toFixed(2)}</p>` : ""}</aside>` : "";
  const traitButton = (id, type) => { const aptitude = data.heroAptitudes.find((item) => item.id === id); const rank = hero.aptitudeRanks[id]; return `<button type="button" class="trait-chip ${selectedHeroTrait?.id === id && selectedHeroTrait.type === type ? "is-selected" : ""}" data-trait-id="${id}" data-trait-type="${type}"><span class="trait-icon" aria-hidden="true">${type === "skill" ? "✦" : "◆"}</span><span>${aptitude?.name ?? id.replaceAll("_", " ").replaceAll("-", " ")}${rank ? `<small>${rank}</small>` : ""}</span></button>`; };
  const traitDetail = selectedHeroTrait ? `<aside class="trait-detail"><span class="trait-icon" aria-hidden="true">${selectedHeroTrait.type === "skill" ? "✦" : "◆"}</span><div><strong>${selectedHeroTrait.id.replaceAll("_", " ").replaceAll("-", " ")}</strong><small>${selectedHeroTrait.type === "skill" ? "Compétence passive" : "Pouvoir spécial"}</small><p>${selectedHeroTrait.type === "skill" ? "Bonus permanent appliqué automatiquement, sans dépense de commandement." : "Action utilisable en combat contre une dépense de points de commandement."}</p><code>${selectedHeroTrait.id}</code></div></aside>` : "";
  ui.heroContent.innerHTML = `<article class="hero-card compact-hero-card"><header><div><h3>${hero.name}</h3><span class="eyebrow">${heroClass?.name ?? hero.classId} · ${rankLabel(HERO_COMMAND_RANKS, hero.commandRank)}</span></div><span class="hero-state">${hero.state}</span></header><section class="hero-bars"><button type="button" class="hero-bar-label hero-stat-trigger ${selectedHeroStat === "health" ? "is-selected" : ""}" data-hero-stat="health" aria-expanded="${selectedHeroStat === "health"}"><strong>Points de vie</strong><span>${hero.health}/${hero.maxHealth}</span></button><div class="hero-progress health-progress" role="progressbar" aria-label="Points de vie" aria-valuemin="0" aria-valuemax="${hero.maxHealth}" aria-valuenow="${hero.health}"><span style="width:${healthPercent}%"></span></div><div class="hero-bar-label"><strong>Niveau ${hero.level}</strong><span>${levelExperience}/100 XP</span></div><div class="hero-progress experience-progress" role="progressbar" aria-label="Expérience du niveau ${hero.level}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${levelExperience}"><span style="width:${experiencePercent}%"></span></div></section><div class="compact-hero-stats">${statButton("attack", signed(heroModifiers.attackBonus))}${statButton("defense", signed(heroModifiers.defenseBonus))}${statButton("morale", signed(heroModifiers.moraleBonus))}${statButton("mobility", `×${heroModifiers.speedMultiplier.toFixed(2)}`)}${statButton("command", `◆ ${hero.commandPoints}/${hero.maxCommandPoints}`)}<div><strong>${hero.army.units.length}/${hero.maxUnitStacks}</strong><span>Unités</span></div><div><strong>${usedBagSlots}/${bagSlotCapacity}</strong><span>Bagages</span></div></div>${statDetail}<section class="trait-section"><h4>Compétences passives</h4><div class="trait-list">${hero.skillIds.map((id) => traitButton(id, "skill")).join("") || '<span class="text-muted">Aucune</span>'}</div></section><section class="trait-section"><h4>Pouvoirs spéciaux</h4><div class="trait-list">${hero.specialPowerIds.map((id) => traitButton(id, "power")).join("") || '<span class="text-muted">Aucun</span>'}</div></section>${traitDetail}<div class="hero-equipment"><strong>Équipement</strong><span>${Object.values(hero.equipment).join(", ") || "aucun"}</span></div></article>`;
  if (hero.state === "ghost") ui.heroContent.querySelector(".hero-bars").insertAdjacentHTML("afterend", `<aside class="ghost-notice"><strong>Héros fantôme</strong><span>Retournez à ${game.getHeroBaseLocation(hero.id)?.name ?? "votre base"} pour revenir avec la moitié de vos PV.</span></aside>`);
  const xpLabel = progress.maximumLevelReached ? "Niveau maximal atteint" : `${levelExperience}/${progress.xpToNextLevel} XP · prochain grade ${progress.nextGrade ? `${progress.nextGrade.name} niv. ${progress.nextGrade.level}` : "au niveau 20"}`;
  ui.heroContent.querySelectorAll(".hero-bar-label")[1].querySelector("span").textContent = xpLabel;
  ui.heroContent.querySelector(".experience-progress").setAttribute("aria-valuemax", String(progress.xpToNextLevel || 1));
  ui.heroContent.querySelector(".compact-hero-stats").insertAdjacentHTML("beforeend", `<div><strong>${authority.used}/${authority.maximum}</strong><span>Autorité</span></div>`);
  ui.heroContent.querySelector(".hero-equipment").innerHTML = renderEquipmentView({ hero });
  if (progress.canLevelUp) ui.heroContent.querySelector(".hero-equipment").insertAdjacentHTML("beforebegin", `<section class="level-up-panel level-up-ready"><p class="eyebrow">Progression disponible</p><h4>Passer au niveau ${hero.level + 1}</h4><p>Autorité ${authority.maximum} → ${authority.maximum + 1} · une statistique augmentera et une aptitude sera à choisir.</p><button type="button" data-hero-level-up>Appliquer le niveau</button></section>`);
  const pending = hero.pendingLevelUps[0];
  if (pending) { const grade = HERO_COMMAND_RANKS.find((item) => item.id === pending.gradeUnlocked); ui.heroContent.querySelector(".hero-equipment").insertAdjacentHTML("beforebegin", `<section class="level-up-panel"><p class="eyebrow">Niveau ${pending.level} atteint</p><h4>${pending.statIncrease.stat} +${pending.statIncrease.amount}</h4>${grade ? `<p>Nouveau grade : ${grade.label}</p>` : ""}<p>Choisis une amélioration (${hero.pendingLevelUps.length} en attente)</p><div class="level-up-options">${pending.proposals.map((proposal) => `<button type="button" data-level-up="${pending.id}" data-upgrade="${proposal.id}"><strong>${proposal.name} · ${proposal.rank}</strong><span>${proposal.description}</span><small>${proposal.type} · ${proposal.scope}</small></button>`).join("")}</div></section>`); }
  if (pending) ui.heroContent.querySelector(".level-up-panel h4")?.insertAdjacentHTML("afterend", `<p>Autorité +${pending.authorityIncrease ?? 1}</p>`);
  ui.heroContent.querySelectorAll("[data-hero-stat]").forEach((button) => button.addEventListener("click", () => { selectedHeroStat = selectedHeroStat === button.dataset.heroStat ? null : button.dataset.heroStat; selectedHeroTrait = null; render(); }));
  ui.heroContent.querySelectorAll("[data-trait-id]").forEach((button) => button.addEventListener("click", () => { const next = { id: button.dataset.traitId, type: button.dataset.traitType }; selectedHeroTrait = selectedHeroTrait?.id === next.id && selectedHeroTrait.type === next.type ? null : next; selectedHeroStat = null; render(); }));
  ui.heroContent.querySelectorAll("[data-level-up]").forEach((button) => button.addEventListener("click", () => { if (!window.confirm(`Choisir définitivement ${button.querySelector("strong").textContent} ?`)) return; game.selectHeroLevelUp({ heroId: hero.id, pendingId: button.dataset.levelUp, upgradeId: button.dataset.upgrade }); render(); }));
  bindEquipmentView(ui.heroContent, { onEquip: (packageId) => { const result = game.equipHeroItem({ playerId: hero.playerId, heroId: hero.id, packageId }); logTest(result.success ? `${result.itemId} équipé sur ${result.slot}.` : `Équipement impossible : ${result.reason}.`); render(); }, onUnequip: (slot) => { const result = game.unequipHeroItem({ playerId: hero.playerId, heroId: hero.id, slot }); logTest(result.success ? `${result.itemId} replacé dans les bagages.` : `Retrait impossible : ${result.reason}.`); render(); } });
  ui.heroContent.querySelector("[data-hero-level-up]")?.addEventListener("click", () => { const result = game.levelUpHero({ heroId: hero.id }); if (!result.success) logTest(`Evolution impossible : ${result.reason}.`); render(); });
  ui.heroContent.onclick = (event) => { let changed = false; if (selectedHeroTrait && !event.target.closest("[data-trait-id], .trait-detail")) { selectedHeroTrait = null; changed = true; } if (selectedHeroStat && !event.target.closest("[data-hero-stat], .stat-detail")) { selectedHeroStat = null; changed = true; } if (changed) render(); };
  ui.armyContent.innerHTML = `<div class="army-list">${hero.army.units.map((unit) => { const definition = game.unitDefinitions.get(unit.typeId); const unitName = unit.name ?? definition?.name ?? unit.typeId; const stats = definition?.stats; const illustration = renderUnitTypeIcon({ typeId: unit.typeId, tags: definition?.tags ?? [], range: stats?.range ?? 1 }); const expanded = expandedArmyUnitId === unit.id; const currentHealth = unit.soldierHealth.reduce((total, health) => total + health, 0); const maximumHealth = unit.maxQuantity * unit.healthPerSoldier; return `<article class="army-card${expanded ? " is-expanded" : ""}" data-army-unit="${unit.id}" role="button" tabindex="0" aria-expanded="${expanded}" aria-label="${expanded ? "Réduire" : "Afficher les détails de"} ${unitName}"><div class="army-illustration" aria-hidden="true">${illustration}</div><div class="army-card__content"><p class="eyebrow">${rankLabel(UNIT_RANKS, unit.rank)} · niveau ${unit.level}</p><div class="army-card__heading"><h3>${unitName}</h3><span class="army-card__chevron" aria-hidden="true">⌄</span></div>${unitHealthBar(unit)}<div class="army-card__summary"><strong>${unit.combatantCount}/${unit.maxQuantity} aptes</strong><span>${currentHealth}/${maximumHealth} PV</span></div><div class="army-card__details" ${expanded ? "" : "hidden"}><div class="army-card__stats"><div><strong>${unit.quantity}/${unit.maxQuantity}</strong><span>Effectif</span></div><div><strong>${unit.combatantCount}</strong><span>Apte(s)</span></div><div><strong>${unit.woundedCount}</strong><span>Blessé(s)</span></div><div><strong>${unit.experience}</strong><span>Expérience</span></div>${stats ? `<div><strong>${stats.attack}</strong><span>Attaque</span></div><div><strong>${stats.defense}</strong><span>Défense</span></div><div><strong>${stats.speed}</strong><span>Vitesse</span></div>` : ""}</div><div class="army-card__meta"></div><div class="army-card__actions"><button type="button" class="disband-unit-button" data-disband-unit="${unit.id}" aria-label="Dissoudre ${unitName}">Dissoudre</button></div></div></div></article>`; }).join("") || '<p class="text-muted">Aucune unité.</p>'}</div>`; renderInventoryView({ element: ui.inventory, hero, slotCount: hero.bagSlotCount });
  const toggleArmyCard = (card) => { expandedArmyUnitId = card.getAttribute("aria-expanded") === "true" ? null : card.dataset.armyUnit; render(); };
  ui.armyContent.querySelectorAll("[data-army-unit]").forEach((card) => {
    card.addEventListener("click", (event) => { if (!event.target.closest("button")) toggleArmyCard(card); });
    card.addEventListener("keydown", (event) => { if ((event.key === "Enter" || event.key === " ") && event.target === card) { event.preventDefault(); toggleArmyCard(card); } });
  });
  ui.armyContent.querySelectorAll("[data-disband-unit]").forEach((button) => button.addEventListener("click", () => {
    const unit = hero.army.getUnit(button.dataset.disbandUnit); if (unit === null) return;
    if (!window.confirm(`Dissoudre définitivement ${unit.name ?? unit.typeId} ? Aucun remboursement ne sera accordé.`)) return;
    const result = game.disbandUnit({ playerId: hero.playerId, heroId: hero.id, unitId: unit.id });
    if (result.success) { logTest(`${result.unit.name ?? result.unit.typeId} a été dissoute.`); render(); }
  }));
  [...ui.armyContent.querySelectorAll(".army-card")].forEach((card, index) => {
    const unit = hero.army.units[index]; if (!unit) return;
    card.querySelector(".army-card__summary")?.insertAdjacentHTML("afterend", renderUnitExperienceBar(unit));
    card.querySelector(".army-card__details")?.insertAdjacentHTML("afterbegin", renderUnitExperienceBar(unit, { detailed: true }));
    const stats = game.unitDefinitions.get(unit.typeId)?.stats;
    if (stats) card.querySelector(".army-card__stats")?.insertAdjacentHTML("beforeend", `<div><strong>${stats.morale}</strong><span>Moral</span></div>`);
    const currentCost = game.getUnitAuthorityCost(unit); const nextCost = unit.nextRank ? game.getUnitAuthorityCost(unit, unit.nextRank.id) : currentCost;
    card.querySelector(".army-card__meta")?.insertAdjacentHTML("beforeend", `<span>Autorité ${currentCost}</span>`);
    if (!unit.canPromote) return;
    const allowed = authority.used - currentCost + nextCost <= authority.maximum;
    card.querySelector(".army-card__actions")?.insertAdjacentHTML("afterbegin", `<button type="button" class="promote-unit-button" data-promote-unit="${unit.id}" ${allowed ? "" : "disabled"}>Promouvoir ${rankLabel(UNIT_RANKS, unit.nextRank.id)} · Autorité ${currentCost} → ${nextCost}${allowed ? "" : " · insuffisante"}</button>`);
  });
  ui.armyContent.querySelectorAll("[data-promote-unit]").forEach((button) => button.addEventListener("click", () => { const result = game.promoteUnit({ heroId: hero.id, unitId: button.dataset.promoteUnit }); if (!result.success) logTest(`Promotion impossible : ${result.reason}.`); render(); }));
  const heroNotices = progress.availableLevelUps + hero.pendingLevelUps.length;
  const unitNotices = hero.army.units.filter((unit) => unit.canPromote).length;
  [["hero", heroNotices], ["army", unitNotices]].forEach(([view, count]) => { const button = document.querySelector(`[data-view="${view}"]`); button?.classList.toggle("has-notice", count > 0); if (button) button.dataset.notice = count > 9 ? "9+" : String(count); });
  const activeQuest = game.getActiveQuest();
  const placement = activeQuest ? Object.values(game.scenarioRuntime?.placements ?? {}).find((candidate) => candidate.status === "walking" || candidate.status === "ready") : null;
  const objectives = activeQuest?.objectives.map((objective) => `<li class="${objective.state === "completed" ? "is-completed" : ""}">${objective.state === "completed" ? "✓" : "○"} ${objective.text}</li>`).join("") ?? "";
  const distanceProgress = placement ? `<p>${Math.round(placement.distanceMeters)} / ${placement.minimumDistanceMeters} m d'éloignement</p>` : "";
  const placementAction = pendingScenarioPlacementSlotId ? `<button type="button" id="confirm-scenario-placement">${pendingScenarioPlacementSlotId === "royal-camp" ? "Rejoindre le camp ici" : "Examiner ce lieu"}</button>` : "";
  ui.quests.innerHTML = activeQuest ? `<article class="quest-card"><small>Quête principale</small><strong>${activeQuest.title}</strong><p>${activeQuest.description}</p>${distanceProgress}<ul>${objectives}</ul>${placementAction}</article>` : '<p class="text-muted">Aucune quête active.</p>';
  ui.quests.querySelector("#confirm-scenario-placement")?.addEventListener("click", confirmScenarioPlacement);
  ui.sitesStatus.textContent = `${game.battleSites.length} champ(s) de bataille · ${game.lootSites.length} site(s) de butin · ${sites.length} visible(s)`;
  $("#grid-status").textContent = playAreaGrid ? `${playAreaGrid.cells.length} cellule(s) · ${playAreaGrid.cells.filter((cell) => cell.visits > 0).length} visitée(s) · ${playAreaGrid.cells.reduce((sum, cell) => sum + cell.visits, 0)} passage(s)` : "Aucune grille.";
  if ($("#world-view").classList.contains("is-active")) renderWorld();
}
function logTest(message) { const item = document.createElement("li"); item.textContent = `${new Date().toLocaleTimeString("fr-FR")} — ${message}`; ui.log.prepend(item); }
function updateMapFollowButton() { const states = { free: { icon: "◎", label: "Recentrer sur le joueur" }, centered: { icon: "◉", label: mode === "gps" ? "Orienter la carte selon le joueur" : "Carte centrée sur le joueur" }, bearing: { icon: "➤", label: "Revenir au nord" } }; const state = states[mapFollowMode]; ui.recenter.textContent = state.icon; ui.recenter.setAttribute("aria-label", state.label); ui.recenter.title = state.label; ui.recenter.dataset.followMode = mapFollowMode; }
function setBattleNavigationLocked(locked) { $(".bottom-nav").classList.toggle("is-locked", locked); $(".top-status").classList.toggle("is-battle-hidden", locked); document.querySelectorAll("[data-view]").forEach((button) => { button.disabled = locked; }); }
function switchView(name) { if (activeBattle?.status === "active" && name !== "battle") return false; document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === `${name}-view`)); document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === name)); if (name === "map") setTimeout(() => mapView.map.invalidateSize(), 0); else closeSheet(ui.sheet); if (name === "world") renderWorld(); return true; }

ui.create.onclick = start; ui.recenter.onclick = () => { if (mapFollowMode === "free") { mapView.setBearingEnabled(false); mapFollowMode = "centered"; } else if (mapFollowMode === "centered" && mode === "gps") { mapView.setBearingEnabled(true); mapFollowMode = "bearing"; } else { mapView.setBearingEnabled(false); mapFollowMode = "centered"; } mapView.focus(heroPosition); updateMapFollowButton(); }; $("#toggle-field-tools").onclick = () => { ui.tools.hidden = false; }; $("#close-field-tools").onclick = () => { ui.tools.hidden = true; };
$("#draw-area").onclick = () => { interactionMode = interactionMode === "draw-area" ? null : "draw-area"; logTest(interactionMode ? "Tracé actif : touchez la carte." : "Tracé suspendu."); };
$("#clear-area").onclick = () => { field.clearPlayArea(); validatedPlayArea = null; playAreaGrid = null; playAreaPresence.setPlayArea(null); lastVisitedCellId = null; persistFieldState(); $("#toggle-heatmap").disabled = true; mapView.setPlayArea([]); render(); logTest("Zone et grille effacées."); };
$("#validate-area").onclick = () => { try { validatePlayArea(); } catch (error) { logTest(error.message); } };
$("#toggle-heatmap").onclick = () => { heatmapVisible = !heatmapVisible; $("#toggle-heatmap").textContent = heatmapVisible ? "Masquer la heatmap" : "Afficher la heatmap"; render(); };
$("#place-location").onclick = () => { interactionMode = "place-location"; logTest("Touchez la carte pour poser le camp."); };
$("#gps-draw-area").onclick = () => { interactionMode = "draw-area"; ui.gpsAreaStatus.textContent = "Tracé actif : touche la carte pour poser les sommets."; };
$("#gps-clear-area").onclick = () => { field.clearPlayArea(); validatedPlayArea = null; playAreaGrid = null; playAreaPresence.setPlayArea(null); ui.finishGpsSetup.disabled = true; ui.gpsAreaStatus.textContent = "Zone non définie."; interactionMode = "draw-area"; mapView.setPlayArea([]); renderGpsLocationButtons(); render(); };
$("#gps-validate-area").onclick = () => { try { validatePlayArea(); } catch (error) { ui.gpsAreaStatus.textContent = error.message; } };
ui.finishGpsSetup.onclick = () => { if (!capitalPlaced || (mode === "gps" && !validatedPlayArea)) return; finishGameStart(); };
$("#start-distance-quest").onclick = () => { field.startDistanceQuest(asGps(heroPosition)); ui.questPlace.disabled = true; logTest("Départ de la quête 300 m enregistré."); render(); };
ui.questPlace.onclick = placeQuestLocation; $("#test-battle").onclick = openBattle; $("#search-battlefield").onclick = searchBattlefield; $("#collect-loot").onclick = collectLoot;
$("#open-cheats").onclick = openCheats; $("#apply-hero-cheats").onclick = applyHeroCheats; $("#create-cheat-location").onclick = createCheatLocation;
document.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => switchView(button.dataset.view));
document.addEventListener("visibilitychange", () => { if (!game) return; if (document.visibilityState === "hidden") { persistFieldState(); logTest("Application suspendue : le suivi GPS peut être interrompu par iOS."); } else logTest("Application de nouveau active : reprise du suivi GPS."); });

try { data = await loadData(); ui.status.textContent = "Le banc d'essai terrain est prêt."; } catch (error) { ui.status.textContent = `Chargement impossible : ${error.message}`; ui.create.disabled = true; }

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("../service-worker.js", { scope: "../" }).catch(() => {}));
