// Traduit les clics selon l'outil actif, sans dépendance au DOM ou à Leaflet.
export function createMapInteractionController({
  getSession,
  asGps,
  activateDivinationAt,
  moveLocation,
  addSetupAutonomousGroup,
  renderGpsLocationButtons,
  updateSetupCompletion,
  onChange,
  onLog,
  onExclusionReady,
  onAreaStatus,
  onCapitalPlaced,
  onSetupReady,
  isSheetOpen,
  onCloseLocation,
  applyPosition,
}) {
  let interactionMode = null;
  function handleMapClick(position) {
    const {
      mode,
      field,
      tasks: manualSetupPlacements,
      playArea: validatedPlayArea,
      enabledLocationIds: enabledGpsLocationIds,
      setupActive: gpsSetupActive,
      game,
    } = getSession();

    const point =
      mode === "gps" ? position : [position.latitude, position.longitude];
    if (interactionMode === "target-divination") {
      activateDivinationAt(asGps(point));
      return;
    }
    if (interactionMode === "draw-exclusion") {
      field.addExclusionPoint(asGps(point));
      onExclusionReady(field.exclusionDraftPoints.length >= 3);
      onAreaStatus(
        `${field.exclusionDraftPoints.length} sommet(s) pour l’exclusion.`,
      );
      onChange();
      return;
    }
    if (interactionMode?.startsWith("setup-manual:")) {
      const key = interactionMode.slice("setup-manual:".length);
      const task = manualSetupPlacements.get(key);
      const gpsPoint = asGps(point);
      if (!task || validatedPlayArea?.allowsPlacement(gpsPoint) !== true) {
        onAreaStatus(
          "Le placement doit rester dans la zone autorisée, hors des exclusions.",
        );
        return;
      }
      if (task.kind === "location") {
        enabledGpsLocationIds.add(task.id);
        moveLocation(task.id, point);
        if (task.id === "royal-capital") onCapitalPlaced();
      } else addSetupAutonomousGroup(task.type, task.index, gpsPoint);
      manualSetupPlacements.delete(key);
      interactionMode = null;
      renderGpsLocationButtons();
      updateSetupCompletion();
      onChange();
      return;
    }
    if (interactionMode === "place-start-capital") {
      if (validatedPlayArea?.allowsPlacement(asGps(point)) !== true) {
        onAreaStatus(
          "La capitale doit rester dans la zone autorisée, hors des exclusions.",
        );
        return;
      }
      moveLocation("royal-capital", point);
      onCapitalPlaced();
      if (enabledGpsLocationIds !== null)
        enabledGpsLocationIds.add("royal-capital");
      interactionMode = null;
      onAreaStatus("Capitale placée. Le héros commencera ici.");
      onSetupReady();
      renderGpsLocationButtons();
      return;
    }
    if (interactionMode === "draw-area") {
      field.addPlayAreaPoint(asGps(point));
      if (gpsSetupActive)
        onAreaStatus(`${field.playAreaPoints.length} sommet(s) posé(s).`);
      onLog(`Sommet ${field.playAreaPoints.length} ajouté.`);
      onChange();
      return;
    }
    if (interactionMode?.startsWith("place-location:")) {
      const id = interactionMode.slice("place-location:".length);
      if (validatedPlayArea?.allowsPlacement(asGps(point)) !== true) {
        onAreaStatus(
          validatedPlayArea
            ? "Ce lieu doit rester dans la zone autorisée, hors des exclusions."
            : "Valide d’abord la zone de jeu avant de placer un lieu.",
        );
        return;
      }
      enabledGpsLocationIds.add(id);
      moveLocation(id, point);
      interactionMode = null;
      renderGpsLocationButtons();
      onLog(`${game.getLocation(id).name} placé sur la carte.`);
      return;
    }
    if (interactionMode === "place-location") {
      if (validatedPlayArea?.allowsPlacement(asGps(point)) !== true) {
        onLog("Placement refusé hors de la zone autorisée.");
        return;
      }
      moveLocation("bandit-camp", point);
      interactionMode = null;
      onLog("Camp placé manuellement sans QR code.");
      return;
    }
    if (isSheetOpen()) {
      onCloseLocation();
      return;
    }
    if (mode === "simulation") applyPosition(point);
  }
  return {
    click: handleMapClick,
    get mode() {
      return interactionMode;
    },
    set mode(value) {
      interactionMode = value;
    },
    reset() {
      interactionMode = null;
    },
  };
}
