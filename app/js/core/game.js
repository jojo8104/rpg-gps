import { GameSetup } from "./game-setup.js";
import { Hero } from "./hero.js";
import { Location } from "./location.js";
import { Player } from "./player.js";
import { RecruitmentService } from "./recruitment-service.js";
import { BattleService } from "./battle-service.js";
import { BattleConsequenceService } from "./battle-consequence-service.js";
import { EngagementService } from "./engagement-service.js";
import { Scenario, ScenarioState } from "./scenario.js";
import { ScenarioEffectResolver } from "./scenario-effect-resolver.js";
import { LootDistributionService } from "./loot-distribution-service.js";
import { BattleSite } from "./battle-site.js";
import { ScenarioLocationBinding } from "./scenario-location-binding.js";
import { LocationAccessPolicy } from "./location-access-policy.js";
import { LocationCaptureService } from "./location-capture-service.js";
import { LocationProgressionService } from "./location-progression-service.js";

/** État actif d'une partie, indépendant de l'interface et des services navigateur. */
export class Game {
  constructor({ setup, scenario = null, scenarioLocationBindings = [], heroClasses = [], unitDefinitions = [], locations = [], now = () => Date.now(), idGenerator = Game.#defaultIdGenerator }) {
    this.setup = setup instanceof GameSetup ? setup : new GameSetup(setup);
    this.heroClasses = Game.#createHeroClassMap(heroClasses);
    this.unitDefinitions = Game.#createUnitDefinitionMap(unitDefinitions);
    this.recruitmentService = new RecruitmentService(this.unitDefinitions);
    this.locationAccessPolicy = new LocationAccessPolicy({ participants: this.setup.participants });
    this.locationCaptureService = new LocationCaptureService();
    this.locationProgressionService = new LocationProgressionService({ mode: this.setup.rules.locationMode });
    this.battleService = new BattleService(this.unitDefinitions);
    this.battleConsequenceService = new BattleConsequenceService();
    this.lootDistributionService = new LootDistributionService();
    this.engagementService = new EngagementService({ engagementRadiusMeters: this.setup.rules.engagementRadiusMeters, fleeConfirmations: this.setup.rules.fleeConfirmations });
    this.scenario = scenario === null ? null : (scenario instanceof Scenario ? scenario : new Scenario(scenario));
    if (this.scenario !== null && this.scenario.id !== this.setup.scenarioId) throw new RangeError("Le scénario ne correspond pas au GameSetup.");
    this.scenarioState = this.scenario === null ? null : new ScenarioState(this.scenario);
    this.locations = Game.#createLocations(locations);
    this.locations.forEach((location) => this.locationProgressionService.initialize(location));
    this.scenarioLocationBindings = this.scenario === null
      ? []
      : ScenarioLocationBinding.validateAll(scenarioLocationBindings, this.scenario, this.locations);
    this.scenarioEffectResolver = new ScenarioEffectResolver();
    this.eventLog = [];
    this.activeScenarioEventId = null;
    this.now = now;
    this.idGenerator = idGenerator;
    this.players = this.setup.participants.map((participant) => new Player({ id: participant.playerId, name: participant.name }));
    this.heroes = [];
    this.status = "preparing";
    this.startedAt = null;
    this.finishedAt = null;
    this.finishReason = null;
    this.battles = [];
    this.battleReports = [];
    this.rogueArmies = [];
    this.lootSites = [];
    this.battleSites = [];
  }

  chooseHero(playerId, { name, classId }) {
    if (this.status !== "preparing") throw new Error("Le héros ne peut être choisi qu'avant le démarrage.");
    const player = this.getPlayer(playerId);
    if (player === null) throw new RangeError("Le joueur n'appartient pas à cette partie.");
    if (player.heroIds.length >= this.setup.rules.maxHeroesPerPlayer) return null;
    const heroClass = this.heroClasses.get(classId);
    if (heroClass === undefined) throw new RangeError("La classe de héros n'existe pas.");

    const hero = new Hero({
      id: this.idGenerator("hero"), playerId: player.id, name, classId,
      abilityIds: heroClass.abilityIds,
    });
    this.heroes.push(hero);
    player.addHero(hero.id);
    return hero;
  }

  start() {
    if (this.status !== "preparing") return false;
    if (this.setup.participants.length !== this.setup.playerCount) throw new Error("Le nombre de joueurs choisi n'est pas atteint.");
    if (this.players.some((player) => player.heroIds.length === 0)) throw new Error("Chaque joueur doit choisir au moins un héros.");
    this.#grantStartingForces();
    this.status = "started";
    this.startedAt = this.now();
    return true;
  }

  getRemainingTimeMilliseconds() {
    if (this.setup.rules.timeLimitMinutes === null || this.startedAt === null) return null;
    const limit = this.setup.rules.timeLimitMinutes * 60_000;
    return Math.max(0, limit - (this.now() - this.startedAt));
  }

  update() {
    if (this.status === "started" && this.getRemainingTimeMilliseconds() === 0) this.finish("time_limit");
    this.cleanupDynamicSites();
  }

  finish(reason = "manual") {
    if (this.status !== "started") return false;
    this.status = "finished";
    this.finishedAt = this.now();
    this.finishReason = Game.#requireText(reason, "La raison de fin");
    return true;
  }

  completeScenarioObjective(objectiveId) {
    if (this.scenarioState === null) return false;
    return this.scenarioState.completeObjective(objectiveId);
  }

  triggerScenarioEvent(eventId) {
    if (this.scenario === null || this.scenarioState === null) return null;
    const event = this.scenarioState.triggerEvent(this.scenario, eventId);
    if (event === null) return null;
    this.activeScenarioEventId = event.id;
    try {
      return { event, appliedEffects: this.scenarioEffectResolver.apply(event, this) };
    } finally {
      this.activeScenarioEventId = null;
    }
  }

  advanceScenario(nextPhaseId) {
    if (this.scenario === null || this.scenarioState === null) return false;
    return this.scenarioState.advance(this.scenario, nextPhaseId);
  }

  getLocationRelation(playerId, locationId) {
    const location = this.getLocation(locationId);
    return location === null ? null : this.locationAccessPolicy.getRelation(playerId, location);
  }

  canPerformLocationAction({ playerId, locationId, action }) {
    const location = this.getLocation(locationId);
    if (location === null || !this.locationAccessPolicy.can(playerId, location, action)) return false;
    if (action === "attack" && location.features.capturable === true) return this.getLocationCaptureRequirement({ playerId, locationId }).state === "battle_required";
    return true;
  }

  getLocationCaptureRequirement({ playerId, locationId }) {
    const location = this.getLocation(locationId);
    if (location === null) return { state: "location_not_found" };
    return this.locationCaptureService.getRequirement({ location, relation: this.locationAccessPolicy.getRelation(playerId, location), isQuestCompleted: (id) => this.isObjectiveCompleted(id) });
  }

  attemptLocationCapture({ playerId, heroId, locationId }) {
    const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (hero === null || location === null || hero.playerId !== playerId || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    const result = this.locationCaptureService.capture({ location, playerId, relation: this.locationAccessPolicy.getRelation(playerId, location), isQuestCompleted: (id) => this.isObjectiveCompleted(id) });
    if (result.success) this.eventLog.push({ type: "location_captured", ...result, heroId, at: this.now() });
    return result;
  }

  isObjectiveCompleted(objectiveId) {
    return this.scenarioState !== null && Object.values(this.scenarioState.phaseStates).some((phase) => phase.objectives.some((objective) => objective.id === objectiveId && objective.state === "completed"));
  }

  recruitUnit({ playerId, heroId, locationId, unitTypeId }) {
    if (this.status !== "started") return { success: false, reason: "game_not_started" };
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id) return { success: false, reason: "invalid_recruitment_request" };
    if (!this.locationAccessPolicy.can(player.id, location, "recruit")) return { success: false, reason: "location_access_denied" };
    return this.recruitmentService.recruit({ player, hero, location, typeId: unitTypeId, idGenerator: this.idGenerator, number: this.#nextUnitNumber(player.id, unitTypeId) });
  }

  collectLocationResources({ playerId, heroId, locationId }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(player.id, location, "collect")) return { success: false, reason: "location_access_denied" };
    const collected = { ...location.resources.stock };
    if (Object.values(collected).every((amount) => amount <= 0)) return { success: false, reason: "empty_stock" };
    Object.entries(collected).forEach(([resource, amount]) => { if (amount > 0) { hero.addResource(resource, amount); location.resources.stock[resource] = 0; } });
    return { success: true, collected };
  }

  depositLocationResource({ playerId, heroId, locationId, resourceName, amount }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(player.id, location, "deposit")) return { success: false, reason: "location_access_denied" };
    const available = hero.getResourceAmount(resourceName);
    const requested = Math.min(available, amount ?? available);
    if (requested <= 0) return { success: false, reason: "nothing_to_deposit" };
    const deposited = location.depositResource(resourceName, requested);
    if (deposited <= 0) return { success: false, reason: "storage_full" };
    hero.spendResource(resourceName, deposited);
    return { success: true, resourceName, deposited };
  }

  depositLocationItem({ playerId, heroId, locationId, lootId }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(player.id, location, "deposit")) return { success: false, reason: "location_access_denied" };
    const index = hero.carriedLoot.findIndex((item) => item.id === lootId);
    if (index === -1) return { success: false, reason: "item_not_carried" };
    const [item] = hero.carriedLoot.splice(index, 1);
    location.depositItem(item);
    return { success: true, item: { ...item } };
  }

  produceLocationResources(cycles = 1, random = Math.random) {
    return this.locations.map((location) => { const modifier = location.getContentmentModifier(this.setup.rules.enableContentment); return { locationId: location.id, contentmentModifier: modifier, produced: location.produceResources(cycles, modifier), producedRecruits: location.produceRecruits(cycles, random, modifier) }; }).filter((result) => Object.keys(result.produced).length > 0 || Object.keys(result.producedRecruits).length > 0);
  }

  garrisonUnit({ playerId, heroId, locationId, unitId }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id) || !this.locationAccessPolicy.can(player.id, location, "garrison")) return false;
    const unit = hero.army.getUnit(unitId);
    if (unit === null || unit.ownerPlayerId !== player.id || location.garrison.hasUnit(unitId)) return false;
    hero.removeUnit(unitId);
    location.garrison.addUnit(unit);
    return true;
  }

  withdrawGarrisonUnit({ playerId, heroId, locationId, unitId }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id) || !this.locationAccessPolicy.can(player.id, location, "withdrawGarrison")) return false;
    if (hero.army.units.length >= hero.maxUnitStacks) return false;
    const unit = location.garrison.getUnit(unitId);
    if (unit === null || unit.ownerPlayerId !== player.id) return false;
    location.garrison.removeUnit(unitId);
    hero.addUnit(unit);
    return true;
  }

  createBattle({ teamParticipants, loot = [], position = null, sourceLocationId = null, sourceEnemyTeamId = null, config = {} }) {
    if (this.status !== "started") throw new Error("La partie doit être démarrée pour créer une bataille.");
    const battle = this.battleService.createBattle({ id: this.idGenerator("battle"), game: this, teamParticipants, loot, config, now: this.now });
    battle.lootPosition = position === null ? null : { ...position };
    battle.sourceLocationId = sourceLocationId;
    battle.sourceEnemyTeamId = sourceEnemyTeamId;
    if (position !== null) {
      const participantPlayerIds = teamParticipants.flatMap((team) => team.heroIds.map((heroId) => this.getHero(heroId)?.playerId)).filter(Boolean);
      this.battleSites.push(new BattleSite({ id: this.idGenerator("battle-site"), battleId: battle.id, position, participantPlayerIds, now: this.now }));
    }
    battle.start();
    this.battles.push(battle);
    return battle;
  }

  canEngageHeroes(firstHeroId, secondHeroId) {
    const first = this.getHero(firstHeroId);
    const second = this.getHero(secondHeroId);
    return !this.#isOnPursuitCooldown(first) && !this.#isOnPursuitCooldown(second) && this.engagementService.canEngage(first, second);
  }

  engageHeroes({ initiatorHeroId, targetHeroId, teams, battleConfig = {} }) {
    const initiator = this.getHero(initiatorHeroId);
    const target = this.getHero(targetHeroId);
    if (!this.canEngageHeroes(initiatorHeroId, targetHeroId)) throw new Error("Les héros ne peuvent pas s'engager à cette distance.");
    if (!Array.isArray(teams) || !teams.some((team) => team.heroIds.includes(initiator.id)) || !teams.some((team) => team.heroIds.includes(target.id))) throw new RangeError("Les équipes d'engagement doivent contenir les deux héros.");
    const heroes = teams.flatMap((team) => team.heroIds.map((heroId) => this.getHero(heroId)));
    if (heroes.some((hero) => hero === null || hero.position === null)) throw new Error("Chaque héros engagé doit avoir une position GPS.");
    const context = this.engagementService.createContext(heroes);
    const teamParticipants = this.engagementService.createTeamParticipants({ teams, context });
    const battle = this.createBattle({ teamParticipants, position: context.center, config: battleConfig });
    battle.engagementContext = context;
    return battle;
  }

  resolveBattle(battleId) {
    const battle = this.battles.find((item) => item.id === battleId);
    if (battle === undefined) throw new RangeError("La bataille n'existe pas.");
    const droppedLoot = this.#extractDroppedEquipment(battle);
    const outcome = this.battleService.applyOutcome({ game: this, battle });
    const consequences = this.battleConsequenceService.resolve({ game: this, battle, idGenerator: this.idGenerator });
    const heroProgression = [];
    battle.teams.forEach((team) => team.heroes.forEach((snapshot) => {
      const participant = this.getHero(snapshot.sourceId); if (participant === null) return;
      const previousExperience = participant.experience; const previousRank = participant.commandRank;
      const experienceGained = team.id === battle.winnerTeamId ? 50 : 20; participant.addExperience(experienceGained);
      heroProgression.push({ heroId: participant.id, playerId: participant.playerId, name: participant.name, experienceGained, previousExperience, experience: participant.experience, previousRank, rank: participant.commandRank, state: participant.state });
    }));
    const position = battle.engagementContext?.center ?? battle.lootPosition;
    const lootSite = position === null || position === undefined ? null : this.lootDistributionService.createSite({ id: this.idGenerator("loot-site"), battle, position, extraLoot: droppedLoot, now: this.now });
    if (lootSite !== null) this.lootSites.push(lootSite);
    this.battleSites.find((site) => site.battleId === battle.id)?.finish();
    const capturedLocation = this.#captureDefeatedLocation(battle);
    const destroyedLocationId = capturedLocation === null ? this.#destroyDefeatedEnemySource(battle) : null;
    return { ...outcome, consequences, heroProgression, lootSite: lootSite?.toJSON() ?? null, destroyedLocationId, capturedLocationId: capturedLocation?.locationId ?? null };
  }

  searchBattlefield({ battleSiteId, playerId, heroId, position, searchType = "loot" }) {
    this.cleanupDynamicSites();
    const battleSite = this.battleSites.find((site) => site.id === battleSiteId); const hero = this.getHero(heroId);
    if (battleSite === undefined || hero === null || hero.playerId !== playerId || hero.state !== "active") return { success: false, reason: "invalid_search", discoveredLootSiteIds: [] };
    const searched = battleSite.search({ type: searchType, playerId, position });
    if (!searched.success) return { ...searched, discoveredLootSiteIds: [] };
    const battle = this.battles.find((item) => item.id === battleSite.battleId);
    if (searchType === "loot") {
      const discoveredLootSiteIds = this.lootSites.filter((site) => site.battleId === battleSite.battleId && site.discover(playerId)).map((site) => site.id);
      return { success: true, searchType, discoveredLootSiteIds };
    }
    if (searchType === "information") return { success: true, searchType, discoveredLootSiteIds: [], information: { battleId: battleSite.battleId, winnerTeamId: battle?.winnerTeamId ?? null, destroyedLocationId: battle?.sourceLocationId ?? null } };
    const survivors = battle?.teams.flatMap((team) => team.units.filter((unit) => unit.quantity > 0 && unit.state !== "defeated").map((unit) => ({ teamId: team.id, unitId: unit.sourceId, quantity: unit.quantity, state: unit.state }))) ?? [];
    return { success: true, searchType, discoveredLootSiteIds: [], survivors };
  }

  getVisibleDynamicSites({ playerId, position }) {
    this.cleanupDynamicSites();
    return [
      ...this.battleSites.filter((site) => site.isVisibleTo({ playerId, position })).map((site) => ({ kind: "battlefield", ...site.toJSON() })),
      ...this.lootSites.filter((site) => site.isKnownBy(playerId)).map((site) => ({ kind: "loot", ...site.toJSON() })),
    ];
  }

  cleanupDynamicSites() {
    this.battleSites = this.battleSites.filter((site) => !site.isExpired());
    this.lootSites = this.lootSites.filter((site) => !site.isExpired() && site.status !== "DEPLETED");
  }

  collectLoot({ lootSiteId, playerId, heroId, position }) {
    const site = this.lootSites.find((item) => item.id === lootSiteId); const hero = this.getHero(heroId);
    if (site === undefined || hero === null || hero.playerId !== playerId || hero.state !== "active") return { success: false, reason: "invalid_loot_request", collected: [] };
    const result = site.collect({ playerId, position, capacity: hero.getRemainingCarryCapacity() });
    if (result.success) hero.addCarriedLoot(result.collected);
    return result;
  }

  surrenderBattle({ battleId, teamId }) {
    const battle = this.battles.find((item) => item.id === battleId);
    if (battle === undefined) return { success: false, reason: "battle_not_found" };
    return battle.surrender(teamId);
  }

  joinBattle({ battleId, teamId, heroId }) {
    const battle = this.battles.find((item) => item.id === battleId);
    const hero = this.getHero(heroId);
    if (battle === undefined || hero === null || battle.status !== "active" || battle.getEntity(`battle-hero-${heroId}`) !== null) return false;
    const context = battle.engagementContext;
    if (context === undefined || !this.engagementService.canJoinBattle(hero, context)) return false;
    const team = battle.teams.find((item) => item.id === teamId);
    if (team === undefined || !this.setup.participants.some((participant) => participant.playerId === hero.playerId)) return false;
    const snapshots = this.battleService.createReinforcementSnapshots({ game: this, heroId });
    return battle.addReinforcement({ teamId, ...snapshots }).success;
  }

  updateBattleHeroPosition({ battleId, heroId, position }) {
    const battle = this.battles.find((item) => item.id === battleId);
    const hero = this.getHero(heroId);
    if (battle === undefined || hero === null || battle.status !== "active" || battle.getEntity(`battle-hero-${heroId}`) === null) return { state: "ignored" };
    hero.updatePosition(position);
    const battleHero = battle.getEntity(`battle-hero-${heroId}`);
    if (!this.engagementService.isOutsideBattleZone(hero.position, battle.engagementContext)) {
      battleHero.fleeConfirmations = 0;
      return { state: "inside" };
    }
    battleHero.fleeConfirmations = (battleHero.fleeConfirmations ?? 0) + 1;
    if (battleHero.fleeConfirmations < this.engagementService.config.fleeConfirmations) {
      battle.eventLog.push({ type: "potential_flee", heroId: hero.id, confirmations: battleHero.fleeConfirmations, at: this.now() });
      return { state: "potential_flee", confirmations: battleHero.fleeConfirmations };
    }
    battleHero.state = "fled";
    hero.state = "fled";
    battle.eventLog.push({ type: "flee_validated", heroId: hero.id, at: this.now() });
    this.#removeHeroCommand(battle, battleHero);
    this.#simulatePursuit(battle, battleHero);
    hero.pursuitCooldownUntil = this.now() + this.setup.rules.pursuitCooldownMinutes * 60_000;
    this.#checkBattleAfterFlee(battle);
    return { state: "fled" };
  }

  #checkBattleAfterFlee(battle) {
    const activeTeams = battle.teams.filter((team) => team.heroes.some((hero) => hero.state === "active"));
    if (activeTeams.length > 1) return;
    battle.status = "finished";
    battle.finishedAt = this.now();
    battle.winnerTeamId = activeTeams[0]?.id ?? null;
    battle.eventLog.push({ type: "battle_finished", winnerTeamId: battle.winnerTeamId, at: this.now() });
  }

  #simulatePursuit(battle, fleeingBattleHero) {
    const fleeingTeam = battle.getTeamForEntity(fleeingBattleHero.id);
    const pursuers = battle.teams.filter((team) => team.id !== fleeingTeam.id).flatMap((team) => team.units.filter((unit) => unit.state === "active"));
    const fleeingUnits = fleeingTeam.units.filter((unit) => unit.state === "fled");
    if (pursuers.length === 0 || fleeingUnits.length === 0) return;
    const pursuitPower = pursuers.reduce((total, unit) => total + unit.speed + unit.range, 0) / pursuers.length;
    fleeingUnits.forEach((battleUnit) => {
      const morale = Math.max(0.2, (battleUnit.morale ?? 5) / 5);
      const escapeFactor = battleUnit.speed * morale;
      const lossRatio = Math.min(0.8, battle.config.pursuitLossRate * (pursuitPower / Math.max(1, escapeFactor)));
      const losses = Math.min(battleUnit.quantity, Math.floor(battleUnit.quantity * lossRatio));
      battleUnit.quantity -= losses;
      if (battleUnit.quantity === 0) battleUnit.state = "defeated";
      battle.eventLog.push({ type: "pursuit_losses", unitId: battleUnit.sourceId, losses, survivors: battleUnit.quantity, at: this.now() });
    });
  }

  #removeHeroCommand(battle, fleeingBattleHero) {
    const team = battle.getTeamForEntity(fleeingBattleHero.id);
    team.units.filter((unit) => unit.state === "active").forEach((unit) => {
      unit.commandDisabled = true;
      unit.morale = Math.max(0, (unit.morale ?? 5) - 1);
      unit.currentOrder ??= { type: "hold" };
      battle.eventLog.push({ type: "command_lost", heroId: fleeingBattleHero.sourceId, unitId: unit.sourceId, morale: unit.morale, at: this.now() });
    });
  }

  #isOnPursuitCooldown(hero) { return hero === null || (hero.pursuitCooldownUntil ?? 0) > this.now(); }

  #destroyDefeatedEnemySource(battle) {
    if (battle.sourceLocationId === null || battle.sourceEnemyTeamId === null || battle.winnerTeamId === battle.sourceEnemyTeamId) return null;
    const location = this.getLocation(battle.sourceLocationId);
    if (location === null || location.features.battle !== true) return null;
    const attackPoints = this.setup.rules.locationMode === "casual"
      ? location.durability?.maxHealth ?? 1
      : 30 + battle.teams.find((team) => team.id === battle.winnerTeamId)?.units.reduce((sum, unit) => sum + Math.max(0, unit.quantity) * Math.max(1, unit.attack ?? 1), 0);
    const result = this.locationProgressionService.applyAttack(location, attackPoints);
    this.eventLog.push({ type: result.destroyed ? "enemy_location_destroyed" : "enemy_location_damaged", locationId: location.id, battleId: battle.id, result, at: this.now() });
    return result.destroyed ? location.id : null;
  }

  #captureDefeatedLocation(battle) {
    if (battle.sourceLocationId === null || battle.sourceEnemyTeamId === null || battle.winnerTeamId === null || battle.winnerTeamId === battle.sourceEnemyTeamId) return null;
    const location = this.getLocation(battle.sourceLocationId); const winner = battle.teams.find((team) => team.id === battle.winnerTeamId);
    const playerId = winner?.heroes.map((snapshot) => this.getHero(snapshot.sourceId)?.playerId).find(Boolean) ?? null;
    if (location === null || playerId === null || location.features.capturable !== true) return null;
    const result = this.locationCaptureService.capture({ location, playerId, relation: this.locationAccessPolicy.getRelation(playerId, location), isQuestCompleted: (id) => this.isObjectiveCompleted(id), afterBattle: true });
    if (!result.success) return null;
    location.garrison.units = [];
    this.eventLog.push({ type: "location_captured", ...result, battleId: battle.id, at: this.now() });
    return result;
  }

  findUnit(unitId) {
    for (const hero of this.heroes) {
      const unit = hero.army.getUnit(unitId);
      if (unit !== null) return unit;
    }
    for (const location of this.locations) {
      const unit = location.garrison.getUnit(unitId);
      if (unit !== null) return unit;
    }
    return null;
  }

  getPlayer(playerId) { return this.players.find((player) => player.id === playerId) ?? null; }
  getHero(heroId) { return this.heroes.find((hero) => hero.id === heroId) ?? null; }
  getLocation(locationId) { return this.locations.find((location) => location.id === locationId) ?? null; }

  getLocationForScenarioSlot(locationSlotId) {
    const binding = this.scenarioLocationBindings.find((item) => item.locationSlotId === locationSlotId);
    if (binding === undefined) throw new RangeError("L'emplacement de scénario n'est pas associé à un lieu.");
    const location = this.getLocation(binding.locationId);
    if (location === null) throw new RangeError("Le lieu associé au scénario n'existe pas.");
    return location;
  }

  toJSON() {
    return {
      setup: this.setup.toJSON(), heroClasses: [...this.heroClasses.values()].map((heroClass) => ({ ...heroClass, abilityIds: [...heroClass.abilityIds] })),
      players: this.players.map((player) => player.toJSON()), heroes: this.heroes.map((hero) => hero.toJSON()),
      locations: this.locations.map((location) => location.toJSON()), status: this.status,
      scenario: this.scenario?.toJSON() ?? null, scenarioState: this.scenarioState?.toJSON() ?? null,
      scenarioLocationBindings: this.scenarioLocationBindings.map((binding) => binding.toJSON()), eventLog: this.eventLog.map((entry) => ({ ...entry })),
      startedAt: this.startedAt, finishedAt: this.finishedAt, finishReason: this.finishReason,
      battles: this.battles.map((battle) => battle.toJSON()),
      battleReports: this.battleReports.map((report) => structuredClone(report)), rogueArmies: this.rogueArmies.map((army) => army.toJSON()),
      lootSites: this.lootSites.map((site) => site.toJSON()),
      battleSites: this.battleSites.map((site) => site.toJSON()),
    };
  }

  static #createHeroClassMap(heroClasses) {
    if (!Array.isArray(heroClasses)) throw new TypeError("Les classes de héros doivent être une liste.");
    const classes = new Map();
    heroClasses.forEach((heroClass) => {
      if (heroClass === null || Array.isArray(heroClass) || typeof heroClass !== "object") throw new TypeError("Une classe de héros doit être un objet.");
      const id = Game.#requireText(heroClass.id, "L'identifiant de classe");
      if (classes.has(id)) throw new RangeError("Les identifiants de classe doivent être uniques.");
      const name = Game.#requireText(heroClass.name, "Le nom de classe");
      const abilityIds = heroClass.abilityIds ?? [];
      if (!Array.isArray(abilityIds)) throw new TypeError("Les capacités de classe doivent être une liste.");
      const startingResources = Game.#createResourceMap(heroClass.startingResources ?? {});
      const startingUnits = Game.#createUnitStacks(heroClass.startingUnits ?? []);
      classes.set(id, { id, name, abilityIds: [...new Set(abilityIds.map((abilityId) => Game.#requireText(abilityId, "Une capacité")))], startingResources, startingUnits });
    });
    return classes;
  }

  #grantStartingForces() {
    this.players.forEach((player) => {
      const primaryHero = this.getHero(player.heroIds[0]);
      if (this.scenario !== null) {
        Object.entries(this.scenario.playerStart.resources).forEach(([resource, amount]) => { if (amount > 0) primaryHero.addResource(resource, amount); });
        this.#addStartingUnits(primaryHero, player.id, this.scenario.playerStart.unitStacks);
      }
      player.heroIds.forEach((heroId) => {
        const hero = this.getHero(heroId);
        const heroClass = this.heroClasses.get(hero.classId);
        Object.entries(heroClass.startingResources).forEach(([resource, amount]) => { if (amount > 0) hero.addResource(resource, amount); });
        this.#addStartingUnits(hero, player.id, heroClass.startingUnits);
      });
    });
  }

  #addStartingUnits(hero, playerId, stacks) {
    stacks.forEach((stack) => {
      if (hero.army.units.length >= hero.maxUnitStacks) throw new Error("Les unités de départ dépassent la capacité de commandement du héros.");
      hero.addUnit(this.recruitmentService.createUnit({ ownerPlayerId: playerId, typeId: stack.typeId, quantity: stack.quantity, idGenerator: this.idGenerator, number: this.#nextUnitNumber(playerId, stack.typeId) }));
    });
  }

  #nextUnitNumber(playerId, typeId) {
    const units = [
      ...this.heroes.flatMap((hero) => hero.army.units),
      ...this.locations.flatMap((location) => location.garrison.units),
    ].filter((unit) => unit.ownerPlayerId === playerId && unit.typeId === typeId);
    return Math.max(0, ...units.map((unit) => unit.number ?? 0)) + 1;
  }

  #extractDroppedEquipment(battle) {
    const dropped = [];
    battle.teams.flatMap((team) => team.heroes).filter((snapshot) => snapshot.state !== "active").forEach((snapshot) => {
      const hero = this.getHero(snapshot.sourceId); if (hero === null) return;
      Object.entries(hero.equipment).forEach(([slot, itemId]) => {
        if (itemId.startsWith("quest:") || itemId.startsWith("bound:")) return;
        dropped.push({ id: `equipment-${hero.id}-${slot}`, itemId, quantity: 1, portable: true, weightPerUnit: 1, valuePerUnit: 10 }); delete hero.equipment[slot];
      });
      hero.carriedLoot.forEach((entry, index) => dropped.push({ id: `carried-${hero.id}-${index}`, ...entry, portable: true }));
      hero.carriedLoot = [];
    });
    return dropped;
  }

  static #createUnitDefinitionMap(definitions) {
    if (!Array.isArray(definitions)) throw new TypeError("Les définitions d'unités doivent être une liste.");
    const result = new Map();
    definitions.forEach((definition) => { if (result.has(definition.id)) throw new RangeError("Les définitions d'unités doivent avoir des identifiants uniques."); result.set(definition.id, definition); });
    return result;
  }

  static #createResourceMap(resources) {
    if (resources === null || Array.isArray(resources) || typeof resources !== "object") throw new TypeError("Les ressources doivent être un objet.");
    return Object.fromEntries(Object.entries(resources).map(([name, amount]) => { if (!Number.isFinite(amount) || amount < 0) throw new RangeError("Une ressource doit être positive ou nulle."); return [Game.#requireText(name, "Le nom de ressource"), amount]; }));
  }

  static #createUnitStacks(stacks) {
    if (!Array.isArray(stacks)) throw new TypeError("Les unités initiales doivent être une liste.");
    return stacks.map((stack) => { if (!Number.isInteger(stack.quantity) || stack.quantity <= 0) throw new RangeError("L'effectif initial doit être positif."); return { typeId: Game.#requireText(stack.typeId, "Le type d'unité"), quantity: stack.quantity }; });
  }

  static #createLocations(locations) {
    if (!Array.isArray(locations)) throw new TypeError("Les lieux doivent être une liste.");
    return locations.map((location) => (location instanceof Location ? location : new Location(location)));
  }

  static #defaultIdGenerator(prefix) {
    if (typeof globalThis.crypto?.randomUUID === "function") return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  static #requireText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
}
