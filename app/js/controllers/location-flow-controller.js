import { closeSheet } from "../ui/bottom-sheet.js";
import { InteractionEngine } from "../core/interaction-engine.js";
/** Destination commune après une action ou un dialogue révélant un lieu. */
export function createLocationFlowController({
  session,
  quests,
  locations,
  positionFor,
  worldMap,
  ui,
  switchView,
  selectLocation,
  renderWorld,
  render,
  openBattle,
  rebuildLocationEngine,
  resolveLocationEnemy,
}) {
  function revealPendingLocation() {
    const id = quests.pendingRevealedLocationId;
    if (!id) return false;
    quests.pendingRevealedLocationId = null;
    const position = positionFor(id);
    if (position) worldMap.view.focus(position);
    if (id === "evacuation-camp") {
      locations.selectedId = null;
      closeSheet(ui.sheet);
      switchView("map");
    } else selectLocation(id);
    return true;
  }
  function finishLocationAction({ action, returnToWorld }) {
    if (action === "battle" || revealPendingLocation()) return;
    if (returnToWorld) {
      locations.message = session.locationMessage;
      renderWorld();
    } else selectLocation(locations.selectedId);
  }
  async function handleDialogueClosed({ battleLocationId }) {
    revealPendingLocation();
    render();
    if (battleLocationId) {
      locations.selectedId = battleLocationId;
      session.currentEncounter = null;
      await openBattle();
    }
  }
  async function handleBattleResolved({ battle, result }) {
    await quests.battleResolved(battle);
    if (result.destroyedLocationId) {
      rebuildLocationEngine();
      session.interactionEngine = new InteractionEngine({
        locations: session.game.locations.filter(
          (location) => location.state !== "destroyed",
        ),
        enemyResolver: resolveLocationEnemy,
      });
      session.currentEncounter = null;
      locations.selectedId = null;
    }
    if (result.capturedLocationId) {
      session.currentEncounter = null;
      session.locationMessage = "Lieu capturé après la victoire.";
    }
  }
  return { finishLocationAction, handleDialogueClosed, handleBattleResolved };
}
