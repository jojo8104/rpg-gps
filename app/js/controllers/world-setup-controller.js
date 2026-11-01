import { LocationSpacingPolicy } from "../core/location-spacing-policy.js";
import { distanceGeneratedLocationIds } from "../map/SetupLocationPolicy.js";
import { AutonomousGroup } from "../core/autonomous-group.js";
import { initiallyPlacedScenarioLocationIds } from "../map/SetupLocationPolicy.js";
import { InteractionEngine } from "../core/interaction-engine.js";
import { formatInteger } from "../ui/number-format.js";
import { PlayAreaGrid } from "../core/play-area-grid.js";
import { playAreaCellSizeMeters } from "../core/play-area-grid-config.js";

/** Prépare le terrain et les placements ; les calculs restent dans les services du moteur. */
export function createWorldSetupController(context) {
  function moveLocation(id, position) {
    const result = context.game.updateLocationPosition({
      locationId: id,
      position: context.asGps(position),
    });
    if (!result.success) {
      context.logTest(
        result.reason === "location_too_close"
          ? `Lieu trop proche de ${result.conflictingLocationId} : écart minimum ${Math.ceil(result.minimumDistance)} ${context.mode === "simulation" ? "unités" : "m"}.`
          : `Déplacement de lieu refusé : ${result.reason}.`,
      );
      return false;
    }
    context.positioning.locationPositions.set(
      id,
      Array.isArray(position) ? [...position] : { ...position },
    );
    if (id === "bandit-camp")
      context.enemyHero?.updatePosition(context.asGps(position));
    context.rebuildLocationEngine();
    context.render();
    context.worldMap.view.focus(position);
    return true;
  }
  function automaticPlacementConfiguration() {
    const deferredLocationIds = distanceGeneratedLocationIds({
      bindings: context.game.scenarioLocationBindings,
      placements: context.game.scenarioRuntime?.placements,
    });
    const scenarioSlotIds = new Set(
      context.game.scenario.locationSlots.map((slot) => slot.id),
    );
    const requiredIds = new Set(
      context.game.scenarioLocationBindings
        .filter((binding) => scenarioSlotIds.has(binding.locationSlotId))
        .map((binding) => binding.locationId)
        .filter((locationId) => !deferredLocationIds.has(locationId)),
    );
    const { placement } = context.setupView.readWorldPreferences();
    const types = [
      ...new Set(
        context.game.scenario.locationSlots
          .filter((slot) => slot.type !== "capital")
          .map((slot) => slot.type),
      ),
    ];
    const locationModes = types.map((type, index) => ({
      type,
      count: context.game.locations.filter(
        (location) => location.type === type && requiredIds.has(location.id),
      ).length,
      placement:
        type !== "quest" &&
        (placement === "manual" || (placement === "mixed" && index < 2))
          ? "manual"
          : "auto",
    }));
    return {
      capitalMode: placement === "auto" ? "auto" : "manual",
      locations: locationModes,
      deferredLocationIds,
      autonomous: [],
    };
  }

  function addSetupAutonomousGroup(type, index, position) {
    const id = `setup-${type}-${index + 1}`;
    if (context.game.getAutonomousGroup(id))
      context.game.removeAutonomousGroup(id);
    const hostile = type === "army" || type === "rogue";
    const unitTypeId = type === "army" ? "chaos-raider" : "militia";
    context.game.addAutonomousGroup(
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
    if (!context.validatedPlayArea) {
      context.ui.gpsAreaStatus.textContent = "Valide d’abord la zone de jeu.";
      return;
    }
    context.enabledGpsLocationIds.clear();
    for (const placement of Object.values(
      context.game.scenarioRuntime?.placements ?? {},
    ))
      if (placement.strategy !== "distance") placement.status = "setup-pending";

    if (context.mode === "simulation") {
      context.game.locations
        .filter((location) => location.source === "simulation")
        .forEach((location) => {
          context.enabledGpsLocationIds.add(location.id);
          context.positioning.locationPositions.set(location.id, [
            location.position.latitude,
            location.position.longitude,
          ]);
        });
    }
    initiallyPlacedScenarioLocationIds({
      bindings: context.game.scenarioLocationBindings,
      placements: context.game.scenarioRuntime?.placements,
    }).forEach((locationId) => context.enabledGpsLocationIds.add(locationId));
    context.manualSetupPlacements.clear();
    context.game.autonomousGroups
      .filter((group) => group.id.startsWith("setup-"))
      .map((group) => group.id)
      .forEach((id) => context.game.removeAutonomousGroup(id));
    context.game.resourceZones = context.game.resourceZones.filter(
      (zone) => !zone.id.startsWith("setup-resource-zone-"),
    );
    const occupied =
      context.mode === "simulation"
        ? context.game.locations
            .filter((location) => location.source === "simulation")
            .map((location) => ({ ...location.position }))
        : [];
    const minimumDistance = 0;
    const occupiedLocations = context.game.locations.filter(
      (location) => location.source === "simulation",
    );
    const spacing = new LocationSpacingPolicy({
      setup: context.game.setup,
      coordinateMode: context.mode,
    });
    const placeAutomatically = (location = null) =>
      context.setupPlacementService.generate({
        playArea: context.validatedPlayArea,
        count: 1,
        occupied,
        minimumDistance,
        acceptPosition: (position) =>
          !location ||
          spacing.check(location, position, occupiedLocations).success,
      })[0];
    const configuration = automaticPlacementConfiguration();
    if (configuration.capitalMode === "auto") {
      const position = context.setupPlacementService.findCentralPosition(
        context.validatedPlayArea,
      );
      occupied.push(position);
      occupiedLocations.push({
        ...context.game.getLocation("royal-capital"),
        position,
      });
      context.enabledGpsLocationIds.add("royal-capital");
      const capitalMoved = context.moveLocation(
        "royal-capital",
        context.mode === "simulation"
          ? [position.latitude, position.longitude]
          : position,
      );
      if (!capitalMoved)
        throw new RangeError(
          "La capitale ne respecte pas l’écart minimal entre lieux.",
        );
      context.capitalPlaced = true;
    } else {
      context.capitalPlaced = false;
      context.manualSetupPlacements.set("capital", {
        kind: "location",
        id: "royal-capital",
        label: "Capitale royale",
      });
    }
    const scenarioSlotIds = new Set(
      context.game.scenario.locationSlots.map((slot) => slot.id),
    );
    const requiredIds = new Set(
      context.game.scenarioLocationBindings
        .filter((binding) => scenarioSlotIds.has(binding.locationSlotId))
        .map((binding) => binding.locationId),
    );
    for (const config of configuration.locations) {
      const templates = context.game.locations
        .filter(
          (location) =>
            location.type === config.type &&
            requiredIds.has(location.id) &&
            !(
              context.mode === "simulation" && location.source === "simulation"
            ) &&
            !configuration.deferredLocationIds.has(location.id),
        )
        .sort(
          (a, b) =>
            Number(requiredIds.has(b.id)) - Number(requiredIds.has(a.id)),
        );
      templates.slice(0, config.count).forEach((location, index) => {
        if (config.placement === "auto") {
          const preferred =
            location.type === "quest"
              ? context.asGps(context.positionFor(location.id))
              : null;
          const position =
            preferred &&
            context.validatedPlayArea.allowsPlacement(preferred) &&
            spacing.check(location, preferred, occupiedLocations).success
              ? preferred
              : placeAutomatically(location);
          occupied.push(position);
          occupiedLocations.push({ ...location, position });
          context.enabledGpsLocationIds.add(location.id);
          const moved = context.moveLocation(
            location.id,
            context.mode === "simulation"
              ? [position.latitude, position.longitude]
              : position,
          );
          if (!moved)
            throw new RangeError(`Placement refusé pour ${location.name}.`);
        } else
          context.manualSetupPlacements.set(`location:${location.id}`, {
            kind: "location",
            id: location.id,
            label: `${location.name}${config.count > 1 ? ` ${index + 1}` : ""}`,
          });
      });
    }
    for (const config of configuration.autonomous)
      for (let index = 0; index < config.count; index += 1) {
        if (config.placement === "auto") {
          const position = placeAutomatically();
          occupied.push(position);
          addSetupAutonomousGroup(config.type, index, position);
        } else
          context.manualSetupPlacements.set(
            `autonomous:${config.type}:${index}`,
            {
              kind: "autonomous",
              type: config.type,
              index,
              label: `${config.type} ${index + 1}`,
            },
          );
      }
    context.interactionEngine = new InteractionEngine({
      locations: context.game.locations,
      enemyResolver: context.resolveLocationEnemy,
    });
    context.rebuildLocationEngine();
    renderGpsLocationButtons();
    updateSetupCompletion();
    context.render();
  }

  function renderGpsLocationButtons() {
    context.ui.gpsLocationButtons.innerHTML = [...context.manualSetupPlacements]
      .map(
        ([key, task]) =>
          `<button type="button" class="secondary-button" data-manual-placement="${key}">Placer ${task.label}</button>`,
      )
      .join("");
    context.ui.gpsLocationButtons
      .querySelectorAll("[data-manual-placement]")
      .forEach(
        (button) =>
          (button.onclick = () => {
            context.mapInteractions.mode = `setup-manual:${button.dataset.manualPlacement}`;
            context.ui.gpsAreaStatus.textContent = `Touche la carte pour placer ${context.manualSetupPlacements.get(button.dataset.manualPlacement).label}.`;
          }),
      );
  }

  function updateSetupCompletion() {
    context.ui.finishGpsSetup.disabled =
      !context.capitalPlaced || context.manualSetupPlacements.size > 0;
    if (!context.ui.finishGpsSetup.disabled)
      context.ui.gpsAreaStatus.textContent =
        "Monde prêt : tous les éléments demandés sont placés.";
  }

  function validatePlayArea() {
    context.validatedPlayArea = context.field.createPlayArea();
    context.game.setup.playArea = context.validatedPlayArea;
    initializePlayAreaGrid();
    context.rebuildLocationEngine();
    context.mapInteractions.mode = null;
    context.persistFieldState();
    context.worldMap.view.setPlayArea(context.validatedPlayArea.polygon);
    context.applyPosition(context.positioning.position);
    const cellSize = formatInteger(context.playAreaGrid.cellSizeMeters);
    const message = `Zone validée · ${formatInteger(context.validatedPlayArea.getAreaSquareMeters() / 10_000)} ha · ${context.playAreaGrid.cells.length} cellules de ${cellSize} m × ${cellSize} m.`;
    if (context.gpsSetupActive) {
      context.ui.gpsAreaStatus.textContent = `${message} Préparation du monde…`;
      applyWorldSetup();
    }
    context.logTest(message);
  }

  function initializePlayAreaGrid() {
    context.playAreaGrid = new PlayAreaGrid({
      playArea: context.validatedPlayArea,
      cellSizeMeters: playAreaCellSizeMeters(
        context.mode,
        context.validatedPlayArea,
      ),
    });
    context.playAreaPresence.setPlayArea(
      context.validatedPlayArea,
      context.asGps(context.positioning.position),
    );
    context.rebuildLocationEngine();
    context.mapInteractions.mode = null;
    context.positioning.resetVisited();
    context.$("#toggle-heatmap").disabled = false;
  }
  return {
    moveLocation,
    automaticPlacementConfiguration,
    addSetupAutonomousGroup,
    applyWorldSetup,
    renderGpsLocationButtons,
    updateSetupCompletion,
    validatePlayArea,
    initializePlayAreaGrid,
  };
}
