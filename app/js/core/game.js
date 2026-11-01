import { campDevelopmentState } from "./camp-development-state.js";
import { CampInstallationService } from "./camp-installation-service.js";
import { reconcileClosedExceptionalSites } from "./exceptional-site-closure.js";
import { ExceptionalSiteResolutionService } from "./exceptional-site-resolution-service.js";
import { ExceptionalExpeditionService } from "./exceptional-expedition-service.js";
import { retireInteriorExceptionalSites } from "./exploration-exterior-migration.js";
import { ExteriorSearchService } from "./exterior-search-service.js";
import { astralTargetInReach } from "./astral-interaction.js";
import { publishExplorationAnnouncements } from "./exploration-announcements.js";
import { ExplorationClueService } from "./exploration-clue-service.js";
import { ExplorationRumorService } from "./exploration-rumor-service.js";
import { ExplorationDiscoveryService } from "./exploration-discovery-service.js";
import { tacticalBonusLoot } from "./tactical-bonuses.js";
import { validateScenarioMapLocations } from "./scenario-map-definition.js";
import { setArmyFormation } from "./army-formation.js";
import {
  questSystemUnavailable,
  isSuspendedQuestGroup,
} from "./quest-system-policy.js";
import {
  LocationWatchService,
  locationWatchZones,
  watchDistance,
} from "./location-watch-service.js";
import { buildingConversation } from "./building-dialogue-catalog.js";
import {
  accrueLocationTaxes,
  locationTaxState,
} from "./location-tax-service.js";
import {
  awardCampActivityExperience,
  campProductionExperience,
} from "./camp-activity-experience.js";
import { PlayerSocialService, alliedPlayers } from "./player-social-service.js";
import { GameSetup } from "./game-setup.js";
import { selectInitialScenarioWorld } from "./initial-scenario-world.js";
import { Hero } from "./hero.js";
import { Location } from "./location.js";
import { LocationRangePolicy } from "./location-range-policy.js";
import { simulationRadii } from "./simulation-config.js";
import {
  mapLocationDiscoverable,
  playerMapVisibility,
} from "./player-map-visibility.js";
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
import {
  maximumAuthority,
  unitAuthorityCost,
  usedAuthority,
} from "./authority-system.js";
import { armySpeed, pursuitRounds } from "./army-pursuit.js";
import { InventoryService } from "./inventory-service.js";
import { EquipmentService } from "./equipment-service.js";
import { getItemDefinition } from "./item-catalog.js";
import { HeroRecoveryService } from "./hero-recovery-service.js";
import { AutonomousGroup } from "./autonomous-group.js";
import { RepressionQuest } from "./repression-quest.js";
import { AutonomousGroupService } from "./autonomous-group-service.js";
import { AutonomousInterceptionService } from "./autonomous-interception-service.js";
import { AutonomousGroupTrace } from "./autonomous-group-trace.js";
import { TradingConvoyService } from "./trading-convoy-service.js";
import { PlayerPlacementService } from "./player-placement-service.js";
import { ProspectingService } from "./prospecting-service.js";
import { ResourceZone } from "./resource-zone.js";
import { ExplorationState } from "./exploration-state.js";
import { LocationChiefService } from "./location-chief-service.js";
import { SideQuestService } from "./side-quest-service.js";
import { sideQuestTemplates } from "./side-quest-catalog.js";
import { ChiefTradeService } from "./chief-trade-service.js";
import { MarketService } from "./market-service.js";
import { QuestRuntime } from "./quest-runtime.js";
import { ScenarioRuntimeBuilder } from "./scenario-runtime-builder.js";
import { HeroClassFeatureService } from "./hero-class-feature-service.js";
import { distanceMeters } from "./geo.js";
import { HeroTravelExperienceService } from "./hero-travel-experience-service.js";
import { LocationDismantlingService } from "./location-dismantling-service.js";
import { ResultEvaluationService } from "./result-evaluation-service.js";
import { TrailState } from "./trail.js";
import { WorldState } from "./world-state.js";
import { UNIT_RANKS } from "./rank-system.js";
import { ScoutWatchBeacon } from "./scout-watch-beacon.js";
import { BattleEngine } from "./battle-engine.js";
import { AmbushService } from "./ambush-service.js";
import { BattleLoot } from "./battle-loot.js";
import { CapitalAiService } from "./capital-ai-service.js";
import { TerritoryService } from "./territory-service.js";
import {
  LocationSpacingPolicy,
  placedLocations,
} from "./location-spacing-policy.js";
import { TavernNpcService } from "./tavern-npc-service.js";
import { ItemAcquisitionService } from "./item-acquisition-service.js";
import {
  TeamFortQuestService,
  startLocalTeamFortTest,
} from "./team-fort-quest.js";

/** État actif d'une partie, indépendant de l'interface et des services navigateur. */
export class Game {
  constructor({
    setup,
    scenario = null,
    scenarioLocationBindings = [],
    heroClasses = [],
    heroAptitudes = [],
    unitDefinitions = [],
    locations = [],
    autonomousGroups = [],
    autonomousGroupTraces = [],
    tradingConvoyConfig = null,
    prospectingConfig = null,
    resourceZones = [],
    explorationState = null,
    watchBeacons = [],
    coordinateMode = "gps",
    scenarioStartsActive = true,
    questSystemEnabled = true,
    tacticalBattles = false,
    questEngineState = null,
    territoryState = null,
    scenarioStateSnapshot = null,
    worldStateSnapshot = null,
    tavernNpcState = null,
    itemAcquisitionState = null,
    teamFortQuestState = [],
    trailStateSnapshots = null,
    scenarioRuntimeSnapshot = null,
    now = () => Date.now(),
    idGenerator = Game.#defaultIdGenerator,
  }) {
    if (
      scenarioRuntimeSnapshot === null &&
      scenario?.mapDefinition?.initialLocationSlotIds
    ) {
      const initial = selectInitialScenarioWorld(
        scenario,
        scenarioLocationBindings,
        locations,
      );
      scenario = initial.scenario;
      scenarioLocationBindings = initial.bindings;
      locations = initial.locations;
    }
    this.setup = setup instanceof GameSetup ? setup : new GameSetup(setup);
    this.tacticalBattles = tacticalBattles === true;
    if (!["gps", "simulation"].includes(coordinateMode))
      throw new RangeError(
        "Le mode de coordonnées doit être gps ou simulation.",
      );
    this.coordinateMode = coordinateMode;
    this.explorationState = new ExplorationState(
      explorationState instanceof ExplorationState
        ? explorationState.toJSON()
        : explorationState,
    );
    retireInteriorExceptionalSites(this.explorationState);
    // Vue officielle reçue par le navigateur ; jamais réinjectée dans la sauvegarde privée.
    this.explorationView = null;
    this.explorationClueService = new ExplorationClueService(this);
    this.explorationRumorService = new ExplorationRumorService(this);
    this.explorationDiscoveryService = new ExplorationDiscoveryService(this);
    this.exteriorSearchService = new ExteriorSearchService(this);
    this.exceptionalExpeditionService = new ExceptionalExpeditionService(this);
    this.exceptionalSiteResolutionService = new ExceptionalSiteResolutionService(this);
    this.campInstallationService = new CampInstallationService(this);
    this.questSystemEnabled = questSystemEnabled !== false;
    this.questEngineState = structuredClone(questEngineState);
    this.territoryState = structuredClone(territoryState);
    this.territoryService = new TerritoryService();
    this.heroClasses = Game.#createHeroClassMap(heroClasses);
    this.heroClassFeatureService = new HeroClassFeatureService({
      classDefinitions: this.heroClasses,
      now,
    });
    this.heroProgressionService = new HeroProgressionService({
      aptitudeDefinitions: heroAptitudes,
      now,
    });
    this.heroTravelExperienceService = new HeroTravelExperienceService(
      coordinateMode === "simulation"
        ? {
            distanceFn: (a, b) =>
              Math.hypot(b.latitude - a.latitude, b.longitude - a.longitude) *
              10,
          }
        : {},
    );
    this.unitDefinitions = Game.#createUnitDefinitionMap(unitDefinitions);
    this.recruitmentService = new RecruitmentService(this.unitDefinitions);
    this.locationAccessPolicy = new LocationAccessPolicy({
      participants: this.setup.participants,
      rules: this.setup.rules,
    });
    this.teamFortQuestService = new TeamFortQuestService(teamFortQuestState);
    this.locationAccessPolicy.teamFortQuests = this.questSystemEnabled
      ? this.teamFortQuestService.quests
      : [];
    this.locationCaptureService = new LocationCaptureService();
    this.locationProgressionService = new LocationProgressionService({
      mode: this.setup.rules.locationMode,
    });
    this.campImprovementService = new CampImprovementService({
      progressionService: this.locationProgressionService,
    });
    this.battleService = new BattleService(this.unitDefinitions);
    this.battleConsequenceService = new BattleConsequenceService();
    this.lootDistributionService = new LootDistributionService();
    this.inventoryService = new InventoryService({ idGenerator });
    this.equipmentService = new EquipmentService();
    this.itemAcquisitionService = new ItemAcquisitionService(
      itemAcquisitionState,
    );
    this.capitalAiService = new CapitalAiService();
    this.heroRecoveryService = new HeroRecoveryService();
    this.locationChiefService = new LocationChiefService();
    this.sideQuestService = new SideQuestService({
      now,
      gainExperience: (hero, amount, source) =>
        this.gainHeroExperience({ heroId: hero.id, amount, source }),
      getTemplates: (hero, location) =>
        sideQuestTemplates({
          unitDefinitions: [...this.unitDefinitions.values()],
          canGarrison:
            this.locationAccessPolicy.can(
              hero.playerId,
              location,
              "garrison",
            ) && location.garrison.units.length < location.defenseSlots,
        }),
      garrisonUnit: (hero, location, unit) =>
        this.garrisonUnit({
          playerId: hero.playerId,
          heroId: hero.id,
          locationId: location.id,
          unitId: unit.id,
        }),
      afterDeposit: (location) =>
        this.tavernNpcService.applyLocationWorkers(location),
      afterComplete: (hero, location, quest) => {
        awardCampActivityExperience(
          this.locationProgressionService,
          this.getLocation(quest.locationId),
          "sideQuest",
        );
        this.itemAcquisitionService.unlock({
          source: "sideQuest",
          key: `${location.id}:${quest.source ?? "chief"}`,
          heroId: hero.id,
          classId: hero.classId,
        });
      },
    });
    this.chiefTradeService = new ChiefTradeService();
    this.locationWatchService = new LocationWatchService();
    this.marketService = new MarketService({ now: () => this.now() });
    this.tavernNpcService = new TavernNpcService(tavernNpcState);
    this.locationDismantlingService = new LocationDismantlingService();
    this.resultEvaluationService = new ResultEvaluationService();
    this.evacuationStates = {};
    this.questDeadlines = {};
    this.availableQuests = [];
    this.playerSessions = [];
    this.playerSocialService = new PlayerSocialService();
    this.questSequence = [];
    this.lastQuestResult = null;
    this.engagementService = new EngagementService({
      engagementRadiusMeters: this.setup.rules.engagementRadiusMeters,
      fleeConfirmations: this.setup.rules.fleeConfirmations,
    });
    this.scenario =
      scenario === null
        ? null
        : scenario instanceof Scenario
          ? scenario
          : new Scenario(scenario);
    if (this.scenario !== null && this.scenario.id !== this.setup.scenarioId)
      throw new RangeError("Le scénario ne correspond pas au GameSetup.");
    this.scenarioState =
      this.scenario === null
        ? null
        : new ScenarioState(this.scenario, {
            startsActive: scenarioStartsActive,
            state: scenarioStateSnapshot,
          });
    this.worldState = new WorldState(
      worldStateSnapshot ?? this.scenario?.worldState ?? {},
    );
    this.trailStates = Object.fromEntries(
      (this.scenario?.trails ?? []).map((trail) => [
        trail.id,
        new TrailState(trail, trailStateSnapshots?.[trail.id] ?? {}),
      ]),
    );
    this.locations = Game.#createLocations(locations, this.unitDefinitions);
    this.locations.forEach((location) => {
      this.locationProgressionService.initialize(location);
      this.campImprovementService.applyEffects(location);
    });
    this.scenarioLocationBindings =
      this.scenario === null
        ? []
        : ScenarioLocationBinding.validateAll(
            scenarioLocationBindings,
            this.scenario,
            this.locations,
          );
    validateScenarioMapLocations(
      this.scenario,
      this.scenarioLocationBindings,
      this.locations,
    );
    this.scenarioEffectResolver = new ScenarioEffectResolver();
    this.questRuntime = new QuestRuntime();
    this.scenarioRuntimeBuilder = new ScenarioRuntimeBuilder();
    this.scenarioRuntime =
      scenarioRuntimeSnapshot === null
        ? this.scenarioRuntimeBuilder.build({
            scenario: this.scenario,
            setup: this.setup,
            bindings: this.scenarioLocationBindings,
            locations: this.locations,
            coordinateMode: this.coordinateMode,
          })
        : structuredClone(scenarioRuntimeSnapshot);
    Object.values(this.scenarioRuntime?.placements ?? {})
      .filter((placement) => placement.status === "placed")
      .forEach((placement) => {
        this.updateLocationPosition({
          locationId: placement.locationId,
          position: placement.position,
        });
      });
    this.eventLog = [];
    this.activeScenarioEventId = null;
    this.now = now;
    this.idGenerator = idGenerator;
    this.tradingConvoyService = new TradingConvoyService({
      ...(tradingConvoyConfig === null ? {} : { config: tradingConvoyConfig }),
      idGenerator,
    });
    this.playerPlacementService = new PlayerPlacementService();
    this.prospectingService = new ProspectingService({
      ...(prospectingConfig === null ? {} : { config: prospectingConfig }),
      idGenerator,
    });
    this.autonomousGroupService = new AutonomousGroupService({
      idGenerator,
      convoyService: this.tradingConvoyService,
      prospectingService: this.prospectingService,
      interceptionService: new AutonomousInterceptionService({
        engagementRadiusMeters: this.setup.rules.engagementRadiusMeters,
        minimumReactionMs:
          this.setup.rules.autonomousReactionMinimumSeconds * 1000,
      }),
    });
    this.players = this.setup.participants.map(
      (participant) =>
        new Player({ id: participant.playerId, name: participant.name }),
    );
    this.heroes = [];
    this.status = "preparing";
    this.startedAt = null;
    this.finishedAt = null;
    this.finishReason = null;
    this.battles = [];
    this.battleReports = [];
    if (!Array.isArray(autonomousGroups))
      throw new TypeError("Les groupes autonomes doivent être une liste.");
    this.autonomousGroups = [];
    autonomousGroups.forEach((group) => this.addAutonomousGroup(group));
    if (!Array.isArray(resourceZones))
      throw new TypeError("Les zones de ressources doivent être une liste.");
    this.resourceZones = resourceZones.map((zone) =>
      zone instanceof ResourceZone ? zone : new ResourceZone(zone),
    );
    if (!Array.isArray(autonomousGroupTraces))
      throw new TypeError(
        "Les traces de groupes autonomes doivent être une liste.",
      );
    this.autonomousGroupTraces = autonomousGroupTraces.map((trace) =>
      trace instanceof AutonomousGroupTrace
        ? trace
        : new AutonomousGroupTrace(trace),
    );
    if (!Array.isArray(watchBeacons))
      throw new TypeError("Les balises de vigie doivent être une liste.");
    this.watchBeacons = watchBeacons.map((beacon) =>
      beacon instanceof ScoutWatchBeacon
        ? beacon
        : new ScoutWatchBeacon(beacon),
    );
    this.battleLoot = [];
    this.battleSites = [];
  }

  // Joueurs, héros et progression individuelle.
  chooseHero(
    playerId,
    {
      name,
      classId,
      gender = null,
      appearanceId = null,
      firstAptitudeId = null,
    },
  ) {
    if (this.status !== "preparing")
      throw new Error("Le héros ne peut être choisi qu'avant le démarrage.");
    const player = this.getPlayer(playerId);
    if (player === null)
      throw new RangeError("Le joueur n'appartient pas à cette partie.");
    if (player.heroIds.length >= this.setup.rules.maxHeroesPerPlayer)
      return null;
    const heroClass = this.heroClasses.get(classId);
    if (heroClass === undefined)
      throw new RangeError("La classe de héros n'existe pas.");

    const hero = new Hero({
      id: this.idGenerator("hero"),
      playerId: player.id,
      name,
      classId,
      gender,
      skillIds: heroClass.abilityIds,
      baseStats: heroClass.baseStats,
      maxHealth: heroClass.baseStats.health,
      maxCommandPoints: heroClass.baseStats.command,
      commandPoints: heroClass.baseStats.command,
      appearanceId,
    });
    this.heroProgressionService.initializeHero(hero, heroClass);
    if (
      firstAptitudeId !== null &&
      [...heroClass.aptitudeIds, ...heroClass.commonAptitudeIds].includes(
        firstAptitudeId,
      )
    ) {
      hero.aptitudeRanks[firstAptitudeId] = "novice";
      const aptitude =
        this.heroProgressionService.aptitudes.get(firstAptitudeId);
      if (["active", "reaction"].includes(aptitude?.type))
        hero.addSpecialPower(firstAptitudeId);
      else hero.addSkill(firstAptitudeId);
    }
    this.heroes.push(hero);
    player.addHero(hero.id);
    return hero;
  }

  gainHeroExperience({ heroId, amount, source }) {
    const hero = this.getHero(heroId);
    if (hero === null) throw new RangeError("Le héros n'existe pas.");
    return this.heroProgressionService.addExperience(
      hero,
      amount,
      source,
      this.heroClasses.get(hero.classId),
    );
  }

  recordHeroTravel({ heroId, position, accuracy = position?.accuracy ?? 0 }) {
    const hero = this.getHero(heroId);
    if (hero === null) throw new RangeError("Le héros n'existe pas.");
    const travel = this.heroTravelExperienceService.record(hero, position, {
      accuracy,
    });
    if (travel.experienceGained > 0)
      travel.progression = this.gainHeroExperience({
        heroId,
        amount: travel.experienceGained,
        source: "travel:gps",
      });
    return travel;
  }

  discoverLocation({ playerId, locationId, level = 1 }) {
    const player = this.getPlayer(playerId);
    if (player === null) throw new RangeError("Le joueur n’existe pas.");
    if (this.getLocation(locationId) === null)
      throw new RangeError("Le lieu n’existe pas.");
    return player.discoverLocation(locationId, level);
  }

  selectHeroLevelUp({ heroId, pendingId, upgradeId }) {
    const hero = this.getHero(heroId);
    if (hero === null) return { success: false, reason: "hero_not_found" };
    return this.heroProgressionService.selectUpgrade(
      hero,
      pendingId,
      upgradeId,
    );
  }

  levelUpHero({ heroId }) {
    const hero = this.getHero(heroId);
    if (hero === null) return { success: false, reason: "hero_not_found" };
    if (this.#isHeroBusy(hero.id))
      return { success: false, reason: "hero_busy" };
    return this.heroProgressionService.levelUp(
      hero,
      this.heroClasses.get(hero.classId),
    );
  }

  getHeroAuthority(heroId) {
    const hero = this.getHero(heroId);
    if (hero === null) return null;
    const maximum = maximumAuthority(hero, this.heroClasses.get(hero.classId));
    const used = usedAuthority(hero, this.unitDefinitions);
    return { used, maximum, remaining: maximum - used };
  }

  getUnitAuthorityCost(unit, rankId = unit.rank) {
    return unitAuthorityCost(unit, this.unitDefinitions, rankId);
  }

  promoteUnit({ heroId, unitId }) {
    const hero = this.getHero(heroId);
    if (hero === null) return { success: false, reason: "hero_not_found" };
    if (this.#isHeroBusy(hero.id))
      return { success: false, reason: "hero_busy" };
    const unit = hero.army.getUnit(unitId);
    if (unit === null) return { success: false, reason: "unit_not_found" };
    if (!unit.canPromote)
      return { success: false, reason: "insufficient_experience" };
    const currentCost = this.getUnitAuthorityCost(unit);
    const nextCost = this.getUnitAuthorityCost(unit, unit.nextRank.id);
    const authority = this.getHeroAuthority(hero.id);
    if (authority.used - currentCost + nextCost > authority.maximum)
      return {
        success: false,
        reason: "insufficient_authority",
        required: nextCost - currentCost,
        authority,
      };
    const previousRank = unit.rank;
    unit.promote(unit.nextRank.id);
    this.eventLog.push({
      type: "unit_promoted",
      heroId: hero.id,
      unitId: unit.id,
      previousRank,
      rank: unit.rank,
      authorityCost: nextCost,
      at: this.now(),
    });
    return {
      success: true,
      previousRank,
      rank: unit.rank,
      level: unit.level,
      authority: this.getHeroAuthority(hero.id),
    };
  }

  getHeroProgress(heroId) {
    const hero = this.getHero(heroId);
    return hero === null ? null : this.heroProgressionService.getProgress(hero);
  }

  // Cycle de vie global et horloge du monde.
  start() {
    if (this.status !== "preparing") return false;
    if (this.setup.participants.length !== this.setup.playerCount)
      throw new Error("Le nombre de joueurs choisi n'est pas atteint.");
    if (this.players.some((player) => player.heroIds.length === 0))
      throw new Error("Chaque joueur doit choisir au moins un héros.");
    this.#grantStartingForces();
    this.heroes.forEach((hero) => {
      hero.experience = 0;
      hero.xpHistory = [];
    });
    this.status = "started";
    this.startedAt = this.now();
    this.capitalAiService.initialize(this);
    return true;
  }

  getRemainingTimeMilliseconds() {
    if (this.setup.rules.timeLimitMinutes === null || this.startedAt === null)
      return null;
    const limit = this.setup.rules.timeLimitMinutes * 60_000;
    return Math.max(0, limit - (this.now() - this.startedAt));
  }

  update() {
    if (this.status === "started") {
      this.exteriorSearchService.refresh();
      this.exceptionalExpeditionService.refresh();
    }
    if (this.status === "started")
      publishExplorationAnnouncements(this.explorationState, this.now());
    let watchBeaconEvents = [];
    if (this.status === "started" && this.getRemainingTimeMilliseconds() === 0)
      this.finish("time_limit");
    if (this.status === "started") {
      this.advanceAutonomousGroups(this.now());
      this.exceptionalSiteResolutionService.update();
      this.campInstallationService.update();
    }
    if (this.status === "started")
      watchBeaconEvents = this.scanWatchBeacons(this.now());
    if (this.status === "started")
      this.locations.forEach((location) =>
        this.locationDismantlingService
          .completeReady(location, this.now())
          .forEach((result) =>
            this.eventLog.push({
              type: "location_structure_dismantled",
              locationId: location.id,
              ...result,
              at: this.now(),
            }),
          ),
      );
    if (this.status === "started") this.#failExpiredQuestDeadline();
    this.cleanupDynamicSites();
    return { watchBeaconEvents };
  }

  // Déplacement, interception et résolution des groupes non joueurs.
  advanceAutonomousGroups(now = this.now()) {
    this.capitalAiService.update(this, now);
    if (this.status === "finished") return { events: [], traces: [] };
    for (const group of this.autonomousGroups) {
      if (
        group.mission?.managedBy === "prospecting_post" &&
        ["destroyed", "mission_failed"].includes(group.status) &&
        group.mission.populationAway > 0
      ) {
        const origin = this.getLocation(group.originLocationId);
        if (origin)
          origin.statistics.prospectingPopulationAway = Math.max(
            0,
            (origin.statistics.prospectingPopulationAway ?? 0) -
              group.mission.populationAway,
          );
        group.mission.populationAway = 0;
        group.mission.active = false;
      }
    }
    this.locationWatchService.update(this, now);
    const targets = this.heroes
      .filter(
        (hero) =>
          hero.state === "active" &&
          hero.position !== null &&
          this.getPlayer(hero.playerId) !== null,
      )
      .map((hero) => ({
        id: hero.id,
        kind: "hero",
        playerId: hero.playerId,
        position: hero.position,
        hostile: true,
        concealmentMultiplier:
          this.heroClassFeatureService.signatureMultiplier(hero),
      }));
    const result = this.autonomousGroupService.advance({
      groups: this.autonomousGroups.filter(
        (group) => !isSuspendedQuestGroup(this, group),
      ),
      locations: this.locations,
      resourceZones: this.resourceZones,
      inspectExplorationSegment: (group, segment) =>
        this.explorationDiscoveryService.inspectProspectingSegment(
          group,
          segment,
        ),
      targets,
      playArea: this.setup.playArea,
      now,
      speedFor: (group) => this.#autonomousGroupSpeed(group),
    });
    this.autonomousGroupTraces.push(...result.traces);
    this.autonomousGroupTraces = this.autonomousGroupTraces.filter(
      (trace) => trace.getScore(now) > 0,
    );
    result.events.forEach((event) => {
      if (event.type === "relay_messenger_arrived") {
        const group = this.getAutonomousGroup(event.groupId);
        const target = this.getHero(group.mission.targetId);
        if (
          target?.state === "active" &&
          watchDistance(this.coordinateMode, group.position, target.position) <=
            (this.coordinateMode === "simulation" ? 1 : 5)
        ) {
          group.status = "completed";
          this.locationWatchService.deliver(this, group.id, now);
        } else group.status = "idle";
      }

      if (event.type === "resource_zone_discovered")
        this.#resolveResourceZoneDiscovery(event);
      const evacuationAttack = this.#resolveUnopposedEvacuationAttack(event);
      const battle = evacuationAttack.handled
        ? null
        : this.#createBattleFromAutonomousEvent(event);
      if (battle !== null) event.battleId = battle.id;
      if (
        event.type === "autonomous_group_location_attack_requested" &&
        battle === null
      )
        this.locationWatchService.attack(this, event.locationId, event.groupId);
      if (evacuationAttack.outcome !== null)
        event.evacuationOutcome = evacuationAttack.outcome;
      this.eventLog.push(structuredClone(event));
    });
    return result;
  }

  resolveAutonomousInterception({
    groupId,
    action = "intercept",
    now = this.now(),
  }) {
    const group = this.getAutonomousGroup(groupId);
    if (group === null) return { success: false, reason: "group_not_found" };
    const result = this.autonomousGroupService.resolveInterception(group, {
      action,
      now,
    });
    if (!result.success) return result;
    if (result.trace !== null) this.autonomousGroupTraces.push(result.trace);
    const event = {
      type:
        result.outcome === "battle_requested"
          ? "autonomous_group_attack_requested"
          : `autonomous_group_${result.outcome}`,
      groupId,
      target: result.target,
      information: result.information,
      cargo: result.cargo,
      at: result.at,
    };
    if (result.information !== null) {
      const interceptor =
        result.target.kind === "hero" ? this.getHero(result.target.id) : null;
      const player =
        interceptor === null ? null : this.getPlayer(interceptor.playerId);
      if (player !== null) {
        const informationId = this.idGenerator("information");
        player.receiveInformation({
          id: informationId,
          source: {
            type: "autonomous_group_interception",
            groupId,
            heroId: interceptor.id,
          },
          content: structuredClone(result.information),
          acquiredAt: result.at,
        });
        this.#applyInformationMapEffects(
          player,
          result.information.mapEffects ??
            result.information.content?.mapEffects ??
            [],
        );
        event.informationId = informationId;
      }
    }
    const battle = this.#createBattleFromAutonomousEvent(event);
    if (battle !== null) event.battleId = battle.id;
    this.eventLog.push(structuredClone(event));
    return { ...result, event };
  }

  placeScoutWatchBeacon({ playerId, heroId, position = null, radius = null }) {
    const hero = this.getHero(heroId);
    const player = this.getPlayer(playerId);
    if (hero === null || player === null || hero.playerId !== player.id)
      return { success: false, reason: "hero_not_found" };
    const features = this.heroClassFeatureService.featuresFor(hero);
    if (features.canPlaceWatchBeacon !== true)
      return { success: false, reason: "class_cannot_place_watch_beacon" };
    if (hero.state !== "active" || this.#isHeroBusy(hero.id))
      return { success: false, reason: "hero_unavailable" };
    const beaconPosition = position ?? hero.position;
    if (!beaconPosition)
      return { success: false, reason: "hero_position_unknown" };
    const now = this.now();
    const beaconRadius =
      radius ?? this.heroClassFeatureService.watchBeaconRadius(hero);
    const maximum = features.maximumWatchBeacons ?? 3;
    if (
      !Number.isFinite(beaconRadius) ||
      beaconRadius <= 0 ||
      !Number.isInteger(maximum) ||
      maximum <= 0
    )
      return { success: false, reason: "invalid_watch_beacon_configuration" };
    const owned = this.watchBeacons
      .filter((beacon) => beacon.sourceHeroId === hero.id)
      .sort((first, second) => first.placedAt - second.placedAt);
    const removedBeacon =
      owned.length >= maximum
        ? this.watchBeacons.splice(
            this.watchBeacons.findIndex((beacon) => beacon.id === owned[0].id),
            1,
          )[0]
        : null;
    const beacon = new ScoutWatchBeacon({
      id: this.idGenerator("watch-beacon"),
      ownerPlayerId: player.id,
      sourceHeroId: hero.id,
      position: beaconPosition,
      radius: beaconRadius,
      placedAt: now,
    });
    this.watchBeacons.push(beacon);
    if (removedBeacon)
      this.eventLog.push({
        type: "watch_beacon_removed",
        beaconId: removedBeacon.id,
        sourceHeroId: hero.id,
        reason: "capacity_rotation",
        at: now,
      });
    this.eventLog.push({
      type: "watch_beacon_placed",
      beaconId: beacon.id,
      sourceHeroId: hero.id,
      ownerPlayerId: player.id,
      position: { ...beacon.position },
      at: now,
    });
    return {
      success: true,
      beacon: beacon.toJSON(),
      removedBeaconId: removedBeacon?.id ?? null,
      count: this.watchBeacons.filter((entry) => entry.sourceHeroId === hero.id)
        .length,
      maximum,
    };
  }

  getWatchBeaconsForPlayer(playerId) {
    return this.watchBeacons
      .filter((beacon) => beacon.ownerPlayerId === playerId)
      .map((beacon) => beacon.toJSON());
  }

  scanWatchBeacons(now = this.now()) {
    const events = [];
    for (const beacon of this.watchBeacons) {
      const targets = [
        ...this.heroes
          .filter(
            (candidate) =>
              candidate.state === "active" &&
              candidate.position &&
              candidate.playerId !== beacon.ownerPlayerId,
          )
          .map((candidate) => ({
            key: `hero:${candidate.id}`,
            kind: "hero",
            id: candidate.id,
            playerId: candidate.playerId,
            name: candidate.name,
            position: { ...candidate.position },
          })),
        ...this.autonomousGroups
          .filter(
            (group) =>
              group.position &&
              !["destroyed", "mission_failed"].includes(group.status) &&
              !(
                group.owner.kind === "player" &&
                group.owner.id === beacon.ownerPlayerId
              ),
          )
          .map((group) => ({
            key: `autonomous_group:${group.id}`,
            kind: "autonomous_group",
            id: group.id,
            type: group.type,
            factionId: group.factionId,
            soldiers: group.army.units.reduce(
              (sum, unit) => sum + unit.combatantCount,
              0,
            ),
            position: { ...group.position },
          })),
      ].filter(
        (target) =>
          this.#worldDistance(beacon.position, target.position) <=
          beacon.radius,
      );
      const previous = new Set(
        beacon.visibleTargets.map((target) => target.key),
      );
      for (const target of targets.filter(
        (candidate) => !previous.has(candidate.key),
      )) {
        const event = {
          type: "watch_beacon_target_detected",
          beaconId: beacon.id,
          sourceHeroId: beacon.sourceHeroId,
          ownerPlayerId: beacon.ownerPlayerId,
          target: structuredClone(target),
          at: now,
        };
        events.push(event);
        this.eventLog.push(structuredClone(event));
      }
      beacon.visibleTargets = targets.map((target) => structuredClone(target));
    }
    return events;
  }

  finish(reason = "manual") {
    if (this.status !== "started") return false;
    this.status = "finished";
    this.finishedAt = this.now();
    this.finishReason = Game.#requireText(reason, "La raison de fin");
    return true;
  }

  // Runtime narratif : placements, événements, choix et séquence de quêtes.
  completeScenarioObjective(objectiveId) {
    if (!this.questSystemEnabled) return false;
    if (this.scenarioState === null) return false;
    return this.scenarioState.completeObjective(objectiveId);
  }

  startScenarioRuntime(position) {
    if (!this.questSystemEnabled) return [];
    if (
      this.scenario !== null &&
      this.scenarioState?.getCurrentPhaseState().status === "locked"
    ) {
      this.scenarioState.activateOfferedPhase(
        this.scenario,
        this.scenario.initialPhaseId,
      );
      this.eventLog.push({
        type: "scenario_started",
        phaseId: this.scenario.initialPhaseId,
        at: this.now(),
      });
    }
    if (this.scenarioState?.getCurrentPhaseState().status !== "active")
      return [];
    const slotIds = this.scenarioRuntimeBuilder.start(
      this.scenarioRuntime,
      position,
      this.scenarioState?.currentPhaseId ?? null,
    );
    if (slotIds.length > 0)
      this.eventLog.push({
        type: "scenario_placement_started",
        slotIds,
        position: { ...position },
        at: this.now(),
      });
    return slotIds;
  }

  startCurrentScenarioPlacements(position) {
    if (!this.questSystemEnabled) return [];
    RepressionQuest.preparePlacements(this);
    return this.scenarioRuntimeBuilder.start(
      this.scenarioRuntime,
      position,
      this.scenarioState?.currentPhaseId ?? null,
    );
  }

  updateScenarioPosition({ position, accuracy = null }) {
    if (!this.questSystemEnabled) return [];
    RepressionQuest.preparePlacements(this);
    if (!this.setup.playArea.contains(position)) return [];
    this.scenarioRuntimeBuilder.start(
      this.scenarioRuntime,
      position,
      this.scenarioState?.currentPhaseId ?? null,
    );
    return RepressionQuest.updatePlacements(
      this,
      this.scenarioRuntimeBuilder.update(this.scenarioRuntime, {
        position,
        accuracy,
        distanceFn:
          RepressionQuest.enabled(this) &&
          ["locate-village", "return-journey"].includes(
            this.scenarioState?.currentPhaseId,
          ) &&
          this.coordinateMode === "simulation"
            ? (a, b) => RepressionQuest.distance(this, a, b)
            : undefined,
      }),
      position,
    );
  }

  placeScenarioLocation({ locationSlotId, position }) {
    if (!this.questSystemEnabled) return questSystemUnavailable();
    const encounter = RepressionQuest.placement(this, locationSlotId, position);
    if (!encounter.success) return encounter;
    if (!this.setup.playArea.allowsPlacement(position))
      return { success: false, reason: "outside_play_area" };
    const targetPlacement = this.scenarioRuntime?.placements[locationSlotId];
    const targetLocation = targetPlacement
      ? this.getLocation(targetPlacement.locationId)
      : null;
    if (targetLocation) {
      if (
        !this.setup.playArea.allowsPlacement(
          encounter.villagePosition ?? position,
        )
      )
        return { success: false, reason: "outside_play_area" };
      const spacing = new LocationSpacingPolicy({
        setup: this.setup,
        coordinateMode: this.coordinateMode,
      });
      const spaced = spacing.check(
        targetLocation,
        encounter.villagePosition ?? position,
        placedLocations(this),
      );
      if (!spaced.success) return spaced;
    }
    const result = this.scenarioRuntimeBuilder.place(
      this.scenarioRuntime,
      locationSlotId,
      encounter.villagePosition ?? position,
    );
    if (!result.success) return result;
    if (encounter.villagePosition)
      this.worldState.set("repression.provostPosition", { ...position });
    const moved = this.updateLocationPosition({
      locationId: result.locationId,
      position: result.position,
    });
    if (!moved.success) return moved;
    const location = this.getLocation(result.locationId);
    // Le lieu placé doit être présent dans la réponse officielle de cette commande.
    this.players.forEach((player) => player.discoverLocation(location.id, 3));
    this.eventLog.push({
      type: "scenario_location_placed",
      locationSlotId,
      locationId: location.id,
      position: { ...result.position },
      at: this.now(),
    });
    const quest = this.dispatchQuestEvent({
      type: "LocationPlaced",
      locationSlotId,
      locationId: location.id,
    });
    return { ...result, quest };
  }

  playerPlacementCommand(args) {
    return this.playerPlacementService.command(
      this,
      args,
      args.officialPosition,
    );
  }

  updateLocationPosition({ locationId, position }) {
    if (!this.setup.playArea.allowsPlacement(position))
      return { success: false, reason: "outside_play_area" };
    const location = this.getLocation(locationId);
    if (location === null)
      return { success: false, reason: "location_not_found" };
    if (this.status !== undefined) {
      const spacing = new LocationSpacingPolicy({
        setup: this.setup,
        coordinateMode: this.coordinateMode,
      });
      const result = spacing.check(location, position, placedLocations(this));
      if (!result.success) return result;
    }
    location.position = {
      latitude: position.latitude,
      longitude: position.longitude,
    };
    const binding = this.scenarioLocationBindings.find(
      (candidate) => candidate.locationId === locationId,
    );
    const placement = binding
      ? this.scenarioRuntime?.placements[binding.locationSlotId]
      : null;
    if (placement?.status === "setup-pending") placement.status = "placed";
    if (placement?.status === "placed")
      placement.position = { ...location.position };
    return { success: true, locationId, position: { ...location.position } };
  }

  /** Placement atomique d'un ensemble : aucune modification partielle en cas de refus. */
  updateLocationPositions(placements) {
    const movingIds = new Set(placements.map((entry) => entry.locationId));
    if (movingIds.size !== placements.length)
      return { success: false, reason: "duplicate_location" };
    const planned = [];
    for (const entry of placements) {
      const location = this.getLocation(entry.locationId);
      if (!location) return { success: false, reason: "location_not_found" };
      if (!this.setup.playArea.allowsPlacement(entry.position))
        return { success: false, reason: "outside_play_area" };
      planned.push({ ...location, position: { ...entry.position } });
    }
    const spacing = new LocationSpacingPolicy({
      setup: this.setup,
      coordinateMode: this.coordinateMode,
    });
    const others = [
      ...placedLocations(this).filter(
        (location) => !movingIds.has(location.id),
      ),
      ...planned,
    ];
    for (const location of planned) {
      const result = spacing.check(location, location.position, others);
      if (!result.success) return result;
    }
    for (const entry of placements) {
      this.getLocation(entry.locationId).position = { ...entry.position };
      for (const placement of Object.values(
        this.scenarioRuntime?.placements ?? {},
      ))
        if (
          placement.locationId === entry.locationId &&
          placement.status === "placed"
        )
          placement.position = { ...entry.position };
    }
    return { success: true };
  }

  dispatchQuestEvent(event) {
    if (event.type === "LocationEntered") {
      const visitor = this.getHero(event.actorId);
      const visited = this.getLocation(event.locationId);
      if (visitor && visited?.heroIds.includes(visitor.id))
        this.itemAcquisitionService.recordVisit(visitor, visited);
    }
    if (!this.questSystemEnabled) {
      if (event.type === "LocationEntered" && event.actorId)
        this.trainHeroAtLocation({
          heroId: event.actorId,
          locationId: event.locationId,
        });
      return null;
    }
    this.activeQuestActorId = event.actorId ?? this.activeQuestActorId;
    RepressionQuest.arrival(this, event);
    if (this.#failExpiredQuestDeadline()) return null;
    if (event.type === "LocationEntered" && event.actorId)
      this.trainHeroAtLocation({
        heroId: event.actorId,
        locationId: event.locationId,
      });
    if (
      event.type === "LocationEntered" &&
      this.scenarioState?.currentPhaseId === "prepare-evacuation"
    ) {
      const capital = this.getLocationForScenarioSlot("capital");
      if (event.locationId === capital.id) {
        const state = this.evacuationStates["royal-camp-evacuation"];
        const source = state ? this.getLocation(state.sourceLocationId) : null;
        if (state && source) {
          state.departedAt ??= this.now();
          state.resourcesRemaining ??= structuredClone(source.resources.stock);
          state.structuresRemaining ??= Object.values(
            source.infrastructure,
          ).reduce((sum, level) => sum + level, 0);
          this.scenarioState.redirectToPhase(
            this.scenario,
            "return-evacuees-to-capital",
          );
          this.eventLog.push({
            type: "evacuation_departure_inferred_at_capital",
            evacuationId: state.id,
            at: this.now(),
          });
        }
      }
    }
    return RepressionQuest.settleArrival(
      this,
      event,
      this.questRuntime.dispatch(event, this),
    );
  }

  trainHeroAtLocation({ heroId, locationId }) {
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (hero === null || location === null)
      return { success: false, reason: "hero_or_location_not_found" };
    if (
      hero.state !== "active" ||
      !location.heroIds.includes(hero.id) ||
      !this.locationAccessPolicy.can(hero.playerId, location, "train")
    )
      return { success: false, reason: "location_access_denied" };
    const visits = (hero.classFeatureState.infrastructureTraining ??= {});
    const results = [];
    if ((location.infrastructure.tavern ?? 0) > 0) {
      const tavernState = (hero.classFeatureState.tavernMorale ??= {});
      if (!tavernState.active) {
        const value = location.infrastructure.tavern;
        hero.recordMoraleFactor("location", value, `tavern:${location.id}`);
        tavernState.active = { locationId: location.id, value };
        results.push({ buildingId: "tavern", morale: value });
      }
    }
    if (
      (location.infrastructure.healing_tent ?? 0) >= 2 &&
      !hero.classFeatureState.healingMorale
    ) {
      hero.recordMoraleFactor("location", 1, "healing_tent");
      hero.classFeatureState.healingMorale = true;
      results.push({ buildingId: "healing_tent", morale: 1 });
    }
    const train = (
      buildingId,
      allowedAptitudeIds,
      maximum = location.infrastructure[buildingId] ?? 0,
    ) => {
      if ((location.infrastructure[buildingId] ?? 0) <= 0) return;
      const visitId = `${location.id}:${buildingId}`;
      const completed = Number(visits[visitId] ?? 0);
      if (completed >= maximum) return;
      visits[visitId] = completed + 1;
      hero.statGrowth.attack += 1;
      hero.statGrowth.defense += 1;
      const aptitudeId =
        allowedAptitudeIds.find(
          (id) => !Object.hasOwn(hero.aptitudeRanks, id),
        ) ?? null;
      if (aptitudeId) {
        hero.aptitudeRanks[aptitudeId] = "novice";
        const aptitude = this.heroProgressionService.aptitudes.get(aptitudeId);
        if (["active", "reaction"].includes(aptitude?.type))
          hero.addSpecialPower(aptitudeId);
        else hero.addSkill(aptitudeId);
      }
      results.push({ buildingId, aptitudeId, attack: 1, defense: 1 });
    };
    const heroClass = this.heroClasses.get(hero.classId);
    train("barracks", [], 1);
    train("military_school", [
      ...(heroClass?.aptitudeIds ?? []),
      ...(heroClass?.commonAptitudeIds ?? []),
    ]);
    if (hero.classId === "mage")
      train("magic_academy", heroClass?.aptitudeIds ?? []);
    results.forEach((result) =>
      this.eventLog.push({
        type: "hero_infrastructure_training",
        heroId,
        locationId,
        ...result,
        at: this.now(),
      }),
    );
    return { success: results.length > 0, results };
  }

  getQuestChoices() {
    if (!this.questSystemEnabled) return [];
    const phase = this.scenario?.getPhase(this.scenarioState?.currentPhaseId);
    if (!phase || this.scenarioState.getCurrentPhaseState().status !== "active")
      return [];
    return phase.choices
      .filter((choice) => this.matchesScenarioCondition(choice.condition))
      .map((choice) => ({ id: choice.id, label: choice.label }));
  }

  selectQuestChoice(choiceId, { heroId = null } = {}) {
    if (!this.questSystemEnabled) return questSystemUnavailable();
    if (heroId) this.activeQuestActorId = heroId;
    if (
      !RepressionQuest.choiceAllowed(
        this,
        choiceId,
        RepressionQuest.actor(this),
      )
    )
      return { success: false, reason: "quest_interaction_out_of_range" };
    const phase = this.scenario?.getPhase(this.scenarioState?.currentPhaseId);
    const state = this.scenarioState?.getCurrentPhaseState();
    if (!phase || state?.status !== "active")
      return { success: false, reason: "quest_unavailable" };
    const choice = phase.choices.find((candidate) => candidate.id === choiceId);
    if (!choice || !this.matchesScenarioCondition(choice.condition))
      return { success: false, reason: "choice_unavailable" };
    state.objectives.forEach((objective) => {
      if (objective.state === "active") objective.state = "completed";
    });
    const appliedEvent = choice.eventId
      ? this.triggerScenarioEvent(choice.eventId)
      : null;
    if (!this.advanceScenario(choice.nextPhase))
      return { success: false, reason: "invalid_transition" };
    const result = {
      success: true,
      type: "quest_choice_selected",
      choiceId,
      phaseId: phase.id,
      nextPhaseId: choice.nextPhase,
      appliedEvent,
    };
    this.eventLog.push({ ...result, at: this.now() });
    return result;
  }

  matchesScenarioCondition(condition) {
    if (condition === undefined || condition === null) return true;
    if (condition.all)
      return condition.all.every((entry) =>
        this.matchesScenarioCondition(entry),
      );
    if (condition.any)
      return condition.any.some((entry) =>
        this.matchesScenarioCondition(entry),
      );
    if (condition.not) return !this.matchesScenarioCondition(condition.not);
    const actual = condition.npcId
      ? this.worldState.getNpc(condition.npcId)?.[condition.field]
      : this.worldState.get(condition.path);
    if (Object.hasOwn(condition, "equals")) return actual === condition.equals;
    if (Array.isArray(condition.in)) return condition.in.includes(actual);
    return Boolean(actual);
  }

  inspectTrailPoint(traceId) {
    if (!this.questSystemEnabled) return null;
    const trail =
      this.scenario?.trails.find((candidate) =>
        candidate.points.some((point) => point.traceId === traceId),
      ) ?? null;
    if (trail === null) return { success: false, reason: "trail_not_found" };
    const result = this.trailStates[trail.id].inspect(trail, traceId);
    if (result.success)
      this.eventLog.push({
        type: "trail_point_inspected",
        ...result,
        at: this.now(),
      });
    return result;
  }

  getTrailState(trailId) {
    return this.trailStates[trailId] ?? null;
  }

  getActiveQuest() {
    if (!this.questSystemEnabled) return null;
    if (this.scenario === null || this.scenarioState === null) return null;
    const phase = this.scenario.getPhase(this.scenarioState.currentPhaseId);
    const state = this.scenarioState.getCurrentPhaseState();
    if (state.status !== "active") return null;
    return {
      ...phase,
      choices: this.getQuestChoices(),
      status: state.status,
      failureReason: state.failureReason ?? null,
      objectives: state.objectives.map((objective) => ({ ...objective })),
    };
  }

  /** Commande serveur : le Proxy réseau transmet l'intention ; aucun secours local. */
  questEngineCommand() {
    throw new Error("Le nouveau moteur exige une session serveur officielle.");
  }

  getQuestEngineView() {
    return this.questEngineState?.view ?? null;
  }

  completeCurrentScenarioPhase() {
    if (!this.questSystemEnabled) return false;
    const phase = this.scenario?.getPhase(this.scenarioState?.currentPhaseId);
    const completed = this.scenarioState?.completeCurrentPhase() ?? false;
    if (
      completed &&
      phase &&
      phase.transitions.length === 0 &&
      phase.choices.length === 0
    ) {
      const actor =
        this.getHero(this.activeQuestActorId) ??
        this.heroes.find((hero) => hero.playerId === "local");
      if (actor)
        this.itemAcquisitionService.unlock({
          source: "mainQuest",
          key: `${this.scenario.id}:${phase.id}`,
          heroId: actor.id,
          classId: actor.classId,
        });
    }
    return completed;
  }

  configureQuestSequence(quests) {
    if (!this.questSystemEnabled) return false;
    if (this.scenario === null || !Array.isArray(quests) || quests.length < 1)
      throw new RangeError("La séquence exige au moins une quête.");
    const usedPhaseIds = new Set();
    this.questSequence = quests.map((quest) => {
      if (
        !quest?.id ||
        !quest?.startPhaseId ||
        !Array.isArray(quest.phaseIds) ||
        !quest.phaseIds.includes(quest.startPhaseId)
      )
        throw new TypeError("Une quête de la séquence est invalide.");
      quest.phaseIds.forEach((phaseId) => {
        if (
          this.scenario.getPhase(phaseId) === null ||
          usedPhaseIds.has(phaseId)
        )
          throw new RangeError(
            "Les phases du cycle doivent exister et appartenir à une seule quête.",
          );
        usedPhaseIds.add(phaseId);
      });
      return {
        id: quest.id,
        title: quest.title ?? quest.id,
        description: quest.description ?? "Nouvelle quête disponible.",
        briefingLines: Array.isArray(quest.briefingLines)
          ? [...quest.briefingLines]
          : [],
        startPhaseId: quest.startPhaseId,
        phaseIds: [...quest.phaseIds],
      };
    });
    return this.questSequence.map((quest) => ({
      ...quest,
      phaseIds: [...quest.phaseIds],
    }));
  }

  advanceQuestSequence({ outcome = "completed" } = {}) {
    if (!this.questSystemEnabled) return null;
    if (
      this.questSequence.length < 1 ||
      this.scenario === null ||
      this.scenarioState === null
    )
      return null;
    const currentIndex = this.questSequence.findIndex((quest) =>
      quest.phaseIds.includes(this.scenarioState.currentPhaseId),
    );
    if (currentIndex < 0) return null;
    const current = this.questSequence[currentIndex];
    const next = this.questSequence[currentIndex + 1] ?? null;
    if (next) this.offerQuest(next);
    this.lastQuestResult = {
      questId: current.id,
      title: current.title,
      outcome,
      nextQuestId: next?.id ?? null,
      at: this.now(),
    };
    const result = {
      type: "quest_sequence_advanced",
      questId: current.id,
      nextQuestId: next?.id ?? null,
      nextPhaseId: null,
      outcome,
      at: this.now(),
    };
    this.eventLog.push(result);
    if (
      current.id === "granaries-of-the-king" &&
      this.worldState.get("capitalAi.enabled") &&
      !this.worldState.get("capitalAi.hostile")
    ) {
      const betrayal = this.scenario.getEvent("capital-betrayal");
      if (betrayal) {
        this.scenarioEffectResolver.apply(betrayal, this);
        this.acceptAvailableQuest("capital-reconquest");
      }
    }
    return result;
  }

  settleQuestSequenceTerminalPhase() {
    if (!this.questSystemEnabled) return null;
    const phase = this.scenario?.getPhase(this.scenarioState?.currentPhaseId);
    if (
      !phase ||
      phase.objectives.length > 0 ||
      phase.transitions.length > 0 ||
      this.scenarioState.getCurrentPhaseState().status !== "active"
    )
      return null;
    if (!this.completeCurrentScenarioPhase()) return null;
    return this.advanceQuestSequence({ outcome: "completed" });
  }

  prepareTestQuest({ playerId, heroId, questId, participantCount }) {
    if (!this.questSystemEnabled) return questSystemUnavailable();
    const hero = this.getHero(heroId);
    if (!hero || hero.playerId !== playerId)
      return { success: false, reason: "hero_not_found" };
    if (questId === "team-fort-test")
      return startLocalTeamFortTest(this, {
        heroId,
        participantCount,
        position: hero.position,
      });
    const quest = this.questSequence.find(
      (candidate) => candidate.id === questId,
    );
    if (!quest) return { success: false, reason: "quest_not_found" };
    if (this.getActiveQuest()) this.abandonCurrentQuest();
    if (!this.availableQuests.some((offer) => offer.id === quest.id))
      this.offerQuest(quest);
    return { success: true };
  }

  offerQuest({ id, title, description, startPhaseId, briefingLines = [] }) {
    if (!this.questSystemEnabled) return false;
    if (
      this.scenario?.getPhase(startPhaseId) === null ||
      this.availableQuests.some((quest) => quest.id === id)
    )
      return false;
    this.availableQuests.push({
      id,
      title,
      description,
      startPhaseId,
      briefingLines: Array.isArray(briefingLines) ? [...briefingLines] : [],
    });
    this.eventLog.push({
      type: "quest_available",
      questId: id,
      startPhaseId,
      at: this.now(),
    });
    return true;
  }

  getAvailableQuests() {
    if (!this.questSystemEnabled) return [];
    return this.availableQuests.map((quest) => ({
      ...quest,
      briefingLines: [...quest.briefingLines],
    }));
  }

  getLastQuestResult() {
    if (!this.questSystemEnabled) return null;
    return this.lastQuestResult === null ? null : { ...this.lastQuestResult };
  }

  acceptAvailableQuest(questId) {
    if (!this.questSystemEnabled) return questSystemUnavailable();
    const index = this.availableQuests.findIndex(
      (quest) => quest.id === questId,
    );
    if (index < 0) return { success: false, reason: "quest_not_available" };
    const quest = this.availableQuests[index];
    const sequenceQuest = this.questSequence.find(
      (candidate) => candidate.id === questId,
    );
    if (this.scenarioState.getCurrentPhaseState().status === "active")
      return { success: false, reason: "another_quest_active" };
    const activated = sequenceQuest
      ? this.scenarioState.restartPhases(this.scenario, sequenceQuest)
      : this.scenarioState.activateOfferedPhase(
          this.scenario,
          quest.startPhaseId,
        );
    if (!activated) return { success: false, reason: "another_quest_active" };
    if (sequenceQuest) {
      const placementSlotIds = new Set(
        sequenceQuest.phaseIds
          .flatMap((phaseId) => this.scenario.getPhase(phaseId).objectives)
          .filter((objective) => objective.trigger?.type === "locationPlaced")
          .map((objective) => objective.trigger.locationSlotId),
      );
      placementSlotIds.forEach((slotId) => {
        const placement = this.scenarioRuntime?.placements[slotId];
        if (placement?.strategy === "distance") {
          placement.status = "waiting";
          placement.origin = null;
          placement.position = null;
          placement.distanceMeters = 0;
          placement.confirmationCount = 0;
        }
      });
    }
    this.lastQuestResult = null;
    this.availableQuests.splice(index, 1);
    this.eventLog.push({
      type: "quest_accepted",
      questId,
      phaseId: quest.startPhaseId,
      at: this.now(),
    });
    return { success: true, quest: { ...quest } };
  }

  abandonCurrentQuest() {
    if (!this.questSystemEnabled) return questSystemUnavailable();
    return this.failCurrentQuest({ reason: "abandoned" });
  }

  failCurrentQuest({ reason = "failed" } = {}) {
    if (!this.questSystemEnabled) return null;
    if (
      this.scenario === null ||
      this.scenarioState === null ||
      this.scenarioState.getCurrentPhaseState().status !== "active"
    )
      return null;
    const phase = this.scenario.getPhase(this.scenarioState.currentPhaseId);
    const failure = phase.failure;
    const belongsToSequencedQuest = this.questSequence.some((quest) =>
      quest.phaseIds.includes(phase.id),
    );
    const isTerminalSequenceFailure =
      belongsToSequencedQuest && failure.scope !== "phase";
    let nextPhaseId = isTerminalSequenceFailure
      ? null
      : failure.policy === "branch"
        ? failure.nextPhase
        : failure.policy === "continue"
          ? (failure.nextPhase ?? phase.transitions[0]?.nextPhase ?? null)
          : null;
    const appliedEvent = failure.eventId
      ? this.triggerScenarioEvent(failure.eventId)
      : null;
    if (
      !this.scenarioState.failCurrentPhase(this.scenario, {
        reason,
        nextPhaseId,
        at: this.now(),
      })
    )
      return null;
    const sequence = isTerminalSequenceFailure
      ? this.advanceQuestSequence({ outcome: reason })
      : null;
    if (sequence) nextPhaseId = sequence.nextPhaseId;
    const result = {
      type: "quest_failed",
      phaseId: phase.id,
      reason,
      policy: failure.policy,
      nextPhaseId,
      nextQuestId: sequence?.nextQuestId ?? null,
      appliedEvent,
      at: this.now(),
    };
    this.eventLog.push(result);
    return result;
  }

  getQuestInteractionsForLocation(locationId) {
    if (!this.questSystemEnabled) return [];
    const active = this.getActiveQuest();
    if (active === null) return [];
    const binding = this.scenarioLocationBindings.find(
      (candidate) => candidate.locationId === locationId,
    );
    if (binding === undefined) return [];
    return active.objectives
      .filter(
        (objective) =>
          objective.state === "active" &&
          [
            "interactionCompleted",
            "resourceDelivery",
            "resourceCollection",
          ].includes(objective.trigger?.type) &&
          objective.trigger.locationSlotId === binding.locationSlotId,
      )
      .map((objective) => ({
        interactionId: objective.trigger.interactionId,
        label: objective.trigger.label ?? objective.text,
        responseLines: Array.isArray(objective.trigger.responseLines)
          ? [...objective.trigger.responseLines]
          : [],
      }));
  }

  triggerScenarioEvent(eventId) {
    if (!this.questSystemEnabled) return null;
    if (this.scenario === null || this.scenarioState === null) return null;
    const event = this.scenarioState.triggerEvent(this.scenario, eventId);
    if (event === null) return null;
    this.activeScenarioEventId = event.id;
    try {
      return {
        event,
        appliedEffects: this.scenarioEffectResolver.apply(event, this),
      };
    } finally {
      this.activeScenarioEventId = null;
    }
  }

  advanceScenario(nextPhaseId) {
    if (!this.questSystemEnabled) return false;
    if (this.scenario === null || this.scenarioState === null) return false;
    return this.scenarioState.advance(this.scenario, nextPhaseId);
  }

  // Progression, administration et interactions des localisations.
  getLocationRelation(playerId, locationId) {
    const location = this.getLocation(locationId);
    return location === null
      ? null
      : this.locationAccessPolicy.getRelation(playerId, location);
  }

  getCampDevelopment(locationId, heroId = null) {
    const location = this.getLocation(locationId);
    if (
      location === null ||
      !["camp", "village", "town", "capital", "fort"].includes(location.type)
    )
      return null;
    if(this.explorationView && location.terrain)return structuredClone(this.explorationView.campDevelopments?.find(entry=>entry.locationId===locationId && entry.heroId===heroId)?.development ?? null);
    const candidate = this.getHero(heroId);
    const hero =
      candidate &&
      location.heroIds.includes(candidate.id) &&
      this.locationAccessPolicy.can(candidate.playerId, location, "build")
        ? candidate
        : null;
    return campDevelopmentState(location,hero,this.campImprovementService,this.locationProgressionService);
  }

  gainLocationExperience({ locationId, amount, source = "activity" }) {
    const location = this.getLocation(locationId);
    if (location === null)
      return { success: false, reason: "location_not_found" };
    return {
      success: true,
      ...this.locationProgressionService.awardExperience(
        location,
        amount,
        source,
      ),
    };
  }

  buildCampImprovement({ playerId, heroId, locationId, improvementId }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if(location?.terrain && !this.campInstallationService.canInteract(hero,location))return {success:false,reason:"hero_not_at_location"};
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(player.id, location, "build"))
      return { success: false, reason: "location_not_owned" };
    const result = this.campImprovementService.build(
      location,
      improvementId,
      hero,
    );
    if (result.success)
      this.eventLog.push({
        type: "camp_improvement_built",
        playerId,
        heroId,
        locationId,
        improvementId,
        level: result.level,
        at: this.now(),
      });
    return result;
  }

  levelUpCamp({ playerId, heroId, locationId }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if(location?.terrain && !this.campInstallationService.canInteract(hero,location))return {success:false,reason:"hero_not_at_location"};
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (this.getLocationRelation(player.id, location.id) !== "owned")
      return { success: false, reason: "location_not_owned" };
    const result = this.campImprovementService.levelUp(location, hero);
    if (result.success)
      this.eventLog.push({
        type: "camp_level_up",
        playerId,
        heroId,
        locationId,
        level: location.level,
        at: this.now(),
      });
    return result;
  }

  evolveCamp({ playerId, heroId, locationId, branchId }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if(location?.terrain && !this.campInstallationService.canInteract(hero,location))return {success:false,reason:"hero_not_at_location"};
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(player.id, location, "build"))
      return { success: false, reason: "location_not_owned" };
    if (
      branchId !== "fort" &&
      this.teamFortQuestService.quests.some(
        (quest) => quest.locationId === locationId && quest.status === "active",
      )
    )
      return { success: false, reason: "team_fort_requires_fort" };
    const result = this.campImprovementService.evolve(location, branchId, hero);
    if (result.success)
      this.eventLog.push({
        type: "camp_evolved",
        playerId,
        heroId,
        locationId,
        branchId,
        evolvedTo: result.evolvedTo,
        at: this.now(),
      });
    if (result.success) this.teamFortQuestService.check(this);
    return result;
  }

  canPerformLocationAction({ playerId, locationId, action }) {
    const repressionAccess = RepressionQuest.actionAllowed(
      this,
      locationId,
      action,
    );
    if (repressionAccess !== null) return repressionAccess;
    const location = this.getLocation(locationId);
    if (location === null) return false;
    const temporarilyAuthorized =
      ["manageReserves", "dismantle"].includes(action) &&
      this.#canOperateEvacuationSource(playerId, locationId);
    if (
      !temporarilyAuthorized &&
      !this.locationAccessPolicy.can(playerId, location, action)
    )
      return false;
    if (action === "attack" && location.features.capturable === true)
      return ["battle_required", "can_capture"].includes(
        this.getLocationCaptureRequirement({ playerId, locationId }).state,
      );
    return true;
  }

  tradeAtLocation({ playerId, heroId, locationId, ...transaction }) {
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      !hero ||
      !location ||
      hero.playerId !== playerId ||
      !location.heroIds.includes(heroId) ||
      !this.locationAccessPolicy.can(playerId, location, "trade")
    )
      return { success: false, reason: "market_unavailable" };
    const result = this.marketService.execute({
      ...transaction,
      hero,
      location,
      preview: false,
    });
    if (result.success)
      result.locationExperienceGained = awardCampActivityExperience(
        this.locationProgressionService,
        location,
        "trade",
        result.lots,
      );
    if (result.success)
      this.eventLog.push({
        type: "market_trade",
        playerId,
        heroId,
        locationId,
        ...result,
        at: this.now(),
      });
    return result;
  }

  getLocationChiefConversation({
    playerId,
    locationId,
    heroId = null,
    source = "chief",
  }) {
    if (source === "forge") {
      const context = this.itemAcquisitionContext({
        playerId,
        heroId,
        locationId,
      });
      if (
        !context ||
        !context.canTrade ||
        !(context.location.infrastructure.forge >= 1)
      )
        return null;
      const remaining = Math.max(
        0,
        3 - (this.itemAcquisitionService.state.forgeUses[locationId] ?? 0),
      );
      return buildingConversation({
        buildingId: "forge",
        location: context.location,
        remaining,
        options: this.itemAcquisitionService
          .offers(context)
          .filter((offer) => ["forge", "supply"].includes(offer.source))
          .map((offer) => ({
            id: `item:${offer.id}`,
            kind: "equipment",
            itemId: offer.itemId,
            label: offer.label,
          })),
      });
    }
    if (source === "equipment") {
      const context = this.itemAcquisitionContext({
        playerId,
        heroId,
        locationId,
      });
      if (!context) return null;
      const visits = this.itemAcquisitionService.state.visits[heroId] ?? [];
      const treasureLocation = visits[2] ? this.getLocation(visits[2]) : null;
      return {
        locationId,
        name: `Équipements · ${context.location.name}`,
        title: "Équipements",
        portrait: null,
        openingLines: [
          `Les équipements sont en stock limité pour toute la partie. La forge accepte trois commandes au total ; les outils d’exploration restent disponibles à volonté pour 2 or dès le niveau 1. Fragments de carte : ${Math.min(3, visits.length)}/3. ${treasureLocation ? `Trésor repéré : ${treasureLocation.name}.` : "Visitez trois lieux distincts pour localiser un trésor au troisième lieu."} Les récompenses sont à retirer ici depuis tout lieu accessible. Une prospection révèle un gisement ; elle ne construit pas de mine et ne donne pas d’équipement.`,
        ],
        options: [
          ...this.explorationClueService.offers(context, source),
          ...this.itemAcquisitionService.offers(context).map((offer) => ({
            id: `item:${offer.id}`,
            kind: "equipment",
            itemId: offer.itemId,
            label: offer.label,
          })),
        ],
      };
    }
    if (RepressionQuest.actionAllowed(this, locationId, "talkChief") === false)
      return null;
    const location = this.getLocation(locationId);
    if (
      location === null ||
      !["chief", "tavern"].includes(source) ||
      !this.locationAccessPolicy.can(
        playerId,
        location,
        source === "tavern" ? "visitTavern" : "talkChief",
      )
    )
      return null;
    const conversation = (source === "chief"
      ? this.locationChiefService.getConversation({
          location,
          canTrade: this.locationAccessPolicy.can(playerId, location, "trade"),
          questsEnabled: this.questSystemEnabled,
          currentPhaseId: this.questSystemEnabled
            ? (this.scenarioState?.currentPhaseId ?? null)
            : null,
          currentPhaseStatus:
            this.scenarioState?.getCurrentPhaseState().status ?? null,
          isObjectiveCompleted: (id) => this.isObjectiveCompleted(id),
        })
      : buildingConversation({ buildingId: "tavern", location })) ?? {
      locationId,
      name:
        source === "tavern"
          ? `Taverne de ${location.name}`
          : `Chef de ${location.name}`,
      title: source === "tavern" ? "Tavernier" : "Chef du village",
      portrait: null,
      openingLines: ["Une petite mission vous intéresse ?"],
      options: [],
    };
    const questHero = heroId
      ? this.getHero(heroId)
      : this.heroes.find((entry) => entry.playerId === playerId);
    if (
      this.questSystemEnabled &&
      source === "chief" &&
      questHero?.playerId === playerId
    )
      conversation.options.push(
        ...this.teamFortQuestService.options(this, questHero, location),
      );
    if (
      this.questSystemEnabled &&
      questHero?.playerId === playerId &&
      (["camp", "village"].includes(location.type) || source === "tavern")
    )
      conversation.options.push(
        ...this.sideQuestService.options(
          questHero,
          location,
          source,
          this.locations.filter((entry) =>
            this.locationAccessPolicy.can(playerId, entry, "talkChief"),
          ),
        ),
      );
    if (source === "tavern") {
      const itemContext = this.itemAcquisitionContext({
        playerId,
        heroId: questHero?.id,
        locationId,
      });
      if (itemContext)
        conversation.options.push(
          ...this.explorationClueService.offers(itemContext, source),
          ...this.itemAcquisitionService
            .offers(itemContext)
            .filter((offer) => offer.source === "fence")
            .map((offer) => ({
              id: `item:${offer.id}`,
              kind: "equipment",
              itemId: offer.itemId,
              label: offer.label,
            })),
        );
      const board = this.getTavernNpcOffers({ playerId, locationId });
      conversation.options.push(
        ...(board.offers ?? []).map((npc) => ({
          id: `tavern-npc:${npc.id}`,
          kind: "tavern_npc",
          appearance: npc.appearance,
          label: `${npc.name} · ${
            npc.questId
              ? "quête requise"
              : Object.entries(npc.costs)
                  .map(([id, amount]) => `${amount} ${id}`)
                  .join(" · ")
          }`,
        })),
      );
    }
    const rumorContext = questHero
      ? this.itemAcquisitionContext({
          playerId,
          heroId: questHero.id,
          locationId,
        })
      : null;
    if (rumorContext)
      conversation.options.push(
        ...this.explorationRumorService.offers(rumorContext, source),
      );
    return conversation;
  }

  selectLocationChiefOption({
    playerId,
    heroId,
    locationId,
    optionId,
    source = "chief",
  }) {
    if (
      typeof optionId === "string" &&
      (optionId.startsWith("rumor-action:") ||
        optionId.startsWith("tavern-rumor:"))
    ) {
      const context = this.itemAcquisitionContext({
        playerId,
        heroId,
        locationId,
      });
      return context
        ? this.explorationRumorService.select(context, source, optionId)
        : { success: false, reason: "rumor_unavailable" };
    }
    if (typeof optionId === "string" && optionId.startsWith("clue-action:")) {
      const context = this.itemAcquisitionContext({
        playerId,
        heroId,
        locationId,
      });
      return context
        ? this.explorationClueService.select(context, source, optionId)
        : { success: false, reason: "clue_offer_unavailable" };
    }
    if (!this.questSystemEnabled && /^(side:|team-fort:|quest:)/.test(optionId))
      return questSystemUnavailable();
    if (
      ["equipment", "tavern", "forge"].includes(source) &&
      optionId.startsWith("item:")
    ) {
      const context = this.itemAcquisitionContext({
        playerId,
        heroId,
        locationId,
      });
      if (
        !context ||
        (source === "tavern" &&
          (!context.canTavern || !optionId.startsWith("item:fence:")))
      )
        return { success: false, reason: "item_offer_unavailable" };
      if (
        source === "forge" &&
        (!context.canTrade ||
          !(context.location.infrastructure.forge >= 1) ||
          !this.itemAcquisitionService
            .offers(context)
            .some(
              (offer) =>
                `item:${offer.id}` === optionId &&
                ["forge", "supply"].includes(offer.source),
            ))
      )
        return { success: false, reason: "item_offer_unavailable" };
      const result = this.itemAcquisitionService.acquire(
        context,
        optionId.slice(5),
      );
      if (result.success) {
        this.eventLog.push({
          type: "hero_item_acquired",
          playerId,
          heroId,
          locationId,
          ...result,
          at: this.now(),
        });
        this.dispatchQuestEvent({
          type: "ItemAcquired",
          actorId: heroId,
          locationId,
          itemId: result.itemId,
        });
      }
      return result;
    }
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      hero === null ||
      location === null ||
      hero.playerId !== playerId ||
      !location.heroIds.includes(hero.id) ||
      !["chief", "tavern"].includes(source) ||
      !this.locationAccessPolicy.can(
        playerId,
        location,
        source === "tavern" ? "visitTavern" : "talkChief",
      )
    )
      return { success: false, reason: "chief_unavailable" };
    if (source === "chief" && optionId.startsWith("team-fort:"))
      return this.teamFortQuestService.select(this, hero, location, optionId);
    if (
      optionId.startsWith("side:") &&
      (["camp", "village"].includes(location.type) || source === "tavern")
    )
      return this.sideQuestService.select(
        hero,
        location,
        source,
        this.locations.filter((entry) =>
          this.locationAccessPolicy.can(playerId, entry, "talkChief"),
        ),
        optionId,
      );
    if (source === "tavern" && optionId.startsWith("tavern-npc:")) {
      const result = this.acquireTavernNpc({
        playerId,
        heroId,
        locationId,
        npcId: optionId.slice("tavern-npc:".length),
      });
      if (result.success)
        result.message =
          result.npc.kind === "trainer"
            ? `${result.npc.name} vous forme : ${result.effect.heroStat} +${result.effect.statBonus}, +${result.effect.heroExperience} XP.`
            : `${result.npc.name} rejoint vos bagages.`;
      return result;
    }
    if (source !== "chief")
      return { success: false, reason: "chief_option_unavailable" };
    if (
      optionId.startsWith("trade-offer:") &&
      (!location.chief ||
        !this.locationAccessPolicy.can(playerId, location, "trade"))
    )
      return { success: false, reason: "trade_offer_unavailable" };
    const result = optionId.startsWith("trade-offer:")
      ? this.chiefTradeService.execute({
          hero,
          location,
          offerId: optionId.slice("trade-offer:".length),
        })
      : this.locationChiefService.select({
          location,
          optionId,
          canTrade: this.locationAccessPolicy.can(playerId, location, "trade"),
          questsEnabled: this.questSystemEnabled,
          currentPhaseId: this.questSystemEnabled
            ? (this.scenarioState?.currentPhaseId ?? null)
            : null,
          currentPhaseStatus:
            this.scenarioState?.getCurrentPhaseState().status ?? null,
          isObjectiveCompleted: (id) => this.isObjectiveCompleted(id),
        });
    if (result.success && result.kind === "secondary_quest") {
      const phase = this.scenario?.getPhase(result.questId);
      if (phase) {
        this.offerQuest({
          id: result.questId,
          title: phase.title,
          description: phase.description,
          startPhaseId: phase.id,
        });
        result.message = phase.title;
        result.lines = [
          phase.description,
          "La mission est disponible dans votre journal de quêtes.",
        ];
      }
    }
    if (result.success && optionId.startsWith("trade-offer:")) {
      result.locationExperienceGained = awardCampActivityExperience(
        this.locationProgressionService,
        location,
        "trade",
      );
      result.kind = "trade_offer";
      result.message = `Échange conclu. Il reste ${result.remaining} troc(s).`;
      result.lines = [result.message];
    }
    if (result.success)
      this.eventLog.push({
        type: "location_chief_interaction",
        playerId,
        heroId,
        locationId,
        optionId,
        kind: result.kind,
        at: this.now(),
      });
    return result;
  }

  getLocationCaptureRequirement({ playerId, locationId }) {
    const location = this.getLocation(locationId);
    if (location === null) return { state: "location_not_found" };
    if (
      location.heroIds.includes("capital-marshal") &&
      this.getHero("capital-marshal")?.state === "active" &&
      this.locationAccessPolicy.getRelation(playerId, location) === "enemy"
    )
      return { state: "battle_required" };
    return this.locationCaptureService.getRequirement({
      location,
      relation: this.locationAccessPolicy.getRelation(playerId, location),
      canCapture: this.locationAccessPolicy.canCapture(playerId, location),
      isQuestCompleted: (id) => this.isObjectiveCompleted(id),
    });
  }

  attemptLocationCapture({ playerId, heroId, locationId }) {
    const access = RepressionQuest.actionAllowed(this, locationId, "attack");
    if (access !== null)
      return {
        success: false,
        reason: access ? "battle_required" : "quest_locked",
      };
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      hero === null ||
      location === null ||
      hero.playerId !== playerId ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (
      location.heroIds.includes("capital-marshal") &&
      this.getHero("capital-marshal")?.state === "active" &&
      this.locationAccessPolicy.getRelation(playerId, location) === "enemy"
    )
      return { success: false, reason: "battle_required" };
    const result = this.locationCaptureService.capture({
      location,
      playerId,
      relation: this.locationAccessPolicy.getRelation(playerId, location),
      canCapture: this.locationAccessPolicy.canCapture(playerId, location),
      isQuestCompleted: (id) => this.isObjectiveCompleted(id),
    });
    if (result.success)
      this.eventLog.push({
        type: "location_captured",
        ...result,
        heroId,
        at: this.now(),
      });
    return result;
  }

  isObjectiveCompleted(objectiveId) {
    return (
      this.scenarioState !== null &&
      Object.values(this.scenarioState.phaseStates).some((phase) =>
        phase.objectives.some(
          (objective) =>
            objective.id === objectiveId && objective.state === "completed",
        ),
      )
    );
  }

  // Recrutement, garnisons et transferts de ressources ou de population.
  getRecruitmentAvailability({ playerId, heroId, locationId, unitTypeId }) {
    if (this.status !== "started")
      return { success: false, reason: "game_not_started" };
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id
    )
      return { success: false, reason: "invalid_recruitment_request" };
    if (!this.locationAccessPolicy.can(player.id, location, "recruit"))
      return { success: false, reason: "location_access_denied" };
    const preview = { typeId: unitTypeId, rank: "soldier" };
    const authority = this.getHeroAuthority(hero.id);
    if (authority.used + this.getUnitAuthorityCost(preview) > authority.maximum)
      return { success: false, reason: "insufficient_authority", authority };
    if (!location.heroIds.includes(hero.id))
      return { success: false, reason: "hero_not_at_location" };
    if (location.features.recruitment !== true)
      return { success: false, reason: "recruitment_not_available" };
    if (!location.recruitment.availableUnitTypeIds.includes(unitTypeId))
      return { success: false, reason: "unit_not_available" };
    if (hero.army.units.length >= hero.maxUnitStacks)
      return { success: false, reason: "army_full" };
    const definition = this.unitDefinitions.get(unitTypeId);
    if (definition === undefined)
      return { success: false, reason: "unknown_unit_type" };
    if (Math.floor(location.recruitment.stock[unitTypeId] ?? 0) <= 0)
      return { success: false, reason: "insufficient_recruits" };
    const missingResources = Object.entries(definition.costs)
      .filter(([resource, amount]) => hero.getResourceAmount(resource) < amount)
      .map(([resource]) => resource);
    if (missingResources.length > 0)
      return {
        success: false,
        reason: "insufficient_resources",
        missingResources,
      };
    return { success: true };
  }

  recruitUnit({ playerId, heroId, locationId, unitTypeId }) {
    const availability = this.getRecruitmentAvailability({
      playerId,
      heroId,
      locationId,
      unitTypeId,
    });
    if (!availability.success) return availability;
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    const result = this.recruitmentService.recruit({
      player,
      hero,
      location,
      typeId: unitTypeId,
      idGenerator: this.idGenerator,
      number: this.#nextUnitNumber(player.id, unitTypeId),
    });
    if (result.success)
      result.locationExperienceGained = awardCampActivityExperience(
        this.locationProgressionService,
        location,
        "recruitment",
      );
    return result;
  }

  completeHeroUnits({ playerId, heroId, locationId }) {
    const quote = this.getHeroUnitCompletionQuote({
      playerId,
      heroId,
      locationId,
    });
    if (!quote.success) return { ...quote, reinforced: [] };
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    Object.entries(quote.costs).forEach(([resource, amount]) => {
      if (amount > 0) hero.spendResource(resource, amount);
    });
    const result = this.recruitmentService.completeUnits({ hero, location });
    const added = result.reinforced.reduce((sum, unit) => sum + unit.added, 0);
    if (result.success && added > 0)
      result.locationExperienceGained = awardCampActivityExperience(
        this.locationProgressionService,
        location,
        "reinforcement",
      );
    return { ...result, costs: quote.costs };
  }

  getHeroUnitCompletionQuote({ playerId, heroId, locationId }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id
    )
      return { success: false, reason: "invalid_reinforcement_request" };
    if (!this.locationAccessPolicy.can(player.id, location, "reinforce"))
      return { success: false, reason: "location_access_denied" };
    if (!location.heroIds.includes(hero.id))
      return { success: false, reason: "hero_not_at_location" };
    const quantities = {};
    for (const unit of hero.army.units) {
      const available = Math.floor(
        location.recruitment.stock[unit.typeId] ?? 0,
      );
      const quantity = Math.min(unit.missingQuantity, available);
      if (quantity > 0)
        quantities[unit.typeId] = (quantities[unit.typeId] ?? 0) + quantity;
    }
    const soldiers = Object.values(quantities).reduce(
      (sum, value) => sum + value,
      0,
    );
    if (soldiers <= 0)
      return { success: false, reason: "no_compatible_recruits" };
    const costs = {};
    Object.entries(quantities).forEach(([typeId, quantity]) => {
      const definition = this.unitDefinitions.get(typeId);
      Object.entries(definition?.costs ?? {}).forEach(([resource, amount]) => {
        if (amount > 0)
          costs[resource] =
            (costs[resource] ?? 0) +
            Math.ceil((amount * quantity) / UNIT_RANKS[0].capacity);
      });
    });
    const missingResources = Object.entries(costs)
      .filter(([resource, amount]) => hero.getResourceAmount(resource) < amount)
      .map(([resource]) => resource);
    return missingResources.length > 0
      ? {
          success: false,
          reason: "insufficient_resources",
          costs,
          soldiers,
          missingResources,
        }
      : { success: true, costs, soldiers };
  }

  healHeroUnits({ playerId, heroId, locationId, timeUnits = 1 }) {
    const quote = this.getHeroUnitHealingQuote({
      playerId,
      heroId,
      locationId,
      timeUnits,
    });
    if (!quote.success) return { ...quote, restoredHealth: 0, units: [] };
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    hero.spendResource("gold", quote.costs.gold);
    const units = hero.army.units
      .map((unit) => ({ unitId: unit.id, ...unit.heal(timeUnits) }))
      .filter((result) => result.restoredHealth > 0);
    const restoredHealth = units.reduce(
      (sum, result) => sum + result.restoredHealth,
      0,
    );
    const locationExperienceGained =
      restoredHealth > 0
        ? awardCampActivityExperience(
            this.locationProgressionService,
            location,
            "healing",
          )
        : 0;
    return restoredHealth > 0
      ? {
          success: true,
          timeUnits,
          restoredHealth,
          units,
          costs: quote.costs,
          locationExperienceGained,
        }
      : {
          success: false,
          reason: "no_wounded_soldiers",
          restoredHealth: 0,
          units: [],
        };
  }

  getHeroUnitHealingQuote({ playerId, heroId, locationId, timeUnits = 1 }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      hero.state !== "active" ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(player.id, location, "heal"))
      return { success: false, reason: "location_access_denied" };
    if (!Number.isInteger(timeUnits) || timeUnits <= 0)
      return { success: false, reason: "invalid_time" };
    const soldiers = hero.army.units.reduce(
      (sum, unit) =>
        sum +
        unit.soldierHealth.filter((health) => health < unit.healthPerSoldier)
          .length,
      0,
    );
    if (soldiers <= 0) return { success: false, reason: "no_wounded_soldiers" };
    const costs = { gold: soldiers };
    return hero.getResourceAmount("gold") < costs.gold
      ? {
          success: false,
          reason: "insufficient_resources",
          costs,
          soldiers,
          missingResources: ["gold"],
        }
      : { success: true, costs, soldiers };
  }

  collectLocationResources({ playerId, heroId, locationId }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(player.id, location, "collect"))
      return { success: false, reason: "location_access_denied" };
    const collected = { ...location.resources.stock };
    if (Object.values(collected).every((amount) => amount <= 0))
      return { success: false, reason: "empty_stock" };
    Object.entries(collected).forEach(([resource, amount]) => {
      if (amount > 0) {
        hero.addResource(resource, amount);
        location.resources.stock[resource] = 0;
      }
    });
    return { success: true, collected };
  }

  collectLocationTaxes({ playerId, heroId, locationId }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      !player ||
      !hero ||
      !location ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (this.locationAccessPolicy.getRelation(player.id, location) !== "owned")
      return { success: false, reason: "location_access_denied" };
    const tax = locationTaxState(location);
    if (!tax.eligible || location.state !== "active")
      return { success: false, reason: "location_not_taxable" };
    if (tax.available < 1) return { success: false, reason: "empty_taxes" };
    hero.addResource("gold", tax.available);
    location.taxes.accrued =
      Math.round((tax.accrued - tax.available) * 1000) / 1000;
    if (this.setup.rules.locationMode === "expert") {
      const previousContentment = location.contentment ?? 50;
      location.contentment = previousContentment;
      const penalty = Math.min(5, Math.ceil(tax.available / 10));
      const contentment = location.adjustContentment(-penalty);
      return {
        success: true,
        collected: { gold: tax.available },
        contentment,
        contentmentDelta: contentment - previousContentment,
      };
    }
    return { success: true, collected: { gold: tax.available } };
  }

  depositLocationResource({
    playerId,
    heroId,
    locationId,
    resourceName,
    amount,
  }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(player.id, location, "deposit"))
      return { success: false, reason: "location_access_denied" };
    const available = hero.getResourceAmount(resourceName);
    const requested = Math.min(available, amount ?? available);
    if (requested <= 0) return { success: false, reason: "nothing_to_deposit" };
    const deposited = location.depositResource(resourceName, requested);
    if (deposited <= 0) return { success: false, reason: "storage_full" };
    hero.spendResource(resourceName, deposited);
    this.tavernNpcService.applyLocationWorkers(location);
    return { success: true, resourceName, deposited };
  }

  depositLocationItem({ playerId, heroId, locationId, lootId }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(player.id, location, "deposit"))
      return { success: false, reason: "location_access_denied" };
    const index = hero.carriedLoot.findIndex((item) => item.id === lootId);
    if (index === -1) return { success: false, reason: "item_not_carried" };
    const [item] = hero.carriedLoot.splice(index, 1);
    location.depositItem(item);
    const clue = this.explorationClueService.find(item.itemId);
    if (clue) clue.holder = { kind: "location", id: location.id };
    return { success: true, item: { ...item } };
  }

  transferLocationResource({
    playerId,
    heroId,
    locationId,
    resourceName,
    amount,
    direction,
  }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.#canManageLocationReserves(player.id, location.id))
      return { success: false, reason: "location_not_owned" };
    const requested = Number(amount);
    if (!Number.isFinite(requested) || requested <= 0)
      return { success: false, reason: "invalid_amount" };
    let transferred = 0;
    if (direction === "to_location") {
      const available = Math.min(
        requested,
        hero.getResourceAmount(resourceName),
      );
      if (available <= 0)
        return { success: false, reason: "nothing_to_deposit" };
      transferred = location.depositResource(resourceName, available);
      if (transferred > 0) hero.spendResource(resourceName, transferred);
    } else if (direction === "to_hero") {
      const portable = this.#heroResourceCapacity(
        hero,
        resourceName,
        requested,
      );
      transferred = Math.min(
        portable,
        location.resources.stock[resourceName] ?? 0,
      );
      if (transferred > 0) {
        location.resources.stock[resourceName] -= transferred;
        hero.addResource(resourceName, transferred);
      }
    } else return { success: false, reason: "invalid_direction" };
    if (transferred <= 0)
      return {
        success: false,
        reason:
          direction === "to_location" ? "nothing_to_deposit" : "empty_stock",
      };
    this.tavernNpcService.applyLocationWorkers(location);
    const contentmentDelta =
      Math.min(5, Math.max(1, Math.ceil(transferred / 10))) *
      (direction === "to_location" ? 1 : -1);
    const contentment = location.adjustContentment(contentmentDelta);
    this.eventLog.push({
      type: "location_reserve_transfer",
      playerId,
      heroId,
      locationId,
      resourceName,
      direction,
      amount: transferred,
      contentmentDelta: contentment === null ? 0 : contentmentDelta,
      at: this.now(),
    });
    return {
      success: true,
      resourceName,
      direction,
      transferred,
      contentmentDelta: contentment === null ? 0 : contentmentDelta,
      contentment,
    };
  }

  transferLocationProduction({
    playerId,
    heroId,
    locationId,
    resourceName,
    amount,
    destination,
  }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.#canManageLocationReserves(player.id, location.id))
      return { success: false, reason: "location_not_owned" };
    if (!["hero", "universal"].includes(destination))
      return { success: false, reason: "invalid_destination" };
    const requested = Number(amount);
    const portable =
      destination === "hero"
        ? this.#heroResourceCapacity(hero, resourceName, requested)
        : requested;
    if (destination === "hero" && portable <= 0)
      return { success: false, reason: "insufficient_slots" };
    const transferred = location.transferProductionResource(
      resourceName,
      portable,
      destination,
    );
    if (transferred <= 0)
      return {
        success: false,
        reason:
          destination === "universal"
            ? "universal_storage_full"
            : "empty_production_stock",
      };
    if (destination === "hero") hero.addResource(resourceName, transferred);
    this.eventLog.push({
      type: "location_production_transfer",
      playerId,
      heroId,
      locationId,
      resourceName,
      destination,
      amount: transferred,
      at: this.now(),
    });
    return { success: true, resourceName, destination, transferred };
  }

  preparePopulationPackages({ playerId, heroId, locationId, people }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    const amount = Number(people);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.#canManageLocationReserves(player.id, location.id))
      return { success: false, reason: "location_not_owned" };
    if (
      !Number.isInteger(amount) ||
      amount <= 0 ||
      (location.population ?? 0) <= 0
    )
      return { success: false, reason: "invalid_population_amount" };
    const requested = Math.min(5, amount, location.population);
    const stored = location.depositResource("population", requested);
    if (stored <= 0)
      return { success: false, reason: "universal_storage_full" };
    location.removePopulation(stored);
    this.eventLog.push({
      type: "population_packaged",
      playerId,
      heroId,
      locationId,
      people: stored,
      at: this.now(),
    });
    return {
      success: true,
      people: stored,
      population: location.population,
      storageSlotCapacity: location.storageSlotCapacity,
    };
  }

  takeLocationPopulationPackage({ playerId, heroId, locationId, people = 5 }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.#canManageLocationReserves(player.id, location.id))
      return { success: false, reason: "location_not_owned" };
    const amount = Math.min(
      5,
      Number(people),
      location.resources.stock.population ?? 0,
    );
    if (amount <= 0) return { success: false, reason: "empty_stock" };
    const freeSlots =
      hero.bagSlotCount - this.inventoryService.getUsedHeroBagSlots(hero);
    if (freeSlots < 1) return { success: false, reason: "insufficient_slots" };
    location.resources.stock.population -= amount;
    hero.addCarriedLoot([
      {
        id: this.idGenerator("population"),
        itemId: "population",
        quantity: amount,
        valuePerUnit: 1,
        metadata: { originLocationId: location.id },
      },
    ]);
    return { success: true, people: amount };
  }

  assignWagons({ playerId, heroId, wagons }) {
    const hero = this.getHero(heroId);
    if (hero === null || hero.playerId !== playerId || !Array.isArray(wagons))
      return { success: false, reason: "invalid_request" };
    const ids = new Set(hero.wagons.map((wagon) => wagon.id));
    for (const wagon of wagons) {
      if (
        !wagon?.id ||
        ids.has(wagon.id) ||
        !Number.isInteger(wagon.slotBonus) ||
        wagon.slotBonus <= 0
      )
        return { success: false, reason: "invalid_wagon" };
      ids.add(wagon.id);
      hero.wagons.push({
        id: wagon.id,
        name: wagon.name ?? "Chariot",
        slotBonus: wagon.slotBonus,
      });
    }
    this.eventLog.push({
      type: "hero_wagons_assigned",
      playerId,
      heroId,
      wagonIds: wagons.map((wagon) => wagon.id),
      addedSlots: wagons.reduce((sum, wagon) => sum + wagon.slotBonus, 0),
      at: this.now(),
    });
    return {
      success: true,
      wagons: hero.wagons.map((wagon) => ({ ...wagon })),
      slotCapacity: hero.bagSlotCount,
    };
  }

  returnWagons({ playerId, heroId, wagonIds }) {
    const hero = this.getHero(heroId);
    if (hero === null || hero.playerId !== playerId || !Array.isArray(wagonIds))
      return { success: false, reason: "invalid_request" };
    const returnedIds = new Set(wagonIds);
    const returned = hero.wagons.filter((wagon) => returnedIds.has(wagon.id));
    hero.wagons = hero.wagons.filter((wagon) => !returnedIds.has(wagon.id));
    const removedSlots = returned.reduce(
      (sum, wagon) => sum + wagon.slotBonus,
      0,
    );
    this.eventLog.push({
      type: "hero_wagons_returned",
      playerId,
      heroId,
      wagonIds: returned.map((wagon) => wagon.id),
      removedSlots,
      at: this.now(),
    });
    return {
      success: true,
      wagons: returned.map((wagon) => ({ ...wagon })),
      removedSlots,
      slotCapacity: hero.bagSlotCount,
    };
  }

  startLocationDismantling({ playerId, heroId, locationId, structureId }) {
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      hero === null ||
      location === null ||
      hero.playerId !== playerId ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (
      !this.locationAccessPolicy.can(playerId, location, "dismantle") &&
      !this.#canOperateEvacuationSource(playerId, locationId)
    )
      return { success: false, reason: "location_not_owned" };
    const result = this.locationDismantlingService.start(
      location,
      structureId,
      this.now(),
    );
    if (result.success)
      this.eventLog.push({
        type: "location_dismantling_started",
        locationId,
        heroId,
        structureId,
        completesAt: result.task.deadline.expiresAt,
        at: this.now(),
      });
    return result;
  }

  organizeLocationEvacuation({ playerId, heroId, locationId }) {
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      hero === null ||
      location === null ||
      hero.playerId !== playerId ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.#canOperateEvacuationSource(playerId, locationId))
      return { success: false, reason: "evacuation_not_authorized" };
    const people =
      (location.population ?? 0) + (location.resources.stock.population ?? 0);
    const requiredSlots = Math.ceil(people / 5);
    const freeSlots =
      hero.bagSlotCount - this.inventoryService.getUsedHeroBagSlots(hero);
    if (freeSlots < requiredSlots)
      return {
        success: false,
        reason: "insufficient_slots",
        requiredSlots,
        freeSlots,
      };
    while ((location.population ?? 0) > 0) {
      const prepared = this.preparePopulationPackages({
        playerId,
        heroId,
        locationId,
        people: Math.min(5, location.population),
      });
      if (!prepared.success) return { success: false, reason: prepared.reason };
    }
    let evacuatedPeople = 0;
    while ((location.resources.stock.population ?? 0) > 0) {
      const taken = this.takeLocationPopulationPackage({
        playerId,
        heroId,
        locationId,
        people: 5,
      });
      if (!taken.success)
        return { success: false, reason: taken.reason, evacuatedPeople };
      evacuatedPeople += taken.people;
    }
    const dismantlings = Object.keys(location.infrastructure)
      .filter(
        (structureId) =>
          !location.dismantlings.some(
            (task) => task.structureId === structureId,
          ),
      )
      .map((structureId) =>
        this.startLocationDismantling({
          playerId,
          heroId,
          locationId,
          structureId,
        }),
      )
      .filter((result) => result.success)
      .map((result) => result.task);
    this.eventLog.push({
      type: "location_evacuation_organized",
      playerId,
      heroId,
      locationId,
      people: evacuatedPeople,
      structures: dismantlings.map((task) => task.structureId),
      at: this.now(),
    });
    return { success: true, people: evacuatedPeople, dismantlings };
  }

  settlePopulationPackage({ playerId, heroId, locationId, packageId }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(player.id, location, "manageReserves"))
      return { success: false, reason: "location_not_owned" };
    const index = hero.carriedLoot.findIndex(
      (entry) => entry.id === packageId && entry.itemId === "population",
    );
    if (index === -1)
      return { success: false, reason: "population_package_not_found" };
    const [entry] = hero.carriedLoot.splice(index, 1);
    location.addPopulation(entry.quantity);
    this.eventLog.push({
      type: "population_settled",
      playerId,
      heroId,
      locationId,
      people: entry.quantity,
      packageId,
      at: this.now(),
    });
    return {
      success: true,
      people: entry.quantity,
      population: location.population,
      storageSlotCapacity: location.storageSlotCapacity,
    };
  }

  #canManageLocationReserves(playerId, locationId) {
    const location = this.getLocation(locationId);
    return (
      location !== null &&
      (this.locationAccessPolicy.can(playerId, location, "manageReserves") ||
        this.#canOperateEvacuationSource(playerId, locationId))
    );
  }

  #canOperateEvacuationSource(playerId, locationId) {
    if (!this.questSystemEnabled) return false;
    if (
      this.getPlayer(playerId) === null ||
      !["reach-evacuation-camp", "prepare-evacuation"].includes(
        this.scenarioState?.currentPhaseId,
      )
    )
      return false;
    return Object.values(this.evacuationStates).some(
      (state) =>
        state.playerId === playerId &&
        state.sourceLocationId === locationId &&
        state.departedAt === null &&
        state.completedAt === undefined,
    );
  }

  #failExpiredQuestDeadline() {
    if (!this.questSystemEnabled) return null;
    const expired = [
      ...Object.values(this.evacuationStates),
      ...Object.values(this.questDeadlines),
    ].find(
      (state) =>
        state.deadlineCausesFailure !== false &&
        state.completedAt === undefined &&
        state.failedAt === undefined &&
        this.now() >= state.expiresAt,
    );
    if (!expired) return null;
    expired.failedAt = this.now();
    return this.failCurrentQuest({ reason: "deadline_expired" });
  }

  #resolveUnopposedEvacuationAttack(event) {
    if (!this.questSystemEnabled) return { handled: false, outcome: null };
    if (event.type !== "autonomous_group_location_attack_requested")
      return { handled: false, outcome: null };
    const state = Object.values(this.evacuationStates).find(
      (candidate) =>
        candidate.sourceLocationId === event.locationId &&
        candidate.completedAt === undefined &&
        candidate.failedAt === undefined,
    );
    if (!state) return { handled: false, outcome: null };
    const location = this.getLocation(event.locationId);
    const hero =
      this.getPlayer(state.playerId)
        ?.heroIds.map((id) => this.getHero(id))
        .find((candidate) => candidate !== null) ?? null;
    if (location?.heroIds.includes(hero?.id))
      return { handled: false, outcome: "battle" };
    const savedPeople =
      hero?.carriedLoot
        .filter(
          (item) =>
            item.itemId === "population" &&
            item.metadata?.originLocationId === state.sourceLocationId,
        )
        .reduce((sum, item) => sum + item.quantity, 0) ?? 0;
    const remainingPeople =
      (location?.population ?? 0) + (location?.resources.stock.population ?? 0);
    state.attackedAt = event.at;
    state.peopleSavedAtAttack = savedPeople;
    state.peopleLostAtAttack = remainingPeople;
    if (location) {
      location.population = 0;
      location.resources.stock.population = 0;
      state.resourcesRemaining = structuredClone(location.resources.stock);
      state.structuresRemaining = Object.values(location.infrastructure).reduce(
        (sum, level) => sum + level,
        0,
      );
    }
    const group = this.getAutonomousGroup(event.groupId);
    if (group) {
      group.mission = null;
      group.movement = null;
      group.status = "arrived";
    }
    if (remainingPeople > 0 && savedPeople === 0) {
      state.failedAt = event.at;
      this.failCurrentQuest({ reason: "no_inhabitant_saved" });
      return { handled: true, outcome: "failure" };
    }
    if (
      !["return-evacuees-to-capital", "second-prologue-complete"].includes(
        this.scenarioState?.currentPhaseId,
      )
    )
      this.scenarioState?.redirectToPhase(
        this.scenario,
        "return-evacuees-to-capital",
      );
    const outcome = remainingPeople === 0 ? "empty_camp" : "partial_victory";
    this.eventLog.push({
      type: "evacuation_camp_attacked_unopposed",
      evacuationId: state.id,
      savedPeople,
      lostPeople: remainingPeople,
      outcome,
      at: event.at,
    });
    return { handled: true, outcome };
  }

  // Équipement, production et récupération à chaque cycle.
  itemAcquisitionContext({ playerId, heroId, locationId }) {
    const hero = this.getHero(heroId),
      location = this.getLocation(locationId);
    if (
      !hero ||
      !location ||
      hero.playerId !== playerId ||
      !location.heroIds.includes(heroId) ||
      hero.state !== "active" ||
      this.#isHeroBusy(heroId) ||
      location.state === "destroyed" ||
      this.locationAccessPolicy.getRelation(playerId, location) === "enemy" ||
      RepressionQuest.actionAllowed(this, locationId, "talkChief") === false
    )
      return null;
    return {
      hero,
      location,
      canTrade: this.locationAccessPolicy.can(playerId, location, "trade"),
      canManageReserves: this.locationAccessPolicy.can(
        playerId,
        location,
        "manageReserves",
      ),
      canTalkChief: this.locationAccessPolicy.can(
        playerId,
        location,
        "talkChief",
      ),
      canTavern: this.locationAccessPolicy.can(
        playerId,
        location,
        "visitTavern",
      ),
    };
  }

  equipHeroItem({ playerId, heroId, packageId, slot = null }) {
    const hero = this.getHero(heroId);
    if (hero === null || hero.playerId !== playerId)
      return { success: false, reason: "hero_not_found" };
    if (this.#isHeroBusy(hero.id))
      return { success: false, reason: "hero_busy" };
    const result = this.equipmentService.equip(hero, packageId, slot);
    if (result.success)
      this.eventLog.push({
        type: "hero_item_equipped",
        playerId,
        heroId,
        packageId,
        slot: result.slot,
        itemId: result.itemId,
        at: this.now(),
      });
    return result;
  }

  unequipHeroItem({ playerId, heroId, slot }) {
    const hero = this.getHero(heroId);
    if (hero === null || hero.playerId !== playerId)
      return { success: false, reason: "hero_not_found" };
    if (this.#isHeroBusy(hero.id))
      return { success: false, reason: "hero_busy" };
    const freeSlots =
      hero.bagSlotCount - this.inventoryService.getUsedHeroBagSlots(hero);
    const result = this.equipmentService.unequip(hero, slot, {
      freeSlots,
      id: this.idGenerator("equipment"),
    });
    if (result.success)
      this.eventLog.push({
        type: "hero_item_unequipped",
        playerId,
        heroId,
        slot,
        itemId: result.itemId,
        at: this.now(),
      });
    return result;
  }

  produceLocationResources(cycles = 1, random = Math.random) {
    return this.locations
      .map((location) => {
        location.advanceAbandonment(cycles);
        const taxes = accrueLocationTaxes(location, cycles);
        const modifier = location.getContentmentModifier(
          this.setup.rules.enableContentment,
        );
        const market = this.marketService.sellBlockedProduction(
          location,
          cycles,
          modifier,
        );
        const produced = location.produceResources(cycles, modifier);
        const producedRecruits = location.produceRecruits(
          cycles,
          random,
          modifier,
        );
        const populationGrowth = this.campImprovementService.advancePopulation(
          location,
          cycles,
          modifier,
        );
        if (location.type === "camp") {
          const activity = campProductionExperience(
            produced,
            producedRecruits,
            cycles,
            market.surplus,
          );
          if (activity > 0)
            this.locationProgressionService.awardExperience(
              location,
              activity,
              "production",
            );
        }
        return {
          locationId: location.id,
          contentmentModifier: modifier,
          taxes,
          produced,
          producedRecruits,
          populationGrowth,
          market,
        };
      })
      .filter(
        (result) =>
          Object.keys(result.produced).length > 0 ||
          Object.keys(result.producedRecruits).length > 0 ||
          result.populationGrowth.gained > 0 ||
          result.market.gold > 0 ||
          result.taxes > 0,
      );
  }

  advanceCycle(cycles = 1, random = Math.random) {
    if (!Number.isInteger(cycles) || cycles <= 0)
      throw new RangeError("Le nombre de cycles doit etre un entier positif.");
    const locations = this.produceLocationResources(cycles, random);
    this.locations.forEach((location) =>
      this.chiefTradeService.refresh(location),
    );
    const tavernNpcs = this.tavernNpcService.advance(this.locations, cycles);
    return {
      locations,
      tavernNpcs,
      recoveredUnits: this.recoverUnits(cycles),
      heroes: this.recoverHeroes(cycles),
    };
  }

  getTavernNpcOffers({ playerId, locationId }) {
    const location = this.getLocation(locationId);
    if (
      !location ||
      !this.locationAccessPolicy.can(playerId, location, "visitTavern")
    )
      return { success: false, reason: "tavern_unavailable", offers: [] };
    if (!Object.hasOwn(this.tavernNpcService.state.assignments, location.id))
      this.tavernNpcService.rotate(this.locations);
    return { success: true, offers: this.tavernNpcService.getOffers(location) };
  }

  acquireTavernNpc({ playerId, heroId, locationId, npcId }) {
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      !hero ||
      hero.playerId !== playerId ||
      !location?.heroIds.includes(heroId)
    )
      return { success: false, reason: "hero_not_at_location" };
    if (!this.locationAccessPolicy.can(playerId, location, "visitTavern"))
      return { success: false, reason: "tavern_unavailable" };
    const offer = this.tavernNpcService
      .getOffers(location)
      .find((npc) => npc.id === npcId);
    if (
      offer &&
      offer.kind !== "trainer" &&
      this.#heroResourceCapacity(hero, offer.effect.itemId, 1) < 1
    )
      return { success: false, reason: "insufficient_slots" };
    const result = this.tavernNpcService.acquire({
      location,
      locations: this.locations,
      hero,
      npcId,
    });
    if (result.success && result.effect.heroExperience)
      this.gainHeroExperience({
        heroId,
        amount: result.effect.heroExperience,
        source: `mentor:${npcId}`,
      });
    if (result.success)
      this.eventLog.push({
        type: "tavern_npc_acquired",
        playerId,
        heroId,
        locationId,
        npcId,
        effect: result.effect,
        at: this.now(),
      });
    return result;
  }

  applyOfficerToUnit({ playerId, heroId, unitId, officerItemId }) {
    const hero = this.getHero(heroId);
    const unit = hero?.army.getUnit(unitId) ?? null;
    const experience =
      { officer_drill: 40, officer_veteran: 80 }[officerItemId] ?? 0;
    if (!hero || hero.playerId !== playerId || !unit || experience === 0)
      return { success: false, reason: "invalid_officer_assignment" };
    if (hero.getResourceAmount(officerItemId) < 1)
      return { success: false, reason: "officer_not_carried" };
    hero.spendResource(officerItemId, 1);
    const progression = unit.addExperience(experience);
    const result = {
      success: true,
      unitId,
      officerItemId,
      experienceGained: experience,
      progression,
    };
    this.eventLog.push({
      type: "officer_applied_to_unit",
      playerId,
      heroId,
      ...result,
      at: this.now(),
    });
    return result;
  }

  recoverUnits(cycles = 1) {
    if (!Number.isInteger(cycles) || cycles <= 0)
      throw new RangeError(
        "Le nombre de cycles de recuperation doit etre un entier positif.",
      );
    const engagedUnitIds = new Set(
      this.battles
        .filter((battle) => battle.status !== "finished")
        .flatMap((battle) =>
          battle.teams.flatMap((team) =>
            team.units.map((unit) => unit.sourceId),
          ),
        ),
    );
    const units = [
      ...this.heroes.flatMap((hero) => hero.army.units),
      ...this.locations.flatMap((location) => location.garrison.units),
    ];
    return [...new Map(units.map((unit) => [unit.id, unit])).values()]
      .filter((unit) => !engagedUnitIds.has(unit.id))
      .map((unit) => ({ unitId: unit.id, ...unit.heal(cycles) }))
      .filter((result) => result.restoredHealth > 0);
  }

  recoverHeroes(cycles = 1) {
    return this.heroes.map((hero) => {
      if (RepressionQuest.blocksRevival(this, hero))
        return {
          heroId: hero.id,
          restoredHealth: 0,
          reason: "repression_prisoner",
        };
      if (this.#isHeroBusy(hero.id))
        return {
          heroId: hero.id,
          restoredHealth: 0,
          naturalHealing: 0,
          locationHealing: 0,
          reason: "hero_busy",
        };
      const base = this.getHeroBaseLocation(hero.id);
      const chapel =
        this.locations.find(
          (location) =>
            location.heroIds.includes(hero.id) &&
            (location.infrastructure.chapel ?? 0) > 0 &&
            this.locationAccessPolicy.can(hero.playerId, location, "heal"),
        ) ?? null;
      const revivalLocation = base?.heroIds.includes(hero.id) ? base : chapel;
      if (hero.state === "ghost" && revivalLocation) {
        const revival = this.heroRecoveryService.reviveAtBase(
          hero,
          revivalLocation,
        );
        if (revival.success)
          this.eventLog.push({
            type: "hero_revived_at_base",
            heroId: hero.id,
            locationId: revivalLocation.id,
            health: revival.health,
            at: this.now(),
          });
        return {
          heroId: hero.id,
          restoredHealth: revival.health ?? 0,
          naturalHealing: 0,
          locationHealing: 0,
          locationId: revivalLocation.id,
          revived: revival.success,
        };
      }
      const healingLocation =
        this.locations.find(
          (location) =>
            location.heroIds.includes(hero.id) &&
            location.features.healing === true &&
            this.locationAccessPolicy.can(hero.playerId, location, "heal"),
        ) ?? null;
      const result = this.heroRecoveryService.recover(hero, {
        cycles,
        healingLocation,
      });
      const auraHealing = this.heroes
        .filter(
          (source) =>
            source.id !== hero.id &&
            source.state === "active" &&
            source.position &&
            hero.position &&
            this.#areAlliedPlayers(source.playerId, hero.playerId),
        )
        .reduce((total, source) => {
          const aura = this.heroClassFeatureService.healingAura(source);
          return aura.radius > 0 &&
            distanceMeters(source.position, hero.position) <= aura.radius
            ? total + aura.healthPerCycle * cycles
            : total;
        }, 0);
      const restoredByAura =
        auraHealing > 0 ? hero.recoverHealth(auraHealing) : 0;
      result.restoredHealth += restoredByAura;
      result.auraHealing = restoredByAura;
      if (result.restoredHealth > 0)
        this.eventLog.push({
          type: "hero_recovered",
          heroId: hero.id,
          restoredHealth: result.restoredHealth,
          locationId: result.locationId,
          at: this.now(),
        });
      return result;
    });
  }

  #areAlliedPlayers(firstPlayerId, secondPlayerId) {
    if (firstPlayerId === secondPlayerId) return true;
    const first = this.setup.participants.find(
      (participant) => participant.playerId === firstPlayerId,
    );
    const second = this.setup.participants.find(
      (participant) => participant.playerId === secondPlayerId,
    );
    return (
      first?.teamId !== null &&
      first?.teamId !== undefined &&
      first.teamId === second?.teamId
    );
  }

  advanceWorldCycle(cycles = 1, random = Math.random) {
    return this.advanceCycle(cycles, random);
  }

  getHeroBaseLocation(heroId) {
    const hero = this.getHero(heroId);
    if (hero === null) return null;
    const baseSlot =
      this.scenario?.locationSlots.find(
        (slot) => slot.id === "refuge" || slot.roles?.includes("spawn"),
      ) ?? null;
    const binding =
      baseSlot === null
        ? null
        : this.scenarioLocationBindings.find(
            (item) => item.locationSlotId === baseSlot.id,
          );
    if (binding) return this.getLocation(binding.locationId);
    const owned = this.locations.filter(
      (location) =>
        location.ownerId === hero.playerId ||
        location.controllerId === hero.playerId,
    );
    return (
      owned.find(
        (location) =>
          location.roles.includes("spawn") || location.roles.includes("refuge"),
      ) ??
      owned.find((location) => ["fort", "camp"].includes(location.type)) ??
      null
    );
  }

  reviveHeroAtBase({ heroId, locationId }) {
    if (RepressionQuest.blocksRevival(this, this.getHero(heroId)))
      return { success: false, reason: "repression_prisoner" };
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    const base = this.getHeroBaseLocation(heroId);
    if (
      hero === null ||
      location === null ||
      (base?.id !== location.id &&
        !(
          (location.infrastructure.chapel ?? 0) > 0 &&
          this.locationAccessPolicy.can(hero?.playerId, location, "heal")
        )) ||
      !location.heroIds.includes(hero.id)
    )
      return { success: false, reason: "hero_not_at_base" };
    const result = this.heroRecoveryService.reviveAtBase(hero, location);
    if (result.success)
      this.eventLog.push({
        type: "hero_revived_at_base",
        heroId: hero.id,
        locationId: location.id,
        health: result.health,
        at: this.now(),
      });
    return result;
  }

  // Mutations d'armée hors combat.
  garrisonUnit({ playerId, heroId, locationId, unitId }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id) ||
      !this.locationAccessPolicy.can(player.id, location, "garrison")
    )
      return false;
    const unit = hero.army.getUnit(unitId);
    if (
      unit === null ||
      unit.ownerPlayerId !== player.id ||
      location.garrison.hasUnit(unitId) ||
      location.garrison.units.length >= location.defenseSlots
    )
      return false;
    hero.removeUnit(unitId);
    location.garrison.addUnit(unit);
    this.teamFortQuestService.check(this);
    return true;
  }

  withdrawGarrisonUnit({ playerId, heroId, locationId, unitId }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    const location = this.getLocation(locationId);
    if (
      player === null ||
      hero === null ||
      location === null ||
      hero.playerId !== player.id ||
      !location.heroIds.includes(hero.id) ||
      !this.locationAccessPolicy.can(player.id, location, "withdrawGarrison")
    )
      return false;
    if (hero.army.units.length >= hero.maxUnitStacks) return false;
    const unit = location.garrison.getUnit(unitId);
    if (unit === null || unit.ownerPlayerId !== player.id) return false;
    const authority = this.getHeroAuthority(hero.id);
    if (authority.used + this.getUnitAuthorityCost(unit) > authority.maximum)
      return false;
    location.garrison.removeUnit(unitId);
    hero.addUnit(unit);
    return true;
  }

  disbandUnit({ playerId, heroId, unitId }) {
    const player = this.getPlayer(playerId);
    const hero = this.getHero(heroId);
    if (player === null || hero === null || hero.playerId !== player.id)
      return { success: false, reason: "invalid_hero" };
    const isInBattle = this.battles.some(
      (battle) =>
        battle.status !== "finished" &&
        battle.teams.some((team) =>
          team.heroes.some((snapshot) => snapshot.sourceId === hero.id),
        ),
    );
    if (isInBattle) return { success: false, reason: "battle_active" };
    const unit = hero.army.getUnit(unitId);
    if (unit === null || unit.ownerPlayerId !== player.id)
      return { success: false, reason: "invalid_unit" };
    hero.removeUnit(unit.id);
    this.eventLog.push({
      type: "unit_disbanded",
      playerId: player.id,
      heroId: hero.id,
      unitId: unit.id,
      unitName: unit.name,
      typeId: unit.typeId,
      quantity: unit.quantity,
      at: this.now(),
    });
    return { success: true, unit: unit.toJSON() };
  }

  playerSocialCommand(input) {
    return this.playerSocialService.execute(this, input);
  }

  createPlayerEncounterBattle({ attackerHeroId, targetHeroId }) {
    if (!this.setup.rules.allowPvP)
      return { success: false, reason: "pvp_disabled" };
    const attacker = this.getHero(attackerHeroId);
    const target = this.getHero(targetHeroId);
    if (!attacker || !target || attacker.id === target.id)
      return { success: false, reason: "invalid_target" };
    if (this.#areAlliedPlayers(attacker.playerId, target.playerId))
      return { success: false, reason: "allied_target" };
    if (attacker.state !== "active" || target.state !== "active")
      return { success: false, reason: "inactive_hero" };
    if (!attacker.position || !target.position)
      return { success: false, reason: "position_unknown" };
    if (
      this.battles.some(
        (b) =>
          b.status !== "finished" &&
          b.teams.some((t) =>
            t.heroes.some((h) => [attacker.id, target.id].includes(h.sourceId)),
          ),
      )
    )
      return { success: false, reason: "already_in_battle" };
    const distance =
      this.coordinateMode === "gps"
        ? distanceMeters(attacker.position, target.position)
        : Math.hypot(
            attacker.position.latitude - target.position.latitude,
            attacker.position.longitude - target.position.longitude,
          );
    if (
      distance > this.setup.rules.engagementRadiusMeters &&
      !astralTargetInReach(this, attacker, "hero", target)
    )
      return { success: false, reason: "out_of_range" };
    const battle = this.createBattle({
      teamParticipants: [
        { id: `player-${attacker.playerId}`, heroIds: [attacker.id] },
        { id: `player-${target.playerId}`, heroIds: [target.id] },
      ],
      position: { ...attacker.position },
    });
    return { success: true, battle };
  }

  setArmyFormation(input) {
    return setArmyFormation(this, input);
  }

  createBattle({
    teamParticipants,
    loot = [],
    position = null,
    sourceLocationId = null,
    sourceEnemyTeamId = null,
    config = {},
  }) {
    if (
      RepressionQuest.actionAllowed(this, sourceLocationId, "attack") === false
    )
      throw new Error(
        "Parlez au prévôt et choisissez votre intervention avant le combat.",
      );
    teamParticipants = RepressionQuest.battleTeams(
      this,
      sourceLocationId,
      teamParticipants,
    );
    if (this.status !== "started")
      throw new Error("La partie doit être démarrée pour créer une bataille.");
    if (
      teamParticipants.some((team) =>
        (team.heroIds ?? []).some(
          (heroId) => this.getHero(heroId)?.state !== "active",
        ),
      )
    )
      throw new Error("Un héros ghost ne peut pas participer à une bataille.");
    const battle = this.battleService.createBattle({
      id: this.idGenerator("battle"),
      game: this,
      teamParticipants,
      loot,
      config: {
        ...config,
        tactical: config.tactical ?? this.tacticalBattles,
        // The launch includes the built-in brigand as a participant, but it is AI.
        humanPlayerIds: this.setup.participants
          .filter((entry) => entry.playerId !== "bandits")
          .map((entry) => entry.playerId),
      },
      now: this.now,
    });
    battle.lootPosition = position === null ? null : { ...position };
    battle.sourceLocationId = sourceLocationId;
    for (const locationId of new Set(
      [
        sourceLocationId,
        ...teamParticipants.map((team) => team.locationId),
      ].filter(Boolean),
    ))
      this.locationWatchService.attack(this, locationId, battle.id);
    battle.sourceEnemyTeamId = sourceEnemyTeamId;
    if (position !== null) {
      const participantPlayerIds = teamParticipants
        .flatMap((team) =>
          (team.heroIds ?? []).map((heroId) => this.getHero(heroId)?.playerId),
        )
        .filter(Boolean);
      this.battleSites.push(
        new BattleSite({
          id: this.idGenerator("battle-site"),
          battleId: battle.id,
          position,
          participantPlayerIds,
          now: this.now,
        }),
      );
    }
    battle.start();
    for (const team of teamParticipants) {
      if (team.autonomousGroupId) {
        const group = this.getAutonomousGroup(team.autonomousGroupId);
        if (group) group.status = "interrupted";
      }
    }
    if (config.ambushTeamId) {
      const attacker = battle.teams.find(
        (team) => team.id === config.ambushTeamId,
      );
      new AmbushService().applyEffects({
        battle,
        attackerTeamId: config.ambushTeamId,
        sourceHeroId: attacker?.heroes[0]?.sourceId ?? null,
        effects: config.ambushEffects ?? {
          rounds: 1,
          attackerAttackMultiplier: 1.15,
          defenderDefenseMultiplier: 0.9,
        },
      });
    }
    this.battles.push(battle);
    return battle;
  }

  // Batailles persistantes, fuite physique, poursuite et conséquences.
  canEngageHeroes(firstHeroId, secondHeroId) {
    const first = this.getHero(firstHeroId);
    const second = this.getHero(secondHeroId);
    return (
      first?.state === "active" &&
      second?.state === "active" &&
      !this.#isOnPursuitCooldown(first) &&
      !this.#isOnPursuitCooldown(second) &&
      (this.engagementService.canEngage(first, second) ||
        astralTargetInReach(this, first, "hero", second))
    );
  }

  engageHeroes({ initiatorHeroId, targetHeroId, teams, battleConfig = {} }) {
    const initiator = this.getHero(initiatorHeroId);
    const target = this.getHero(targetHeroId);
    if (!this.canEngageHeroes(initiatorHeroId, targetHeroId))
      throw new Error("Les héros ne peuvent pas s'engager à cette distance.");
    if (
      !Array.isArray(teams) ||
      !teams.some((team) => team.heroIds.includes(initiator.id)) ||
      !teams.some((team) => team.heroIds.includes(target.id))
    )
      throw new RangeError(
        "Les équipes d'engagement doivent contenir les deux héros.",
      );
    const heroes = teams.flatMap((team) =>
      team.heroIds.map((heroId) => this.getHero(heroId)),
    );
    if (heroes.some((hero) => hero === null || hero.position === null))
      throw new Error("Chaque héros engagé doit avoir une position GPS.");
    const context = this.engagementService.createContext(heroes);
    const teamParticipants = this.engagementService.createTeamParticipants({
      teams,
      context,
    });
    const battle = this.createBattle({
      teamParticipants,
      position: context.center,
      config: battleConfig,
    });
    battle.engagementContext = context;
    return battle;
  }

  resolveBattle(battleId) {
    const existingReport = this.battleReports.find(
      (report) =>
        report.battleId === battleId && Array.isArray(report.heroProgression),
    );
    if (existingReport) return structuredClone(existingReport);
    const battle = this.battles.find((item) => item.id === battleId);
    if (battle === undefined) throw new RangeError("La bataille n'existe pas.");

    const droppedLoot = this.#extractDroppedEquipment(battle);
    const outcome = this.battleService.applyOutcome({ game: this, battle });
    battle.teams.forEach((team) =>
      team.heroes.forEach((snapshot) => {
        const hero = this.getHero(snapshot.sourceId);
        if (hero?.classFeatureState.healingMorale) {
          hero.moraleHistory = hero.moraleHistory.filter(
            (factor) => factor.reason !== "healing_tent",
          );
          delete hero.classFeatureState.healingMorale;
        }
        const active = hero?.classFeatureState.tavernMorale?.active;
        if (!active) return;
        hero.moraleHistory = hero.moraleHistory.filter(
          (factor) =>
            !(
              factor.source === "location" &&
              factor.reason === `tavern:${active.locationId}`
            ),
        );
        delete hero.classFeatureState.tavernMorale.active;
      }),
    );
    const consequences = this.battleConsequenceService.resolve({
      game: this,
      battle,
      idGenerator: this.idGenerator,
    });
    this.#settleAutonomousBattleParticipants(battle);
    const enemyVictory =
      battle.sourceEnemyTeamId !== null &&
      battle.winnerTeamId === battle.sourceEnemyTeamId;
    const enemySalvage = enemyVictory
      ? this.#awardEnemySalvage(battle, [...battle.state.loot, ...droppedLoot])
      : null;
    const heroProgression = [];
    battle.teams.forEach((team) =>
      team.heroes.forEach((snapshot) => {
        const participant = this.getHero(snapshot.sourceId);
        if (participant === null) return;
        const previousExperience = participant.experience;
        const previousRank = participant.commandRank;
        const experienceGained = team.id === battle.winnerTeamId ? 50 : 20;
        const progression = this.gainHeroExperience({
          heroId: participant.id,
          amount: experienceGained,
          source: `battle:${battle.id}`,
        });
        heroProgression.push({
          heroId: participant.id,
          playerId: participant.playerId,
          name: participant.name,
          experienceGained,
          previousExperience,
          experience: participant.experience,
          previousRank,
          rank: participant.commandRank,
          state: participant.state,
          availableLevelUps: progression.availableLevelUps,
        });
      }),
    );
    const duelSpoils = [];
    if (battle.duel?.mode === "DUEL") {
      for (const player of battle.duel.players) {
        const snapshot = battle.teams.find((team) => team.id === player.id)
          ?.heroes[0];
        const participant = snapshot ? this.getHero(snapshot.sourceId) : null;
        if (!participant) continue;
        if (player.spoils.gold > 0)
          participant.addResource("gold", player.spoils.gold);
        if (player.spoils.wood > 0)
          participant.addResource("wood", player.spoils.wood);
        if (player.spoils.xp > 0)
          this.gainHeroExperience({
            heroId: participant.id,
            amount: player.spoils.xp,
            source: `battle-duel:${battle.id}`,
          });
        duelSpoils.push({ heroId: participant.id, ...player.spoils });
      }
    }
    if (!enemyVictory) this.explorationClueService.unlockBattleLoot(battle);
    const battleLoot = enemyVictory
      ? null
      : this.lootDistributionService.createReward({
          id: this.idGenerator("battle-loot"),
          battle,
          extraLoot: [...droppedLoot, ...tacticalBonusLoot(battle)],
          now: this.now,
        });
    if (battleLoot !== null) {
      this.battleLoot.push(battleLoot);
      for (const share of battleLoot.shares) {
        this.collectBattleLoot({
          battleId: battle.id,
          playerId: share.playerId,
          heroId: share.heroId,
          selection: Object.fromEntries(
            battleLoot.entries.map((entry) => [
              entry.id,
              entry.allocations[share.playerId] ?? 0,
            ]),
          ),
        });
      }
    }
    if (
      !enemyVictory &&
      battle.sourceEnemyTeamId &&
      battle.winnerTeamId &&
      battle.sourceLocationId
    ) {
      const winner = battle.teams
        .find((team) => team.id === battle.winnerTeamId)
        ?.heroes.map((snapshot) => this.getHero(snapshot.sourceId))
        .find((hero) => hero?.state === "active");
      if (winner)
        this.itemAcquisitionService.unlock({
          source: "battle",
          key: battle.sourceLocationId,
          heroId: winner.id,
          classId: winner.classId,
        });
    }
    if (enemyVictory)
      this.battleSites = this.battleSites.filter(
        (site) => site.battleId !== battle.id,
      );
    else this.battleSites.find((site) => site.battleId === battle.id)?.finish();
    const capturedLocation = this.#captureDefeatedLocation(battle);
    const destroyedLocationId =
      capturedLocation === null
        ? this.#destroyDefeatedEnemySource(battle)
        : null;
    const evacuation = Object.values(this.evacuationStates).find(
      (state) =>
        state.sourceLocationId === battle.sourceLocationId &&
        state.completedAt === undefined &&
        state.failedAt === undefined,
    );
    if (this.questSystemEnabled && evacuation) {
      evacuation.attackedAt = this.now();
      evacuation.battleId = battle.id;
      evacuation.battleWon = !enemyVictory;
      if (enemyVictory) {
        evacuation.failedAt = this.now();
        this.failCurrentQuest({ reason: "evacuation_battle_lost" });
      }
    }
    const report = {
      battleId: battle.id,
      ...outcome,
      consequences,
      heroProgression,
      duelSpoils,
      enemySalvage,
      battleLoot: battleLoot?.toJSON() ?? null,
      destroyedLocationId,
      capturedLocationId: capturedLocation?.locationId ?? null,
    };
    this.battleReports.push(structuredClone(report));
    return report;
  }

  // Sites dynamiques issus d'une bataille et collecte différée du butin.
  getVisibleDynamicSites({ playerId, position }) {
    this.cleanupDynamicSites();
    return this.battleSites
      .filter((site) => site.isVisibleTo({ playerId, position }))
      .map((site) => ({ kind: "battlefield", ...site.toJSON() }));
  }

  cleanupDynamicSites() {
    this.battleSites = this.battleSites.filter((site) => !site.isExpired());
  }

  collectBattleLoot({ battleId, playerId, heroId, selection }) {
    const reward = this.battleLoot.find((item) => item.battleId === battleId);
    const hero = this.getHero(heroId);
    if (
      reward === undefined ||
      hero === null ||
      hero.playerId !== playerId ||
      hero.state !== "active"
    )
      return { success: false, reason: "invalid_loot_request", collected: [] };
    const result = reward.collect({
      playerId,
      bag: this.inventoryService.getHeroBagState(hero),
      selection,
      allowPartial: true,
    });
    if (result.success) this.#storeCollectedLoot(hero, result.collected);
    for (const report of this.battleReports) {
      if (report.battleId === battleId) report.battleLoot = reward.toJSON();
    }
    return {
      ...result,
      battleId,
      depleted: reward.status === "COLLECTED",
      battleLoot: reward.toJSON(),
    };
  }

  joinBattle({ battleId, teamId, heroId }) {
    const battle = this.battles.find((item) => item.id === battleId);
    const hero = this.getHero(heroId);
    if (
      battle === undefined ||
      hero === null ||
      battle.status !== "active" ||
      battle.getEntity(`battle-hero-${heroId}`) !== null
    )
      return false;
    const context = battle.engagementContext;
    if (
      context === undefined ||
      !this.engagementService.canJoinBattle(hero, context)
    )
      return false;
    const team = battle.teams.find((item) => item.id === teamId);
    if (
      team === undefined ||
      !team.heroes.some((participant) =>
        this.#areAlliedPlayers(hero.playerId, participant.playerId),
      ) ||
      !this.setup.participants.some(
        (participant) => participant.playerId === hero.playerId,
      )
    )
      return false;
    const snapshots = this.battleService.createReinforcementSnapshots({
      game: this,
      heroId,
    });
    return battle.addReinforcement({ teamId, ...snapshots }).success;
  }

  updateBattleHeroPosition({ battleId, heroId, position }) {
    const battle = this.battles.find((item) => item.id === battleId);
    const hero = this.getHero(heroId);
    if (
      battle === undefined ||
      hero === null ||
      !["countdown", "active"].includes(battle.status) ||
      battle.getEntity(`battle-hero-${heroId}`) === null
    )
      return { state: "ignored" };
    hero.updatePosition(position);
    return { state: "inside" };
  }

  #isOnPursuitCooldown(hero) {
    return hero === null || (hero.pursuitCooldownUntil ?? 0) > this.now();
  }

  #destroyDefeatedEnemySource(battle) {
    if (battle.sourceEnemyTeamId?.startsWith("autonomous-")) return null;
    if (
      battle.sourceLocationId === null ||
      battle.sourceEnemyTeamId === null ||
      battle.winnerTeamId === battle.sourceEnemyTeamId
    )
      return null;
    const location = this.getLocation(battle.sourceLocationId);
    if (location === null || location.features.battle !== true) return null;
    const attackPoints =
      this.setup.rules.locationMode === "casual"
        ? (location.durability?.maxHealth ?? 1)
        : 30 +
          battle.teams
            .find((team) => team.id === battle.winnerTeamId)
            ?.units.reduce(
              (sum, unit) =>
                sum +
                Math.max(0, unit.quantity) * Math.max(1, unit.attack ?? 1),
              0,
            );
    const result = this.locationProgressionService.applyAttack(
      location,
      attackPoints,
    );
    this.eventLog.push({
      type: result.destroyed
        ? "enemy_location_destroyed"
        : "enemy_location_damaged",
      locationId: location.id,
      battleId: battle.id,
      result,
      at: this.now(),
    });
    return result.destroyed ? location.id : null;
  }

  #captureDefeatedLocation(battle) {
    if (
      battle.sourceLocationId === null ||
      battle.sourceEnemyTeamId === null ||
      battle.winnerTeamId === null
    )
      return null;
    if (
      battle.sourceEnemyTeamId.startsWith("autonomous-") &&
      battle.winnerTeamId !== battle.sourceEnemyTeamId
    )
      return null;
    const location = this.getLocation(battle.sourceLocationId);
    const winner = battle.teams.find((team) => team.id === battle.winnerTeamId);
    if (
      winner?.heroes.some(
        (snapshot) => snapshot.sourceId === `location-${location?.id}`,
      )
    )
      return null;
    const playerId =
      winner?.heroes
        .map((snapshot) => {
          const hero = this.getHero(snapshot.sourceId);
          if (hero) return hero.playerId;
          if (!snapshot.sourceId.startsWith("autonomous-group-")) return null;
          const group = this.getAutonomousGroup(
            snapshot.sourceId.slice("autonomous-group-".length),
          );
          return group ? this.getAutonomousControllerId(group) : null;
        })
        .find(Boolean) ?? null;
    if (
      location === null ||
      playerId === null ||
      location.features.capturable !== true
    )
      return null;
    const result = this.locationCaptureService.capture({
      location,
      playerId,
      relation: this.locationAccessPolicy.getRelation(playerId, location),
      canCapture: this.locationAccessPolicy.canCapture(playerId, location),
      isQuestCompleted: (id) => this.isObjectiveCompleted(id),
      afterBattle: true,
    });
    if (!result.success) return null;
    location.garrison.units = [];
    this.eventLog.push({
      type: "location_captured",
      ...result,
      battleId: battle.id,
      at: this.now(),
    });
    return result;
  }

  // Requêtes publiques et sérialisation de l'état complet.
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

  get rogueArmies() {
    return this.autonomousGroups.filter((group) => group.type === "rogue");
  }
  getAutonomousGroup(groupId) {
    return this.autonomousGroups.find((group) => group.id === groupId) ?? null;
  }
  getAutonomousGroupsByOwner({ kind, id }) {
    return this.autonomousGroups.filter(
      (group) => group.owner.kind === kind && group.owner.id === id,
    );
  }
  addAutonomousGroup(group) {
    const candidate =
      group instanceof AutonomousGroup ? group : new AutonomousGroup(group);
    if (this.getAutonomousGroup(candidate.id) !== null) return false;
    this.autonomousGroups.push(candidate);
    return true;
  }

  getLocationWatchZones(playerId) {
    return locationWatchZones(this, playerId);
  }

  sendRelayMessage({ playerId, heroId, locationId, recipientPlayerId, text }) {
    const location = this.getLocation(locationId),
      hero = this.getHero(heroId);
    if (
      !hero ||
      hero.playerId !== playerId ||
      hero.state !== "active" ||
      !location?.heroIds.includes(heroId) ||
      location.ownerId !== playerId
    )
      return { success: false, reason: "location_access_denied" };
    return this.locationWatchService.send(this, {
      location,
      recipientPlayerId,
      text,
    });
  }

  divineAtAcademy({ playerId, heroId, locationId }) {
    const hero = this.getHero(heroId),
      location = this.getLocation(locationId),
      player = this.getPlayer(playerId);
    if (
      !hero ||
      hero.playerId !== playerId ||
      hero.state !== "active" ||
      !location?.heroIds.includes(heroId) ||
      !(location.infrastructure.magic_academy > 0) ||
      !this.locationAccessPolicy.can(playerId, location, "train")
    )
      return { success: false, reason: "location_access_denied" };
    if (hero.getResourceAmount("gold") < 50)
      return { success: false, reason: "insufficient_resources" };
    const radius = this.coordinateMode === "simulation" ? 60 : 450;
    const revealedLocationIds = this.locations
      .filter(
        (site) =>
          watchDistance(
            this.coordinateMode,
            location.position,
            site.position,
          ) <= radius,
      )
      .filter((site) => player.discoverLocation(site.id, 1))
      .map((site) => site.id);
    hero.spendResource("gold", 50);
    hero.classFeatureState.divinationVision = {
      center: { ...location.position },
      radius,
      activatedAt: this.now(),
      expiresAt: this.now() + 60_000,
    };
    return {
      success: true,
      revealedLocationIds,
      cost: 50,
      durationMs: 60_000,
      radius,
    };
  }

  activateHeroDivination({ playerId, heroId, center }) {
    const hero = this.getHero(heroId),
      player = this.getPlayer(playerId);
    if (
      !hero ||
      hero.playerId !== playerId ||
      hero.state !== "active" ||
      this.#isHeroBusy(heroId)
    )
      return {
        success: false,
        reason: "ability_unavailable",
        revealedLocationIds: [],
      };
    if (
      !Number.isFinite(center?.latitude) ||
      !Number.isFinite(center?.longitude)
    )
      return {
        success: false,
        reason: "invalid_position",
        revealedLocationIds: [],
      };
    return this.heroClassFeatureService.divine(hero, {
      player,
      locations: this.locations.filter((location) =>
        mapLocationDiscoverable(location, this, player.id),
      ),
      center,
      distanceFn: (first, second) => this.#worldDistance(first, second),
    });
  }

  activateHeroAstralTravel({ playerId, heroId }) {
    const hero = this.getHero(heroId);
    if (
      !hero ||
      hero.playerId !== playerId ||
      hero.state !== "active" ||
      this.#isHeroBusy(heroId) ||
      !hero.position
    )
      return { success: false, reason: "ability_unavailable" };
    return this.heroClassFeatureService.beginAstralTravel(hero);
  }

  selectHeroAstralTarget({ playerId, heroId, kind, targetId }) {
    const hero = this.getHero(heroId);
    const travel = this.heroClassFeatureService.activeAstralTravel(hero);
    if (
      !travel ||
      hero.playerId !== playerId ||
      hero.state !== "active" ||
      this.#isHeroBusy(heroId)
    )
      return { success: false, reason: "ability_unavailable" };
    const target =
      kind === "location"
        ? this.getLocation(targetId)
        : kind === "hero"
          ? this.getHero(targetId)
          : kind === "group"
            ? this.getAutonomousGroup(targetId)
            : null;
    const visibility = playerMapVisibility(this.toJSON(), playerId, this.now());
    const visible =
      kind === "location"
        ? visibility.locations.has(targetId)
        : kind === "group"
          ? visibility.autonomousGroups.has(targetId)
          : kind === "hero" &&
            target?.id !== hero.id &&
            target?.state === "active" &&
            (alliedPlayers(this, playerId, target.playerId) ||
              this.#worldDistance(hero.position, target.position) <=
                this.heroClassFeatureService.visionRadius(hero) ||
              watchedPosition(this, playerId, target.position));
    if (!target?.position || !visible)
      return { success: false, reason: "invalid_target" };
    if (this.#worldDistance(hero.position, target.position) > travel.reachBonus)
      return { success: false, reason: "target_out_of_astral_reach" };
    hero.classFeatureState.astralTravel = {
      ...travel,
      targetKind: kind,
      targetId,
      locationId: kind === "location" ? targetId : null,
      targetPosition: { ...target.position },
    };
    return { success: true, kind, targetId, playerId: target.playerId ?? null };
  }

  getTradingConvoyOptions({ playerId, originLocationId }) {
    return this.tradingConvoyService.getOptions({
      locations: this.locations,
      groups: this.autonomousGroups,
      playerId,
      originLocationId,
    });
  }

  foundResourceCamp(request) { return this.campInstallationService.found(request); }
  sendCampInstallation(request) { return this.campInstallationService.send(request); }
  claimCampInstallation(request) { const m=this.explorationState.expeditions.find(m=>m.id===request.expeditionId && m.kind==="installation"); return m ? this.exceptionalSiteResolutionService.claim(request) : {success:false,reason:"expedition_unavailable"}; }
  resolveExceptionalExpedition(request) { return this.exceptionalSiteResolutionService.resolve(request); }
  claimExceptionalExpedition(request) { return this.exceptionalSiteResolutionService.claim(request); }
  prepareExceptionalExpedition(request) { return this.exceptionalExpeditionService.prepare(request); }
  departExceptionalExpedition(request) { return this.exceptionalExpeditionService.depart(request); }
  cancelExceptionalExpedition(request) { return this.exceptionalExpeditionService.cancel(request); }

  beginExteriorSearch(request) {
    return this.exteriorSearchService.begin(request);
  }
  prepareExteriorSearch(request) {
    return this.exteriorSearchService.prepare(request);
  }
  validateExteriorSearch(request) {
    return this.exteriorSearchService.validate(request);
  }
  cancelExteriorSearch(request) {
    return this.exteriorSearchService.cancel(request);
  }

  getProspectingOptions({ playerId, originLocationId }) {
    return this.prospectingService.getOptions({
      locations: this.locations,
      groups: this.autonomousGroups,
      playerId,
      originLocationId,
    });
  }

  createProspectingExpedition({
    playerId,
    heroId,
    originLocationId,
    specialistId,
    food = 5,
    beer = 0,
    horses = 0,
  }) {
    const hero = this.getHero(heroId);
    const origin = this.getLocation(originLocationId);
    if (
      !hero ||
      hero.playerId !== playerId ||
      !origin ||
      !origin.heroIds.includes(heroId)
    )
      return { success: false, reason: "hero_not_at_origin" };
    const result = this.prospectingService.create({
      locations: this.locations,
      playerId,
      originLocationId,
      specialistId,
      food,
      beer,
      horses,
      coordinateMode: this.coordinateMode,
      playArea: this.setup.playArea,
      now: this.now(),
    });
    if (!result.success) return result;
    this.addAutonomousGroup(result.group);
    const event = {
      type: "prospecting_expedition_created",
      playerId,
      heroId,
      groupId: result.group.id,
      originLocationId,
      specialistId,
      food,
      cost: result.cost,
      maximumRadius: result.maximumRadius,
      at: this.now(),
    };
    this.eventLog.push(event);
    return {
      success: true,
      groupId: result.group.id,
      cost: result.cost,
      maximumRadius: result.maximumRadius,
      event,
    };
  }

  addResourceZone(zone) {
    const candidate =
      zone instanceof ResourceZone ? zone : new ResourceZone(zone);
    if (this.resourceZones.some((entry) => entry.id === candidate.id))
      return false;
    this.resourceZones.push(candidate);
    return true;
  }

  #resolveResourceZoneDiscovery(event) {
    const player = this.getPlayer(event.playerId);
    if (!player) return;
    player.receiveInformation({
      id: this.idGenerator("information"),
      kind: "prospecting_report",
      sourceGroupId: event.groupId,
      locationIds:
        event.locationId && this.getLocation(event.locationId)
          ? [event.locationId]
          : [],
      zoneId: event.zoneId,
      resourceId: event.resourceId,
      createdAt: event.at,
    });
  }

  createTradingConvoy({
    playerId,
    heroId,
    originLocationId,
    destinationLocationId,
    resourceId,
  }) {
    const hero = this.getHero(heroId);
    const origin = this.getLocation(originLocationId);
    if (
      !hero ||
      hero.playerId !== playerId ||
      !origin ||
      !origin.heroIds.includes(heroId)
    )
      return { success: false, reason: "hero_not_at_origin" };
    const result = this.tradingConvoyService.create({
      locations: this.locations,
      playerId,
      originLocationId,
      destinationLocationId,
      resourceId,
      coordinateMode: this.coordinateMode,
      now: this.now(),
    });
    if (!result.success) return result;
    this.addAutonomousGroup(result.group);
    const event = {
      type: "trading_convoy_created",
      playerId,
      heroId,
      groupId: result.group.id,
      originLocationId,
      destinationLocationId,
      resourceId,
      cost: result.cost,
      at: this.now(),
    };
    this.eventLog.push(event);
    return {
      success: true,
      groupId: result.group.id,
      cost: result.cost,
      event,
    };
  }

  stopTradingConvoy({ playerId, groupId }) {
    const group = this.getAutonomousGroup(groupId);
    if (!group || group.owner.kind !== "player" || group.owner.id !== playerId)
      return { success: false, reason: "convoy_not_owned" };
    const result = this.tradingConvoyService.stop(group, this.now());
    if (result.success)
      this.eventLog.push({
        type: "trading_convoy_stopped",
        playerId,
        groupId,
        at: this.now(),
      });
    return result;
  }
  removeAutonomousGroup(groupId) {
    const index = this.autonomousGroups.findIndex(
      (group) => group.id === groupId,
    );
    return index === -1 ? null : this.autonomousGroups.splice(index, 1)[0];
  }

  getPlayer(playerId) {
    return this.players.find((player) => player.id === playerId) ?? null;
  }
  getHero(heroId) {
    return this.heroes.find((hero) => hero.id === heroId) ?? null;
  }
  getLocation(locationId) {
    return (
      this.locations.find((location) => location.id === locationId) ?? null
    );
  }

  getLocationForScenarioSlot(locationSlotId) {
    const binding = this.scenarioLocationBindings.find(
      (item) => item.locationSlotId === locationSlotId,
    );
    if (binding === undefined)
      throw new RangeError(
        "L'emplacement de scénario n'est pas associé à un lieu.",
      );
    const location = this.getLocation(binding.locationId);
    if (location === null)
      throw new RangeError("Le lieu associé au scénario n'existe pas.");
    return location;
  }

  toJSON() {
    return {
      questEngineState: structuredClone(this.questEngineState),
      questSystemEnabled: this.questSystemEnabled,
      tacticalBattles: this.tacticalBattles,
      setup: this.setup.toJSON(),
      heroClasses: [...this.heroClasses.values()].map((heroClass) =>
        structuredClone(heroClass),
      ),
      heroAptitudes: [...this.heroProgressionService.aptitudes.values()].map(
        (aptitude) => aptitude.toJSON(),
      ),
      unitDefinitions: [...this.unitDefinitions.values()].map((definition) =>
        typeof definition.toJSON === "function"
          ? definition.toJSON()
          : structuredClone(definition),
      ),
      coordinateMode: this.coordinateMode,
      playerSessions: structuredClone(this.playerSessions),
      territoryState: structuredClone(this.territoryState),
      players: this.players.map((player) => player.toJSON()),
      heroes: this.heroes.map((hero) => hero.toJSON()),
      locations: this.locations.map((location) => location.toJSON()),
      status: this.status,
      scenario: this.scenario?.toJSON() ?? null,
      scenarioState: this.scenarioState?.toJSON() ?? null,
      scenarioRuntime:
        this.scenarioRuntime === null
          ? null
          : structuredClone(this.scenarioRuntime),
      trailStates: Object.fromEntries(
        Object.entries(this.trailStates).map(([id, state]) => [
          id,
          state.toJSON(),
        ]),
      ),
      worldState: this.worldState.toJSON(),
      availableQuests: this.availableQuests.map((quest) => ({ ...quest })),
      tavernNpcState: this.tavernNpcService.toJSON(),
      itemAcquisitionState: this.itemAcquisitionService.toJSON(),
      teamFortQuestState: this.teamFortQuestService.toJSON(),
      questSequence: this.questSequence.map((quest) => ({
        ...quest,
        phaseIds: [...quest.phaseIds],
      })),
      lastQuestResult:
        this.lastQuestResult === null ? null : { ...this.lastQuestResult },
      scenarioLocationBindings: this.scenarioLocationBindings.map((binding) =>
        binding.toJSON(),
      ),
      eventLog: this.eventLog.map((entry) => ({ ...entry })),
      activeScenarioEventId: this.activeScenarioEventId,
      evacuationStates: structuredClone(this.evacuationStates),
      questDeadlines: structuredClone(this.questDeadlines),
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      finishReason: this.finishReason,
      battles: this.battles.map((battle) => battle.toJSON()),
      battleReports: this.battleReports.map((report) =>
        structuredClone(report),
      ),
      autonomousGroups: this.autonomousGroups.map((group) => group.toJSON()),
      tradingConvoyConfig: structuredClone(this.tradingConvoyService.config),
      prospectingConfig: structuredClone(this.prospectingService.config),
      resourceZones: this.resourceZones.map((zone) => zone.toJSON()),
      explorationState: this.explorationState.toJSON(),
      watchBeacons: this.watchBeacons.map((beacon) => beacon.toJSON()),
      autonomousGroupTraces: this.autonomousGroupTraces.map((trace) =>
        trace.toJSON(),
      ),
      battleLoot: this.battleLoot.map((reward) => reward.toJSON()),
      battleSites: this.battleSites.map((site) => site.toJSON()),
    };
  }

  static fromJSON(snapshot, options = {}) {
    if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object")
      throw new TypeError("L’instantané de partie est invalide.");
    const game = new Game({
      setup: snapshot.setup,
      scenario: snapshot.scenario,
      scenarioLocationBindings: snapshot.scenarioLocationBindings ?? [],
      heroClasses: snapshot.heroClasses ?? [],
      heroAptitudes: snapshot.heroAptitudes ?? [],
      unitDefinitions: snapshot.unitDefinitions ?? [],
      locations: snapshot.locations ?? [],
      autonomousGroups: snapshot.autonomousGroups ?? [],
      tradingConvoyConfig: snapshot.tradingConvoyConfig ?? null,
      prospectingConfig: snapshot.prospectingConfig ?? null,
      resourceZones: snapshot.resourceZones ?? [],
      explorationState: snapshot.explorationState ?? null,
      autonomousGroupTraces: snapshot.autonomousGroupTraces ?? [],
      watchBeacons: snapshot.watchBeacons ?? [],
      coordinateMode: snapshot.coordinateMode ?? "gps",
      scenarioStartsActive: false,
      tacticalBattles:
        options.tacticalBattles ?? snapshot.tacticalBattles ?? false,
      questEngineState: snapshot.questEngineState ?? null,
      territoryState: snapshot.territoryState ?? null,
      questSystemEnabled:
        options.questSystemEnabled ?? snapshot.questSystemEnabled ?? true,
      scenarioStateSnapshot: snapshot.scenarioState,
      worldStateSnapshot: snapshot.worldState,
      tavernNpcState: snapshot.tavernNpcState ?? null,
      itemAcquisitionState: snapshot.itemAcquisitionState ?? null,
      teamFortQuestState: snapshot.teamFortQuestState ?? [],
      trailStateSnapshots: snapshot.trailStates,
      scenarioRuntimeSnapshot: snapshot.scenarioRuntime,
      ...(typeof options.now === "function" ? { now: options.now } : {}),
      ...(typeof options.idGenerator === "function"
        ? { idGenerator: options.idGenerator }
        : {}),
    });
    game.playerSessions = structuredClone(snapshot.playerSessions ?? []);
    game.explorationView = structuredClone(snapshot.explorationView ?? null);
    game.players = (snapshot.players ?? []).map((player) => new Player(player));
    game.heroes = (snapshot.heroes ?? []).map((hero) => new Hero(hero));
    game.locations = (snapshot.locations ?? []).map(
      (location) => new Location(location),
    );
    game.status = snapshot.status ?? "preparing";
    game.startedAt = snapshot.startedAt ?? null;
    game.finishedAt = snapshot.finishedAt ?? null;
    game.finishReason = snapshot.finishReason ?? null;
    game.availableQuests = structuredClone(snapshot.availableQuests ?? []);
    game.questSequence = structuredClone(snapshot.questSequence ?? []);
    game.lastQuestResult = structuredClone(snapshot.lastQuestResult ?? null);
    game.eventLog = structuredClone(snapshot.eventLog ?? []);
    game.activeScenarioEventId = snapshot.activeScenarioEventId ?? null;
    game.evacuationStates = structuredClone(snapshot.evacuationStates ?? {});
    game.questDeadlines = structuredClone(snapshot.questDeadlines ?? {});
    // Un combat hors du format courant ne doit pas empêcher la reprise du monde.
    // Aucun résultat ni récompense n'est inventé pour les combats écartés.
    const battleSnapshots = snapshot.battles ?? [];
    const discardedBattles = battleSnapshots.filter(
      (battle) => !BattleEngine.canRestoreSnapshot(battle),
    );
    const discardedActiveBattleIds = new Set(
      discardedBattles
        .filter((battle) => battle.status !== "finished")
        .map((battle) => battle.id),
    );
    game.battles = battleSnapshots.filter(BattleEngine.canRestoreSnapshot).map(
      (battle) =>
        new BattleEngine({
          ...battle,
          ...(typeof options.now === "function" ? { now: options.now } : {}),
        }),
    );
    game.battleReports = structuredClone(snapshot.battleReports ?? []);
    game.battleLoot = (snapshot.battleLoot ?? []).map(
      (loot) =>
        new BattleLoot({
          ...loot,
          ...(typeof options.now === "function" ? { now: options.now } : {}),
        }),
    );
    game.battleSites = (snapshot.battleSites ?? [])
      .filter((site) => !discardedActiveBattleIds.has(site.battleId))
      .map(
        (site) =>
          new BattleSite({
            ...site,
            ...(typeof options.now === "function" ? { now: options.now } : {}),
          }),
      );
    if (discardedBattles.length) {
      game.eventLog.push({
        type: "incompatible_battles_discarded",
        battleIds: discardedBattles.map((battle) => battle.id),
        at: game.now(),
      });
    }
    reconcileClosedExceptionalSites(game);
    return game;
  }

  // Normalisation défensive des catalogues injectés au constructeur.
  static #createHeroClassMap(heroClasses) {
    if (!Array.isArray(heroClasses))
      throw new TypeError("Les classes de héros doivent être une liste.");
    const classes = new Map();
    heroClasses.forEach((heroClass) => {
      if (
        heroClass === null ||
        Array.isArray(heroClass) ||
        typeof heroClass !== "object"
      )
        throw new TypeError("Une classe de héros doit être un objet.");
      const id = Game.#requireText(heroClass.id, "L'identifiant de classe");
      if (classes.has(id))
        throw new RangeError(
          "Les identifiants de classe doivent être uniques.",
        );
      const name = Game.#requireText(heroClass.name, "Le nom de classe");
      const abilityIds = heroClass.abilityIds ?? [];
      if (!Array.isArray(abilityIds))
        throw new TypeError("Les capacités de classe doivent être une liste.");
      const startingResources = Game.#createResourceMap(
        heroClass.startingResources ?? {},
      );
      const startingUnits = Game.#createUnitStacks(
        heroClass.startingUnits ?? [],
      );
      const startingItems = Game.#createIds(heroClass.startingItems ?? []);
      const defaults = classDefinitionFor(id);
      const baseStats = Game.#createStats(
        heroClass.baseStats ??
          defaults?.baseStats ?? {
            attack: 0,
            defense: 0,
            morale: 0,
            mobility: 1,
            command: 3,
            health: 30,
          },
        "Les statistiques de classe",
      );
      const growthWeights = Game.#createGrowthWeights(
        heroClass.growthWeights ??
          defaults?.growthWeights ?? {
            attack: 4,
            defense: 3,
            morale: 3,
            mobility: 3,
            command: 3,
            health: 3,
          },
      );
      const aptitudeIds = Game.#createIds(
        heroClass.aptitudeIds ?? defaults?.aptitudeIds ?? [],
      );
      const commonAptitudeIds = Game.#createIds(
        heroClass.commonAptitudeIds ?? defaults?.commonAptitudeIds ?? [],
      );
      const authorityBonus =
        heroClass.authorityBonus ??
        defaults?.authorityBonus ??
        { warrior: 2, ranger: 1, mage: 0 }[id] ??
        0;
      if (!Number.isInteger(authorityBonus) || authorityBonus < 0)
        throw new RangeError(
          "Le bonus d'autorite de classe doit etre un entier positif ou nul.",
        );
      const features = heroClass.features ?? defaults?.features ?? {};
      if (
        features === null ||
        Array.isArray(features) ||
        typeof features !== "object"
      )
        throw new TypeError("Les avantages de classe doivent être un objet.");
      classes.set(id, {
        id,
        name,
        authorityBonus,
        advantage: heroClass.advantage ?? defaults?.advantage ?? "",
        features: structuredClone(features),
        abilityIds: [
          ...new Set(
            abilityIds.map((abilityId) =>
              Game.#requireText(abilityId, "Une capacité"),
            ),
          ),
        ],
        baseStats,
        growthWeights,
        aptitudeIds,
        commonAptitudeIds,
        startingResources,
        startingUnits,
        startingItems,
      });
    });
    return classes;
  }

  #grantStartingForces() {
    this.players.forEach((player) => {
      const primaryHero = this.getHero(player.heroIds[0]);
      if (this.scenario !== null) {
        Object.entries(this.scenario.playerStart.resources).forEach(
          ([resource, amount]) => {
            if (amount > 0) primaryHero.addResource(resource, amount);
          },
        );
        this.#addStartingUnits(
          primaryHero,
          player.id,
          this.scenario.playerStart.unitStacks,
        );
      }
      player.heroIds.forEach((heroId) => {
        const hero = this.getHero(heroId);
        const heroClass = this.heroClasses.get(hero.classId);
        Object.entries(heroClass.startingResources).forEach(
          ([resource, amount]) => {
            if (amount > 0) hero.addResource(resource, amount);
          },
        );
        hero.addCarriedLoot(
          heroClass.startingItems.map((itemId) => ({
            id: this.idGenerator("equipment"),
            itemId,
            quantity: 1,
            valuePerUnit: 1,
          })),
        );
        this.#addStartingUnits(hero, player.id, heroClass.startingUnits);
      });
    });
  }

  #addStartingUnits(hero, playerId, stacks) {
    stacks.forEach((stack) => {
      if (hero.army.units.length >= hero.maxUnitStacks)
        throw new Error(
          "Les unités de départ dépassent la capacité de commandement du héros.",
        );
      const unit = this.recruitmentService.createUnit({
        ownerPlayerId: playerId,
        typeId: stack.typeId,
        quantity: stack.quantity,
        idGenerator: this.idGenerator,
        number: this.#nextUnitNumber(playerId, stack.typeId),
      });
      const authority = this.getHeroAuthority(hero.id);
      if (authority.used + this.getUnitAuthorityCost(unit) > authority.maximum)
        throw new Error("Les unites de depart depassent l'autorite du heros.");
      hero.addUnit(unit);
    });
  }

  #worldDistance(first, second) {
    return this.coordinateMode === "simulation"
      ? Math.hypot(
          first.latitude - second.latitude,
          first.longitude - second.longitude,
        )
      : distanceMeters(first, second);
  }

  #isHeroBusy(heroId) {
    return this.battles.some(
      (battle) =>
        !["finished"].includes(battle.status) &&
        battle.teams.some((team) =>
          team.heroes.some((snapshot) => snapshot.sourceId === heroId),
        ),
    );
  }

  #heroResourceCapacity(hero, resourceName, requested) {
    if (!Number.isFinite(requested) || requested <= 0) return 0;
    if (getItemDefinition(resourceName)?.bagSlots === 0) return requested;
    const usedSlots = this.inventoryService.getUsedHeroBagSlots(hero);
    if (usedSlots > hero.bagSlotCount) return 0;
    const bundleSize = getItemDefinition(resourceName)?.bundleSize ?? 1;
    const current = hero.getResourceAmount(resourceName);
    const partialRoom =
      current % bundleSize === 0 ? 0 : bundleSize - (current % bundleSize);
    return Math.min(
      requested,
      partialRoom + Math.max(0, hero.bagSlotCount - usedSlots) * bundleSize,
    );
  }

  #nextUnitNumber(playerId, typeId) {
    const units = [
      ...this.heroes.flatMap((hero) => hero.army.units),
      ...this.locations.flatMap((location) => location.garrison.units),
    ].filter(
      (unit) => unit.ownerPlayerId === playerId && unit.typeId === typeId,
    );
    return Math.max(0, ...units.map((unit) => unit.number ?? 0)) + 1;
  }

  #autonomousGroupSpeed(group) {
    if (
      Number.isFinite(group.mission?.speedMetersPerSecond) &&
      group.mission.speedMetersPerSecond > 0
    )
      return group.mission.speedMetersPerSecond;
    if (group.type === "messenger") return 5;
    if (group.type === "prospecting") return 1.4;
    if (group.type === "convoy")
      return Math.max(0.8, 2 - group.occupiedCargoSlots * 0.1);
    if (group.army.units.length === 0) return 1.2;
    return Math.max(
      0.5,
      armySpeed(
        group.army.units,
        (unit) => this.unitDefinitions.get(unit.typeId)?.stats?.speed ?? 1.2,
      ),
    );
  }

  getAutonomousControllerId(group) {
    if (group.owner.kind !== "player" && group.alignment)
      return { ally: "kingdom", neutral: "neutral", enemy: "enemy" }[
        group.alignment
      ];
    if (group.owner.kind === "location") {
      const origin = this.getLocation(group.owner.id);
      return (
        origin?.controllerId ??
        origin?.ownerId ??
        group.factionId ??
        group.owner.id
      );
    }
    const controllerId =
      group.owner.kind === "player"
        ? group.owner.id
        : (group.factionId ?? group.owner.id);
    if (
      group.owner.kind !== "player" &&
      !this.locationAccessPolicy.alliedControllerIds.has(controllerId)
    )
      this.locationAccessPolicy.enemyControllerIds.add(controllerId);
    return controllerId;
  }

  #createBattleFromAutonomousEvent(event) {
    if (
      ![
        "autonomous_group_attack_requested",
        "autonomous_group_ambush_attack_requested",
        "autonomous_group_location_attack_requested",
      ].includes(event.type)
    )
      return null;
    const group = this.getAutonomousGroup(event.groupId);
    if (
      group === null ||
      group.army.units.every((unit) => unit.combatantCount === 0)
    )
      return null;
    const autonomousTeamId = `autonomous-${group.id}`;
    if (event.type === "autonomous_group_location_attack_requested") {
      const location = this.getLocation(event.locationId);
      if (
        location === null ||
        !this.locationAccessPolicy.canCapture(
          this.getAutonomousControllerId(group),
          location,
        )
      )
        return null;
      const defenderHeroIds = location.heroIds.filter((heroId) => {
        const hero = this.getHero(heroId);
        return (
          hero?.state === "active" &&
          this.locationAccessPolicy.isDefender(hero.playerId, location)
        );
      });
      if (
        defenderHeroIds.length === 0 &&
        !location.garrison.units.some((unit) => unit.quantity > 0)
      ) {
        const playerId = this.getAutonomousControllerId(group);
        const result = this.locationCaptureService.capture({
          location,
          playerId,
          relation: this.locationAccessPolicy.getRelation(playerId, location),
          canCapture: this.locationAccessPolicy.canCapture(playerId, location),
          isQuestCompleted: (id) => this.isObjectiveCompleted(id),
        });
        if (result.success) {
          this.eventLog.push({
            type: "location_captured",
            ...result,
            groupId: group.id,
            at: this.now(),
          });
          group.status = "idle";
          group.mission = null;
          group.interruption = null;
          return null;
        }
      }
      return this.createBattle({
        teamParticipants: [
          { id: "heroes", heroIds: defenderHeroIds, locationId: location.id },
          { id: autonomousTeamId, heroIds: [], autonomousGroupId: group.id },
        ],
        position: group.position,
        sourceLocationId: location.id,
        sourceEnemyTeamId: autonomousTeamId,
      });
    }
    const hero = this.getHero(event.target?.id);
    if (hero === null || hero.state !== "active" || this.#isHeroBusy(hero.id))
      return null;
    return this.createBattle({
      teamParticipants: [
        { id: "heroes", heroIds: [hero.id] },
        { id: autonomousTeamId, heroIds: [], autonomousGroupId: group.id },
      ],
      position: group.position,
      sourceLocationId:
        group.mission?.kind === "attack_location"
          ? group.mission.targetId
          : null,
      config:
        event.type === "autonomous_group_ambush_attack_requested"
          ? { ambushTeamId: autonomousTeamId }
          : {},
    });
  }

  #settleAutonomousBattleParticipants(battle) {
    battle.teams.forEach((team) =>
      team.heroes.forEach((snapshot) => {
        if (!snapshot.sourceId.startsWith("autonomous-group-")) return;
        const group = this.getAutonomousGroup(
          snapshot.sourceId.slice("autonomous-group-".length),
        );
        if (group === null) return;
        if (group.commander)
          group.commander.setBattleState({
            health: snapshot.health,
            state: snapshot.health === 0 ? "ghost" : snapshot.state,
          });
        const survived =
          team.id === battle.winnerTeamId &&
          (!group.commander || snapshot.health > 0) &&
          group.army.units.some((unit) => unit.combatantCount > 0);
        group.status = survived ? "idle" : "destroyed";
        group.interruption = null;
        group.movement = null;
        group.ambush = null;
        if (
          survived &&
          group.mission?.kind === "attack_location" &&
          group.mission.targetId === battle.sourceLocationId
        )
          group.mission = null;
        group.history.push({
          type: survived ? "battle_won" : "battle_lost",
          battleId: battle.id,
          at: this.now(),
        });
      }),
    );
  }

  #applyInformationMapEffects(player, effects) {
    if (!Array.isArray(effects)) return;
    effects.forEach((effect) => {
      if (
        effect?.type === "reveal_location" &&
        this.getLocation(effect.locationId) !== null
      )
        player.discoverLocation(
          effect.locationId,
          Math.max(1, Math.min(3, effect.knowledgeLevel ?? 1)),
        );
    });
  }

  #extractDroppedEquipment(battle) {
    const dropped = [];
    battle.teams
      .flatMap((team) => team.heroes)
      .filter(
        (snapshot) => !["active", "fled", "retreated"].includes(snapshot.state),
      )
      .forEach((snapshot) => {
        const hero = this.getHero(snapshot.sourceId);
        if (hero === null) return;
        const isGhost = snapshot.state === "ghost" || snapshot.health === 0;
        if (isGhost || snapshot.state === "surrendered") {
          Object.entries(hero.equipment).forEach(([slot, itemId]) => {
            if (itemId.startsWith("quest:") || itemId.startsWith("bound:"))
              return;
            dropped.push({
              id: `equipment-${hero.id}-${slot}`,
              itemId,
              quantity: 1,
              portable: true,
              valuePerUnit: 10,
            });
            delete hero.equipment[slot];
          });
          hero.equipmentModifiers = Object.fromEntries(
            Object.keys(hero.equipmentModifiers).map((stat) => [stat, 0]),
          );
          Object.values(hero.equipment).forEach((itemId) =>
            Object.entries(getItemDefinition(itemId)?.modifiers ?? {}).forEach(
              ([stat, value]) => {
                hero.equipmentModifiers[stat] += value;
              },
            ),
          );
        }
        this.explorationClueService.lose(
          hero,
          hero.carriedLoot.map((entry) => entry.itemId),
          `battle-loss:${battle.id}`,
        );
        hero.carriedLoot.forEach((entry, index) =>
          dropped.push({
            id: `carried-${hero.id}-${index}`,
            ...entry,
            portable: true,
          }),
        );
        hero.carriedLoot = [];
        if (isGhost || snapshot.state === "surrendered")
          Object.entries(hero.resources).forEach(([itemId, amount]) => {
            const quantity = Math.floor(amount);
            if (quantity > 0)
              dropped.push({
                id: `resource-${hero.id}-${itemId}`,
                itemId,
                quantity,
                portable: true,
                valuePerUnit: 1,
              });
            hero.resources[itemId] = 0;
          });
      });
    return dropped;
  }

  #storeCollectedLoot(hero, entries) {
    entries.forEach((entry) => {
      const clue = this.explorationClueService.find(entry.itemId);
      if (clue) {
        this.explorationClueService.receive(hero, clue);
        return;
      }
      const definition = getItemDefinition(entry.itemId);
      if (
        definition &&
        ["resource", "consumable", "livestock"].includes(definition.category)
      ) {
        hero.addResource(entry.itemId, entry.quantity);
        return;
      }
      const bundleSize = definition?.bundleSize ?? 1;
      for (let remaining = entry.quantity; remaining > 0; ) {
        const quantity = Math.min(bundleSize, remaining);
        remaining -= quantity;
        hero.addCarriedLoot([
          {
            id: this.idGenerator("loot"),
            itemId: entry.itemId,
            quantity,
            valuePerUnit: entry.valuePerUnit ?? 1,
          },
        ]);
      }
    });
  }

  #awardEnemySalvage(battle, entries) {
    const winningTeam = battle.teams.find(
      (team) => team.id === battle.winnerTeamId,
    );
    const winningHeroes =
      winningTeam?.heroes
        .map((snapshot) => this.getHero(snapshot.sourceId))
        .filter((hero) => hero?.state === "active") ?? [];
    const hero = winningHeroes[0] ?? null;
    const equipped = [];
    let experiencePool = 0;
    entries
      .filter(
        (entry) =>
          entry.protected !== true &&
          !["barricade", "barricades"].includes(entry.itemId),
      )
      .forEach((entry, entryIndex) => {
        const definition = getItemDefinition(entry.itemId);
        const quantity = Math.max(0, Math.floor(entry.quantity ?? 0));
        if (hero && definition?.category === "equipment") {
          for (let index = 0; index < quantity; index += 1) {
            const packageId = this.idGenerator("enemy-equipment");
            hero.addCarriedLoot([
              {
                id: packageId,
                itemId: entry.itemId,
                quantity: 1,
                valuePerUnit: entry.valuePerUnit ?? 1,
              },
            ]);
            const result = this.equipmentService.equip(hero, packageId);
            if (result.success)
              equipped.push({
                heroId: hero.id,
                itemId: entry.itemId,
                slot: result.slot,
              });
            else {
              hero.carriedLoot = hero.carriedLoot.filter(
                (item) => item.id !== packageId,
              );
              experiencePool += 1;
            }
          }
        } else experiencePool += quantity;
      });
    const units =
      winningTeam?.units
        .map((snapshot) => this.findUnit(snapshot.sourceId))
        .filter((unit) => unit !== null && unit.quantity > 0) ?? [];
    const recipients = [
      ...winningHeroes.map((winner) => ({ kind: "hero", entity: winner })),
      ...units.map((unit) => ({ kind: "unit", entity: unit })),
    ];
    const experience = [];
    if (recipients.length > 0 && experiencePool > 0) {
      const base = Math.floor(experiencePool / recipients.length);
      let remainder = experiencePool % recipients.length;
      recipients.forEach(({ kind, entity }) => {
        const amount = base + (remainder-- > 0 ? 1 : 0);
        if (amount <= 0) return;
        entity.addExperience(amount, `salvage:${battle.id}`);
        const promotions = [];
        if (kind === "unit")
          while (entity.canPromote) {
            const rank = entity.nextRank.id;
            if (!entity.promote(rank)) break;
            promotions.push(rank);
          }
        experience.push({ kind, id: entity.id, amount, promotions });
      });
    }
    return {
      winnerTeamId: battle.winnerTeamId,
      equipped,
      convertedExperience: experiencePool,
      experience,
    };
  }

  static #createUnitDefinitionMap(definitions) {
    if (!Array.isArray(definitions))
      throw new TypeError("Les définitions d'unités doivent être une liste.");
    const result = new Map();
    definitions.forEach((definition) => {
      if (result.has(definition.id))
        throw new RangeError(
          "Les définitions d'unités doivent avoir des identifiants uniques.",
        );
      result.set(definition.id, definition);
    });
    return result;
  }

  static #createResourceMap(resources) {
    if (
      resources === null ||
      Array.isArray(resources) ||
      typeof resources !== "object"
    )
      throw new TypeError("Les ressources doivent être un objet.");
    return Object.fromEntries(
      Object.entries(resources).map(([name, amount]) => {
        if (!Number.isFinite(amount) || amount < 0)
          throw new RangeError("Une ressource doit être positive ou nulle.");
        return [Game.#requireText(name, "Le nom de ressource"), amount];
      }),
    );
  }

  static #createUnitStacks(stacks) {
    if (!Array.isArray(stacks))
      throw new TypeError("Les unités initiales doivent être une liste.");
    return stacks.map((stack) => {
      if (!Number.isInteger(stack.quantity) || stack.quantity <= 0)
        throw new RangeError("L'effectif initial doit être positif.");
      return {
        typeId: Game.#requireText(stack.typeId, "Le type d'unité"),
        quantity: stack.quantity,
      };
    });
  }
  static #createStats(stats, label) {
    if (stats === null || Array.isArray(stats) || typeof stats !== "object")
      throw new TypeError(`${label} doivent être un objet.`);
    return Object.fromEntries(
      ["attack", "defense", "morale", "mobility", "command", "health"].map(
        (name) => {
          const value = stats[name];
          if (!Number.isFinite(value) || value < 0)
            throw new RangeError(`${label} invalides.`);
          return [name, value];
        },
      ),
    );
  }
  static #createGrowthWeights(weights) {
    const result = Game.#createStats(weights, "Les pondérations");
    if (
      Object.values(result).reduce((sum, value) => sum + value, 0) !== 19 ||
      Object.values(result).some((value) => !Number.isInteger(value))
    )
      throw new RangeError(
        "Les pondérations doivent contenir 19 paliers entiers.",
      );
    return result;
  }
  static #createIds(ids) {
    if (!Array.isArray(ids))
      throw new TypeError("Les aptitudes doivent être une liste.");
    return [...new Set(ids.map((id) => Game.#requireText(id, "Une aptitude")))];
  }

  static #createLocations(locations, unitDefinitions) {
    if (!Array.isArray(locations))
      throw new TypeError("Les lieux doivent être une liste.");
    return locations.map((location) => {
      if (location instanceof Location) return location;
      const units = (location.garrison?.units ?? []).map((unit) => {
        const definition = unitDefinitions.get(unit.typeId);
        if (definition === undefined)
          throw new RangeError(
            `La définition de l'unité ${unit.typeId} n'existe pas.`,
          );
        return {
          ...unit,
          healthPerSoldier:
            unit.healthPerSoldier ?? definition.stats.healthPerSoldier ?? 10,
          combatHealthThreshold:
            unit.combatHealthThreshold ??
            definition.stats.combatHealthThreshold ??
            4,
        };
      });
      return new Location({
        ...location,
        garrison: { ...(location.garrison ?? {}), units },
      });
    });
  }

  static #defaultIdGenerator(prefix) {
    if (typeof globalThis.crypto?.randomUUID === "function")
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  static #requireText(value, label) {
    if (typeof value !== "string" || value.trim() === "")
      throw new TypeError(`${label} doit être un texte non vide.`);
    return value.trim();
  }
}
