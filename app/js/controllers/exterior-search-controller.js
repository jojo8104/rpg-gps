import {
  exteriorSearchDialog,
  SEARCH_REASONS,
} from "../ui/exterior-search-view.js";

/** Transmet des intentions ; les points et dépenses proviennent exclusivement du serveur. */
export function createExteriorSearchController({
  host,
  getSession,
  onChange = () => {},
  log = () => {},
}) {
  const doc = host.ownerDocument,
    control = doc.createElement("div"),
    dialog = doc.createElement("dialog");
  control.className = "exterior-search-control";
  control.innerHTML =
    '<button type="button">Chercher un trésor</button><small></small>';
  control.hidden = true;
  dialog.className = "exterior-search-dialog";
  host.append(control);
  doc.body.append(dialog);
  const button = control.querySelector("button"),
    status = control.querySelector("small");
  let pending = false,
    opened = false,
    feedback = "",
    epoch = 0,
    timer = null,
    signature = "",
    clock = null;
  function model() {
    const { game, hero } = getSession();
    const controls = game?.explorationView?.searchControls?.find(
      (entry) => entry.heroId === hero?.id,
    );
    if (!controls) return null;
    if (!clock || clock.serverNow !== controls.serverNow)
      clock = { serverNow: controls.serverNow, receivedAt: Date.now() };
    const searches = (game.explorationView.searches ?? []).filter(
      (entry) => entry.heroId === hero.id,
    );
    const attempt =
      searches.find((entry) => entry.id === controls.activeSearchId) ??
      searches.sort((a, b) => b.startedAt - a.startedAt)[0];
    return { controls, attempt, game, hero };
  }
  function countdown() {
    const value = model();
    if (!value) return;
    const now = clock.serverNow + Date.now() - clock.receivedAt;
    const seconds = Math.max(
      0,
      Math.ceil((value.controls.cooldownUntil - now) / 1000),
    );
    const penalty = Math.max(
      0,
      Math.ceil((value.controls.discretionPenaltyUntil - now) / 1000),
    );
    button.textContent = value.controls.activeSearchId
      ? "Reprendre la recherche"
      : seconds
        ? `Chercher un trésor · ${seconds} s`
        : "Chercher un trésor";
    status.textContent = penalty
      ? `Discrétion −50 % · ${penalty} s`
      : (SEARCH_REASONS[value.controls.reason] ?? "");
    const detail = dialog.querySelector("[data-search-penalty]");
    if (detail)
      detail.textContent = penalty
        ? `Discrétion −50 % : ${penalty} s restantes. Recharge : ${seconds} s.`
        : `Pénalité terminée. Recharge : ${seconds} s.`;
  }
  function draft() {
    return {
      clueIds: [...dialog.querySelectorAll("[data-search-clue]:checked")].map(
        (input) => input.value,
      ),
      npcIds: [...dialog.querySelectorAll("[data-search-npc]:checked")].map(
        (input) => input.value,
      ),
      resources: Object.fromEntries(
        [...dialog.querySelectorAll("[data-search-resource]")].map((input) => [
          input.dataset.searchResource,
          Number(input.value),
        ]),
      ),
    };
  }
  async function command(method) {
    const value = model();
    if (!value || pending) return;
    const request = { playerId: value.hero.playerId, heroId: value.hero.id };
    if (method !== "beginExteriorSearch")
      request.searchId = value.controls.activeSearchId;
    if (["prepareExteriorSearch", "validateExteriorSearch"].includes(method))
      request.preparation = draft();
    const revision = epoch;
    pending = true;
    render(true);
    try {
      const result = await value.game[method](request);
      if (revision !== epoch) return;
      feedback = result?.success
        ? (result.message ?? "Jauge actualisée par le serveur.")
        : (SEARCH_REASONS[result?.reason] ?? "Action non confirmée.");
      if (result?.success && method === "beginExteriorSearch") {
        opened = true;
        if (!dialog.open) dialog.showModal();
      }
      if (result?.success && method === "cancelExteriorSearch") {
        opened = false;
        dialog.close();
      }
      if (result?.message) log(result.message);
      onChange();
    } catch (error) {
      if (revision === epoch)
        feedback = `Action non confirmée : ${error.message}`;
    } finally {
      if (revision === epoch) {
        pending = false;
        render(true);
      }
    }
  }
  button.addEventListener("click", () => {
    const value = model();
    if (!value || pending) return;
    if (value.controls.activeSearchId) {
      opened = true;
      feedback = "";
      render(true);
      if (!dialog.open) dialog.showModal();
    } else command("beginExteriorSearch");
  });
  dialog.addEventListener("close", () => {
    opened = false;
    signature = "";
  });
  function render(force = false) {
    const value = model();
    control.hidden = !value;
    if (!value) return;
    if (!timer) timer = setInterval(countdown, 1000);
    button.disabled =
      pending || (!value.controls.canStart && !value.controls.activeSearchId);
    if (opened) {
      const next = JSON.stringify([
        value.controls.activeSearchId,
        value.controls.canPrepare,
        value.controls.resources,
        value.controls.clues,
        value.controls.specialists,
        value.attempt,
        feedback,
        pending,
      ]);
      if (force || next !== signature) {
        signature = next;
        dialog.innerHTML = exteriorSearchDialog({
          ...value,
          feedback,
          pending,
        });
        dialog
          .querySelector("[data-search-close]")
          .addEventListener("click", () => dialog.close());
        dialog
          .querySelector("[data-search-prepare]")
          .addEventListener("click", () => command("prepareExteriorSearch"));
        dialog
          .querySelector("[data-search-cancel]")
          .addEventListener("click", () => command("cancelExteriorSearch"));
        dialog.querySelector("form").addEventListener("submit", (event) => {
          event.preventDefault();
          command("validateExteriorSearch");
        });
      }
    }
    countdown();
  }
  return {
    render,
    reset() {
      epoch++;
      pending = opened = false;
      feedback = signature = "";
      clock = null;
      if (timer) clearInterval(timer);
      timer = null;
      control.hidden = true;
      if (dialog.open) dialog.close();
    },
  };
}
