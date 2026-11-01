import { QUEST_SYSTEM_ENABLED } from "../core/quest-system-policy.js";
import { GameLoadingView } from "../ui/game-loading-view.js";
import { paintLoadingStep } from "../ui/game-loading-view.js";
import { createVillageAdventure } from "../core/village-adventure.js";
import { Game } from "../core/game.js";
import { prepareScenarioLocationsForPlayArea } from "../core/scenario-location-preparation.js";
import { createSeededIdGenerator } from "../core/multiplayer-launch.js";
import { QUEST_SEQUENCE } from "../core/scenario-quest-catalog.js";
import { LocationRangePolicy } from "../core/location-range-policy.js";
import { InteractionEngine } from "../core/interaction-engine.js";
import { PlayArea } from "../core/play-area.js";

/** Coordonne la préparation d'une partie avec les services et vues du navigateur. */
export function createGameStartController(context) {
  let startInProgress = false;
  const gameLoadingView = new GameLoadingView(context.$("#game-loading"));
  async function start(multiplayerLaunch = null) {
    if (startInProgress) return;
    startInProgress = true;
    let buildingWorld = false;
    gameLoadingView.show();
    try {
      gameLoadingView.update("Création du monde, des lieux et des héros…");
      await paintLoadingStep();
      const launch =
        multiplayerLaunch ??
        (await context.multiplayer.prepareSolo({
          setup: context.setupView.readSetup(),
          heroChoice: context.setupView.readHeroChoice(),
          positionMode: context.setupView.readPositionMode(),
        }));
      if (
        launch.adventureId &&
        !["chaos", "villages"].includes(launch.adventureId)
      ) {
        const official = await context.multiplayer.client.requestGameState();
        launch.officialGame =
          official?.game?.state ??
          official?.state ??
          context.multiplayer.pendingGame;
        if (!launch.officialGame)
          throw new Error("Le monde officiel du scénario n’a pas été reçu.");
      }
      buildingWorld = true;
      buildWorld(launch);
      gameLoadingView.update("Le monde est prêt", 100);
      await paintLoadingStep();
      gameLoadingView.close();
    } catch (error) {
      gameLoadingView.error(
        error,
        async () => {
          if (buildingWorld) location.reload();
          else void (await start(multiplayerLaunch));
        },
        { reload: buildingWorld },
      );
    } finally {
      startInProgress = false;
    }
  }

  function buildWorld(multiplayerLaunch = null) {
    context.gps.reset();
    context.worldMap.reset();
    context.positioning.reset();
    context.mapInteractions.reset();
    context.locations.reset();
    context.locationActions.reset();
    context.logistics.reset();
    context.relay.reset();
    context.dialogues.reset();
    context.battles.reset();
    context.playerInteractions.reset();
    context.playerInterface.reset();
    context.heroAbilities.reset();
    context.quests.reset();
    if (
      !context.data?.scenario ||
      !context.data?.heroClasses ||
      !context.data?.unitDefinitions ||
      !context.data?.locations
    ) {
      throw new Error(
        "Les données du scénario ne sont pas encore chargées. Réessayez dans un instant.",
      );
    }
    const networkLaunch = multiplayerLaunch?.setup ? multiplayerLaunch : null;
    context.resetSession?.();
    context.multiplayer.begin(networkLaunch);
    context.$("#save-and-end-game").hidden =
      !context.multiplayer.active || !context.multiplayer.isHost;
    context.$("#destroy-game").hidden =
      !context.multiplayer.active || !context.multiplayer.isHost;
    let setup;
    try {
      setup = networkLaunch?.setup ?? context.setupView.readSetup();
    } catch (error) {
      throw error;
    }
    context.mode =
      networkLaunch?.positionMode ?? context.setupView.readPositionMode();
    context.localPlayerId = networkLaunch?.localPlayerId ?? "local";
    context.activeAdventureId = networkLaunch?.adventureId ?? "chaos";
    const bindings = [
      { locationSlotId: "refuge", locationId: "fort-nord" },
      { locationSlotId: "capital", locationId: "royal-capital" },
      { locationSlotId: "royal-camp", locationId: "village-vert" },
      {
        locationSlotId: "prospectors-battlefield",
        locationId: "prospector-battlefield",
      },
      ...[1, 2].map((index) => ({
        locationSlotId: `prospectors-trace-${index}`,
        locationId: `prospectors-trace-${index}`,
      })),
      { locationSlotId: "gold-mine", locationId: "gold-mine" },
      { locationSlotId: "bandit-camp", locationId: "bandit-camp" },
      { locationSlotId: "evacuation-camp", locationId: "evacuation-camp" },
      { locationSlotId: "supply-fort", locationId: "supply-fort" },
      { locationSlotId: "opposite-fort", locationId: "opposite-fort" },
      { locationSlotId: "royal-gold-mine", locationId: "royal-gold-mine" },
      ...["gold", "iron", "wood", "stone"].flatMap((resource) =>
        ["", "-village"].map((suffix) => ({
          locationSlotId: `capital-resource-${resource}${suffix}`,
          locationId: `capital-resource-${resource}${suffix}`,
        })),
      ),
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
    const adventure =
      context.activeAdventureId === "villages"
        ? createVillageAdventure(
            context.data.scenario,
            context.data.locations,
            bindings,
          )
        : {
            scenario: context.data.scenario,
            locations: context.data.locations,
          };
    context.game = networkLaunch?.officialGame
      ? Game.fromJSON(networkLaunch.officialGame)
      : new Game({
          questSystemEnabled: QUEST_SYSTEM_ENABLED,
          setup,
          scenario: adventure.scenario,
          heroClasses: context.data.heroClasses,
          heroAptitudes: context.data.heroAptitudes,
          unitDefinitions: context.data.unitDefinitions,
          locations: [
            ...prepareScenarioLocationsForPlayArea({
              scenario: adventure.scenario,
              setup,
              bindings,
              locations: adventure.locations,
            }),
          ],
          scenarioLocationBindings: bindings,
          coordinateMode: context.mode,
          scenarioStartsActive: false,
          ...(networkLaunch
            ? { idGenerator: createSeededIdGenerator(networkLaunch.seed) }
            : {}),
        });
    if (
      !networkLaunch?.officialGame &&
      context.activeAdventureId !== "villages"
    )
      context.game.configureQuestSequence(QUEST_SEQUENCE);
    context.rangePolicy = new LocationRangePolicy(
      context.game.setup.locationSetup.rangePolicy,
    );
    if (networkLaunch?.officialGame) {
      context.hero = context.game.heroes.find(
        (hero) => hero.playerId === context.localPlayerId,
      );
      context.enemyHero = context.game.heroes.find(
        (hero) => hero.playerId === "bandits",
      );
    } else if (networkLaunch) {
      networkLaunch.heroChoices.forEach(({ playerId, choice }) => {
        const selectedHero = context.game.chooseHero(playerId, choice);
        if (playerId === context.localPlayerId) context.hero = selectedHero;
      });
    } else
      context.hero = context.game.chooseHero(
        context.localPlayerId,
        context.setupView.readHeroChoice(),
      );
    if (!context.hero)
      throw new Error("Le héros de ce joueur n’a pas pu être créé.");
    if (!networkLaunch?.officialGame) {
      context.enemyHero = context.game.chooseHero("bandits", {
        name: "Rask le brigand",
        classId: "warrior",
      });
      context.game.getLocation("bandit-camp")?.addHero(context.enemyHero.id);
    }
    const initialPlayers = networkLaunch
      ? networkLaunch.heroChoices.map(({ playerId }) =>
          context.game.getPlayer(playerId),
        )
      : [context.game.getPlayer(context.localPlayerId)];
    if (!networkLaunch?.officialGame)
      initialPlayers.forEach((player) => {
        player.discoverLocation("fort-nord", 2);
        player.discoverLocation("royal-capital", 3);
        player.discoverLocation("bandit-camp", 3);
        player.discoverLocation("camp-local", 3);
        player.discoverLocation("enemy-fort", 3);
        player.discoverLocation("lumber-camp-test", 3);
      });
    if (context.mode === "simulation")
      initialPlayers.forEach((player) =>
        context.game.locations
          .filter((location) => location.source === "simulation")
          .forEach((location) => player.discoverLocation(location.id, 3)),
      );
    context.positioning.position =
      context.mode === "gps"
        ? { latitude: 48.8566, longitude: 2.3522 }
        : [...context.simulationStartPosition];
    context.enabledGpsLocationIds = new Set();
    context.game.locations.forEach((location) =>
      context.positioning.locationPositions.set(
        location.id,
        context.mode === "gps"
          ? { ...location.position }
          : networkLaunch?.officialGame || location.source === "simulation"
            ? [location.position.latitude, location.position.longitude]
            : [
                ...(context.simulationPositions[location.id] ??
                  context.simulationStartPosition),
              ],
      ),
    );
    context.rebuildLocationEngine();
    context.interactionEngine = new InteractionEngine({
      locations: context.game.locations,
      enemyResolver: context.resolveLocationEnemy,
    });
    if (context.multiplayer.pendingWorld)
      context.applyReceivedMultiplayerWorld(context.multiplayer.pendingWorld, {
        renderNow: false,
      });
    context.ui.setup.hidden = true;
    context.ui.lobby.hidden = true;
    context.ui.game.hidden = false;
    context.worldMap.initialize({
      mode: context.mode,
      initialPosition: context.positioning.position,
      onHeroMove: context.applyPosition,
      onLocationSelect: context.selectLocation,
      onTraceSelect: context.scenarioWorld.inspectQuestTrace,
      onAutonomousGroupSelect: context.selectAutonomousGroup,
      onPlayerSelect: context.selectPlayerInteraction,
      onMapClick: context.handleMapClick,
    });
    if (context.multiplayer.pendingGame)
      context.applyAuthoritativeGameState(context.multiplayer.pendingGame, {
        renderNow: false,
      });
    context.worldMap.view.setAlliedHeroes(context.playerMapIntel());
    context.capitalPlaced = false;
    context.gpsSetupActive = true;
    context.ui.game.classList.add("is-gps-setup");
    context.ui.gpsSetup.classList.toggle(
      "is-simulation",
      context.mode === "simulation",
    );
    context.ui.gpsSetup.hidden = false;
    context.renderGpsLocationButtons();
    if (
      networkLaunch &&
      (!networkLaunch.solo ||
        networkLaunch.resumesSavedGame ||
        context.multiplayer.pendingGame) &&
      context.mode === "gps"
    ) {
      context.validatedPlayArea = context.game.setup.playArea;
      context.field.loadTerrain(context.validatedPlayArea.toJSON());
      context.initializePlayAreaGrid();
      context.worldMap.view.setPlayArea(context.validatedPlayArea.polygon);
      context.startGps();
      if (
        context.multiplayer.resuming ||
        networkLaunch.prepared ||
        (networkLaunch.solo && context.multiplayer.pendingGame)
      ) {
        context.enabledGpsLocationIds = null;
        context.manualSetupPlacements.clear();
        context.capitalPlaced = true;
        context.ui.gpsAreaStatus.textContent = networkLaunch.prepared
          ? "Chargement de la partie préparée par l’organisateur…"
          : "Chargement de la partie sauvegardée…";
        if (context.multiplayer.authoritative) finishGameStart();
        else
          context.multiplayer.client
            .requestGameState()
            .catch((error) =>
              context.logTest(`Reprise impossible : ${error.message}`),
            );
        return;
      }
      context.ui.gpsAreaStatus.textContent =
        "Zone GPS reçue de l’organisateur. Préparation du monde…";
      context.applyWorldSetup();
      context.render();
      context.worldMap.invalidateSize();
      finishGameStart();
      return;
    }
    if (networkLaunch?.officialGame && context.mode === "simulation") {
      context.validatedPlayArea = context.game.setup.playArea;
      context.worldMap.view.setPlayArea(context.validatedPlayArea.polygon);
      context.enabledGpsLocationIds = null;
      context.manualSetupPlacements.clear();
      context.capitalPlaced = true;
      context.worldMap.invalidateSize();
      finishGameStart();
      return;
    }
    if (context.mode === "simulation") {
      context.validatedPlayArea = new PlayArea({
        id: "simulation-area",
        name: "Zone maison agrandie",
        polygon: [
          { latitude: -89, longitude: -179 },
          { latitude: -89, longitude: 179 },
          { latitude: 89, longitude: 179 },
          { latitude: 89, longitude: -179 },
        ],
      });
      context.game.setup.playArea = context.validatedPlayArea;
      context.worldMap.view.setPlayArea(context.validatedPlayArea.polygon);
      context.ui.gpsAreaStatus.textContent =
        "Zone maison agrandie prête. Le monde utilise vos choix précédents.";
      context.applyWorldSetup();
      context.render();
      context.worldMap.invalidateSize();
      finishGameStart();
      return;
    }
    context.field.clearPlayArea();
    context.mapInteractions.mode = "draw-area";
    context.startGps();
    context.render();
    context.worldMap.invalidateSize();
  }

  function finishGameStart() {
    if (!context.capitalPlaced || context.manualSetupPlacements.size > 0)
      return;
    const start =
      context.game.getLocationForScenarioSlot("capital") ??
      context.game.locations.find(
        (location) => location.id === "royal-capital",
      );
    const capitalPosition = start
      ? context.positionFor(start.id)
      : context.mode === "simulation"
        ? [context.hero.position.latitude, context.hero.position.longitude]
        : context.hero.position;
    context.positioning.position = Array.isArray(capitalPosition)
      ? [...capitalPosition]
      : { ...capitalPosition };
    context.hero.updatePosition(context.asGps(context.positioning.position));
    if (
      context.multiplayer.active &&
      context.multiplayer.client &&
      context.game.status === "started" &&
      !context.gpsSetupActive
    )
      context.multiplayer.client
        .sendPosition({
          ...context.asGps(context.positioning.position),
          accuracy: context.positioning.accuracy,
          heading: context.gps.heading,
        })
        .catch(() => {});
    context.worldMap.view.focus(context.positioning.position);
    if (context.game.status === "preparing") {
      context.game.start();
      context.game.locations
        .filter((location) => location.roles.includes("capital-economy"))
        .forEach((location) => {
          context.positioning.locationPositions.set(
            location.id,
            context.mode === "simulation"
              ? [location.position.latitude, location.position.longitude]
              : { ...location.position },
          );
          context.enabledGpsLocationIds?.add(location.id);
        });
      context.rebuildLocationEngine();
    }
    context.gpsSetupActive = false;
    context.ui.game.classList.remove("is-gps-setup");
    context.ui.gpsSetup.hidden = true;
    context.mapInteractions.mode = null;
    context.deviceAlerts
      .enable()
      .then((enabled) =>
        context.logTest(
          enabled ? "Alertes sonores activées." : "Son d'alerte indisponible.",
        ),
      );
    context.screenAwake.start();

    if (context.mode === "gps") {
      void context.gps.startCompass();
      context.applyPosition(context.positioning.position);
    } else {
      context.ui.gpsStatus.textContent =
        "Simulation : clique sur la carte ou fais glisser le pion.";
      context.applyPosition(context.positioning.position);
    }
    context.worldMap.invalidateSize();
    context.render();
    context.quests.startAdventure();
  }
  return { start, buildWorld, finishGameStart };
}
