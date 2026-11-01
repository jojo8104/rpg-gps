import { renderWorldStatus } from "../ui/world-status-view.js";
/** Coordonne les projections des contrôleurs sans faire avancer le moteur. */
export function createApplicationRenderController({
  session,
  appShell,
  relayMessages,
  isManagementOpen,
  refreshOpenResourceViews,
  debugPauseControl,
  deferRender,
  worldMap,
  scenarioWorld,
  multiplayer,
  queueMultiplayerWorldPublish,
  mapLayers,
  gps,
  positioning,
  field,
  playerMapIntel,
  playerInterface,
  exteriorSearch = null,
  exceptionalExpeditions = null,
  campInstallation = null,
  heroAbilities,
  quests,
  ui,
  $,
  renderWorld,
}) {
  function render({ background = false } = {}) {
    exteriorSearch?.render();
    exceptionalExpeditions?.render();
    campInstallation?.render();
    if (session.game) {
      appShell.updateRelayMessages(relayMessages());
    }
    if (background && isManagementOpen()) {
      refreshOpenResourceViews();
      quests.render();
      return;
    }
    if (debugPauseControl.isPaused) {
      deferRender();
      return;
    }
    if (!session.game || !worldMap.view) return;
    scenarioWorld.syncTeamLocations();
    if (
      multiplayer.active &&
      multiplayer.client &&
      session.game.status === "started" &&
      !multiplayer.authoritative
    )
      multiplayer.client.sendHeroState(session.hero).catch(() => {});
    queueMultiplayerWorldPublish();
    scenarioWorld.syncQuestBattlefield();
    const mapFrame = mapLayers.frame({
      heading: gps.heading,
      accuracy: positioning.accuracy,
      setupActive: session.gpsSetupActive,
      fogEnabled: worldMap.layers.fogVisible,
      field,
      grid: session.playAreaGrid,
      heatmapVisible: worldMap.layers.heatmapVisible,
    });
    worldMap.render(
      {
        ...mapFrame,
        explorationView: session.game.explorationView,
        onExplorationSelect: (entry) => {
          if (entry.kind === "cell") campInstallation?.open(entry.id);
          else exceptionalExpeditions?.open(entry.id);
        },
        heroPosition: positioning.displayPosition ?? mapFrame.heroPosition,
      },
      playerMapIntel(),
    );
    playerInterface.render(heroAbilities.render());
    quests.render();
    renderWorldStatus({ ui, $, session, mapFrame });
    if ($("#world-view").classList.contains("is-active")) renderWorld();
  }
  return { render };
}
