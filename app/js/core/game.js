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
import { CampImprovementService } from "./camp-improvement-service.js";
import { HeroProgressionService } from "./hero-progression-service.js";
import { classDefinitionFor } from "./hero-progression-config.js";
import { maximumAuthority, unitAuthorityCost, usedAuthority } from "./authority-system.js";
import { armySpeed, pursuitRounds } from "./army-pursuit.js";
import { InventoryService } from "./inventory-service.js";
import { EquipmentService } from "./equipment-service.js";
import { getItemDefinition } from "./item-catalog.js";
import { HeroRecoveryService } from "./hero-recovery-service.js";
import { AutonomousGroup } from "./autonomous-group.js";
import { AutonomousGroupService } from "./autonomous-group-service.js";
import { AutonomousInterceptionService } from "./autonomous-interception-service.js";
import { AutonomousGroupTrace } from "./autonomous-group-trace.js";
import { LocationChiefService } from "./location-chief-service.js";
import { ChiefTradeService } from "./chief-trade-service.js";
import { MarketService } from "./market-service.js";
import { QuestRuntime } from "./quest-runtime.js";
import { ScenarioRuntimeBuilder } from "./scenario-runtime-builder.js";
import { HeroClassFeatureService } from "./hero-class-feature-service.js";
import { distanceMeters } from "./geo.js";
import { HeroTravelExperienceService } from "./hero-travel-experience-service.js";
import { LocationDismantlingService } from "./location-dismantling-service.js";
import { ResultEvaluationService } from "./result-evaluation-service.js";

/** État actif d'une partie, indépendant de l'interface et des services navigateur. */
export class Game {
  constructor({ setup, scenario = null, scenarioLocationBindings = [], heroClasses = [], heroAptitudes = [], unitDefinitions = [], locations = [], autonomousGroups = [], autonomousGroupTraces = [], coordinateMode = "gps", scenarioStartsActive = true, now = () => Date.now(), idGenerator = Game.#defaultIdGenerator }) {
    this.setup = setup instanceof GameSetup ? setup : new GameSetup(setup);
    if (!["gps", "simulation"].includes(coordinateMode)) throw new RangeError("Le mode de coordonnées doit être gps ou simulation.");
    this.coordinateMode = coordinateMode;
    this.heroClasses = Game.#createHeroClassMap(heroClasses);
    this.heroClassFeatureService = new HeroClassFeatureService({ classDefinitions: this.heroClasses, now });
    this.heroProgressionService = new HeroProgressionService({ aptitudeDefinitions: heroAptitudes, now });
    this.heroTravelExperienceService = new HeroTravelExperienceService();
    this.unitDefinitions = Game.#createUnitDefinitionMap(unitDefinitions);
    this.recruitmentService = new RecruitmentService(this.unitDefinitions);
    this.locationAccessPolicy = new LocationAccessPolicy({ participants: this.setup.participants });
    this.locationCaptureService = new LocationCaptureService();
    this.locationProgressionService = new LocationProgressionService({ mode: this.setup.rules.locationMode });
    this.campImprovementService = new CampImprovementService({ progressionService: this.locationProgressionService });
    this.battleService = new BattleService(this.unitDefinitions, [...this.heroProgressionService.aptitudes.values()]);
    this.battleConsequenceService = new BattleConsequenceService();
    this.lootDistributionService = new LootDistributionService();
    this.inventoryService = new InventoryService({ idGenerator });
    this.equipmentService = new EquipmentService();
    this.heroRecoveryService = new HeroRecoveryService();
    this.locationChiefService = new LocationChiefService();
    this.chiefTradeService = new ChiefTradeService();
    this.marketService = new MarketService();
    this.locationDismantlingService = new LocationDismantlingService();
    this.resultEvaluationService = new ResultEvaluationService();
    this.evacuationStates = {};
    this.availableQuests = [];
    this.questSequence = [];
    this.lastQuestResult = null;
    this.engagementService = new EngagementService({ engagementRadiusMeters: this.setup.rules.engagementRadiusMeters, fleeConfirmations: this.setup.rules.fleeConfirmations });
    this.scenario = scenario === null ? null : (scenario instanceof Scenario ? scenario : new Scenario(scenario));
    if (this.scenario !== null && this.scenario.id !== this.setup.scenarioId) throw new RangeError("Le scénario ne correspond pas au GameSetup.");
    this.scenarioState = this.scenario === null ? null : new ScenarioState(this.scenario, { startsActive: scenarioStartsActive });
    this.locations = Game.#createLocations(locations, this.unitDefinitions);
    this.locations.forEach((location) => { this.locationProgressionService.initialize(location); this.campImprovementService.applyEffects(location); });
    this.scenarioLocationBindings = this.scenario === null
      ? []
      : ScenarioLocationBinding.validateAll(scenarioLocationBindings, this.scenario, this.locations);
    this.scenarioEffectResolver = new ScenarioEffectResolver();
    this.questRuntime = new QuestRuntime();
    this.scenarioRuntimeBuilder = new ScenarioRuntimeBuilder();
    this.scenarioRuntime = this.scenarioRuntimeBuilder.build({ scenario: this.scenario, setup: this.setup, bindings: this.scenarioLocationBindings, locations: this.locations });
    Object.values(this.scenarioRuntime?.placements ?? {}).filter((placement) => placement.status === "placed").forEach((placement) => {
      this.updateLocationPosition({ locationId: placement.locationId, position: placement.position });
    });
    this.eventLog = [];
    this.activeScenarioEventId = null;
    this.now = now;
    this.idGenerator = idGenerator;
    this.autonomousGroupService = new AutonomousGroupService({
      idGenerator,
      interceptionService: new AutonomousInterceptionService({ engagementRadiusMeters: this.setup.rules.engagementRadiusMeters, minimumReactionMs: this.setup.rules.autonomousReactionMinimumSeconds * 1000 }),
    });
    this.players = this.setup.participants.map((participant) => new Player({ id: participant.playerId, name: participant.name }));
    this.heroes = [];
    this.status = "preparing";
    this.startedAt = null;
    this.finishedAt = null;
    this.finishReason = null;
    this.battles = [];
    this.battleReports = [];
    if (!Array.isArray(autonomousGroups)) throw new TypeError("Les groupes autonomes doivent être une liste.");
    this.autonomousGroups = [];
    autonomousGroups.forEach((group) => this.addAutonomousGroup(group));
    if (!Array.isArray(autonomousGroupTraces)) throw new TypeError("Les traces de groupes autonomes doivent être une liste.");
    this.autonomousGroupTraces = autonomousGroupTraces.map((trace) => trace instanceof AutonomousGroupTrace ? trace : new AutonomousGroupTrace(trace));
    this.battleLoot = [];
    this.battleSites = [];
  }

  chooseHero(playerId, { name, classId, appearanceId = null, firstAptitudeId = null }) {
    if (this.status !== "preparing") throw new Error("Le héros ne peut être choisi qu'avant le démarrage.");
    const player = this.getPlayer(playerId);
    if (player === null) throw new RangeError("Le joueur n'appartient pas à cette partie.");
    if (player.heroIds.length >= this.setup.rules.maxHeroesPerPlayer) return null;
    const heroClass = this.heroClasses.get(classId);
    if (heroClass === undefined) throw new RangeError("La classe de héros n'existe pas.");

    const hero = new Hero({
      id: this.idGenerator("hero"), playerId: player.id, name, classId,
      skillIds: heroClass.abilityIds, baseStats: heroClass.baseStats, maxHealth: heroClass.baseStats.health,
      maxCommandPoints: heroClass.baseStats.command, commandPoints: heroClass.baseStats.command, appearanceId,
    });
    this.heroProgressionService.initializeHero(hero, heroClass);
    if (firstAptitudeId !== null && [...heroClass.aptitudeIds, ...heroClass.commonAptitudeIds].includes(firstAptitudeId)) { hero.aptitudeRanks[firstAptitudeId] = "novice"; const aptitude = this.heroProgressionService.aptitudes.get(firstAptitudeId); if (["active", "reaction"].includes(aptitude?.type)) hero.addSpecialPower(firstAptitudeId); else hero.addSkill(firstAptitudeId); }
    this.heroes.push(hero);
    player.addHero(hero.id);
    return hero;
  }

  gainHeroExperience({ heroId, amount, source }) {
    const hero = this.getHero(heroId); if (hero === null) throw new RangeError("Le héros n'existe pas.");
    return this.heroProgressionService.addExperience(hero, amount, source, this.heroClasses.get(hero.classId));
  }

  recordHeroTravel({ heroId, position, accuracy = position?.accuracy ?? 0 }) {
    const hero = this.getHero(heroId); if (hero === null) throw new RangeError("Le héros n'existe pas.");
    const travel = this.heroTravelExperienceService.record(hero, position, { accuracy });
    if (travel.experienceGained > 0) travel.progression = this.gainHeroExperience({ heroId, amount: travel.experienceGained, source: "travel:gps" });
    return travel;
  }

  selectHeroLevelUp({ heroId, pendingId, upgradeId }) {
    const hero = this.getHero(heroId); if (hero === null) return { success: false, reason: "hero_not_found" };
    return this.heroProgressionService.selectUpgrade(hero, pendingId, upgradeId);
  }

  levelUpHero({ heroId }) {
    const hero = this.getHero(heroId); if (hero === null) return { success: false, reason: "hero_not_found" };
    if (this.#isHeroBusy(hero.id)) return { success: false, reason: "hero_busy" };
    return this.heroProgressionService.levelUp(hero, this.heroClasses.get(hero.classId));
  }

  getHeroAuthority(heroId) {
    const hero = this.getHero(heroId); if (hero === null) return null;
    const maximum = maximumAuthority(hero, this.heroClasses.get(hero.classId)); const used = usedAuthority(hero, this.unitDefinitions);
    return { used, maximum, remaining: maximum - used };
  }

  getUnitAuthorityCost(unit, rankId = unit.rank) { return unitAuthorityCost(unit, this.unitDefinitions, rankId); }

  promoteUnit({ heroId, unitId }) {
    const hero = this.getHero(heroId); if (hero === null) return { success: false, reason: "hero_not_found" };
    if (this.#isHeroBusy(hero.id)) return { success: false, reason: "hero_busy" };
    const unit = hero.army.getUnit(unitId); if (unit === null) return { success: false, reason: "unit_not_found" };
    if (!unit.canPromote) return { success: false, reason: "insufficient_experience" };
    const currentCost = this.getUnitAuthorityCost(unit); const nextCost = this.getUnitAuthorityCost(unit, unit.nextRank.id); const authority = this.getHeroAuthority(hero.id);
    if (authority.used - currentCost + nextCost > authority.maximum) return { success: false, reason: "insufficient_authority", required: nextCost - currentCost, authority };
    const previousRank = unit.rank; unit.promote(unit.nextRank.id);
    this.eventLog.push({ type: "unit_promoted", heroId: hero.id, unitId: unit.id, previousRank, rank: unit.rank, authorityCost: nextCost, at: this.now() });
    return { success: true, previousRank, rank: unit.rank, level: unit.level, authority: this.getHeroAuthority(hero.id) };
  }

  getHeroProgress(heroId) { const hero = this.getHero(heroId); return hero === null ? null : this.heroProgressionService.getProgress(hero); }

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
    if (this.status === "started") this.advanceAutonomousGroups(this.now());
    if (this.status === "started") this.locations.forEach((location) => this.locationDismantlingService.completeReady(location, this.now()).forEach((result) => this.eventLog.push({ type: "location_structure_dismantled", locationId: location.id, ...result, at: this.now() })));
    if (this.status === "started") this.#failExpiredQuestDeadline();
    this.cleanupDynamicSites();
  }

  advanceAutonomousGroups(now = this.now()) {
    const targets = this.heroes.filter((hero) => hero.state === "active" && hero.position !== null).map((hero) => ({ id: hero.id, kind: "hero", playerId: hero.playerId, position: hero.position, hostile: true, concealmentMultiplier: this.heroClassFeatureService.signatureMultiplier(hero) }));
    const result = this.autonomousGroupService.advance({ groups: this.autonomousGroups, locations: this.locations, targets, playArea: this.setup.playArea, now, speedFor: (group) => this.#autonomousGroupSpeed(group) });
    this.autonomousGroupTraces.push(...result.traces);
    this.autonomousGroupTraces = this.autonomousGroupTraces.filter((trace) => trace.getScore(now) > 0);
    result.events.forEach((event) => {
      const battle = this.#createBattleFromAutonomousEvent(event);
      if (battle !== null) event.battleId = battle.id;
      this.eventLog.push(structuredClone(event));
    });
    return result;
  }

  resolveAutonomousInterception({ groupId, action = "intercept", now = this.now() }) {
    const group = this.getAutonomousGroup(groupId);
    if (group === null) return { success: false, reason: "group_not_found" };
    const result = this.autonomousGroupService.resolveInterception(group, { action, now });
    if (!result.success) return result;
    if (result.trace !== null) this.autonomousGroupTraces.push(result.trace);
    const event = { type: result.outcome === "battle_requested" ? "autonomous_group_attack_requested" : `autonomous_group_${result.outcome}`, groupId, target: result.target, information: result.information, cargo: result.cargo, at: result.at };
    if (result.information !== null) {
      const interceptor = result.target.kind === "hero" ? this.getHero(result.target.id) : null;
      const player = interceptor === null ? null : this.getPlayer(interceptor.playerId);
      if (player !== null) {
        const informationId = this.idGenerator("information");
        player.receiveInformation({ id: informationId, source: { type: "autonomous_group_interception", groupId, heroId: interceptor.id }, content: structuredClone(result.information), acquiredAt: result.at });
        this.#applyInformationMapEffects(player, result.information.mapEffects ?? result.information.content?.mapEffects ?? []);
        event.informationId = informationId;
      }
    }
    const battle = this.#createBattleFromAutonomousEvent(event);
    if (battle !== null) event.battleId = battle.id;
    this.eventLog.push(structuredClone(event));
    return { ...result, event };
  }

  prepareHeroAmbush({ playerId, heroId, unitId, position = null, radius = null, durationMs = null }) {
    const hero = this.getHero(heroId); const player = this.getPlayer(playerId);
    if (hero === null || player === null || hero.playerId !== player.id) return { success: false, reason: "hero_not_found" };
    const features = this.heroClassFeatureService.featuresFor(hero);
    if (features.canPrepareAmbush !== true) return { success: false, reason: "class_cannot_prepare_ambush" };
    if (hero.state !== "active" || this.#isHeroBusy(hero.id)) return { success: false, reason: "hero_unavailable" };
    const unit = hero.army.getUnit(unitId); const ambushPosition = position ?? hero.position;
    if (unit === null) return { success: false, reason: "unit_not_found" };
    if (!ambushPosition) return { success: false, reason: "hero_position_unknown" };
    const now = this.now(); const ambushRadius = radius ?? features.ambushRadius ?? 75; const ambushDuration = durationMs ?? features.ambushDurationMs ?? 1_800_000;
    if (!Number.isFinite(ambushRadius) || ambushRadius <= 0 || !Number.isFinite(ambushDuration) || ambushDuration <= 0) return { success: false, reason: "invalid_ambush_configuration" };
    hero.removeUnit(unit.id);
    const group = new AutonomousGroup({ id: this.idGenerator("hero-ambush"), type: "army", owner: { kind: "player", id: player.id }, position: ambushPosition, status: "ambushing", behavior: "aggressive", army: { units: [unit] }, detectionMultiplier: this.heroClassFeatureService.detectionMultiplier(hero), concealmentMultiplier: this.heroClassFeatureService.signatureMultiplier(hero), ambush: { radiusMeters: ambushRadius, startedAt: now, expiresAt: now + ambushDuration }, history: [{ type: "hero_ambush_prepared", heroId: hero.id, at: now }] });
    this.autonomousGroups.push(group); this.eventLog.push({ type: "hero_ambush_prepared", heroId: hero.id, unitId: unit.id, groupId: group.id, at: now });
    return { success: true, groupId: group.id, unitId: unit.id, expiresAt: now + ambushDuration };
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

  startScenarioRuntime(position) {
    if (this.scenario !== null && this.scenarioState?.getCurrentPhaseState().status === "locked") {
      this.scenarioState.activateOfferedPhase(this.scenario, this.scenario.initialPhaseId);
      this.eventLog.push({ type: "scenario_started", phaseId: this.scenario.initialPhaseId, at: this.now() });
    }
    if (this.scenarioState?.getCurrentPhaseState().status !== "active") return [];
    const slotIds = this.scenarioRuntimeBuilder.start(this.scenarioRuntime, position, this.scenarioState?.currentPhaseId ?? null);
    if (slotIds.length > 0) this.eventLog.push({ type: "scenario_placement_started", slotIds, position: { ...position }, at: this.now() });
    return slotIds;
  }

  startCurrentScenarioPlacements(position) {
    return this.scenarioRuntimeBuilder.start(this.scenarioRuntime, position, this.scenarioState?.currentPhaseId ?? null);
  }

  updateScenarioPosition({ position, accuracy = null }) {
    if (!this.setup.playArea.contains(position)) return [];
    this.scenarioRuntimeBuilder.start(this.scenarioRuntime, position, this.scenarioState?.currentPhaseId ?? null);
    return this.scenarioRuntimeBuilder.update(this.scenarioRuntime, { position, accuracy });
  }

  placeScenarioLocation({ locationSlotId, position }) {
    if (!this.setup.playArea.contains(position)) return { success: false, reason: "outside_play_area" };
    const result = this.scenarioRuntimeBuilder.place(this.scenarioRuntime, locationSlotId, position);
    if (!result.success) return result;
    const moved = this.updateLocationPosition({ locationId: result.locationId, position: result.position });
    if (!moved.success) return moved;
    const location = this.getLocation(result.locationId);
    this.eventLog.push({ type: "scenario_location_placed", locationSlotId, locationId: location.id, position: { ...result.position }, at: this.now() });
    const quest = this.dispatchQuestEvent({ type: "LocationPlaced", locationSlotId, locationId: location.id });
    return { ...result, quest };
  }

  updateLocationPosition({ locationId, position }) {
    if (!this.setup.playArea.contains(position)) return { success: false, reason: "outside_play_area" };
    const location = this.getLocation(locationId);
    if (location === null) return { success: false, reason: "location_not_found" };
    location.position = { latitude: position.latitude, longitude: position.longitude };
    const binding = this.scenarioLocationBindings.find((candidate) => candidate.locationId === locationId);
    const placement = binding ? this.scenarioRuntime?.placements[binding.locationSlotId] : null;
    if (placement?.status === "placed") placement.position = { ...location.position };
    return { success: true, locationId, position: { ...location.position } };
  }

  dispatchQuestEvent(event) {
    return this.questRuntime.dispatch(event, this);
  }

  getActiveQuest() {
    if (this.scenario === null || this.scenarioState === null) return null;
    const phase = this.scenario.getPhase(this.scenarioState.currentPhaseId);
    const state = this.scenarioState.getCurrentPhaseState();
    if (state.status !== "active") return null;
    return { ...phase, status: state.status, failureReason: state.failureReason ?? null, objectives: state.objectives.map((objective) => ({ ...objective })) };
  }

  completeCurrentScenarioPhase() { return this.scenarioState?.completeCurrentPhase() ?? false; }

  configureQuestSequence(quests) {
    if (this.scenario === null || !Array.isArray(quests) || quests.length < 1) throw new RangeError("La séquence exige au moins une quête.");
    const usedPhaseIds = new Set();
    this.questSequence = quests.map((quest) => {
      if (!quest?.id || !quest?.startPhaseId || !Array.isArray(quest.phaseIds) || !quest.phaseIds.includes(quest.startPhaseId)) throw new TypeError("Une quête de la séquence est invalide.");
      quest.phaseIds.forEach((phaseId) => {
        if (this.scenario.getPhase(phaseId) === null || usedPhaseIds.has(phaseId)) throw new RangeError("Les phases du cycle doivent exister et appartenir à une seule quête.");
        usedPhaseIds.add(phaseId);
      });
      return { id: quest.id, title: quest.title ?? quest.id, description: quest.description ?? "Nouvelle quête disponible.", briefingLines: Array.isArray(quest.briefingLines) ? [...quest.briefingLines] : [], startPhaseId: quest.startPhaseId, phaseIds: [...quest.phaseIds] };
    });
    return this.questSequence.map((quest) => ({ ...quest, phaseIds: [...quest.phaseIds] }));
  }

  advanceQuestSequence({ outcome = "completed" } = {}) {
    if (this.questSequence.length < 1 || this.scenario === null || this.scenarioState === null) return null;
    const currentIndex = this.questSequence.findIndex((quest) => quest.phaseIds.includes(this.scenarioState.currentPhaseId));
    if (currentIndex < 0) return null;
    const current = this.questSequence[currentIndex]; const next = this.questSequence[currentIndex + 1] ?? null;
    if (next) this.offerQuest(next);
    this.lastQuestResult = { questId: current.id, title: current.title, outcome, nextQuestId: next?.id ?? null, at: this.now() };
    const result = { type: "quest_sequence_advanced", questId: current.id, nextQuestId: next?.id ?? null, nextPhaseId: null, outcome, at: this.now() };
    this.eventLog.push(result); return result;
  }

  settleQuestSequenceTerminalPhase() {
    const phase = this.scenario?.getPhase(this.scenarioState?.currentPhaseId);
    if (!phase || phase.objectives.length > 0 || phase.transitions.length > 0 || this.scenarioState.getCurrentPhaseState().status !== "active") return null;
    if (!this.completeCurrentScenarioPhase()) return null;
    return this.advanceQuestSequence({ outcome: "completed" });
  }

  offerQuest({ id, title, description, startPhaseId, briefingLines = [] }) {
    if (this.scenario?.getPhase(startPhaseId) === null || this.availableQuests.some((quest) => quest.id === id)) return false;
    this.availableQuests.push({ id, title, description, startPhaseId, briefingLines: Array.isArray(briefingLines) ? [...briefingLines] : [] }); this.eventLog.push({ type: "quest_available", questId: id, startPhaseId, at: this.now() }); return true;
  }

  getAvailableQuests() { return this.availableQuests.map((quest) => ({ ...quest, briefingLines: [...quest.briefingLines] })); }

  getLastQuestResult() { return this.lastQuestResult === null ? null : { ...this.lastQuestResult }; }

  acceptAvailableQuest(questId) {
    const index = this.availableQuests.findIndex((quest) => quest.id === questId); if (index < 0) return { success: false, reason: "quest_not_available" };
    const quest = this.availableQuests[index]; const sequenceQuest = this.questSequence.find((candidate) => candidate.id === questId);
    if (this.scenarioState.getCurrentPhaseState().status === "active") return { success: false, reason: "another_quest_active" };
    const activated = sequenceQuest ? this.scenarioState.restartPhases(this.scenario, sequenceQuest) : this.scenarioState.activateOfferedPhase(this.scenario, quest.startPhaseId);
    if (!activated) return { success: false, reason: "another_quest_active" };
    if (sequenceQuest) {
      const placementSlotIds = new Set(sequenceQuest.phaseIds.flatMap((phaseId) => this.scenario.getPhase(phaseId).objectives).filter((objective) => objective.trigger?.type === "locationPlaced").map((objective) => objective.trigger.locationSlotId));
      placementSlotIds.forEach((slotId) => { const placement = this.scenarioRuntime?.placements[slotId]; if (placement?.strategy === "distance") { placement.status = "waiting"; placement.origin = null; placement.position = null; placement.distanceMeters = 0; placement.confirmationCount = 0; } });
    }
    this.lastQuestResult = null;
    this.availableQuests.splice(index, 1); this.eventLog.push({ type: "quest_accepted", questId, phaseId: quest.startPhaseId, at: this.now() }); return { success: true, quest: { ...quest } };
  }

  abandonCurrentQuest() { return this.failCurrentQuest({ reason: "abandoned" }); }

  failCurrentQuest({ reason = "failed" } = {}) {
    if (this.scenario === null || this.scenarioState === null || this.scenarioState.getCurrentPhaseState().status !== "active") return null;
    const phase = this.scenario.getPhase(this.scenarioState.currentPhaseId); const failure = phase.failure;
    const isSequencedQuest = this.questSequence.some((quest) => quest.phaseIds.includes(phase.id));
    let nextPhaseId = isSequencedQuest ? null : failure.policy === "branch" ? failure.nextPhase : failure.policy === "continue" ? (failure.nextPhase ?? phase.transitions[0]?.nextPhase ?? null) : null;
    const appliedEvent = failure.eventId ? this.triggerScenarioEvent(failure.eventId) : null;
    if (!this.scenarioState.failCurrentPhase(this.scenario, { reason, nextPhaseId, at: this.now() })) return null;
    const sequence = isSequencedQuest ? this.advanceQuestSequence({ outcome: reason }) : null;
    if (sequence) nextPhaseId = sequence.nextPhaseId;
    const result = { type: "quest_failed", phaseId: phase.id, reason, policy: failure.policy, nextPhaseId, nextQuestId: sequence?.nextQuestId ?? null, appliedEvent, at: this.now() }; this.eventLog.push(result); return result;
  }

  getQuestInteractionsForLocation(locationId) {
    const active = this.getActiveQuest();
    if (active === null) return [];
    const binding = this.scenarioLocationBindings.find((candidate) => candidate.locationId === locationId);
    if (binding === undefined) return [];
    return active.objectives.filter((objective) => objective.state === "active" && ["interactionCompleted", "resourceDelivery", "resourceCollection"].includes(objective.trigger?.type) && objective.trigger.locationSlotId === binding.locationSlotId).map((objective) => ({ interactionId: objective.trigger.interactionId, label: objective.trigger.label ?? objective.text, responseLines: Array.isArray(objective.trigger.responseLines) ? [...objective.trigger.responseLines] : [] }));
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

  getCampDevelopment(locationId) {
    const location = this.getLocation(locationId);
    if (location === null || location.type !== "camp") return null;
    return { ...this.campImprovementService.getState(location), levelUp: this.campImprovementService.getLevelUpStatus(location), experience: location.progression.experience, experienceRequired: this.locationProgressionService.getExperienceRequired(location) };
  }

  gainLocationExperience({ locationId, amount, source = "activity" }) {
    const location = this.getLocation(locationId);
    if (location === null) return { success: false, reason: "location_not_found" };
    return { success: true, ...this.locationProgressionService.awardExperience(location, amount, source) };
  }

  buildCampImprovement({ playerId, heroId, locationId, improvementId }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (this.getLocationRelation(player.id, location.id) !== "owned") return { success: false, reason: "location_not_owned" };
    const result = this.campImprovementService.build(location, improvementId);
    if (result.success) this.eventLog.push({ type: "camp_improvement_built", playerId, heroId, locationId, improvementId, level: result.level, at: this.now() });
    return result;
  }

  levelUpCamp({ playerId, heroId, locationId }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (this.getLocationRelation(player.id, location.id) !== "owned") return { success: false, reason: "location_not_owned" };
    const result = this.campImprovementService.levelUp(location);
    if (result.success) this.eventLog.push({ type: "camp_level_up", playerId, heroId, locationId, level: location.level, at: this.now() });
    return result;
  }

  canPerformLocationAction({ playerId, locationId, action }) {
    const location = this.getLocation(locationId);
    if (location === null) return false;
    const temporarilyAuthorized = ["manageReserves", "dismantle"].includes(action) && this.#canOperateEvacuationSource(playerId, locationId);
    if (!temporarilyAuthorized && !this.locationAccessPolicy.can(playerId, location, action)) return false;
    if (action === "attack" && location.features.capturable === true) return ["battle_required", "can_capture"].includes(this.getLocationCaptureRequirement({ playerId, locationId }).state);
    return true;
  }

  getLocationChiefConversation({ playerId, locationId }) {
    const location = this.getLocation(locationId); if (location === null || !this.locationAccessPolicy.can(playerId, location, "talkChief")) return null;
    return this.locationChiefService.getConversation({ location, canTrade: this.locationAccessPolicy.can(playerId, location, "trade"), currentPhaseId: this.scenarioState?.currentPhaseId ?? null, currentPhaseStatus: this.scenarioState?.getCurrentPhaseState().status ?? null, isObjectiveCompleted: (id) => this.isObjectiveCompleted(id) });
  }

  selectLocationChiefOption({ playerId, heroId, locationId, optionId }) {
    const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (hero === null || location === null || hero.playerId !== playerId || !location.heroIds.includes(hero.id) || !this.locationAccessPolicy.can(playerId, location, "talkChief")) return { success: false, reason: "chief_unavailable" };
    const result = optionId.startsWith("trade-offer:") ? this.chiefTradeService.execute({ hero, location, offerId: optionId.slice("trade-offer:".length) }) : this.locationChiefService.select({ location, optionId, canTrade: this.locationAccessPolicy.can(playerId, location, "trade"), currentPhaseId: this.scenarioState?.currentPhaseId ?? null, currentPhaseStatus: this.scenarioState?.getCurrentPhaseState().status ?? null, isObjectiveCompleted: (id) => this.isObjectiveCompleted(id) });
    if (result.success && optionId.startsWith("trade-offer:")) { result.kind = "trade_offer"; result.message = `Échange conclu. Il reste ${result.remaining} troc(s).`; result.lines = [result.message]; }
    if (result.success) this.eventLog.push({ type: "location_chief_interaction", playerId, heroId, locationId, optionId, kind: result.kind, at: this.now() });
    return result;
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
    const preview = { typeId: unitTypeId, rank: "soldier" };
    const authority = this.getHeroAuthority(hero.id);
    if (authority.used + this.getUnitAuthorityCost(preview) > authority.maximum) return { success: false, reason: "insufficient_authority", authority };
    return this.recruitmentService.recruit({ player, hero, location, typeId: unitTypeId, idGenerator: this.idGenerator, number: this.#nextUnitNumber(player.id, unitTypeId) });
  }

  completeHeroUnits({ playerId, heroId, locationId }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id) return { success: false, reason: "invalid_reinforcement_request", reinforced: [] };
    if (!this.locationAccessPolicy.can(player.id, location, "reinforce")) return { success: false, reason: "location_access_denied", reinforced: [] };
    const result = this.recruitmentService.completeUnits({ hero, location });
    const added = result.reinforced.reduce((sum, unit) => sum + unit.added, 0);
    if (result.success && location.type === "camp" && added > 0) this.locationProgressionService.awardExperience(location, added / 5, "reinforcement");
    return result;
  }

  healHeroUnits({ playerId, heroId, locationId, timeUnits = 1 }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || hero.state !== "active" || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location", restoredHealth: 0 };
    if (!this.locationAccessPolicy.can(player.id, location, "heal")) return { success: false, reason: "location_access_denied", restoredHealth: 0 };
    if (!Number.isInteger(timeUnits) || timeUnits <= 0) return { success: false, reason: "invalid_time", restoredHealth: 0 };
    const units = hero.army.units.map((unit) => ({ unitId: unit.id, ...unit.heal(timeUnits) })).filter((result) => result.restoredHealth > 0);
    const restoredHealth = units.reduce((sum, result) => sum + result.restoredHealth, 0);
    if (restoredHealth > 0 && location.type === "camp") this.locationProgressionService.awardExperience(location, restoredHealth / 20, "healing");
    return restoredHealth > 0 ? { success: true, timeUnits, restoredHealth, units } : { success: false, reason: "no_wounded_soldiers", restoredHealth: 0, units: [] };
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

  transferLocationResource({ playerId, heroId, locationId, resourceName, amount, direction }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (!this.#canManageLocationReserves(player.id, location.id)) return { success: false, reason: "location_not_owned" };
    const requested = Number(amount);
    if (!Number.isFinite(requested) || requested <= 0) return { success: false, reason: "invalid_amount" };
    let transferred = 0;
    if (direction === "to_location") {
      const available = Math.min(requested, hero.getResourceAmount(resourceName));
      if (available <= 0) return { success: false, reason: "nothing_to_deposit" };
      transferred = location.depositResource(resourceName, available);
      if (transferred > 0) hero.spendResource(resourceName, transferred);
    } else if (direction === "to_hero") {
      const portable = this.#heroResourceCapacity(hero, resourceName, requested);
      transferred = Math.min(portable, location.resources.stock[resourceName] ?? 0);
      if (transferred > 0) { location.resources.stock[resourceName] -= transferred; hero.addResource(resourceName, transferred); }
    } else return { success: false, reason: "invalid_direction" };
    if (transferred <= 0) return { success: false, reason: direction === "to_location" ? "nothing_to_deposit" : "empty_stock" };
    const contentmentDelta = Math.min(5, Math.max(1, Math.ceil(transferred / 10))) * (direction === "to_location" ? 1 : -1);
    const contentment = location.adjustContentment(contentmentDelta);
    this.eventLog.push({ type: "location_reserve_transfer", playerId, heroId, locationId, resourceName, direction, amount: transferred, contentmentDelta: contentment === null ? 0 : contentmentDelta, at: this.now() });
    return { success: true, resourceName, direction, transferred, contentmentDelta: contentment === null ? 0 : contentmentDelta, contentment };
  }

  transferLocationProduction({ playerId, heroId, locationId, resourceName, amount, destination }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (!this.#canManageLocationReserves(player.id, location.id)) return { success: false, reason: "location_not_owned" };
    if (!["hero", "universal"].includes(destination)) return { success: false, reason: "invalid_destination" };
    const requested = Number(amount);
    const portable = destination === "hero" ? this.#heroResourceCapacity(hero, resourceName, requested) : requested;
    if (destination === "hero" && portable <= 0) return { success: false, reason: "insufficient_slots" };
    const transferred = location.transferProductionResource(resourceName, portable, destination);
    if (transferred <= 0) return { success: false, reason: destination === "universal" ? "universal_storage_full" : "empty_production_stock" };
    if (destination === "hero") hero.addResource(resourceName, transferred);
    this.eventLog.push({ type: "location_production_transfer", playerId, heroId, locationId, resourceName, destination, amount: transferred, at: this.now() });
    return { success: true, resourceName, destination, transferred };
  }

  preparePopulationPackages({ playerId, heroId, locationId, people }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId); const amount = Number(people);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (!this.#canManageLocationReserves(player.id, location.id)) return { success: false, reason: "location_not_owned" };
    if (!Number.isInteger(amount) || amount <= 0 || (location.population ?? 0) <= 0) return { success: false, reason: "invalid_population_amount" };
    const requested = Math.min(5, amount, location.population); const stored = location.depositResource("population", requested);
    if (stored <= 0) return { success: false, reason: "universal_storage_full" };
    location.removePopulation(stored);
    this.eventLog.push({ type: "population_packaged", playerId, heroId, locationId, people: stored, at: this.now() });
    return { success: true, people: stored, population: location.population, storageSlotCapacity: location.storageSlotCapacity };
  }

  takeLocationPopulationPackage({ playerId, heroId, locationId, people = 5 }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (!this.#canManageLocationReserves(player.id, location.id)) return { success: false, reason: "location_not_owned" };
    const amount = Math.min(5, Number(people), location.resources.stock.population ?? 0); if (amount <= 0) return { success: false, reason: "empty_stock" };
    const freeSlots = hero.bagSlotCount - this.inventoryService.getUsedHeroBagSlots(hero); if (freeSlots < 1) return { success: false, reason: "insufficient_slots" };
    location.resources.stock.population -= amount; hero.addCarriedLoot([{ id: this.idGenerator("population"), itemId: "population", quantity: amount, valuePerUnit: 1, metadata: { originLocationId: location.id } }]);
    return { success: true, people: amount };
  }

  assignWagons({ playerId, heroId, wagons }) {
    const hero = this.getHero(heroId); if (hero === null || hero.playerId !== playerId || !Array.isArray(wagons)) return { success: false, reason: "invalid_request" };
    const ids = new Set(hero.wagons.map((wagon) => wagon.id));
    for (const wagon of wagons) { if (!wagon?.id || ids.has(wagon.id) || !Number.isInteger(wagon.slotBonus) || wagon.slotBonus <= 0) return { success: false, reason: "invalid_wagon" }; ids.add(wagon.id); hero.wagons.push({ id: wagon.id, name: wagon.name ?? "Chariot", slotBonus: wagon.slotBonus }); }
    this.eventLog.push({ type: "hero_wagons_assigned", playerId, heroId, wagonIds: wagons.map((wagon) => wagon.id), addedSlots: wagons.reduce((sum, wagon) => sum + wagon.slotBonus, 0), at: this.now() });
    return { success: true, wagons: hero.wagons.map((wagon) => ({ ...wagon })), slotCapacity: hero.bagSlotCount };
  }

  startLocationDismantling({ playerId, heroId, locationId, structureId }) {
    const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (hero === null || location === null || hero.playerId !== playerId || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(playerId, location, "dismantle") && !this.#canOperateEvacuationSource(playerId, locationId)) return { success: false, reason: "location_not_owned" };
    const result = this.locationDismantlingService.start(location, structureId, this.now());
    if (result.success) this.eventLog.push({ type: "location_dismantling_started", locationId, heroId, structureId, completesAt: result.task.deadline.expiresAt, at: this.now() });
    return result;
  }

  organizeLocationEvacuation({ playerId, heroId, locationId }) {
    const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (hero === null || location === null || hero.playerId !== playerId || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (!this.#canOperateEvacuationSource(playerId, locationId)) return { success: false, reason: "evacuation_not_authorized" };
    const people = (location.population ?? 0) + (location.resources.stock.population ?? 0);
    const requiredSlots = Math.ceil(people / 5); const freeSlots = hero.bagSlotCount - this.inventoryService.getUsedHeroBagSlots(hero);
    if (freeSlots < requiredSlots) return { success: false, reason: "insufficient_slots", requiredSlots, freeSlots };
    while ((location.population ?? 0) > 0) {
      const prepared = this.preparePopulationPackages({ playerId, heroId, locationId, people: Math.min(5, location.population) });
      if (!prepared.success) return { success: false, reason: prepared.reason };
    }
    let evacuatedPeople = 0;
    while ((location.resources.stock.population ?? 0) > 0) {
      const taken = this.takeLocationPopulationPackage({ playerId, heroId, locationId, people: 5 });
      if (!taken.success) return { success: false, reason: taken.reason, evacuatedPeople };
      evacuatedPeople += taken.people;
    }
    const dismantlings = Object.keys(location.infrastructure).filter((structureId) => !location.dismantlings.some((task) => task.structureId === structureId)).map((structureId) => this.startLocationDismantling({ playerId, heroId, locationId, structureId })).filter((result) => result.success).map((result) => result.task);
    this.eventLog.push({ type: "location_evacuation_organized", playerId, heroId, locationId, people: evacuatedPeople, structures: dismantlings.map((task) => task.structureId), at: this.now() });
    return { success: true, people: evacuatedPeople, dismantlings };
  }

  settlePopulationPackage({ playerId, heroId, locationId, packageId }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(player.id, location, "manageReserves")) return { success: false, reason: "location_not_owned" };
    const index = hero.carriedLoot.findIndex((entry) => entry.id === packageId && entry.itemId === "population");
    if (index === -1) return { success: false, reason: "population_package_not_found" };
    const [entry] = hero.carriedLoot.splice(index, 1); location.addPopulation(entry.quantity);
    this.eventLog.push({ type: "population_settled", playerId, heroId, locationId, people: entry.quantity, packageId, at: this.now() });
    return { success: true, people: entry.quantity, population: location.population, storageSlotCapacity: location.storageSlotCapacity };
  }

  #canManageLocationReserves(playerId, locationId) {
    const location = this.getLocation(locationId);
    return location !== null && (this.locationAccessPolicy.can(playerId, location, "manageReserves") || this.#canOperateEvacuationSource(playerId, locationId));
  }

  #canOperateEvacuationSource(playerId, locationId) {
    if (this.getPlayer(playerId) === null || !["defend-evacuation-camp", "prepare-evacuation"].includes(this.scenarioState?.currentPhaseId)) return false;
    return Object.values(this.evacuationStates).some((state) => state.playerId === playerId && state.sourceLocationId === locationId && state.departedAt === null && state.completedAt === undefined);
  }

  #failExpiredQuestDeadline() {
    const expired = Object.values(this.evacuationStates).find((state) => state.completedAt === undefined && state.failedAt === undefined && this.now() >= state.expiresAt);
    if (!expired) return null;
    expired.failedAt = this.now();
    return this.failCurrentQuest({ reason: "deadline_expired" });
  }

  equipHeroItem({ playerId, heroId, packageId, slot = null }) {
    const hero = this.getHero(heroId); if (hero === null || hero.playerId !== playerId) return { success: false, reason: "hero_not_found" };
    if (this.#isHeroBusy(hero.id)) return { success: false, reason: "hero_busy" };
    const result = this.equipmentService.equip(hero, packageId, slot);
    if (result.success) this.eventLog.push({ type: "hero_item_equipped", playerId, heroId, packageId, slot: result.slot, itemId: result.itemId, at: this.now() });
    return result;
  }

  unequipHeroItem({ playerId, heroId, slot }) {
    const hero = this.getHero(heroId); if (hero === null || hero.playerId !== playerId) return { success: false, reason: "hero_not_found" };
    if (this.#isHeroBusy(hero.id)) return { success: false, reason: "hero_busy" };
    const freeSlots = hero.bagSlotCount - this.inventoryService.getUsedHeroBagSlots(hero);
    const result = this.equipmentService.unequip(hero, slot, { freeSlots, id: this.idGenerator("equipment") });
    if (result.success) this.eventLog.push({ type: "hero_item_unequipped", playerId, heroId, slot, itemId: result.itemId, at: this.now() });
    return result;
  }

  produceLocationResources(cycles = 1, random = Math.random) {
    return this.locations.map((location) => { location.advanceAbandonment(cycles); const modifier = location.getContentmentModifier(this.setup.rules.enableContentment); const market = this.marketService.sellBlockedProduction(location, cycles, modifier); const produced = location.produceResources(cycles, modifier); const producedRecruits = location.produceRecruits(cycles, random, modifier); if (location.type === "camp") { const activity = (produced.food ?? 0) / 10 + Object.values(producedRecruits).reduce((sum, amount) => sum + amount, 0) / 5; if (activity > 0) this.locationProgressionService.awardExperience(location, activity, "production"); } return { locationId: location.id, contentmentModifier: modifier, produced, producedRecruits, market }; }).filter((result) => Object.keys(result.produced).length > 0 || Object.keys(result.producedRecruits).length > 0 || result.market.gold > 0);
  }

  advanceCycle(cycles = 1, random = Math.random) {
    if (!Number.isInteger(cycles) || cycles <= 0) throw new RangeError("Le nombre de cycles doit etre un entier positif.");
    const locations = this.produceLocationResources(cycles, random);
    this.locations.forEach((location) => this.chiefTradeService.refresh(location));
    return { locations, recoveredUnits: this.recoverUnits(cycles), heroes: this.recoverHeroes(cycles) };
  }

  recoverUnits(cycles = 1) {
    if (!Number.isInteger(cycles) || cycles <= 0) throw new RangeError("Le nombre de cycles de recuperation doit etre un entier positif.");
    const engagedUnitIds = new Set(this.battles.filter((battle) => battle.status !== "finished").flatMap((battle) => battle.teams.flatMap((team) => team.units.map((unit) => unit.sourceId))));
    const units = [...this.heroes.flatMap((hero) => hero.army.units), ...this.locations.flatMap((location) => location.garrison.units)];
    return [...new Map(units.map((unit) => [unit.id, unit])).values()].filter((unit) => !engagedUnitIds.has(unit.id)).map((unit) => ({ unitId: unit.id, ...unit.heal(cycles) })).filter((result) => result.restoredHealth > 0);
  }

  recoverHeroes(cycles = 1) {
    return this.heroes.map((hero) => {
      if (this.#isHeroBusy(hero.id)) return { heroId: hero.id, restoredHealth: 0, naturalHealing: 0, locationHealing: 0, reason: "hero_busy" };
      const base = this.getHeroBaseLocation(hero.id);
      if (hero.state === "ghost" && base?.heroIds.includes(hero.id)) {
        const revival = this.heroRecoveryService.reviveAtBase(hero);
        if (revival.success) this.eventLog.push({ type: "hero_revived_at_base", heroId: hero.id, locationId: base.id, health: revival.health, at: this.now() });
        return { heroId: hero.id, restoredHealth: revival.health ?? 0, naturalHealing: 0, locationHealing: 0, locationId: base.id, revived: revival.success };
      }
      const healingLocation = this.locations.find((location) => location.heroIds.includes(hero.id) && location.features.healing === true && this.locationAccessPolicy.can(hero.playerId, location, "heal")) ?? null;
      const result = this.heroRecoveryService.recover(hero, { cycles, healingLocation });
      const auraHealing = this.heroes.filter((source) => source.id !== hero.id && source.state === "active" && source.position && hero.position && this.#areAlliedPlayers(source.playerId, hero.playerId)).reduce((total, source) => {
        const aura = this.heroClassFeatureService.healingAura(source);
        return aura.radius > 0 && distanceMeters(source.position, hero.position) <= aura.radius ? total + aura.healthPerCycle * cycles : total;
      }, 0);
      const restoredByAura = auraHealing > 0 ? hero.recoverHealth(auraHealing) : 0;
      result.restoredHealth += restoredByAura; result.auraHealing = restoredByAura;
      if (result.restoredHealth > 0) this.eventLog.push({ type: "hero_recovered", heroId: hero.id, restoredHealth: result.restoredHealth, locationId: result.locationId, at: this.now() });
      return result;
    });
  }

  #areAlliedPlayers(firstPlayerId, secondPlayerId) {
    if (firstPlayerId === secondPlayerId) return true;
    const first = this.setup.participants.find((participant) => participant.playerId === firstPlayerId);
    const second = this.setup.participants.find((participant) => participant.playerId === secondPlayerId);
    return first?.teamId !== null && first?.teamId !== undefined && first.teamId === second?.teamId;
  }

  advanceWorldCycle(cycles = 1, random = Math.random) {
    return this.advanceCycle(cycles, random);
  }

  getHeroBaseLocation(heroId) {
    const hero = this.getHero(heroId); if (hero === null) return null;
    const baseSlot = this.scenario?.locationSlots.find((slot) => slot.id === "refuge" || slot.roles?.includes("spawn")) ?? null;
    const binding = baseSlot === null ? null : this.scenarioLocationBindings.find((item) => item.locationSlotId === baseSlot.id);
    if (binding) return this.getLocation(binding.locationId);
    const owned = this.locations.filter((location) => location.ownerId === hero.playerId || location.controllerId === hero.playerId);
    return owned.find((location) => location.roles.includes("spawn") || location.roles.includes("refuge")) ?? owned.find((location) => ["fort", "camp"].includes(location.type)) ?? null;
  }

  reviveHeroAtBase({ heroId, locationId }) {
    const hero = this.getHero(heroId); const location = this.getLocation(locationId); const base = this.getHeroBaseLocation(heroId);
    if (hero === null || location === null || base?.id !== location.id || !location.heroIds.includes(hero.id)) return { success: false, reason: "hero_not_at_base" };
    const result = this.heroRecoveryService.reviveAtBase(hero);
    if (result.success) this.eventLog.push({ type: "hero_revived_at_base", heroId: hero.id, locationId: location.id, health: result.health, at: this.now() });
    return result;
  }

  garrisonUnit({ playerId, heroId, locationId, unitId }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId); const location = this.getLocation(locationId);
    if (player === null || hero === null || location === null || hero.playerId !== player.id || !location.heroIds.includes(hero.id) || !this.locationAccessPolicy.can(player.id, location, "garrison")) return false;
    const unit = hero.army.getUnit(unitId);
    if (unit === null || unit.ownerPlayerId !== player.id || location.garrison.hasUnit(unitId) || location.garrison.units.length >= location.defenseSlots) return false;
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
    const authority = this.getHeroAuthority(hero.id);
    if (authority.used + this.getUnitAuthorityCost(unit) > authority.maximum) return false;
    location.garrison.removeUnit(unitId);
    hero.addUnit(unit);
    return true;
  }

  disbandUnit({ playerId, heroId, unitId }) {
    const player = this.getPlayer(playerId); const hero = this.getHero(heroId);
    if (player === null || hero === null || hero.playerId !== player.id) return { success: false, reason: "invalid_hero" };
    const isInBattle = this.battles.some((battle) => battle.status !== "finished" && battle.teams.some((team) => team.heroes.some((snapshot) => snapshot.sourceId === hero.id)));
    if (isInBattle) return { success: false, reason: "battle_active" };
    const unit = hero.army.getUnit(unitId);
    if (unit === null || unit.ownerPlayerId !== player.id) return { success: false, reason: "invalid_unit" };
    hero.removeUnit(unit.id);
    this.eventLog.push({ type: "unit_disbanded", playerId: player.id, heroId: hero.id, unitId: unit.id, unitName: unit.name, typeId: unit.typeId, quantity: unit.quantity, at: this.now() });
    return { success: true, unit: unit.toJSON() };
  }

  createBattle({ teamParticipants, loot = [], position = null, sourceLocationId = null, sourceEnemyTeamId = null, config = {} }) {
    if (this.status !== "started") throw new Error("La partie doit être démarrée pour créer une bataille.");
    if (teamParticipants.some((team) => (team.heroIds ?? []).some((heroId) => this.getHero(heroId)?.state !== "active"))) throw new Error("Un héros ghost ne peut pas participer à une bataille.");
    const battle = this.battleService.createBattle({ id: this.idGenerator("battle"), game: this, teamParticipants, loot, config: { countdownMs: 3_000, ...config }, now: this.now });
    battle.lootPosition = position === null ? null : { ...position };
    battle.sourceLocationId = sourceLocationId;
    battle.sourceEnemyTeamId = sourceEnemyTeamId;
    if (position !== null) {
      const participantPlayerIds = teamParticipants.flatMap((team) => (team.heroIds ?? []).map((heroId) => this.getHero(heroId)?.playerId)).filter(Boolean);
      this.battleSites.push(new BattleSite({ id: this.idGenerator("battle-site"), battleId: battle.id, position, participantPlayerIds, now: this.now }));
    }
    battle.start();
    this.battles.push(battle);
    return battle;
  }

  canEngageHeroes(firstHeroId, secondHeroId) {
    const first = this.getHero(firstHeroId);
    const second = this.getHero(secondHeroId);
    return first?.state === "active" && second?.state === "active" && !this.#isOnPursuitCooldown(first) && !this.#isOnPursuitCooldown(second) && this.engagementService.canEngage(first, second);
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
    this.#resolveFleePursuits(battle);
    const droppedLoot = this.#extractDroppedEquipment(battle);
    const outcome = this.battleService.applyOutcome({ game: this, battle });
    const consequences = this.battleConsequenceService.resolve({ game: this, battle, idGenerator: this.idGenerator });
    this.#settleAutonomousBattleParticipants(battle);
    const enemyVictory = battle.sourceEnemyTeamId !== null && battle.winnerTeamId === battle.sourceEnemyTeamId;
    const enemySalvage = enemyVictory ? this.#awardEnemySalvage(battle, [...battle.state.loot, ...droppedLoot]) : null;
    const heroProgression = [];
    battle.teams.forEach((team) => team.heroes.forEach((snapshot) => {
      const participant = this.getHero(snapshot.sourceId); if (participant === null) return;
      const previousExperience = participant.experience; const previousRank = participant.commandRank;
      const experienceGained = team.id === battle.winnerTeamId ? 50 : 20; const progression = this.gainHeroExperience({ heroId: participant.id, amount: experienceGained, source: `battle:${battle.id}` });
      heroProgression.push({ heroId: participant.id, playerId: participant.playerId, name: participant.name, experienceGained, previousExperience, experience: participant.experience, previousRank, rank: participant.commandRank, state: participant.state, availableLevelUps: progression.availableLevelUps });
    }));
    const battleLoot = enemyVictory ? null : this.lootDistributionService.createReward({ id: this.idGenerator("battle-loot"), battle, extraLoot: droppedLoot, now: this.now });
    if (battleLoot !== null) this.battleLoot.push(battleLoot);
    if (enemyVictory) this.battleSites = this.battleSites.filter((site) => site.battleId !== battle.id);
    else this.battleSites.find((site) => site.battleId === battle.id)?.finish();
    const capturedLocation = this.#captureDefeatedLocation(battle);
    const destroyedLocationId = capturedLocation === null ? this.#destroyDefeatedEnemySource(battle) : null;
    return { ...outcome, consequences, heroProgression, enemySalvage, battleLoot: battleLoot?.toJSON() ?? null, destroyedLocationId, capturedLocationId: capturedLocation?.locationId ?? null };
  }

  getVisibleDynamicSites({ playerId, position }) {
    this.cleanupDynamicSites();
    return this.battleSites.filter((site) => site.isVisibleTo({ playerId, position })).map((site) => ({ kind: "battlefield", ...site.toJSON() }));
  }

  cleanupDynamicSites() {
    this.battleSites = this.battleSites.filter((site) => !site.isExpired());
  }

  collectBattleLoot({ battleId, playerId, heroId, selection }) {
    const reward = this.battleLoot.find((item) => item.battleId === battleId); const hero = this.getHero(heroId);
    if (reward === undefined || hero === null || hero.playerId !== playerId || hero.state !== "active") return { success: false, reason: "invalid_loot_request", collected: [] };
    const result = reward.collect({ playerId, bag: this.inventoryService.getHeroBagState(hero), selection });
    if (result.success) this.#storeCollectedLoot(hero, result.collected);
    return { ...result, battleId, depleted: reward.status === "COLLECTED", battleLoot: reward.toJSON() };
  }

  surrenderBattle({ battleId, teamId }) {
    const battle = this.battles.find((item) => item.id === battleId);
    if (battle === undefined) return { success: false, reason: "battle_not_found" };
    return battle.surrender(teamId);
  }

  fleeBattleHero({ battleId, heroId }) {
    const battle = this.battles.find((item) => item.id === battleId); const hero = this.getHero(heroId);
    const battleHero = battle?.getEntity(`battle-hero-${heroId}`) ?? null;
    if (!battle || !hero || !["countdown", "active"].includes(battle.status) || battleHero?.state !== "active") return { success: false, reason: "hero_cannot_flee" };
    return { success: true, ...this.#finalizeHeroFlee(battle, hero, battleHero, "player_action") };
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
    if (battle === undefined || hero === null || !["countdown", "active"].includes(battle.status) || battle.getEntity(`battle-hero-${heroId}`) === null) return { state: "ignored" };
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
    return this.#finalizeHeroFlee(battle, hero, battleHero, "gps_exit");
  }

  #finalizeHeroFlee(battle, hero, battleHero, trigger) {
    battleHero.state = "fled";
    battle.eventLog.push({ type: "flee_validated", heroId: hero.id, trigger, at: this.now() });
    this.#removeHeroCommand(battle, battleHero);
    hero.pursuitCooldownUntil = this.now() + this.setup.rules.pursuitCooldownMinutes * 60_000;
    this.#checkBattleAfterFlee(battle);
    return { state: "fled", battleFinished: battle.status === "finished" };
  }

  #checkBattleAfterFlee(battle) {
    const activeTeams = battle.teams.filter((team) => team.heroes.some((hero) => hero.state === "active"));
    if (activeTeams.length > 1) return;
    battle.status = "finished";
    battle.finishedAt = this.now();
    battle.winnerTeamId = activeTeams[0]?.id ?? null;
    battle.eventLog.push({ type: "battle_finished", winnerTeamId: battle.winnerTeamId, at: this.now() });
  }

  #resolveFleePursuits(battle) {
    if (battle.status !== "finished" || battle.winnerTeamId === null) return [];
    const winner = battle.teams.find((team) => team.id === battle.winnerTeamId);
    if (!winner) return [];
    const winnerUnits = winner.units.filter((unit) => unit.state === "active" && unit.quantity > 0);
    const winnerSpeed = armySpeed(winnerUnits, (unit) => battle.getEffectiveStat(unit.id, "speed") ?? unit.speed);
    const reports = [];
    battle.teams.filter((team) => team.id !== winner.id).forEach((loser) => {
      loser.heroes.filter((hero) => hero.state === "fled").forEach((fleeingHero) => {
        if (battle.eventLog.some((event) => event.type === "flee_pursuit_resolved" && event.heroId === fleeingHero.sourceId)) return;
        const fleeingUnits = loser.units.filter((unit) => unit.heroSourceId === fleeingHero.sourceId && ["active", "fled"].includes(unit.state) && unit.quantity > 0);
        const loserSpeed = armySpeed(fleeingUnits, (unit) => battle.getEffectiveStat(unit.id, "speed") ?? unit.speed);
        const rounds = pursuitRounds(winnerSpeed, loserSpeed);
        let attacks = 0; let damage = 0; let losses = 0;
        for (let round = 1; round <= rounds; round += 1) {
          winnerUnits.filter((unit) => unit.state === "active" && unit.quantity > 0).forEach((attacker) => {
            const target = fleeingUnits.filter((unit) => ["active", "fled"].includes(unit.state) && unit.quantity > 0)
              .sort((first, second) => (battle.getEffectiveStat(first.id, "speed") ?? first.speed) - (battle.getEffectiveStat(second.id, "speed") ?? second.speed) || first.id.localeCompare(second.id))[0];
            if (!target) return;
            const result = battle.resolvePursuitAttack(attacker.id, target.id);
            if (!result.success) return;
            attacks += 1; damage += result.damage; losses += result.losses;
          });
        }
        fleeingUnits.filter((unit) => unit.state !== "defeated").forEach((unit) => { unit.state = "fled"; unit.lane = null; unit.targetId = null; unit.retreating = false; unit.retreatReason = null; });
        const report = { type: "flee_pursuit_resolved", heroId: fleeingHero.sourceId, winnerTeamId: winner.id, winnerSpeed, loserSpeed, speedDifference: winnerSpeed - loserSpeed, rounds, attacks, damage, losses, at: this.now() };
        battle.eventLog.push(report); reports.push(report);
      });
    });
    return reports;
  }

  #removeHeroCommand(battle, fleeingBattleHero) {
    const team = battle.getTeamForEntity(fleeingBattleHero.id);
    team.units.filter((unit) => unit.heroSourceId === fleeingBattleHero.sourceId && unit.state === "active").forEach((unit) => {
      unit.commandDisabled = true;
      unit.morale = Math.max(0, (unit.morale ?? 5) - 1);
      unit.currentOrder ??= { type: "hold" };
      unit.state = "fled"; unit.lane = null; unit.targetId = null; unit.retreating = false; unit.retreatReason = null;
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
    for (const group of this.autonomousGroups) {
      const unit = group.army.getUnit(unitId);
      if (unit !== null) return unit;
    }
    return null;
  }

  get rogueArmies() { return this.autonomousGroups.filter((group) => group.type === "rogue"); }
  getAutonomousGroup(groupId) { return this.autonomousGroups.find((group) => group.id === groupId) ?? null; }
  getAutonomousGroupsByOwner({ kind, id }) { return this.autonomousGroups.filter((group) => group.owner.kind === kind && group.owner.id === id); }
  addAutonomousGroup(group) {
    const candidate = group instanceof AutonomousGroup ? group : new AutonomousGroup(group);
    if (this.getAutonomousGroup(candidate.id) !== null) return false;
    this.autonomousGroups.push(candidate);
    return true;
  }
  removeAutonomousGroup(groupId) {
    const index = this.autonomousGroups.findIndex((group) => group.id === groupId);
    return index === -1 ? null : this.autonomousGroups.splice(index, 1)[0];
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
      setup: this.setup.toJSON(), heroClasses: [...this.heroClasses.values()].map((heroClass) => structuredClone(heroClass)),
      players: this.players.map((player) => player.toJSON()), heroes: this.heroes.map((hero) => hero.toJSON()),
      locations: this.locations.map((location) => location.toJSON()), status: this.status,
      scenario: this.scenario?.toJSON() ?? null, scenarioState: this.scenarioState?.toJSON() ?? null,
      scenarioRuntime: this.scenarioRuntime === null ? null : structuredClone(this.scenarioRuntime),
      availableQuests: this.availableQuests.map((quest) => ({ ...quest })),
      questSequence: this.questSequence.map((quest) => ({ ...quest, phaseIds: [...quest.phaseIds] })), lastQuestResult: this.lastQuestResult === null ? null : { ...this.lastQuestResult },
      scenarioLocationBindings: this.scenarioLocationBindings.map((binding) => binding.toJSON()), eventLog: this.eventLog.map((entry) => ({ ...entry })),
      startedAt: this.startedAt, finishedAt: this.finishedAt, finishReason: this.finishReason,
      battles: this.battles.map((battle) => battle.toJSON()),
      battleReports: this.battleReports.map((report) => structuredClone(report)), autonomousGroups: this.autonomousGroups.map((group) => group.toJSON()),
      autonomousGroupTraces: this.autonomousGroupTraces.map((trace) => trace.toJSON()),
      battleLoot: this.battleLoot.map((reward) => reward.toJSON()),
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
      const startingItems = Game.#createIds(heroClass.startingItems ?? []);
      const defaults = classDefinitionFor(id);
      const baseStats = Game.#createStats(heroClass.baseStats ?? defaults?.baseStats ?? { attack: 0, defense: 0, morale: 0, mobility: 1, command: 3, health: 30 }, "Les statistiques de classe");
      const growthWeights = Game.#createGrowthWeights(heroClass.growthWeights ?? defaults?.growthWeights ?? { attack: 4, defense: 3, morale: 3, mobility: 3, command: 3, health: 3 });
      const aptitudeIds = Game.#createIds(heroClass.aptitudeIds ?? defaults?.aptitudeIds ?? []); const commonAptitudeIds = Game.#createIds(heroClass.commonAptitudeIds ?? defaults?.commonAptitudeIds ?? []);
      const authorityBonus = heroClass.authorityBonus ?? defaults?.authorityBonus ?? ({ warrior: 2, ranger: 1, mage: 0 }[id] ?? 0);
      if (!Number.isInteger(authorityBonus) || authorityBonus < 0) throw new RangeError("Le bonus d'autorite de classe doit etre un entier positif ou nul.");
      const features = heroClass.features ?? defaults?.features ?? {};
      if (features === null || Array.isArray(features) || typeof features !== "object") throw new TypeError("Les avantages de classe doivent être un objet.");
      classes.set(id, { id, name, authorityBonus, advantage: heroClass.advantage ?? defaults?.advantage ?? "", features: structuredClone(features), abilityIds: [...new Set(abilityIds.map((abilityId) => Game.#requireText(abilityId, "Une capacité")))], baseStats, growthWeights, aptitudeIds, commonAptitudeIds, startingResources, startingUnits, startingItems });
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
        hero.addCarriedLoot(heroClass.startingItems.map((itemId) => ({ id: this.idGenerator("equipment"), itemId, quantity: 1, valuePerUnit: 1 })));
        this.#addStartingUnits(hero, player.id, heroClass.startingUnits);
      });
    });
  }

  #addStartingUnits(hero, playerId, stacks) {
    stacks.forEach((stack) => {
      if (hero.army.units.length >= hero.maxUnitStacks) throw new Error("Les unités de départ dépassent la capacité de commandement du héros.");
      const unit = this.recruitmentService.createUnit({ ownerPlayerId: playerId, typeId: stack.typeId, quantity: stack.quantity, idGenerator: this.idGenerator, number: this.#nextUnitNumber(playerId, stack.typeId) });
      const authority = this.getHeroAuthority(hero.id);
      if (authority.used + this.getUnitAuthorityCost(unit) > authority.maximum) throw new Error("Les unites de depart depassent l'autorite du heros.");
      hero.addUnit(unit);
    });
  }

  #isHeroBusy(heroId) {
    return this.battles.some((battle) => !["finished"].includes(battle.status) && battle.teams.some((team) => team.heroes.some((snapshot) => snapshot.sourceId === heroId)));
  }

  #heroResourceCapacity(hero, resourceName, requested) {
    if (!Number.isFinite(requested) || requested <= 0) return 0;
    const usedSlots = this.inventoryService.getUsedHeroBagSlots(hero);
    if (usedSlots > hero.bagSlotCount) return 0;
    const bundleSize = getItemDefinition(resourceName)?.bundleSize ?? 1;
    const current = hero.getResourceAmount(resourceName);
    const partialRoom = current % bundleSize === 0 ? 0 : bundleSize - current % bundleSize;
    return Math.min(requested, partialRoom + Math.max(0, hero.bagSlotCount - usedSlots) * bundleSize);
  }

  #nextUnitNumber(playerId, typeId) {
    const units = [
      ...this.heroes.flatMap((hero) => hero.army.units),
      ...this.locations.flatMap((location) => location.garrison.units),
    ].filter((unit) => unit.ownerPlayerId === playerId && unit.typeId === typeId);
    return Math.max(0, ...units.map((unit) => unit.number ?? 0)) + 1;
  }

  #autonomousGroupSpeed(group) {
    if (Number.isFinite(group.mission?.speedMetersPerSecond) && group.mission.speedMetersPerSecond > 0) return group.mission.speedMetersPerSecond;
    if (group.type === "messenger") return 5;
    if (group.type === "prospecting") return 1.4;
    if (group.type === "convoy") return Math.max(.8, 2 - group.cargo.length * .1);
    if (group.army.units.length === 0) return 1.2;
    return Math.max(.5, armySpeed(group.army.units, (unit) => this.unitDefinitions.get(unit.typeId)?.stats?.speed ?? 1.2));
  }

  #createBattleFromAutonomousEvent(event) {
    if (!["autonomous_group_attack_requested", "autonomous_group_ambush_attack_requested", "autonomous_group_location_attack_requested"].includes(event.type)) return null;
    const group = this.getAutonomousGroup(event.groupId);
    if (group === null || group.army.units.every((unit) => unit.combatantCount === 0)) return null;
    const autonomousTeamId = `autonomous-${group.id}`;
    if (event.type === "autonomous_group_location_attack_requested") {
      const location = this.getLocation(event.locationId);
      if (location === null) return null;
      const defenderHeroIds = location.heroIds.filter((heroId) => { const hero = this.getHero(heroId); return hero?.state === "active" && this.locationAccessPolicy.isDefender(hero.playerId, location); });
      return this.createBattle({ teamParticipants: [{ id: "heroes", heroIds: defenderHeroIds, locationId: location.id }, { id: autonomousTeamId, heroIds: [], autonomousGroupId: group.id }], position: group.position, sourceLocationId: location.id, sourceEnemyTeamId: autonomousTeamId });
    }
    const hero = this.getHero(event.target?.id);
    if (hero === null || hero.state !== "active" || this.#isHeroBusy(hero.id)) return null;
    return this.createBattle({ teamParticipants: [{ id: "heroes", heroIds: [hero.id] }, { id: autonomousTeamId, heroIds: [], autonomousGroupId: group.id }], position: group.position, sourceLocationId: group.mission?.kind === "attack_location" ? group.mission.targetId : null, config: event.type === "autonomous_group_ambush_attack_requested" ? { ambushTeamId: autonomousTeamId } : {} });
  }

  #settleAutonomousBattleParticipants(battle) {
    battle.teams.forEach((team) => team.heroes.forEach((snapshot) => {
      if (!snapshot.sourceId.startsWith("autonomous-group-")) return;
      const group = this.getAutonomousGroup(snapshot.sourceId.slice("autonomous-group-".length));
      if (group === null) return;
      const survived = team.id === battle.winnerTeamId && group.army.units.some((unit) => unit.combatantCount > 0);
      group.status = survived ? "idle" : "destroyed";
      group.interruption = null; group.movement = null; group.ambush = null;
      if (survived && group.mission?.kind === "attack_location" && group.mission.targetId === battle.sourceLocationId) group.mission = null;
      group.history.push({ type: survived ? "battle_won" : "battle_lost", battleId: battle.id, at: this.now() });
    }));
  }

  #applyInformationMapEffects(player, effects) {
    if (!Array.isArray(effects)) return;
    effects.forEach((effect) => {
      if (effect?.type === "reveal_location" && this.getLocation(effect.locationId) !== null) player.discoverLocation(effect.locationId, Math.max(1, Math.min(3, effect.knowledgeLevel ?? 1)));
    });
  }

  #extractDroppedEquipment(battle) {
    const dropped = [];
    battle.teams.flatMap((team) => team.heroes).filter((snapshot) => !["active", "fled", "retreated"].includes(snapshot.state)).forEach((snapshot) => {
      const hero = this.getHero(snapshot.sourceId); if (hero === null) return;
      const isGhost = snapshot.state === "ghost" || snapshot.health === 0;
      if (isGhost || snapshot.state === "surrendered") {
        Object.entries(hero.equipment).forEach(([slot, itemId]) => {
          if (itemId.startsWith("quest:") || itemId.startsWith("bound:")) return;
          dropped.push({ id: `equipment-${hero.id}-${slot}`, itemId, quantity: 1, portable: true, valuePerUnit: 10 }); delete hero.equipment[slot];
        });
        hero.equipmentModifiers = Object.fromEntries(Object.keys(hero.equipmentModifiers).map((stat) => [stat, 0]));
        Object.values(hero.equipment).forEach((itemId) => Object.entries(getItemDefinition(itemId)?.modifiers ?? {}).forEach(([stat, value]) => { hero.equipmentModifiers[stat] += value; }));
      }
      hero.carriedLoot.forEach((entry, index) => dropped.push({ id: `carried-${hero.id}-${index}`, ...entry, portable: true }));
      hero.carriedLoot = [];
      if (isGhost || snapshot.state === "surrendered") Object.entries(hero.resources).forEach(([itemId, amount]) => {
        const quantity = Math.floor(amount); if (quantity > 0) dropped.push({ id: `resource-${hero.id}-${itemId}`, itemId, quantity, portable: true, valuePerUnit: 1 }); hero.resources[itemId] = 0;
      });
    });
    return dropped;
  }

  #storeCollectedLoot(hero, entries) {
    entries.forEach((entry) => {
      const definition = getItemDefinition(entry.itemId);
      if (definition && ["resource", "consumable", "livestock"].includes(definition.category)) {
        hero.addResource(entry.itemId, entry.quantity); return;
      }
      const bundleSize = definition?.bundleSize ?? 1;
      for (let remaining = entry.quantity; remaining > 0;) {
        const quantity = Math.min(bundleSize, remaining); remaining -= quantity;
        hero.addCarriedLoot([{ id: this.idGenerator("loot"), itemId: entry.itemId, quantity, valuePerUnit: entry.valuePerUnit ?? 1 }]);
      }
    });
  }

  #awardEnemySalvage(battle, entries) {
    const winningTeam = battle.teams.find((team) => team.id === battle.winnerTeamId); const winningHeroes = winningTeam?.heroes.map((snapshot) => this.getHero(snapshot.sourceId)).filter((hero) => hero?.state === "active") ?? [];
    const hero = winningHeroes[0] ?? null; const equipped = []; let experiencePool = 0;
    entries.filter((entry) => entry.protected !== true && !["barricade", "barricades"].includes(entry.itemId)).forEach((entry, entryIndex) => {
      const definition = getItemDefinition(entry.itemId); const quantity = Math.max(0, Math.floor(entry.quantity ?? 0));
      if (hero && definition?.category === "equipment") {
        for (let index = 0; index < quantity; index += 1) {
          const packageId = this.idGenerator("enemy-equipment"); hero.addCarriedLoot([{ id: packageId, itemId: entry.itemId, quantity: 1, valuePerUnit: entry.valuePerUnit ?? 1 }]);
          const result = this.equipmentService.equip(hero, packageId); if (result.success) equipped.push({ heroId: hero.id, itemId: entry.itemId, slot: result.slot }); else experiencePool += 1;
        }
      } else experiencePool += quantity;
    });
    const units = winningTeam?.units.map((snapshot) => this.findUnit(snapshot.sourceId)).filter((unit) => unit !== null && unit.quantity > 0) ?? []; const recipients = [...winningHeroes.map((winner) => ({ kind: "hero", entity: winner })), ...units.map((unit) => ({ kind: "unit", entity: unit }))];
    const experience = []; if (recipients.length > 0 && experiencePool > 0) {
      const base = Math.floor(experiencePool / recipients.length); let remainder = experiencePool % recipients.length;
      recipients.forEach(({ kind, entity }) => { const amount = base + (remainder-- > 0 ? 1 : 0); if (amount <= 0) return; entity.addExperience(amount, `salvage:${battle.id}`); const promotions = []; if (kind === "unit") while (entity.canPromote) { const rank = entity.nextRank.id; if (!entity.promote(rank)) break; promotions.push(rank); } experience.push({ kind, id: entity.id, amount, promotions }); });
    }
    return { winnerTeamId: battle.winnerTeamId, equipped, convertedExperience: experiencePool, experience };
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
  static #createStats(stats, label) { if (stats === null || Array.isArray(stats) || typeof stats !== "object") throw new TypeError(`${label} doivent être un objet.`); return Object.fromEntries(["attack", "defense", "morale", "mobility", "command", "health"].map((name) => { const value = stats[name]; if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} invalides.`); return [name, value]; })); }
  static #createGrowthWeights(weights) { const result = Game.#createStats(weights, "Les pondérations"); if (Object.values(result).reduce((sum, value) => sum + value, 0) !== 19 || Object.values(result).some((value) => !Number.isInteger(value))) throw new RangeError("Les pondérations doivent contenir 19 paliers entiers."); return result; }
  static #createIds(ids) { if (!Array.isArray(ids)) throw new TypeError("Les aptitudes doivent être une liste."); return [...new Set(ids.map((id) => Game.#requireText(id, "Une aptitude")))]; }

  static #createLocations(locations, unitDefinitions) {
    if (!Array.isArray(locations)) throw new TypeError("Les lieux doivent être une liste.");
    return locations.map((location) => {
      if (location instanceof Location) return location;
      const units = (location.garrison?.units ?? []).map((unit) => {
        const definition = unitDefinitions.get(unit.typeId);
        if (definition === undefined) throw new RangeError(`La définition de l'unité ${unit.typeId} n'existe pas.`);
        return {
          ...unit,
          healthPerSoldier: unit.healthPerSoldier ?? definition.stats.healthPerSoldier ?? 10,
          combatHealthThreshold: unit.combatHealthThreshold ?? definition.stats.combatHealthThreshold ?? 4,
        };
      });
      return new Location({ ...location, garrison: { ...(location.garrison ?? {}), units } });
    });
  }

  static #defaultIdGenerator(prefix) {
    if (typeof globalThis.crypto?.randomUUID === "function") return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  static #requireText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
}
