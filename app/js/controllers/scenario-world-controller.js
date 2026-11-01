import { AutonomousGroupTrace } from "../core/autonomous-group-trace.js";
import { Location } from "../core/location.js";
import { questPaceProfile } from "../core/quest-pace-profile.js";
import { bearingDegrees } from "../core/setup-placement-service.js";
import { mapLocationEnabled } from "../core/player-map-visibility.js";
// Relie la progression du scénario à ses traces et objectifs géographiques.
export function createScenarioWorldController({
  getSession,
  asGps,
  distance,
  positionFor,
  moveLocation,
  setupPlacementService,
  rebuildLocationEngine,
  persistFieldState,
  resetInteractions,
  showSearchHeatmap,
  onProgress,
  onPlaced,
  onChange,
  onMessage,
  selectLocation,
  logTest,
  deviceAlerts,
  now = () => Date.now(),
}) {
  let locationMessage = "";
  const setMessage = (text) => {
    locationMessage = text;
    onMessage(text);
  };
  function syncEvacuationCampSearch() {
    if (getSession().game?.questSystemEnabled === false) return false;
    const {
      game,
      mode,
      localPlayerId,
      positioning,
      playAreaGrid,
      enabledGpsLocationIds,
    } = getSession();

    if (game?.scenarioState?.currentPhaseId !== "reach-evacuation-camp")
      return false;
    const location = game.getLocation("evacuation-camp");
    const player = game.getPlayer(localPlayerId);
    if (!location || player.knowsLocation(location.id)) return false;
    const position = asGps(positionFor(location.id) ?? location.position);
    const evacuation = game.evacuationStates["royal-camp-evacuation"];
    if (playAreaGrid && evacuation && !evacuation.searchTargetCellId) {
      const signal = playAreaGrid.setQuestSignal(position, { radiusCells: 1 });
      evacuation.searchTargetCellId = signal?.targetCellId ?? null;
      showSearchHeatmap();
      persistFieldState();
    }
    const currentCell = playAreaGrid?.getCellAt(asGps(positioning.position));
    const foundByCell =
      currentCell && currentCell.id === evacuation?.searchTargetCellId;
    const target =
      mode === "simulation"
        ? [position.latitude, position.longitude]
        : position;
    const foundByProximity =
      distance(positioning.position, target) <=
      (mode === "simulation" ? 8 : 12);
    if (!foundByCell && !foundByProximity) return false;
    player.discoverLocation(location.id, 2);
    if (enabledGpsLocationIds !== null) enabledGpsLocationIds.add(location.id);
    playAreaGrid?.clearQuestSignal();
    if (evacuation) evacuation.campDiscoveredAt = now();
    rebuildLocationEngine();
    persistFieldState();
    deviceAlerts.notify("notice");
    logTest("Camp royal localisé : approchez-vous pour entrer dans le camp.");
    return true;
  }

  function syncQuestTrace() {
    if (getSession().game?.questSystemEnabled === false) return false;
    const { game, mode, positioning, validatedPlayArea } = getSession();

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
    const previousTrace = definition.id.endsWith("-2")
      ? game.autonomousGroupTraces.find(
          (trace) => trace.id === definition.id.replace(/-2$/, "-1"),
        )
      : null;
    const preferredDirection =
      previousTrace?.directionDegrees ?? definition.direction;
    const origin = asGps(positioning.position);
    const position = setupPlacementService.findPosition({
      playArea: validatedPlayArea ?? game.setup.playArea,
      origin,
      preferredDistance:
        mode === "simulation"
          ? definition.simulationDistance
          : definition.gpsDistance,
      preferredDirectionDegrees: preferredDirection,
      directionJitterDegrees: previousTrace ? 12 : 28,
      maximumDirectionDeviationDegrees: 80,
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
        directionDegrees: bearingDegrees(origin, position),
        createdAt: now(),
        decayPerMinute: 0.001,
      }),
    );
  }

  function visibleQuestTraces() {
    if (getSession().game?.questSystemEnabled === false) return [];
    const { game, mode } = getSession();

    syncQuestTrace();
    const visibleTraceId =
      {
        "follow-first-trace": "prospectors-trace-1",
        "follow-second-trace": "prospectors-trace-2",
        "convoy-trace-one": "convoy-trace-1",
        "convoy-trace-two": "convoy-trace-2",
      }[game.scenarioState?.currentPhaseId] ?? null;
    return game.autonomousGroupTraces
      .filter(
        (trace) => trace.id === visibleTraceId && trace.getScore(now()) > 0,
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
    if (getSession().game?.questSystemEnabled === false) return false;
    const {
      game,
      mode,
      localPlayerId,
      positioning,
      validatedPlayArea,
      enabledGpsLocationIds,
    } = getSession();

    if (game.scenarioState?.currentPhaseId !== "prospectors-battlefield")
      return;
    const player = game.getPlayer(localPlayerId);
    if (player.knowsLocation("prospector-battlefield")) return;
    const firstTrace = game.autonomousGroupTraces.find(
      (trace) => trace.id === "prospectors-trace-1",
    );
    const secondTrace = game.autonomousGroupTraces.find(
      (trace) => trace.id === "prospectors-trace-2",
    );
    const trailDirection =
      firstTrace && secondTrace
        ? bearingDegrees(firstTrace.position, secondTrace.position)
        : 40;
    const targetGps = setupPlacementService.findPosition({
      playArea: validatedPlayArea ?? game.setup.playArea,
      origin: asGps(positioning.position),
      preferredDistance:
        mode === "simulation"
          ? 13
          : questPaceProfile(game.setup.rules.travelPaceMode).battlefieldMeters,
      preferredDirectionDegrees: trailDirection,
      directionJitterDegrees: 14,
      maximumDirectionDeviationDegrees: 80,
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
    const { game, mode, positioning, validatedPlayArea } = getSession();

    const location = game.getLocation(locationId);
    const playArea = validatedPlayArea ?? game.setup.playArea;
    if (!location || !playArea) return;
    const current = asGps(positionFor(locationId) ?? location.position);
    if (playArea.contains(current)) return;
    const origin = asGps(positioning.position);
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
    const { game, mode, validatedPlayArea } = getSession();

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
          (location) =>
            location.id !== locationId && isLocationEnabled(location),
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

  async function inspectQuestTrace(traceId) {
    const { game, mode, positioning } = getSession();

    const trace = game.autonomousGroupTraces.find(
      (item) => item.id === traceId,
    );
    if (!trace) return;
    const tracePosition =
      mode === "simulation"
        ? [trace.position.latitude, trace.position.longitude]
        : trace.position;
    if (
      distance(positioning.position, tracePosition) >
      (mode === "simulation" ? 8 : 25)
    ) {
      setMessage("Approchez-vous pour examiner cette trace.");
      logTest(locationMessage);
      return;
    }
    const progress = await game.dispatchQuestEvent({
      type: "TraceInspected",
      traceId,
    });
    if (progress == null) return;
    if (progress) {
      await onProgress(progress);
      onChange();
    }
  }

  async function confirmScenarioPlacement(pendingScenarioPlacementSlotId) {
    const {
      game,
      mode,
      localPlayerId,
      positioning,
      validatedPlayArea,
      enabledGpsLocationIds,
    } = getSession();

    if (!pendingScenarioPlacementSlotId) return;
    if (
      validatedPlayArea?.allowsPlacement(asGps(positioning.position)) !== true
    ) {
      setMessage(
        "Impossible de placer ce lieu de quête hors de la zone autorisée.",
      );
      logTest(locationMessage);
      onChange();
      return;
    }
    const result = await game.placeScenarioLocation({
      locationSlotId: pendingScenarioPlacementSlotId,
      position: asGps(positioning.position),
    });
    if (result == null) return;
    if (!result.success)
      return logTest(`Placement impossible : ${result.reason}.`);
    const slotId = pendingScenarioPlacementSlotId;
    onPlaced();
    positioning.locationPositions.set(
      result.locationId,
      mode === "gps"
        ? { ...result.position }
        : [result.position.latitude, result.position.longitude],
    );
    if (enabledGpsLocationIds !== null)
      enabledGpsLocationIds.add(result.locationId);
    await game.discoverLocation({
      playerId: localPlayerId,
      locationId: result.locationId,
      level: 3,
    });
    resetInteractions();
    rebuildLocationEngine();
    if (result.quest) await onProgress(result.quest);
    logTest(`Lieu de scénario placé : ${slotId}.`);
    onChange();
    selectLocation(result.locationId);
    return result;
  }

  function placeQuestLocation() {
    const { game, mode, positioning, validatedPlayArea, field } = getSession();

    const gps = asGps(positioning.position);
    if (!field.canPlaceQuestLocation(gps, validatedPlayArea)) {
      setMessage(
        "Le lieu de quête doit respecter la distance demandée et rester dans la zone de jeu.",
      );
      logTest(locationMessage);
      onChange();
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
    positioning.locationPositions.set(
      location.id,
      mode === "gps" ? gps : [...positioning.position],
    );
    rebuildLocationEngine();
    logTest(
      `Lieu de quête posé à ${Math.round(field.questDistanceMeters)} m du départ.`,
    );
    onChange();
  }

  function prepareQuestInteraction(interactionId) {
    if (getSession().game?.questSystemEnabled === false) return false;
    const { game, mode } = getSession();

    if (interactionId !== "receive-evacuation-order" || mode !== "simulation")
      return;
    const campPosition = positionFor("evacuation-camp");
    if (campPosition)
      game.updateLocationPosition({
        locationId: "evacuation-camp",
        position: asGps(campPosition),
      });
  }

  function isLocationEnabled(location) {
    const { game, localPlayerId } = getSession();
    return mapLocationEnabled(location, game, localPlayerId);
  }

  function syncTeamLocations() {
    const { game, mode, positioning, enabledGpsLocationIds } = getSession();
    let changed = false;
    for (const location of game.locations.filter((entry) =>
      entry.source.startsWith("team-quest"),
    )) {
      enabledGpsLocationIds?.add(location.id);
      if (positioning.locationPositions.has(location.id)) continue;
      positioning.locationPositions.set(
        location.id,
        mode === "gps"
          ? { ...location.position }
          : [location.position.latitude, location.position.longitude],
      );
      changed = true;
    }
    if (changed) {
      resetInteractions();
      rebuildLocationEngine();
    }
    return changed;
  }

  return {
    syncEvacuationCampSearch,
    syncQuestTrace,
    visibleQuestTraces,
    syncQuestBattlefield,
    ensureRevealedLocationInsidePlayArea,
    alignRevealedQuestLocation,
    inspectQuestTrace,
    confirmScenarioPlacement,
    placeQuestLocation,
    prepareQuestInteraction,
    isLocationEnabled,
    syncTeamLocations,
    updatePresentation(locationId) {
      const { game, mode, positioning } = getSession();
      const location = game.getLocation(locationId);
      if (location)
        positioning.locationPositions.set(
          location.id,
          mode === "gps"
            ? { ...location.position }
            : [location.position.latitude, location.position.longitude],
        );
    },
  };
}
