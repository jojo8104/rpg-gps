import { Game } from "./core/game.js";
import { Location } from "./core/location.js";
import { LocationEngine } from "./core/location-engine.js";
import { InteractionEngine } from "./core/interaction-engine.js";
import { LocationRangePolicy } from "./core/location-range-policy.js";
import { distanceMeters } from "./core/geo.js";
import { FieldTestSession } from "./core/field-test-session.js";
import { PlayAreaGrid } from "./core/play-area-grid.js";
import { GpsTracker } from "./gps.js";
import { normalizePosition } from "./position-adapter.js";
import { HERO_COMMAND_RANKS, UNIT_RANKS } from "./core/rank-system.js";
import { MapView } from "./ui/map-view.js";
import { closeSheet, renderLocationSheet } from "./ui/bottom-sheet.js";
import { renderBattleView } from "./ui/battle-view.js";

const $ = (selector) => document.querySelector(selector);
const rankLabel = (ranks, id) => ranks.find((rank) => rank.id === id)?.label ?? id;
const ui = { setup: $("#setup-screen"), game: $("#game-screen"), name: $("#hero-name"), heroClass: $("#hero-class"), create: $("#create-game"), status: $("#setup-status"), mode: $("#top-mode"), health: $("#top-health"), army: $("#top-army"), gold: $("#top-gold"), heroContent: $("#hero-content"), armyContent: $("#army-content"), inventory: $("#inventory-content"), quests: $("#quests-content"), battle: $("#battle-content"), sheet: $("#bottom-sheet"), recenter: $("#recenter-map"), tools: $("#field-tools"), gpsStatus: $("#gps-status"), questStatus: $("#distance-quest-status"), questPlace: $("#place-quest-location"), sitesStatus: $("#dynamic-sites-status"), log: $("#field-log") };
const simulationPositions = { "fort-nord": [22, 22], "village-vert": [60, 50], "bandit-camp": [78, 78], "gold-mine": [42, 70] };
const simulationRadii = { "fort-nord": 12, "village-vert": 10, "bandit-camp": 9, "gold-mine": 8 };
const simulationDetectionRadii = { "fort-nord": 24, "village-vert": 20, "bandit-camp": 18, "gold-mine": 16 };
const simulationStartPosition = [50, 30];
const descriptions = { "fort-nord": "Votre refuge frontalier.", "village-vert": "Les habitants connaissent les menaces locales.", "bandit-camp": "Une zone de combat testable.", "gold-mine": "Une mine contenant de l'or." };
let data, game, hero, enemyHero, mapView, gpsTracker, locationEngine, interactionEngine, rangePolicy, activeBattle, battleTimer, productionTimer;
let mode = "simulation", heroPosition, gpsAccuracy = null, firstGpsFix = true, interactionMode = null, currentLocationId = null, locationMessage = "", currentEncounter = null;
let battleDragging = false, selectedBattleUnitId = null, battleMessage = "", battleResolved = false, validatedPlayArea = null;
let playAreaGrid = null, heatmapVisible = true, lastVisitedCellId = null;
const field = new FieldTestSession({ minimumQuestDistanceMeters: 300 });
const runtimePositions = new Map();
$("#field-tools .tool-block p").textContent = "Active le tracé puis touche la carte pour poser au moins 3 sommets. La validation crée des cellules de 15 m × 15 m.";

async function loadData() { const load = async (path) => (await fetch(path)).json(); const [scenario, heroClasses, unitDefinitions, locations] = await Promise.all([load("../data/scenarios/chaos.json"), load("../data/hero-classes.json"), load("../data/units.json"), load("../data/locations.json")]); return { scenario, heroClasses, unitDefinitions, locations }; }
function buildSetup() { return { id: "chaos-field-test", name: "Essai terrain", mode: "quick", scenarioId: "chaos", playerCount: 2, playArea: { id: "initial-area", name: "Zone provisoire", polygon: [{ latitude: -89, longitude: -179 }, { latitude: -89, longitude: 179 }, { latitude: 89, longitude: 0 }] }, participants: [{ playerId: "local", name: "Joueur" }, { playerId: "bandits", name: "Chef brigand" }] }; }

function start() {
  mode = document.querySelector('input[name="test-mode"]:checked').value;
  const bindings = [{ locationSlotId: "refuge", locationId: "fort-nord" }, { locationSlotId: "village", locationId: "village-vert" }, { locationSlotId: "bandit-camp", locationId: "bandit-camp" }];
  game = new Game({ setup: buildSetup(), scenario: data.scenario, heroClasses: data.heroClasses, unitDefinitions: data.unitDefinitions, locations: data.locations, scenarioLocationBindings: bindings });
  rangePolicy = new LocationRangePolicy(game.setup.locationSetup.rangePolicy);
  hero = game.chooseHero("local", { name: ui.name.value.trim() || "Aldric", classId: ui.heroClass.value });
  enemyHero = game.chooseHero("bandits", { name: "Rask le brigand", classId: "warrior" }); game.start();
  game.getPlayer("local").discoverLocation("fort-nord");
  heroPosition = mode === "gps" ? { latitude: 48.8566, longitude: 2.3522 } : [...simulationStartPosition];
  game.locations.forEach((location) => runtimePositions.set(location.id, mode === "gps" ? { ...location.position } : [...simulationPositions[location.id]]));
  rebuildLocationEngine();
  interactionEngine = new InteractionEngine({ locations: game.locations, enemyResolver: ({ location }) => location.features.battle ? { name: "Brigands", danger: 2, aggressive: false } : null });
  ui.setup.hidden = true; ui.game.hidden = false;
  mapView = new MapView({ element: $("#map"), mode, initialPosition: heroPosition, onHeroMove: applyPosition, onLocationSelect: selectLocation, onDynamicSiteSelect: selectDynamicSite, onMapClick: handleMapClick });
  clearInterval(productionTimer); productionTimer = setInterval(runProductionCycle, 10_000);
  if (mode === "gps") startGps(); else { ui.gpsStatus.textContent = "Simulation : clique sur la carte ou fais glisser le pion."; applyPosition(heroPosition); }
  render(); logTest(`Mode ${mode === "gps" ? "GPS réel" : "simulation"} démarré.`);
}

function startGps() {
  ui.gpsStatus.textContent = "GPS : recherche de la position…";
  gpsTracker = new GpsTracker({ onPosition: (position) => { applyPosition(position); ui.gpsStatus.textContent = `GPS actif · précision ±${Math.round(position.accuracy)} m · ${new Date(position.updatedAt).toLocaleTimeString("fr-FR")}`; if (firstGpsFix) { firstGpsFix = false; mapView.focus(position); logTest("Premier point GPS reçu."); } }, onError: (error) => { ui.gpsStatus.textContent = `Erreur GPS : ${error.message}`; logTest(`Erreur GPS (${error.code}).`); } });
  if (!gpsTracker.start()) ui.gpsStatus.textContent = "Géolocalisation indisponible sur cet appareil.";
}

function distance(a, b) { return mode === "gps" ? distanceMeters(a, b) : Math.hypot(a[0] - b[0], a[1] - b[1]); }
function asGps(position) { return Array.isArray(position) ? { latitude: position[0], longitude: position[1] } : { latitude: position.latitude, longitude: position.longitude }; }
function positionFor(id) { return runtimePositions.get(id); }
function rangesFor(location) { return mode === "gps" ? rangePolicy.resolve(location, game.setup.playArea) : { interactionRadius: simulationRadii[location.id] ?? 8, detectionRadius: simulationDetectionRadii[location.id] ?? 16 }; }
function radiusFor(location) { return rangesFor(location).interactionRadius; }
function rebuildLocationEngine() { locationEngine = new LocationEngine({ locations: game.locations.filter((location) => location.state !== "destroyed").map((location) => ({ id: location.id, position: positionFor(location.id), interactionRadius: radiusFor(location) })), cooldownMs: 2_000, exitMarginMeters: mode === "gps" ? 10 : 1, distanceFn: distance, validatePositionFn: () => {} }); }

function mappedLocations({ knownOnly = true } = {}) { const player = game.getPlayer("local"); return game.locations.filter((location) => location.state !== "destroyed" && (!knownOnly || player.knowsLocation(location.id))).map((location) => { const position = positionFor(location.id); const d = distance(heroPosition, position); const ranges = rangesFor(location); const nearby = d <= ranges.interactionRadius; const actions = []; if (location.features.recruitment) location.recruitment.availableUnitTypeIds.forEach((type) => actions.push({ id: `recruit:${type}`, label: `Recruter ${type}` })); if (location.features.resourceProduction) { const stock = Object.entries(location.resources.stock).map(([id, amount]) => `${Math.floor(amount)} ${id}`).join(", ") || "vide"; actions.push({ id: "collect", label: `Récupérer (${stock})` }); } if (location.features.battle) actions.push({ id: "battle", label: "Attaquer les brigands" }); return { id: location.id, name: location.name, type: location.type, position, radius: ranges.interactionRadius, interactionRadius: ranges.interactionRadius, detectionRadius: ranges.detectionRadius, distance: d, nearby, state: "DISCOVERED", description: descriptions[location.id] ?? "Lieu créé pendant le test terrain.", actions }; }); }

function runProductionCycle() { const results = game.produceLocationResources(1); if (results.length === 0) return; const mine = results.find((result) => result.locationId === "gold-mine"); if (mine) logTest(`La mine produit ${mine.produced.gold ?? 0} or.`); render(); if (currentLocationId === "gold-mine" && !ui.sheet.hidden) selectLocation(currentLocationId); }
function applyPosition(position) {
  heroPosition = normalizePosition(position, mode); gpsAccuracy = mode === "gps" ? position.accuracy ?? null : null; hero.updatePosition(asGps(heroPosition));
  const quest = field.updatePosition(asGps(heroPosition)); if (quest) { ui.questStatus.textContent = `${Math.round(quest.distanceMeters)} / 300 m ${quest.completed ? "· objectif atteint" : ""}`; ui.questPlace.disabled = !quest.completed; }
  if (playAreaGrid) { const cell = playAreaGrid.getCellAt(asGps(heroPosition)); if (cell && cell.id !== lastVisitedCellId) { playAreaGrid.recordVisit(asGps(heroPosition)); lastVisitedCellId = cell.id; logTest(`Entrée dans ${cell.id}.`); } }
  updatePresence(); locationEngine.update({ actorId: hero.id, position: heroPosition }).forEach(handleLocationEvent);
  if (activeBattle?.status === "active" && activeBattle.engagementContext) game.updateBattleHeroPosition({ battleId: activeBattle.id, heroId: hero.id, position: asGps(heroPosition) });
  render();
}
function updatePresence() { if (!game) return; const player = game.getPlayer("local"); mappedLocations({ knownOnly: false }).forEach((item) => { const location = game.getLocation(item.id); if (item.distance <= item.detectionRadius) player.discoverLocation(item.id); if (item.nearby) location.addHero(hero.id); else location.removeHero(hero.id); }); }
function handleLocationEvent(event) { const interaction = interactionEngine.handle(event); if (!interaction) return; if (event.type === "LocationExited") { if (currentLocationId === event.locationId) { currentLocationId = null; locationMessage = ""; if (currentEncounter?.locationId === event.locationId) currentEncounter = null; closeSheet(ui.sheet); } return; } currentLocationId = event.locationId; if (interaction.type === "encounter") { currentEncounter = interaction.encounter; renderEncounter(); } else selectLocation(event.locationId); }

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
function selectLocation(id) { const location = mappedLocations().find((item) => item.id === id); if (!location) return; currentLocationId = id; renderLocationSheet({ element: ui.sheet, location, message: locationMessage, onClose: () => { currentLocationId = null; closeSheet(ui.sheet); }, onAction: runAction }); }
function selectDynamicSite(id) {
  const site = game.battleSites.find((item) => item.id === id); if (!site || site.status !== "FINISHED") return;
  ui.sheet.hidden = false; ui.sheet.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Champ de bataille</span><h2>Traces du combat</h2><p>Ce site disparaîtra bientôt.</p><div class="sheet-actions"><button data-site-search="loot">Chercher du butin</button><button data-site-search="information">Chercher des informations</button><button data-site-search="survivors">Chercher des survivants</button></div>`;
  ui.sheet.querySelector(".sheet-close").onclick = () => closeSheet(ui.sheet);
  ui.sheet.querySelectorAll("[data-site-search]").forEach((button) => button.onclick = () => { searchBattlefield(button.dataset.siteSearch, site.id); closeSheet(ui.sheet); });
}
function runAction(action) { const location = game.getLocation(currentLocationId); if (action.startsWith("recruit:")) { const result = game.recruitUnit({ playerId: "local", heroId: hero.id, locationId: location.id, unitTypeId: action.split(":")[1] }); locationMessage = result.success ? "Unité recrutée." : `Impossible : ${result.reason}.`; } else if (action === "collect") { const result = game.collectLocationResources({ playerId: "local", heroId: hero.id, locationId: location.id }); locationMessage = result.success ? "Ressources récupérées." : "Collecte impossible."; } else if (action === "battle") openBattle(); render(); if (action !== "battle") selectLocation(currentLocationId); }

function openBattle() {
  if (activeBattle?.status === "active") return; closeSheet(ui.sheet); enemyHero.updatePosition(asGps(heroPosition));
  activeBattle = game.createBattle({ teamParticipants: [{ id: "heroes", heroIds: [hero.id] }, { id: "bandits", heroIds: [enemyHero.id] }], position: asGps(heroPosition), sourceLocationId: currentEncounter?.locationId ?? currentLocationId ?? "bandit-camp", sourceEnemyTeamId: "bandits", loot: [{ id: "bandit-gold", itemId: "gold", quantity: 12, portable: true, weightPerUnit: .1, valuePerUnit: 1 }, { id: "bandit-barricade", itemId: "barricade", quantity: 1, portable: false, weightPerUnit: 80, valuePerUnit: 25 }] });
  activeBattle.teams[0].units.forEach((unit) => { unit.lane = null; unit.progress = 0; }); activeBattle.teams[1].units.forEach((unit, index) => { unit.lane = index % 3; unit.progress = 0; }); battleResolved = false; battleMessage = "Placez vos unités sur une ligne."; setBattleNavigationLocked(true); switchView("battle"); renderBattle(); logTest("Combat déclenché à la position du joueur.");
  clearInterval(battleTimer); battleTimer = setInterval(() => { activeBattle.tick(500); resolveFinishedBattle(); if (!battleDragging) renderBattle(); render(); if (activeBattle.status === "finished") clearInterval(battleTimer); }, 500);
}
function renderBattle() { renderBattleView({ element: ui.battle, battle: activeBattle, playerTeamId: "heroes", message: battleMessage, selectedUnitId: selectedBattleUnitId, onSelectUnit: (id) => { selectedBattleUnitId = id; renderBattle(); }, onDragState: (active) => { battleDragging = active; }, onAssign: (unitId, lane) => { const heroId = activeBattle.teams[0].heroes.find((item) => item.state === "active")?.id; const result = heroId ? activeBattle.assignUnit(unitId, heroId, lane) : { success: false }; selectedBattleUnitId = null; battleMessage = result.success ? `Unité sur la ligne ${lane + 1}.` : "Placement impossible."; renderBattle(); }, onRetreatLine: (lane) => { const result = activeBattle.orderRetreat("heroes", lane); battleMessage = result.success ? `Retraite ordonnée ligne ${lane + 1}.` : `Aucune unité disponible ligne ${lane + 1}.`; renderBattle(); }, onSurrender: () => { game.surrenderBattle({ battleId: activeBattle.id, teamId: "heroes" }); resolveFinishedBattle(); renderBattle(); render(); } }); }
function resolveFinishedBattle() { if (activeBattle.status !== "finished" || battleResolved) return; const result = game.resolveBattle(activeBattle.id); battleResolved = true; setBattleNavigationLocked(false); if (result.destroyedLocationId) { rebuildLocationEngine(); interactionEngine = new InteractionEngine({ locations: game.locations.filter((location) => location.state !== "destroyed"), enemyResolver: ({ location }) => location.features.battle ? { name: "Brigands", danger: 2, aggressive: false } : null }); currentEncounter = null; currentLocationId = null; } battleMessage = `Bataille terminée · vainqueur ${activeBattle.winnerTeamId ?? "aucun"}.`; logTest(`Champ de bataille créé${result.lootSite ? " et butin calculé" : ", sans butin"}${result.destroyedLocationId ? " · camp ennemi détruit" : ""}.`); }

function searchBattlefield(searchType = "loot", battleSiteId = null) { const site = battleSiteId ? game.battleSites.find((item) => item.id === battleSiteId) : game.battleSites.at(-1); if (!site) return logTest("Aucun champ de bataille à chercher."); const result = game.searchBattlefield({ battleSiteId: site.id, playerId: "local", heroId: hero.id, position: asGps(heroPosition), searchType }); const detail = searchType === "loot" ? `${result.discoveredLootSiteIds?.length ?? 0} butin(s) découvert(s)` : searchType === "information" ? `vainqueur : ${result.information?.winnerTeamId ?? "inconnu"}` : `${result.survivors?.length ?? 0} survivant(s)`; logTest(result.success ? `Recherche réussie · ${detail}.` : `Recherche impossible : ${result.reason}.`); render(); }
function collectLoot() { const site = game.lootSites.find((item) => item.isKnownBy("local")); if (!site) return logTest("Aucun butin découvert."); const result = game.collectLoot({ lootSiteId: site.id, playerId: "local", heroId: hero.id, position: asGps(heroPosition) }); logTest(result.success ? `Butin collecté : ${result.collected.map((item) => `${item.quantity} ${item.itemId}`).join(", ") || "rien"}.` : `Collecte impossible : ${result.reason}.`); render(); }

function visibleSites() { if (!game || !heroPosition) return []; return game.getVisibleDynamicSites({ playerId: "local", position: asGps(heroPosition) }); }
function render() {
  if (!game || !mapView) return; const sites = visibleSites(); mapView.render({ heroPosition, accuracy: gpsAccuracy, locations: mappedLocations(), playAreaPoints: field.playAreaPoints, dynamicSites: sites, gridCells: playAreaGrid?.cells ?? [], heatmapVisible });
  const player = game.getPlayer("local"); ui.mode.textContent = mode === "gps" ? "GPS réel" : "Maison"; ui.health.textContent = `PV ${hero.health}/${hero.maxHealth}`; ui.army.textContent = `Armée ${hero.army.units.length}`; ui.gold.textContent = `Or ${hero.getResourceAmount("gold")}`;
  const heroClass = data.heroClasses.find((item) => item.id === hero.classId); ui.heroContent.innerHTML = `<article class="hero-card"><h3>${hero.name}</h3><span class="eyebrow">${heroClass?.name ?? hero.classId} · ${rankLabel(HERO_COMMAND_RANKS, hero.commandRank)}</span><div class="hero-stats"><div class="hero-stat"><strong>${hero.health}/${hero.maxHealth}</strong><span>Points de vie</span></div><div class="hero-stat"><strong>Niveau ${hero.level}</strong><span>${hero.experience} XP</span></div><div class="hero-stat"><strong>${hero.army.units.length}/${hero.maxUnitStacks}</strong><span>Unités commandées</span></div><div class="hero-stat"><strong>${hero.getRemainingCarryCapacity().toFixed(1)}</strong><span>Capacité restante</span></div></div><div class="hero-details"><span>État : ${hero.state}</span><span>Capacités : ${hero.abilityIds.join(", ") || "aucune"}</span><span>Équipement : ${Object.values(hero.equipment).join(", ") || "aucun"}</span></div></article>`;
  ui.armyContent.innerHTML = hero.army.units.map((unit) => `<article class="unit-row"><strong>${unit.typeId} · ${rankLabel(UNIT_RANKS, unit.rank)}</strong><span>${unit.quantity}/${unit.maxQuantity} · ${unit.experience} XP</span></article>`).join("") || "Aucune unité."; ui.inventory.innerHTML = `<article class="unit-row"><strong>Ressources</strong><span>${Object.entries(hero.resources).map(([key, value]) => `${key}: ${value}`).join(" · ")}</span></article><article class="unit-row"><strong>Butin transporté</strong><span>${hero.carriedLoot.map((item) => `${item.quantity} ${item.itemId}`).join(" · ") || "Aucun"}</span></article>`;
  ui.quests.innerHTML = `<article class="quest-card"><strong>Marche des 300 mètres</strong><span>${field.questStart ? `${Math.round(field.questDistanceMeters)} / 300 m` : "Non démarrée"}</span></article>`; ui.sitesStatus.textContent = `${game.battleSites.length} champ(s) de bataille · ${game.lootSites.length} site(s) de butin · ${sites.length} visible(s)`;
  $("#grid-status").textContent = playAreaGrid ? `${playAreaGrid.cells.length} cellule(s) · ${playAreaGrid.cells.filter((cell) => cell.visits > 0).length} visitée(s)` : "Aucune grille.";
}
function logTest(message) { const item = document.createElement("li"); item.textContent = `${new Date().toLocaleTimeString("fr-FR")} — ${message}`; ui.log.prepend(item); }
function setBattleNavigationLocked(locked) { $(".bottom-nav").classList.toggle("is-locked", locked); document.querySelectorAll("[data-view]").forEach((button) => { button.disabled = locked; }); }
function switchView(name) { if (activeBattle?.status === "active" && name !== "battle") return false; document.querySelectorAll(".view").forEach((view) => view.classList.toggle("is-active", view.id === `${name}-view`)); document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.view === name)); if (name === "map") setTimeout(() => mapView.map.invalidateSize(), 0); else closeSheet(ui.sheet); return true; }

ui.create.onclick = start; ui.recenter.onclick = () => mapView.focus(heroPosition); $("#toggle-field-tools").onclick = () => { ui.tools.hidden = false; }; $("#close-field-tools").onclick = () => { ui.tools.hidden = true; };
$("#draw-area").onclick = () => { interactionMode = interactionMode === "draw-area" ? null : "draw-area"; logTest(interactionMode ? "Tracé actif : touchez la carte." : "Tracé suspendu."); };
$("#clear-area").onclick = () => { field.clearPlayArea(); validatedPlayArea = null; playAreaGrid = null; lastVisitedCellId = null; $("#toggle-heatmap").disabled = true; mapView.setPlayArea([]); render(); logTest("Zone et grille effacées."); };
$("#validate-area").onclick = () => { try { validatedPlayArea = field.createPlayArea(); game.setup.playArea = validatedPlayArea; playAreaGrid = new PlayAreaGrid({ playArea: validatedPlayArea, cellSizeMeters: mode === "gps" ? 15 : 15_000 }); rebuildLocationEngine(); interactionMode = null; lastVisitedCellId = null; $("#toggle-heatmap").disabled = false; mapView.setPlayArea(validatedPlayArea.polygon); logTest(`Zone validée · ${(validatedPlayArea.getAreaSquareMeters() / 10_000).toFixed(1)} ha · ${playAreaGrid.cells.length} cellules de 15 m × 15 m.`); applyPosition(heroPosition); } catch (error) { logTest(error.message); } };
$("#toggle-heatmap").onclick = () => { heatmapVisible = !heatmapVisible; $("#toggle-heatmap").textContent = heatmapVisible ? "Masquer la heatmap" : "Afficher la heatmap"; render(); };
$("#place-location").onclick = () => { interactionMode = "place-location"; logTest("Touchez la carte pour poser le camp."); };
$("#start-distance-quest").onclick = () => { field.startDistanceQuest(asGps(heroPosition)); ui.questPlace.disabled = true; logTest("Départ de la quête 300 m enregistré."); render(); };
ui.questPlace.onclick = placeQuestLocation; $("#test-battle").onclick = openBattle; $("#search-battlefield").onclick = searchBattlefield; $("#collect-loot").onclick = collectLoot;
document.querySelectorAll("[data-view]").forEach((button) => button.onclick = () => switchView(button.dataset.view));

try { data = await loadData(); ui.heroClass.innerHTML = data.heroClasses.filter((item) => item.id !== "mage").map((item) => `<option value="${item.id}">${item.name}</option>`).join(""); ui.status.textContent = "Le banc d'essai terrain est prêt."; } catch (error) { ui.status.textContent = `Chargement impossible : ${error.message}`; ui.create.disabled = true; }

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("../service-worker.js", { scope: "../" }).catch(() => {}));
