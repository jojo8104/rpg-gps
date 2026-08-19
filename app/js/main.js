import { Game } from "./core/game.js";
import { Location } from "./core/location.js";
import { LocationEngine } from "./core/location-engine.js";
import { InteractionEngine } from "./core/interaction-engine.js";
import { LocationRangePolicy } from "./core/location-range-policy.js";
import { distanceMeters } from "./core/geo.js";
import { FieldTestSession } from "./core/field-test-session.js";
import { PlayAreaGrid } from "./core/play-area-grid.js";
import { PlayAreaPresence } from "./core/play-area-presence.js";
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

const $ = (selector) => document.querySelector(selector);
const rankLabel = (ranks, id) => ranks.find((rank) => rank.id === id)?.label ?? id;
const unitHealthBar = (unit) => { const total = Math.max(1, unit.maxQuantity ?? unit.soldierHealth?.length ?? unit.quantity); const wounded = unit.woundedCount ?? 0; const combatants = unit.combatantCount ?? unit.quantity; const unavailable = Math.max(0, total - combatants - wounded); return `<div class="army-health-bar" role="img" aria-label="${combatants} combattants, ${wounded} blessés, ${unavailable} morts ou places libres"><i class="is-dead" style="flex:${unavailable}"></i><i class="is-wounded" style="flex:${wounded}"></i><i class="is-combatant" style="flex:${combatants}"></i></div>`; };
const ui = { setup: $("#setup-screen"), game: $("#game-screen"), name: $("#hero-name"), heroClass: $("#hero-class"), create: $("#create-game"), status: $("#setup-status"), mode: $("#top-mode"), health: $("#top-health"), army: $("#top-army"), gold: $("#top-gold"), worldContent: $("#world-content"), heroContent: $("#hero-content"), armyContent: $("#army-content"), inventory: $("#inventory-content"), quests: $("#quests-content"), battle: $("#battle-content"), sheet: $("#bottom-sheet"), recenter: $("#recenter-map"), tools: $("#field-tools"), gpsStatus: $("#gps-status"), questStatus: $("#distance-quest-status"), questPlace: $("#place-quest-location"), sitesStatus: $("#dynamic-sites-status"), log: $("#field-log") };
const simulationPositions = { "fort-nord": [22, 22], "village-vert": [60, 50], "bandit-camp": [78, 78], "enemy-fort": [72, 35], "gold-mine": [42, 70] };
const simulationRadii = { "fort-nord": 12, "village-vert": 10, "bandit-camp": 9, "enemy-fort": 12, "gold-mine": 8 };
const simulationDetectionRadii = { "fort-nord": 24, "village-vert": 20, "bandit-camp": 18, "enemy-fort": 24, "gold-mine": 16 };
const simulationStartPosition = [50, 30];
const descriptions = { "fort-nord": "Votre refuge frontalier.", "village-vert": "Les habitants connaissent les menaces locales.", "bandit-camp": "Une zone de combat testable.", "enemy-fort": "Un fort ennemi de niveau 3 protégé par une garnison.", "gold-mine": "Une mine contenant de l'or." };
let data, game, hero, enemyHero, mapView, gpsTracker, locationEngine, interactionEngine, rangePolicy, activeBattle, battleTimer, productionTimer;
let mode = "simulation", heroPosition, gpsAccuracy = null, firstGpsFix = true, interactionMode = null, currentLocationId = null, locationMessage = "", currentEncounter = null;
let heroHeading = 0, lastCompassAt = 0;
let worldMessage = "";
let worldSelectedLocationId = null;
let selectedHeroTrait = null;
const worldFilters = { search: "", type: "", owner: "", sort: "distance" };
let battleDragging = false, selectedBattleUnitId = null, battleMessage = "", battleResolved = false, battleResult = null, validatedPlayArea = null;
let playAreaGrid = null, heatmapVisible = true, lastVisitedCellId = null;
const field = new FieldTestSession({ minimumQuestDistanceMeters: 300 });
const savedFieldState = loadFieldState();
const gpsAccuracyLog = new GpsAccuracyLog(savedFieldState?.gpsAccuracyLog ?? {});
const playAreaPresence = new PlayAreaPresence(null, { confirmations: 2 });
const deviceAlerts = new DeviceAlerts();
const screenAwake = new ScreenAwake({ onChange: (active) => { if (game) logTest(active ? "Écran maintenu actif." : "Maintien d'écran indisponible ou suspendu."); } });
const orientationTracker = new OrientationTracker({ onHeading: ({ heading }) => { heroHeading = smoothHeading(heroHeading, heading); lastCompassAt = Date.now(); mapView?.setHeroHeading(heroHeading); }, onError: () => { if (game) logTest("Boussole indisponible."); } });
const runtimePositions = new Map();
const gpsAccuracyStatus = document.createElement("p"); gpsAccuracyStatus.id = "gps-accuracy-log"; gpsAccuracyStatus.className = "test-status"; ui.gpsStatus.after(gpsAccuracyStatus);
$("#field-tools .tool-block p").textContent = "Active le tracé puis touche la carte pour poser au moins 3 sommets. La validation crée des cellules de 15 m × 15 m.";

async function loadData() { const load = async (path) => (await fetch(path)).json(); const [scenario, heroClasses, unitDefinitions, locations] = await Promise.all([load("../data/scenarios/chaos.json"), load("../data/hero-classes.json"), load("../data/units.json"), load("../data/locations.json")]); return { scenario, heroClasses, unitDefinitions, locations }; }
function buildSetup() { const expert = $("#expert-contentment").checked; return { id: "chaos-field-test", name: "Essai terrain", mode: "quick", scenarioId: "chaos", playerCount: 2, rules: { enableContentment: expert, locationMode: expert ? "expert" : "casual" }, playArea: { id: "initial-area", name: "Zone provisoire", polygon: [{ latitude: -89, longitude: -179 }, { latitude: -89, longitude: 179 }, { latitude: 89, longitude: 0 }] }, participants: [{ playerId: "local", name: "Joueur" }, { playerId: "bandits", name: "Chef brigand" }] }; }

function start() {
  mode = document.querySelector('input[name="test-mode"]:checked').value;
  const bindings = [{ locationSlotId: "refuge", locationId: "fort-nord" }, { locationSlotId: "village", locationId: "village-vert" }, { locationSlotId: "bandit-camp", locationId: "bandit-camp" }];
  game = new Game({ setup: buildSetup(), scenario: data.scenario, heroClasses: data.heroClasses, unitDefinitions: data.unitDefinitions, locations: data.locations, scenarioLocationBindings: bindings });
  rangePolicy = new LocationRangePolicy(game.setup.locationSetup.rangePolicy);
  hero = game.chooseHero("local", { name: ui.name.value.trim() || "Aldric", classId: ui.heroClass.value });
  hero.maxHealth = 150; hero.health = 150;
  enemyHero = game.chooseHero("bandits", { name: "Rask le brigand", classId: "warrior" }); game.start(); game.getLocation("bandit-camp").addHero(enemyHero.id);
  game.getPlayer("local").discoverLocation("fort-nord", 2);
  game.getPlayer("local").discoverLocation("bandit-camp", 3);
  game.getPlayer("local").discoverLocation("enemy-fort", 3);
  heroPosition = mode === "gps" ? { latitude: 48.8566, longitude: 2.3522 } : [...simulationStartPosition];
  game.locations.forEach((location) => runtimePositions.set(location.id, mode === "gps" ? { ...location.position } : [...simulationPositions[location.id]]));
  rebuildLocationEngine();
  interactionEngine = new InteractionEngine({ locations: game.locations, enemyResolver: ({ location }) => location.features.battle ? { name: "Brigands", danger: 2, aggressive: false } : null });
  ui.setup.hidden = true; ui.game.hidden = false;
  mapView = new MapView({ element: $("#map"), mode, initialPosition: heroPosition, onHeroMove: applyPosition, onLocationSelect: selectLocation, onDynamicSiteSelect: selectDynamicSite, onMapClick: handleMapClick });
  restoreFieldTestState();
  deviceAlerts.enable().then((enabled) => logTest(enabled ? "Alertes sonores activées." : "Son d'alerte indisponible."));
  screenAwake.start();
  clearInterval(productionTimer); productionTimer = setInterval(runProductionCycle, 10_000);
  if (mode === "gps") { orientationTracker.start().then((enabled) => logTest(enabled ? "Boussole activée : le pion indique le nord." : "Boussole refusée ou indisponible : utilisation du cap GPS.")); startGps(); } else { ui.gpsStatus.textContent = "Simulation : clique sur la carte ou fais glisser le pion."; applyPosition(heroPosition); }
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
function radiusFor(location) { return rangesFor(location).interactionRadius; }
function rebuildLocationEngine() { locationEngine = new LocationEngine({ locations: game.locations.filter((location) => location.state !== "destroyed").map((location) => ({ id: location.id, position: positionFor(location.id), interactionRadius: radiusFor(location) })), cooldownMs: 2_000, exitMarginMeters: mode === "gps" ? 10 : 1, distanceFn: distance, validatePositionFn: () => {} }); }

function mappedLocations({ knownOnly = true } = {}) {
  const player = game.getPlayer("local");
  return game.locations.filter((location) => location.state !== "destroyed" && (!knownOnly || player.knowsLocation(location.id))).map((location) => {
    const position = positionFor(location.id); const d = distance(heroPosition, position); const ranges = rangesFor(location); const nearby = d <= ranges.interactionRadius;
    const relation = game.getLocationRelation(player.id, location.id); const can = (action) => game.canPerformLocationAction({ playerId: player.id, locationId: location.id, action }); const actions = [];
    if (can("recruit")) location.recruitment.availableUnitTypeIds.forEach((type) => { const definition = game.unitDefinitions.get(type); actions.push({ id: `recruit:${type}`, label: `Recruter ${definition?.name ?? type}`, details: { name: definition?.name ?? type, available: location.recruitment.stock[type] ?? 0, stats: definition ? { ...definition.stats } : {}, costs: definition ? { ...definition.costs } : {} } }); });
    if (can("collect")) { const stock = Object.entries(location.resources.stock).map(([id, amount]) => `${Math.floor(amount)} ${id}`).join(", ") || "vide"; actions.push({ id: "collect", label: `Récupérer (${stock})` }); }
    if (can("attack")) actions.push({ id: "battle", label: relation === "neutral" ? "Prendre le contrôle" : "Attaquer" });
    if (can("deposit")) { Object.entries(hero.resources).filter(([, amount]) => amount > 0).forEach(([id, amount]) => actions.push({ id: `deposit-resource:${id}`, label: `Déposer ${Math.floor(amount)} ${id}`, details: { resourceName: id, available: amount } })); hero.carriedLoot.forEach((item) => actions.push({ id: `deposit-item:${item.id}`, label: `Déposer ${item.quantity} ${item.itemId}`, details: { itemName: item.itemId, quantity: item.quantity } })); }
    return { id: location.id, name: location.name, type: location.type, position, radius: ranges.interactionRadius, interactionRadius: ranges.interactionRadius, detectionRadius: ranges.detectionRadius, distance: d, nearby, relation, state: "DISCOVERED", description: descriptions[location.id] ?? "Lieu créé pendant le test terrain.", actions };
  });
}

function runProductionCycle() { const results = game.produceLocationResources(1); if (results.length === 0) return; const mine = results.find((result) => result.locationId === "gold-mine"); if (mine) logTest(`La mine produit ${mine.produced.gold ?? 0} or.`); render(); if (currentLocationId && !ui.sheet.hidden && results.some((result) => result.locationId === currentLocationId)) selectLocation(currentLocationId); }
function applyPosition(position) {
  heroPosition = normalizePosition(position, mode); gpsAccuracy = mode === "gps" ? position.accuracy ?? null : null; hero.updatePosition(asGps(heroPosition));
  const playAreaEvent = playAreaPresence.update(asGps(heroPosition));
  if (playAreaEvent?.type === "PlayAreaExited") { lastVisitedCellId = null; deviceAlerts.notify("danger"); logTest("⚠ Sortie de la zone de jeu."); }
  if (playAreaEvent?.type === "PlayAreaEntered") { deviceAlerts.notify("notice"); logTest("Retour dans la zone de jeu."); }
  const quest = field.updatePosition(asGps(heroPosition)); if (quest) { ui.questStatus.textContent = `${Math.round(quest.distanceMeters)} / 300 m ${quest.completed ? "· objectif atteint" : ""}`; ui.questPlace.disabled = !quest.completed; }
  if (playAreaGrid) { const cell = playAreaGrid.getCellAt(asGps(heroPosition)); if (!cell) lastVisitedCellId = null; else if (cell.id !== lastVisitedCellId) { const passage = playAreaGrid.recordVisit(asGps(heroPosition)); lastVisitedCellId = cell.id; persistFieldState(); logTest(`Passage ${passage.visits} dans ${cell.id}.`); } }
  updatePresence(); locationEngine.update({ actorId: hero.id, position: heroPosition }).forEach(handleLocationEvent);
  if (activeBattle?.status === "active" && activeBattle.engagementContext) game.updateBattleHeroPosition({ battleId: activeBattle.id, heroId: hero.id, position: asGps(heroPosition) });
  render();
}
function updatePresence() { if (!game) return; const player = game.getPlayer("local"); mappedLocations({ knownOnly: false }).forEach((item) => { const location = game.getLocation(item.id); if (item.distance <= item.detectionRadius) player.discoverLocation(item.id, item.nearby ? 3 : 1); if (item.nearby) location.addHero(hero.id); else location.removeHero(hero.id); }); }
function handleLocationEvent(event) { const interaction = interactionEngine.handle(event); if (!interaction) return; if (event.type === "LocationExited") { if (currentLocationId === event.locationId) { currentLocationId = null; locationMessage = ""; if (currentEncounter?.locationId === event.locationId) currentEncounter = null; closeSheet(ui.sheet); } return; } currentLocationId = event.locationId; const capture = game.attemptLocationCapture({ playerId: "local", heroId: hero.id, locationId: event.locationId }); if (capture.success) { locationMessage = "Lieu capturé sans combat."; deviceAlerts.notify("notice"); logTest(`${game.getLocation(event.locationId).name} passe sous votre contrôle.`); } else if (capture.reason === "quest_required") locationMessage = `Capture protégée par la quête ${capture.objectiveId}.`; if (interaction.type === "encounter") { currentEncounter = interaction.encounter; interaction.autoBattle ? openBattle({ ambushTeamId: "bandits" }) : renderEncounter(); } else selectLocation(event.locationId); }

function handleMapClick(position) {
  const point = mode === "gps" ? position : [position.latitude, position.longitude];
  if (interactionMode === "draw-area") { field.addPlayAreaPoint(asGps(point)); logTest(`Sommet ${field.playAreaPoints.length} ajouté.`); render(); return; }
  if (interactionMode === "place-location") { moveLocation("bandit-camp", point); interactionMode = null; logTest("Camp placé manuellement sans QR code."); return; }
  if (mode === "simulation") applyPosition(point);
}
function moveLocation(id, position) { runtimePositions.set(id, Array.isArray(position) ? [...position] : { ...position }); const location = game.getLocation(id); location.position = asGps(position); if (id === "bandit-camp") enemyHero.updatePosition(asGps(position)); rebuildLocationEngine(); render(); mapView.focus(position); }
function placeQuestLocation() {
  const gps = asGps(heroPosition); if (!field.canPlaceQuestLocation(gps)) return;
  let location = game.getLocation("quest-beacon-300m");
  if (!location) { location = new Location({ id: "quest-beacon-300m", name: "Balise des 300 mètres", type: "quest", roles: ["quest"], source: "quest", position: gps, interactionRadius: 40, visibility: "discovered", features: {}, qr: { enabled: false } }); game.locations.push(location); }
  runtimePositions.set(location.id, mode === "gps" ? gps : [...heroPosition]); rebuildLocationEngine(); logTest(`Lieu de quête posé à ${Math.round(field.questDistanceMeters)} m du départ.`); render();
}

function renderEncounter() { ui.sheet.hidden = false; ui.sheet.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Rencontre</span><h2>Ennemi détecté</h2><p>${currentEncounter.enemy.name}</p><div class="sheet-actions"><button data-encounter="fight">Combattre</button><button class="secondary-button" data-encounter="avoid">Éviter</button></div>`; ui.sheet.querySelector(".sheet-close").onclick = () => closeSheet(ui.sheet); ui.sheet.querySelectorAll("[data-encounter]").forEach((button) => button.onclick = () => { currentEncounter.choose(button.dataset.encounter); button.dataset.encounter === "fight" ? openBattle() : closeSheet(ui.sheet); }); }
function selectLocation(id) { const location = mappedLocations().find((item) => item.id === id); if (!location) return; currentLocationId = id; renderLocationSheet({ element: ui.sheet, location, message: locationMessage, onClose: () => { currentLocationId = null; closeSheet(ui.sheet); }, onAction: runAction, onOpenWorld: () => openLocationDetail(id) }); }
function selectDynamicSite(id) {
  const site = game.battleSites.find((item) => item.id === id); if (!site || site.status !== "FINISHED") return;
  ui.sheet.hidden = false; ui.sheet.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Champ de bataille</span><h2>Traces du combat</h2><p>Ce site disparaîtra bientôt.</p><div class="sheet-actions"><button data-site-search="loot">Chercher du butin</button><button data-site-search="information">Chercher des informations</button><button data-site-search="survivors">Chercher des survivants</button></div>`;
  ui.sheet.querySelector(".sheet-close").onclick = () => closeSheet(ui.sheet);
  ui.sheet.querySelectorAll("[data-site-search]").forEach((button) => button.onclick = () => { searchBattlefield(button.dataset.siteSearch, site.id); closeSheet(ui.sheet); });
}
function runAction(action, { returnToWorld = false } = {}) { const location = game.getLocation(currentLocationId); if (action.startsWith("recruit:")) { const result = game.recruitUnit({ playerId: "local", heroId: hero.id, locationId: location.id, unitTypeId: action.split(":")[1] }); locationMessage = result.success ? "Unité recrutée." : `Impossible : ${result.reason}.`; } else if (action === "collect") { const result = game.collectLocationResources({ playerId: "local", heroId: hero.id, locationId: location.id }); locationMessage = result.success ? "Ressources récupérées." : "Collecte impossible."; } else if (action.startsWith("deposit-resource:")) { const [resourceName, requestedAmount] = action.slice("deposit-resource:".length).split(":"); const amount = requestedAmount === undefined ? undefined : Number(requestedAmount); const result = game.depositLocationResource({ playerId: "local", heroId: hero.id, locationId: location.id, resourceName, amount }); locationMessage = result.success ? `${result.deposited} ${resourceName} déposé.` : `Dépôt impossible : ${result.reason}.`; } else if (action.startsWith("deposit-item:")) { const result = game.depositLocationItem({ playerId: "local", heroId: hero.id, locationId: location.id, lootId: action.slice("deposit-item:".length) }); locationMessage = result.success ? `${result.item.quantity} ${result.item.itemId} déposé.` : `Dépôt impossible : ${result.reason}.`; } else if (action === "battle") openBattle(); render(); if (action !== "battle") { if (returnToWorld) { worldMessage = locationMessage; renderWorld(); } else selectLocation(currentLocationId); } }

function openBattle({ ambushTeamId = null } = {}) {
  if (activeBattle && activeBattle.status !== "finished") return; closeSheet(ui.sheet); enemyHero.updatePosition(asGps(heroPosition));
  const sourceLocationId = currentEncounter?.locationId ?? currentLocationId;
  if (ambushTeamId === null && sourceLocationId && !game.canPerformLocationAction({ playerId: "local", locationId: sourceLocationId, action: "attack" })) { locationMessage = "Attaque interdite par la relation avec ce lieu."; return selectLocation(sourceLocationId); }
  const battleLocationId = currentEncounter?.locationId ?? currentLocationId ?? "bandit-camp"; const battleLocation = game.getLocation(battleLocationId); const defenderHeroIds = battleLocation?.heroIds.filter((id) => game.getHero(id)?.playerId !== hero.playerId) ?? [enemyHero.id];
  activeBattle = game.createBattle({ teamParticipants: [{ id: "heroes", heroIds: [hero.id] }, { id: "bandits", heroIds: defenderHeroIds, locationId: battleLocationId }], position: asGps(heroPosition), sourceLocationId: battleLocationId, sourceEnemyTeamId: "bandits", config: { ambushTeamId, ambushDefenderRevealDelayMs: 1_500 }, loot: [{ id: "bandit-gold", itemId: "gold", quantity: 12, portable: true, weightPerUnit: .1, valuePerUnit: 1 }, { id: "bandit-barricade", itemId: "barricade", quantity: 1, portable: false, weightPerUnit: 80, valuePerUnit: 25 }] });
  activeBattle.teams[0].units.forEach((unit) => { unit.lane = null; unit.progress = 0; }); activeBattle.teams[1].units.forEach((unit, index) => { unit.lane = index % 3; unit.progress = 0; }); battleResolved = false; battleResult = null; battleMessage = ambushTeamId ? "Embuscade ! Réagissez immédiatement." : "Placez vos unités avant le début."; setBattleNavigationLocked(true);
  const revealBattle = () => { closeSheet(ui.sheet); switchView("battle"); renderBattle(); };
  const revealDelay = ambushTeamId !== null && ambushTeamId !== "heroes" ? activeBattle.config.ambushDefenderRevealDelayMs : 0;
  if (revealDelay > 0) { ui.sheet.hidden = false; ui.sheet.innerHTML = `<span class="sheet-state">Alerte</span><h2>Vous êtes attaqué !</h2><p>Le combat a déjà commencé.</p>`; setTimeout(revealBattle, revealDelay); } else revealBattle();
  logTest(`${ambushTeamId ? "Embuscade" : "Combat"} déclenché à la position du joueur.`);
  clearInterval(battleTimer); battleTimer = setInterval(() => { activeBattle.tick(500); resolveFinishedBattle(); if (!battleDragging) renderBattle(); render(); if (activeBattle.status === "finished") clearInterval(battleTimer); }, 500);
}
function renderBattle() { if (battleResult) { renderBattleResultView({ element: ui.battle, battle: activeBattle, result: battleResult, playerId: "local", playerTeamId: "heroes", onReturnToMap: () => { switchView("map"); render(); } }); return; } renderBattleView({ element: ui.battle, battle: activeBattle, playerTeamId: "heroes", message: battleMessage, selectedUnitId: selectedBattleUnitId, onSelectUnit: (id) => { selectedBattleUnitId = id; renderBattle(); }, onDragState: (active) => { battleDragging = active; }, onAssign: (unitId, lane) => { const heroId = activeBattle.teams[0].heroes.find((item) => item.state === "active")?.id; const result = heroId ? activeBattle.assignUnit(unitId, heroId, lane) : { success: false }; selectedBattleUnitId = null; battleMessage = result.success ? `Unité sur la ligne ${lane + 1}.` : "Placement impossible."; renderBattle(); }, onRetreatLine: (lane) => { const result = activeBattle.orderRetreat("heroes", lane); battleMessage = result.success ? `Retraite ordonnée ligne ${lane + 1} · commandement dépensé.` : result.reason === "insufficient_command_points" ? "Commandement insuffisant pour ordonner la retraite." : `Aucune unité disponible ligne ${lane + 1}.`; renderBattle(); }, onActivatePower: ({ userId, powerId, cost }) => { const result = activeBattle.activateSpecialPower({ teamId: "heroes", userId, powerId, cost }); battleMessage = result.success ? `${powerId} activé · ${result.remainingCommandPoints} point(s) restant(s).` : result.reason === "insufficient_command_points" ? "Commandement insuffisant pour ce pouvoir." : "Pouvoir indisponible."; renderBattle(); }, onSurrender: () => { game.surrenderBattle({ battleId: activeBattle.id, teamId: "heroes" }); resolveFinishedBattle(); renderBattle(); render(); } }); }
function resolveFinishedBattle() { if (activeBattle.status !== "finished" || battleResolved) return; const result = game.resolveBattle(activeBattle.id); battleResolved = true; battleResult = result; setBattleNavigationLocked(false); if (result.destroyedLocationId) { rebuildLocationEngine(); interactionEngine = new InteractionEngine({ locations: game.locations.filter((location) => location.state !== "destroyed"), enemyResolver: ({ location }) => location.features.battle ? { name: "Brigands", danger: 2, aggressive: false } : null }); currentEncounter = null; currentLocationId = null; } if (result.capturedLocationId) { currentEncounter = null; locationMessage = "Lieu capturé après la victoire."; } battleMessage = `Bataille terminée · vainqueur ${activeBattle.winnerTeamId ?? "aucun"}.`; logTest(`Champ de bataille créé${result.lootSite ? " et butin calculé" : ", sans butin"}${result.destroyedLocationId ? " · camp ennemi détruit" : ""}${result.capturedLocationId ? " · lieu capturé" : ""}.`); }

function searchBattlefield(searchType = "loot", battleSiteId = null) { const site = battleSiteId ? game.battleSites.find((item) => item.id === battleSiteId) : game.battleSites.at(-1); if (!site) return logTest("Aucun champ de bataille à chercher."); const result = game.searchBattlefield({ battleSiteId: site.id, playerId: "local", heroId: hero.id, position: asGps(heroPosition), searchType }); const detail = searchType === "loot" ? `${result.discoveredLootSiteIds?.length ?? 0} butin(s) découvert(s)` : searchType === "information" ? `vainqueur : ${result.information?.winnerTeamId ?? "inconnu"}` : `${result.survivors?.length ?? 0} survivant(s)`; logTest(result.success ? `Recherche réussie · ${detail}.` : `Recherche impossible : ${result.reason}.`); render(); }
function collectLoot() { const site = game.lootSites.find((item) => item.isKnownBy("local")); if (!site) return logTest("Aucun butin découvert."); const result = game.collectLoot({ lootSiteId: site.id, playerId: "local", heroId: hero.id, position: asGps(heroPosition) }); logTest(result.success ? `Butin collecté : ${result.collected.map((item) => `${item.quantity} ${item.itemId}`).join(", ") || "rien"}.` : `Collecte impossible : ${result.reason}.`); render(); }

function visibleSites() { if (!game || !heroPosition) return []; return game.getVisibleDynamicSites({ playerId: "local", position: asGps(heroPosition) }); }
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
function directoryLocations() { const player = game.getPlayer("local"); return mappedLocations().map((snapshot) => { const location = game.getLocation(snapshot.id); const ownerPlayer = location.ownerId ? game.getPlayer(location.ownerId) : null; const owner = location.ownerId ? { id: location.ownerId, name: ownerPlayer?.name ?? location.ownerId, color: location.ownerId === "local" ? "#62a8ff" : location.ownerId === "bandits" ? "#d86868" : "#d8b862" } : null; const heroes = location.heroIds.map((id) => game.getHero(id)).filter((item) => item && item.playerId !== player.id).map((item) => ({ ...item, className: data.heroClasses.find((heroClass) => heroClass.id === item.classId)?.name ?? item.classId })); return buildLocationIntel({ location, snapshot, knowledgeLevel: player.getLocationKnowledge(location.id), owner, heroes, description: descriptions[location.id] ?? "Un lieu dont l'histoire reste à découvrir." }); }); }
function filteredDirectoryLocations() { const search = worldFilters.search.trim().toLocaleLowerCase("fr"); const locations = directoryLocations().filter((location) => (!search || location.name.toLocaleLowerCase("fr").includes(search)) && (!worldFilters.type || location.nature === worldFilters.type) && (!worldFilters.owner || (worldFilters.owner === "known" ? location.owner.id : !location.owner.id))); const compare = worldFilters.sort === "name" ? (a, b) => a.name.localeCompare(b.name, "fr") : worldFilters.sort === "type" ? (a, b) => a.nature.localeCompare(b.nature, "fr") : worldFilters.sort === "owner" ? (a, b) => a.owner.name.localeCompare(b.owner.name, "fr") : (a, b) => a.distance - b.distance; return locations.sort(compare); }
function openLocationDetail(id) { worldSelectedLocationId = id; worldMessage = ""; closeSheet(ui.sheet); switchView("world"); }
function showLocationOnMap(id) { const location = directoryLocations().find((item) => item.id === id); if (!location) return; switchView("map"); mapView.focus(location.position); }
function renderWorld() {
  if (!game || !ui.worldContent) return;
  const locations = filteredDirectoryLocations();
  if (!worldSelectedLocationId) return renderWorldDirectory({ element: ui.worldContent, locations, types: [...new Set(directoryLocations().map((location) => location.nature))].sort(), filters: worldFilters, onFilter: (key, value) => { worldFilters[key] = value; renderWorld(); if (key === "search") { const input = ui.worldContent.querySelector('[data-filter="search"]'); input?.focus(); input?.setSelectionRange(value.length, value.length); } }, onOpen: openLocationDetail, onShowMap: showLocationOnMap });
  const allLocations = directoryLocations().sort((a, b) => a.name.localeCompare(b.name, "fr")); const index = Math.max(0, allLocations.findIndex((item) => item.id === worldSelectedLocationId)); const location = allLocations[index]; if (!location) { worldSelectedLocationId = null; return renderWorld(); }
  renderLocationDetail({ element: ui.worldContent, location, index, total: allLocations.length, message: worldMessage, onBack: () => { worldSelectedLocationId = null; worldMessage = ""; renderWorld(); }, onPrevious: () => { if (index > 0) { worldSelectedLocationId = allLocations[index - 1].id; worldMessage = ""; renderWorld(); } }, onNext: () => { if (index < allLocations.length - 1) { worldSelectedLocationId = allLocations[index + 1].id; worldMessage = ""; renderWorld(); } }, onShowMap: () => showLocationOnMap(location.id), onAction: (action) => { currentLocationId = location.id; runAction(action, { returnToWorld: true }); } });
}
function render() {
  if (!game || !mapView) return; const sites = visibleSites(); mapView.render({ heroPosition, heroHeading, accuracy: gpsAccuracy, locations: mappedLocations(), playAreaPoints: field.playAreaPoints, dynamicSites: sites, gridCells: playAreaGrid?.cells ?? [], heatmapVisible });
  const player = game.getPlayer("local"); ui.mode.textContent = mode === "gps" ? "GPS réel" : "Maison"; ui.health.textContent = `PV ${hero.health}/${hero.maxHealth}`; ui.army.textContent = `Armée ${hero.army.units.length}`; ui.gold.textContent = `Or ${hero.getResourceAmount("gold")}`;
  const heroClass = data.heroClasses.find((item) => item.id === hero.classId);
  const heroModifiers = HeroArmyModifier.calculate({ hero, units: hero.army.units, unitDefinitions: game.unitDefinitions, moraleMode: game.setup.rules.moraleMode });
  const carriedWeight = heroModifiers.details.speed.carriedWeight;
  const signed = (value) => `${value >= 0 ? "+" : ""}${Number(value.toFixed(2))}`;
  const healthPercent = Math.max(0, Math.min(100, hero.health / hero.maxHealth * 100));
  const levelExperienceStart = (hero.level - 1) * 100;
  const levelExperience = Math.max(0, hero.experience - levelExperienceStart);
  const experiencePercent = Math.max(0, Math.min(100, levelExperience));
  const traitButton = (id, type) => `<button type="button" class="trait-chip ${selectedHeroTrait?.id === id && selectedHeroTrait.type === type ? "is-selected" : ""}" data-trait-id="${id}" data-trait-type="${type}"><span class="trait-icon" aria-hidden="true">${type === "skill" ? "✦" : "◆"}</span><span>${id.replaceAll("_", " ").replaceAll("-", " ")}</span></button>`;
  const traitDetail = selectedHeroTrait ? `<aside class="trait-detail"><span class="trait-icon" aria-hidden="true">${selectedHeroTrait.type === "skill" ? "✦" : "◆"}</span><div><strong>${selectedHeroTrait.id.replaceAll("_", " ").replaceAll("-", " ")}</strong><small>${selectedHeroTrait.type === "skill" ? "Compétence passive" : "Pouvoir spécial"}</small><p>${selectedHeroTrait.type === "skill" ? "Bonus permanent appliqué automatiquement, sans dépense de commandement." : "Action utilisable en combat contre une dépense de points de commandement."}</p><code>${selectedHeroTrait.id}</code></div></aside>` : "";
  ui.heroContent.innerHTML = `<article class="hero-card compact-hero-card"><header><div><h3>${hero.name}</h3><span class="eyebrow">${heroClass?.name ?? hero.classId} · ${rankLabel(HERO_COMMAND_RANKS, hero.commandRank)}</span></div><span class="hero-state">${hero.state}</span></header><section class="hero-bars"><div class="hero-bar-label"><strong>Points de vie</strong><span>${hero.health}/${hero.maxHealth}</span></div><div class="hero-progress health-progress" role="progressbar" aria-label="Points de vie" aria-valuemin="0" aria-valuemax="${hero.maxHealth}" aria-valuenow="${hero.health}"><span style="width:${healthPercent}%"></span></div><div class="hero-bar-label"><strong>Niveau ${hero.level}</strong><span>${levelExperience}/100 XP</span></div><div class="hero-progress experience-progress" role="progressbar" aria-label="Expérience du niveau ${hero.level}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${levelExperience}"><span style="width:${experiencePercent}%"></span></div></section><div class="compact-hero-stats"><div><strong>${signed(heroModifiers.attackBonus)}</strong><span>Attaque</span></div><div><strong>${signed(heroModifiers.defenseBonus)}</strong><span>Défense</span></div><div><strong>${signed(heroModifiers.moraleBonus)}</strong><span>Moral</span></div><div><strong>×${heroModifiers.speedMultiplier.toFixed(2)}</strong><span>Mobilité</span></div><div><strong>◆ ${hero.commandPoints}/${hero.maxCommandPoints}</strong><span>Commandement</span></div><div><strong>${hero.army.units.length}/${hero.maxUnitStacks}</strong><span>Unités</span></div><div><strong>${carriedWeight.toFixed(1)}/${hero.carryCapacity}</strong><span>Charge</span></div></div><section class="trait-section"><h4>Compétences passives</h4><div class="trait-list">${hero.skillIds.map((id) => traitButton(id, "skill")).join("") || '<span class="text-muted">Aucune</span>'}</div></section><section class="trait-section"><h4>Pouvoirs spéciaux</h4><div class="trait-list">${hero.specialPowerIds.map((id) => traitButton(id, "power")).join("") || '<span class="text-muted">Aucun</span>'}</div></section>${traitDetail}<div class="hero-equipment"><strong>Équipement</strong><span>${Object.values(hero.equipment).join(", ") || "aucun"}</span></div></article>`;
  ui.heroContent.querySelectorAll("[data-trait-id]").forEach((button) => button.addEventListener("click", () => { const next = { id: button.dataset.traitId, type: button.dataset.traitType }; selectedHeroTrait = selectedHeroTrait?.id === next.id && selectedHeroTrait.type === next.type ? null : next; render(); }));
  ui.heroContent.onclick = (event) => { if (selectedHeroTrait && !event.target.closest("[data-trait-id]")) { selectedHeroTrait = null; render(); } };
  ui.armyContent.innerHTML = `<div class="army-list">${hero.army.units.map((unit) => { const definition = game.unitDefinitions.get(unit.typeId); const unitName = unit.name ?? definition?.name ?? unit.typeId; const illustration = definition?.tags?.includes("cavalry") ? "♞" : definition?.tags?.includes("ranged") ? "➶" : "⚔"; const stats = definition?.stats; return `<article class="army-card"><div class="army-illustration" aria-hidden="true">${illustration}</div><div class="army-card__content"><p class="eyebrow">${rankLabel(UNIT_RANKS, unit.rank)} · niveau ${unit.level}</p><h3>${unitName}</h3>${unitHealthBar(unit)}<div class="army-card__meta"><strong>${unit.combatantCount} aptes · ${unit.woundedCount} blessés</strong><span>${unit.experience} XP</span>${stats ? `<span>ATQ ${stats.attack} · DÉF ${stats.defense} · VIT ${stats.speed}</span>` : ""}</div></div></article>`; }).join("") || '<p class="text-muted">Aucune unité.</p>'}</div>`; ui.inventory.innerHTML = `<article class="unit-row"><strong>Ressources</strong><span>${Object.entries(hero.resources).map(([key, value]) => `${key}: ${value}`).join(" · ")}</span></article><article class="unit-row"><strong>Butin transporté</strong><span>${hero.carriedLoot.map((item) => `${item.quantity} ${item.itemId}`).join(" · ") || "Aucun"}</span></article>`;
  ui.quests.innerHTML = `<article class="quest-card"><strong>Marche des 300 mètres</strong><span>${field.questStart ? `${Math.round(field.questDistanceMeters)} / 300 m` : "Non démarrée"}</span></article>`; ui.sitesStatus.textContent = `${game.battleSites.length} champ(s) de bataille · ${game.lootSites.length} site(s) de butin · ${sites.length} visible(s)`;
  $("#grid-status").textContent = playAreaGrid ? `${playAreaGrid.cells.length} cellule(s) · ${playAreaGrid.cells.filter((cell) => cell.visits > 0).length} visitée(s) · ${playAreaGrid.cells.reduce((sum, cell) => sum + cell.visits, 0)} passage(s)` : "Aucune grille.";
  if ($("#world-view").classList.contains("is-active")) renderWorld();
}
function logTest(message) { const item = document.createElement("li"); item.textContent = `${new Date().toLocaleTimeString("fr-FR")} — ${message}`; ui.log.prepend(item); }
function setBattleNavigationLocked(locked) { $(".bottom-nav").classList.toggle("is-locked", locked); $(".top-status").classList.toggle("is-battle-hidden", locked); document.querySelectorAll("[data-view]").forEach((button) => { button.disabled = locked; }); }
function switchView(name) { if (activeBattle?.status === "active" && name !== "battle") return false; document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === `${name}-view`)); document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === name)); if (name === "map") setTimeout(() => mapView.map.invalidateSize(), 0); else closeSheet(ui.sheet); if (name === "world") renderWorld(); return true; }

ui.create.onclick = start; ui.recenter.onclick = () => mapView.focus(heroPosition); $("#toggle-field-tools").onclick = () => { ui.tools.hidden = false; }; $("#close-field-tools").onclick = () => { ui.tools.hidden = true; };
$("#draw-area").onclick = () => { interactionMode = interactionMode === "draw-area" ? null : "draw-area"; logTest(interactionMode ? "Tracé actif : touchez la carte." : "Tracé suspendu."); };
$("#clear-area").onclick = () => { field.clearPlayArea(); validatedPlayArea = null; playAreaGrid = null; playAreaPresence.setPlayArea(null); lastVisitedCellId = null; persistFieldState(); $("#toggle-heatmap").disabled = true; mapView.setPlayArea([]); render(); logTest("Zone et grille effacées."); };
$("#validate-area").onclick = () => { try { validatedPlayArea = field.createPlayArea(); game.setup.playArea = validatedPlayArea; playAreaGrid = new PlayAreaGrid({ playArea: validatedPlayArea, cellSizeMeters: mode === "gps" ? 15 : 15_000 }); playAreaPresence.setPlayArea(validatedPlayArea, asGps(heroPosition)); rebuildLocationEngine(); interactionMode = null; lastVisitedCellId = null; persistFieldState(); $("#toggle-heatmap").disabled = false; mapView.setPlayArea(validatedPlayArea.polygon); logTest(`Zone validée · ${(validatedPlayArea.getAreaSquareMeters() / 10_000).toFixed(1)} ha · ${playAreaGrid.cells.length} cellules de 15 m × 15 m.`); applyPosition(heroPosition); } catch (error) { logTest(error.message); } };
$("#toggle-heatmap").onclick = () => { heatmapVisible = !heatmapVisible; $("#toggle-heatmap").textContent = heatmapVisible ? "Masquer la heatmap" : "Afficher la heatmap"; render(); };
$("#place-location").onclick = () => { interactionMode = "place-location"; logTest("Touchez la carte pour poser le camp."); };
$("#start-distance-quest").onclick = () => { field.startDistanceQuest(asGps(heroPosition)); ui.questPlace.disabled = true; logTest("Départ de la quête 300 m enregistré."); render(); };
ui.questPlace.onclick = placeQuestLocation; $("#test-battle").onclick = openBattle; $("#search-battlefield").onclick = searchBattlefield; $("#collect-loot").onclick = collectLoot;
document.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => switchView(button.dataset.view));
document.addEventListener("visibilitychange", () => { if (!game) return; if (document.visibilityState === "hidden") { persistFieldState(); logTest("Application suspendue : le suivi GPS peut être interrompu par iOS."); } else logTest("Application de nouveau active : reprise du suivi GPS."); });

try { data = await loadData(); ui.heroClass.innerHTML = data.heroClasses.filter((item) => item.id !== "mage").map((item) => `<option value="${item.id}">${item.name}</option>`).join(""); ui.status.textContent = "Le banc d'essai terrain est prêt."; } catch (error) { ui.status.textContent = `Chargement impossible : ${error.message}`; ui.create.disabled = true; }

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("../service-worker.js", { scope: "../" }).catch(() => {}));
