import {
  loadTerrainProfile,
  saveTerrainProfile,
} from "../terrain-profile-storage.js";
import { InteractionEngine } from "../core/interaction-engine.js";

/** Relie les outils de terrain et les formulaires de triche aux services du moteur. */
export function createGameToolsController(context) {
  function openCheats() {
    const dialog = context.$("#cheat-dialog");
    const form = dialog.querySelector("form");
    form.elements["hero-level"].value = context.hero.level;
    form.elements["hero-health"].value = context.hero.health;
    ["attack", "defense", "morale", "mobility", "command", "health"].forEach(
      (stat) => {
        form.elements[`stat-${stat}`].value =
          context.hero.temporaryModifiers[stat];
      },
    );
    ["gold", "wood", "stone", "iron"].forEach((resource) => {
      form.elements[`resource-${resource}`].value =
        context.hero.getResourceAmount(resource);
    });
    context.$("#cheat-status").textContent = "";
    dialog.showModal();
  }

  function applyHeroCheats() {
    const form = context.$("#cheat-dialog form");
    try {
      context.cheatService.applyHeroChanges(context.hero, {
        level: form.elements["hero-level"].value,
        health: form.elements["hero-health"].value,
        stats: Object.fromEntries(
          ["attack", "defense", "morale", "mobility", "command", "health"].map(
            (stat) => [stat, form.elements[`stat-${stat}`].value],
          ),
        ),
        resources: Object.fromEntries(
          ["gold", "wood", "stone", "iron"].map((resource) => [
            resource,
            form.elements[`resource-${resource}`].value,
          ]),
        ),
      });
      context.$("#cheat-status").textContent =
        "Modifications appliquées au héros.";
      context.logTest("Cheat : statistiques du héros modifiées.");
      context.render();
    } catch (error) {
      context.$("#cheat-status").textContent = error.message;
    }
  }

  async function createCheatLocation() {
    const form = context.$("#cheat-dialog form");
    const value = (name) => form.elements[name].value;
    try {
      if (context.game.getLocation(value("location-id")))
        throw new Error("Cet identifiant de localisation existe déjà.");
      const location = context.cheatService.createLocation(
        {
          id: value("location-id"),
          name: value("location-name"),
          type: value("location-type"),
          ownerId: value("location-owner"),
          level: value("location-level"),
          population: value("location-population"),
          defenseSlots: value("location-defense-slots"),
          productionResource: value("location-production-resource"),
          productionAmount: value("location-production-amount"),
        },
        context.asGps(context.positioning.position),
      );
      context.game.locations.push(location);
      context.positioning.locationPositions.set(
        location.id,
        Array.isArray(context.positioning.position)
          ? [...context.positioning.position]
          : { ...context.positioning.position },
      );
      await context.game.discoverLocation({
        playerId: context.localPlayerId,
        locationId: location.id,
        level: 3,
      });
      context.interactionEngine = new InteractionEngine({
        locations: context.game.locations,
        enemyResolver: context.resolveLocationEnemy,
      });
      context.rebuildLocationEngine();
      context.render();
      context.$("#cheat-status").textContent =
        `${location.name} créé à votre position.`;
      context.logTest(`Cheat : ${location.name} créé.`);
    } catch (error) {
      context.$("#cheat-status").textContent = error.message;
    }
  }
  function closeGameMenu() {
    context.$("#landscape-tools").classList.remove("is-open");
    context.$("#toggle-game-menu").setAttribute("aria-expanded", "false");
  }

  function initialize() {
    context.$("#toggle-field-tools").onclick = () => {
      context.ui.tools.hidden = false;
    };
    context.$("#close-field-tools").onclick = () => {
      context.ui.tools.hidden = true;
    };
    context.$("#toggle-game-menu").onclick = () => {
      const open = context.$("#landscape-tools").classList.toggle("is-open");
      context
        .$("#toggle-game-menu")
        .setAttribute("aria-expanded", String(open));
    };
    context.$("#close-game-menu").onclick = closeGameMenu;
    context.$("#save-and-end-game").onclick = async () => {
      if (!context.multiplayer.client || !context.multiplayer.isHost) return;
      const name = window.prompt("Nom de cette sauvegarde :", "Notre aventure");
      if (!name) return;
      if (
        !window.confirm(
          `Sauvegarder « ${name.trim()} » et terminer la session pour tous les joueurs ?`,
        )
      )
        return;
      try {
        await context.multiplayer.saveAndEnd(name);
        closeGameMenu();
      } catch (error) {
        window.alert(error.message);
      }
    };
    context.$("#open-field-tools").onclick = () => {
      closeGameMenu();
      context.ui.tools.hidden = false;
    };
    context.$("#destroy-game").onclick = async () => {
      if (!context.multiplayer.client || !context.multiplayer.isHost) return;
      if (
        !window.confirm(
          "Quitter sans sauvegarder et détruire cette partie pour tous les joueurs ? Cette action est irréversible. Les anciennes sauvegardes seront conservées.",
        )
      )
        return;
      const button = context.$("#destroy-game");
      if (button.disabled) return;
      button.disabled = true;
      try {
        await context.multiplayer.destroyGame();
        closeGameMenu();
      } catch (error) {
        window.alert(error.message);
      } finally {
        button.disabled = false;
      }
    };
    context.$("#open-cheat-tools").onclick = () => {
      closeGameMenu();
      openCheats();
    };
    context.$("#draw-area").onclick = () => {
      context.mapInteractions.mode =
        context.mapInteractions.mode === "draw-area" ? null : "draw-area";
      context.logTest(
        context.mapInteractions.mode
          ? "Tracé actif : touchez la carte."
          : "Tracé suspendu.",
      );
    };
    context.$("#clear-area").onclick = () => {
      context.field.clearPlayArea();
      context.validatedPlayArea = null;
      context.playAreaGrid = null;
      context.playAreaPresence.setPlayArea(null);
      context.positioning.resetVisited();
      context.persistFieldState();
      context.$("#toggle-heatmap").disabled = true;
      context.worldMap.view.setPlayArea([]);
      context.render();
      context.logTest("Zone et grille effacées.");
    };
    context.$("#validate-area").onclick = () => {
      try {
        context.validatePlayArea();
      } catch (error) {
        context.logTest(error.message);
      }
    };
    context.$("#toggle-heatmap").onclick = () => {
      context.worldMap.layers.heatmapVisible =
        !context.worldMap.layers.heatmapVisible;
      context.heatmapControl.querySelector("input").checked =
        context.worldMap.layers.heatmapVisible;
      context.$("#toggle-heatmap").textContent = context.worldMap.layers
        .heatmapVisible
        ? "Masquer la heatmap"
        : "Afficher la heatmap";
      context.render();
    };
    context.$("#place-location").onclick = () => {
      context.mapInteractions.mode = "place-location";
      context.logTest("Touchez la carte pour poser le camp.");
    };
    context.$("#gps-draw-area").onclick = () => {
      context.mapInteractions.mode = "draw-area";
      context.ui.gpsAreaStatus.textContent =
        "Tracé actif : touche la carte pour poser les sommets.";
    };
    context.$("#gps-draw-exclusion").onclick = () => {
      if (context.field.playAreaPoints.length < 3) {
        context.ui.gpsAreaStatus.textContent =
          "Trace d’abord la limite extérieure avec au moins trois sommets.";
        return;
      }
      context.field.exclusionDraftPoints = [];
      context.mapInteractions.mode = "draw-exclusion";
      context.$("#gps-finish-exclusion").disabled = true;
      context.ui.gpsAreaStatus.textContent =
        "Exclusion active : touche la carte pour dessiner son contour.";
      context.render();
    };
    context.$("#gps-finish-exclusion").onclick = () => {
      try {
        context.field.completeExclusion();
        context.mapInteractions.mode = null;
        context.$("#gps-finish-exclusion").disabled = true;
        context.ui.gpsAreaStatus.textContent = `${context.field.excludedPolygons.length} zone(s) d’exclusion définie(s).`;
        if (context.validatedPlayArea) context.validatePlayArea();
        else context.render();
      } catch (error) {
        context.ui.gpsAreaStatus.textContent = error.message;
      }
    };
    context.$("#gps-clear-exclusions").onclick = () => {
      context.field.clearExclusions();
      context.mapInteractions.mode = null;
      context.$("#gps-finish-exclusion").disabled = true;
      if (context.validatedPlayArea) context.validatePlayArea();
      else context.render();
      context.ui.gpsAreaStatus.textContent =
        "Toutes les exclusions ont été effacées.";
    };
    context.$("#save-terrain-profile").onclick = () => {
      try {
        if (!context.validatedPlayArea) context.validatePlayArea();
        saveTerrainProfile(context.validatedPlayArea);
        context.ui.gpsAreaStatus.textContent = `Carte sauvegardée avec ${context.validatedPlayArea.polygon.length} points GPS et ${context.validatedPlayArea.excludedPolygons.length} exclusion(s).`;
      } catch (error) {
        context.ui.gpsAreaStatus.textContent = error.message;
      }
    };
    context.$("#load-terrain-profile").onclick = () => {
      try {
        const profile = loadTerrainProfile();
        if (!profile)
          throw new Error("Aucune carte sauvegardée sur cet appareil.");
        context.field.loadTerrain(profile.playArea);
        context.validatePlayArea();
        context.worldMap.view.focus(context.field.playAreaPoints[0]);
        context.ui.gpsAreaStatus.textContent = `Carte chargée · ${context.field.playAreaPoints.length} points GPS · ${context.field.excludedPolygons.length} exclusion(s).`;
      } catch (error) {
        context.ui.gpsAreaStatus.textContent = error.message;
      }
    };
    context.$("#gps-clear-area").onclick = () => {
      context.field.clearPlayArea();
      context.validatedPlayArea = null;
      context.game.setup.playArea = null;
      context.playAreaGrid = null;
      context.playAreaPresence.setPlayArea(null);
      context.manualSetupPlacements.clear();
      context.enabledGpsLocationIds.clear();
      context.capitalPlaced = false;
      context.ui.finishGpsSetup.disabled = true;
      context.ui.gpsAreaStatus.textContent = "Zone non définie.";
      context.mapInteractions.mode = "draw-area";
      context.worldMap.view.setPlayArea([]);
      context.renderGpsLocationButtons();
      context.render();
    };
    context.$("#gps-validate-area").onclick = () => {
      try {
        context.validatePlayArea();
      } catch (error) {
        context.ui.gpsAreaStatus.textContent = error.message;
      }
    };
    context.ui.finishGpsSetup.onclick = () => {
      if (
        !context.capitalPlaced ||
        context.manualSetupPlacements.size > 0 ||
        !context.validatedPlayArea
      )
        return;
      context.finishGameStart();
    };
    context.$("#start-distance-quest").onclick = () => {
      context.field.startDistanceQuest(
        context.asGps(context.positioning.position),
      );
      context.ui.questPlace.disabled = true;
      context.logTest("Départ de la quête 300 m enregistré.");
      context.render();
    };
    context.ui.questPlace.onclick = context.scenarioWorld.placeQuestLocation;
    context.$("#test-battle").onclick = context.openBattle;
    context.$("#search-battlefield")?.remove();
    context.$("#collect-loot")?.remove();
    context.$("#open-cheats").onclick = openCheats;
    context.$("#apply-hero-cheats").onclick = applyHeroCheats;
    context.$("#create-cheat-location").onclick = createCheatLocation;
  }
  return {
    openCheats,
    applyHeroCheats,
    createCheatLocation,
    initialize,
    closeGameMenu,
  };
}
