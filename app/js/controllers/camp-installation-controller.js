import { campInstallationDialog } from "../ui/camp-installation-view.js";
export function createCampInstallationController({
  host,
  getSession,
  onChange = () => {},
}) {
  const doc = host.ownerDocument,
    button = doc.createElement("button"),
    dialog = doc.createElement("dialog");
  button.type = "button";
  button.className = "camp-installation-control";
  button.textContent = "Installer un camp";
  button.hidden = true;
  dialog.className = "exterior-search-dialog";
  host.append(button);
  doc.body.append(dialog);
  let pending = false,
    feedback = "",
    signature = "",
    epoch = 0;
  function model() {
    const { game, hero } = getSession();
    const controls = game?.explorationView?.installationControls?.find(
      (c) => c.heroId === hero?.id,
    );
    return controls
      ? {
          game,
          hero,
          controls,
          missions: (game.explorationView.expeditions ?? []).filter(
            (m) => m.kind === "installation" && m.preparerHeroId === hero.id,
          ),
        }
      : null;
  }
  function render(force = false) {
    const value = model();
    button.hidden =
      !value || (!value.controls.targets.length && !value.missions.length);
    button.disabled = pending;
    if (!value || !dialog.open) return;
    const next = JSON.stringify([
      value.controls,
      value.missions,
      pending,
      feedback,
    ]);
    if (!force && signature === next) return;
    signature = next;
    dialog.innerHTML = campInstallationDialog({ ...value, pending, feedback });
    dialog.querySelector("[data-camp-close]").onclick = () => dialog.close();
    dialog.querySelector("[data-camp-found]").onclick = () =>
      command("foundResourceCamp");
    dialog.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      command("sendCampInstallation");
    };
    for (const b of dialog.querySelectorAll("[data-camp-unload]"))
      b.onclick = () => command("claimCampInstallation", b.dataset.campUnload);
  }
  async function command(method, expeditionId = null) {
    const value = model();
    if (!value || pending) return;
    const request = { playerId: value.hero.playerId, heroId: value.hero.id };
    if (method === "foundResourceCamp")
      request.cellId = value.controls.currentCellId;
    if (method === "sendCampInstallation") {
      request.cellId = dialog.querySelector("[data-camp-cell]").value;
      request.originLocationId =
        dialog.querySelector("[data-camp-origin]").value;
    }
    if (expeditionId) request.expeditionId = expeditionId;
    const revision = epoch;
    pending = true;
    render(true);
    try {
      const result = await value.game[method](request);
      if (revision !== epoch) return;
      feedback = result?.success
        ? (result.message ?? "Installation confirmée.")
        : ({
            installation_unknown_cell:
              "Cette case doit d’abord être prospectée.",
            installation_not_on_cell: "Rejoignez la case visée.",
            installation_occupied: "La case est déjà occupée.",
            installation_under_influence:
              "La case est sous l’influence d’un lieu.",
            installation_too_close: "La case est trop proche d’un autre lieu.",
            insufficient_resources: "Ressources insuffisantes.",
            prospecting_post_unavailable:
              "Rejoignez un de vos postes de prospection.",
          }[result?.reason] ?? "Installation non disponible.");
      onChange();
    } catch (error) {
      if (revision === epoch) feedback = error.message;
    } finally {
      if (revision === epoch) {
        pending = false;
        render(true);
      }
    }
  }
  button.onclick = () => {
    dialog.showModal();
    render(true);
  };
  return {
    render,
    open(id) {
      const value = model();
      if (!value?.controls.targets.some((c) => c.id === id)) return;
      if (!dialog.open) dialog.showModal();
      render(true);
      const select = dialog.querySelector("[data-camp-cell]");
      if (select) select.value = id;
    },
    reset() {
      epoch++;
      pending = false;
      feedback = signature = "";
      button.hidden = true;
      if (dialog.open) dialog.close();
    },
  };
}
