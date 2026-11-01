import { normalizePosition } from "../position-adapter.js";
import { LocationEngine } from "../core/location-engine.js";
import { formatInteger } from "../ui/number-format.js";

// Coordonne les services spatiaux et possède les positions de présentation.
// Les effets du scénario sont transmis au contrôleur de scénario par callback.
export function createPositionController({
  getSession,
  heroTraceService,
  heroConcealmentService,
  mappedLocations,
  isLocationEnabled,
  positionFor,
  radiusFor,
  distance,
  asGps,
  onTravelReward,
  onWatchEvents,
  onAmbushCancelled,
  onFollow,
  onChange,
  onAreaEvent,
  onFieldQuest,
  onScenarioPlacements,
  onPersist,
  onQuestSearch,
  onLocationEvent,
  onMessage,
  onLog,
  onDisplayPosition = () => {},
  now = () => Date.now(),
}) {
  let currentPosition = null,
    accuracy = null,
    lastVisitedCellId = null,
    locationEngine = null;
  const locationPositions = new Map();
  let generation = 0;
  let displayPosition = null;
  function rebuildLocationEngine() {
    const { game, mode } = getSession();
    const locations = game.locations
      .filter(isLocationEnabled)
      .map((location) => ({
        id: location.id,
        position: positionFor(location.id),
        interactionRadius: radiusFor(location),
      }));
    if (locationEngine) {
      locationEngine.locations = locations;
      return;
    }
    locationEngine = new LocationEngine({
      locations,
      cooldownMs: 2_000,
      exitMarginMeters: mode === "gps" ? 10 : 1,
      distanceFn: distance,
      validatePositionFn: () => {},
    });
  }

  async function applyPosition(position) {
    const {
      game,
      hero,
      playerId: localPlayerId,
      mode,
      setupActive: gpsSetupActive,
      authoritative: authoritativeServerReady,
      client: multiplayerClient,
      heading: heroHeading,
      field,
      playAreaPresence,
      grid: playAreaGrid,
      battle,
    } = getSession();
    if (!game || !hero) return;
    const revision = ++generation;
    const isCurrent = () =>
      revision === generation && getSession().hero?.id === hero.id;

    const measuredPosition = normalizePosition(position, mode);
    const localGpsDisplay =
      mode === "gps" && authoritativeServerReady && !gpsSetupActive;
    if (localGpsDisplay) {
      if (!currentPosition && hero.position)
        currentPosition = normalizePosition(hero.position, mode);
      displayPosition = measuredPosition;
      onDisplayPosition(
        displayPosition,
        position.accuracy ?? null,
        heroHeading,
      );
    } else currentPosition = measuredPosition;
    accuracy = mode === "gps" ? (position.accuracy ?? null) : null;
    if (!authoritativeServerReady) hero.updatePosition(asGps(currentPosition));
    if (
      game.status === "started" &&
      !gpsSetupActive &&
      !authoritativeServerReady
    ) {
      const at = now();
      const bag = game.inventoryService.getHeroBagState(hero);
      game.autonomousGroupTraces.push(
        ...heroTraceService.recordMovement({
          hero,
          position: asGps(currentPosition),
          at,
          coordinateMode: mode,
          occupiedCargoSlots: bag.usedSlots,
          concealmentMultiplier:
            game.heroClassFeatureService.signatureMultiplier(hero),
        }),
      );
      game.autonomousGroupTraces = game.autonomousGroupTraces.filter(
        (trace) => trace.getScore(at) > 0,
      );
    }
    if (game.status === "started" && !authoritativeServerReady)
      onWatchEvents(game.scanWatchBeacons());
    const motion = heroConcealmentService.update({
      position: asGps(measuredPosition),
      accuracy: accuracy ?? 0,
      at: now(),
    });
    if (!authoritativeServerReady)
      hero.classFeatureState.gpsConcealmentMultiplier =
        heroConcealmentService.signatureMultiplier;
    if (multiplayerClient && game.status === "started" && !gpsSetupActive) {
      try {
        const confirmation = await multiplayerClient.sendPosition({
          ...asGps(measuredPosition),
          accuracy: accuracy,
          heading: heroHeading,
          concealmentMultiplier: heroConcealmentService.signatureMultiplier,
        });
        if (authoritativeServerReady && confirmation === null) return;
        const officialPosition = confirmation?.positions?.positions?.find(
          (entry) => entry.playerId === localPlayerId,
        )?.position;
        if (authoritativeServerReady && officialPosition && isCurrent())
          currentPosition = normalizePosition(officialPosition, mode);
      } catch (error) {
        if (isCurrent()) onLog(`Position non confirmée : ${error.message}`);
        return;
      }
      if (!isCurrent()) return;
    }
    if (localGpsDisplay && !currentPosition) return;
    if (motion.concealmentCancelled) {
      onAmbushCancelled();
      onLog("Embuscade annulée : déplacement confirmé.");
    }
    onFollow(displayPosition ?? currentPosition);
    // La carte n'attend pas les interactions et les commandes de quête.
    if (authoritativeServerReady) onChange({ background: true });
    if (gpsSetupActive) {
      onChange();
      return;
    }
    const playAreaEvent = playAreaPresence.update(asGps(currentPosition));
    if (playAreaEvent?.type === "PlayAreaExited") {
      lastVisitedCellId = null;
      onAreaEvent("danger");
      onLog("⚠ Sortie de la zone de jeu.");
    }
    if (playAreaEvent?.type === "PlayAreaEntered") {
      onAreaEvent("notice");
      onLog("Retour dans la zone de jeu.");
    }
    const quest = field.updatePosition(asGps(currentPosition));
    if (quest) onFieldQuest(quest);
    const scenarioPlacements =
      game.questSystemEnabled === false
        ? []
        : await game.updateScenarioPosition({
            position: asGps(currentPosition),
            accuracy: accuracy,
          });
    if (!isCurrent() || scenarioPlacements == null) return;
    await onScenarioPlacements(scenarioPlacements);
    if (!isCurrent()) return;
    if (playAreaGrid) {
      const configuredVisionRadius =
        game.heroClassFeatureService.visionRadius(hero);
      const explorationRadius =
        mode === "simulation"
          ? configuredVisionRadius * (32 / 150)
          : configuredVisionRadius;
      const revealedCellIds = playAreaGrid.revealWithinRadius(
        asGps(currentPosition),
        { radius: explorationRadius, coordinateMode: mode },
      );
      const cell = playAreaGrid.getCellAt(asGps(currentPosition));
      if (!cell) lastVisitedCellId = null;
      else if (cell.id !== lastVisitedCellId) {
        const passage = playAreaGrid.recordVisit(asGps(currentPosition));
        lastVisitedCellId = cell.id;
        onPersist();
        onLog(`Passage ${passage.visits} dans ${cell.id}.`);
      }
      if (revealedCellIds.length > 0) onPersist();
    }
    onQuestSearch();
    await updatePresence();
    if (!isCurrent()) return;
    const events = locationEngine.update({
      actorId: hero.id,
      position: currentPosition,
    });
    for (const event of events) {
      if (!isCurrent()) return;
      await onLocationEvent(event, { isCurrent });
    }
    if (!isCurrent()) return;
    if (battle?.status === "active" && battle.engagementContext)
      await game.updateBattleHeroPosition({
        battleId: battle.id,
        heroId: hero.id,
        position: asGps(currentPosition),
      });
    onChange({ background: true });
  }
  async function updatePresence() {
    const { game, hero, playerId: localPlayerId, authoritative } = getSession();
    if (!game) return;
    if (authoritative) return;
    const player = game.getPlayer(localPlayerId);
    await Promise.all(
      mappedLocations({ knownOnly: false }).map(async (item) => {
        const location = game.getLocation(item.id);
        if (item.distance <= item.detectionRadius)
          player.discoverLocation(item.id, item.nearby ? 3 : 1);
        if (item.nearby) {
          location.addHero(hero.id);
          const revival = await game.reviveHeroAtBase({
            heroId: hero.id,
            locationId: location.id,
          });
          if (revival == null) return;
          if (revival.success) {
            onMessage(
              `Le héros reprend forme avec ${formatInteger(revival.health)}/${formatInteger(revival.maximumHealth)} PV.`,
            );
            onLog(
              `Retour à la base : héros actif avec ${formatInteger(revival.health)} PV.`,
            );
          }
        } else location.removeHero(hero.id);
      }),
    );
  }
  return {
    locationPositions,
    apply: applyPosition,
    syncOfficialPosition() {
      const { hero, mode, setupActive } = getSession();
      if (setupActive || !hero?.position) return false;
      currentPosition = normalizePosition(hero.position, mode);
      if (mode === "gps" && Number.isFinite(hero.position.accuracy))
        if (!displayPosition) accuracy = hero.position.accuracy;
      onFollow(displayPosition ?? currentPosition);
      return true;
    },
    rebuild: rebuildLocationEngine,
    get position() {
      return currentPosition;
    },
    get displayPosition() {
      return displayPosition ?? currentPosition;
    },
    set position(value) {
      currentPosition = normalizePosition(value, getSession().mode);
    },
    get accuracy() {
      return accuracy;
    },
    resetVisited() {
      lastVisitedCellId = null;
    },
    reset() {
      generation++;
      currentPosition = accuracy = lastVisitedCellId = locationEngine = null;
      displayPosition = null;
      locationPositions.clear();
    },
  };
}
