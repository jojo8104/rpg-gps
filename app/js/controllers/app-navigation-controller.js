import { closeSheet } from "../ui/bottom-sheet.js";
import { backgroundAssets } from "../background-assets.js";

/** Navigation des écrans ; le moteur décide seulement si un combat la verrouille. */
export function createAppNavigationController({
  document,
  ui,
  isBattleActive,
  onMap,
  onInventory,
  onWorld,
  hasSavedSession = () => false,
  onResume = () => {},
  onNewGame = () => {},
  onLoadGame = () => {},
  schedule = setTimeout,
}) {
  const $ = (selector) => document.querySelector(selector);
  function switchView(name) {
    if (isBattleActive() && name !== "battle") return false;
    document
      .querySelectorAll(".view")
      .forEach((view) =>
        view.classList.toggle("is-active", view.id === `${name}-view`),
      );
    document
      .querySelectorAll("[data-view]")
      .forEach((button) =>
        button.classList.toggle("is-active", button.dataset.view === name),
      );
    if (name === "map") onMap();
    else closeSheet(ui.sheet);
    if (name === "inventory") onInventory();
    if (name === "world") onWorld();
    return true;
  }
  function setBattleLocked(locked) {
    $(".bottom-nav").classList.toggle("is-locked", locked);
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.disabled = locked;
    });
  }
  function refreshSavedSession() {
    if (ui.resumeApp) ui.resumeApp.hidden = !hasSavedSession();
  }
  function initialize() {
    const enterLobby = () => {
      void backgroundAssets.start();
      ui.presentation.classList.add("is-leaving");
      ui.lobby.hidden = false;
      schedule(() => {
        ui.presentation.hidden = true;
      }, 650);
    };
    ui.enterApp.addEventListener("click", enterLobby);
    ui.newGameApp?.addEventListener("click", () => {
      if (ui.newGameApp.disabled) return;
      onNewGame();
      enterLobby();
    });
    ui.loadGameApp?.addEventListener("click", () => {
      if (!ui.loadGameApp.disabled) onLoadGame(enterLobby);
    });
    if (ui.resumeApp) {
      refreshSavedSession();
      ui.resumeApp.addEventListener("click", async () => {
        if (ui.resumeApp.disabled) return;
        ui.resumeApp.disabled = true;
        enterLobby();
        try {
          await onResume();
        } finally {
          refreshSavedSession();
          ui.resumeApp.disabled = false;
        }
      });
    }
    const exitSetup = () => {
      ui.setup.hidden = true;
      ui.lobby.hidden = false;
      $("#lobby-choice").hidden = true;
      $("#lobby-mode").hidden = false;
    };
    $("#setup-exit").addEventListener("click", exitSetup);
    ui.setup
      .querySelector('[data-setup-page="1"] [data-setup-back]')
      .addEventListener("click", exitSetup);
    $("#mode-back").addEventListener("click", () => {
      refreshSavedSession();
      ui.lobby.hidden = true;
      ui.presentation.classList.remove("is-leaving");
      ui.presentation.hidden = false;
    });
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.onclick = () => switchView(button.dataset.view);
    });
  }
  return { initialize, switchView, setBattleLocked, refreshSavedSession };
}
