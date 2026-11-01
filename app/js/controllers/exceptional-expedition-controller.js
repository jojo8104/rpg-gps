import { exceptionalExpeditionDialog } from "../ui/exceptional-expedition-view.js";
export function createExceptionalExpeditionController({
  host,
  getSession,
  onChange = () => {},
}) {
  const doc = host.ownerDocument,
    button = doc.createElement("button"),
    dialog = doc.createElement("dialog");
  button.type = "button";
  button.className = "exceptional-expedition-control";
  button.textContent = "Préparer une expédition";
  button.hidden = true;
  dialog.className = "exterior-search-dialog";
  host.append(button);
  doc.body.append(dialog);
  let pending = false,
    feedback = "",
    originLocationId = null,
    siteId = null,
    signature = "",
    epoch = 0;
  function model() {
    const { game, hero } = getSession();
    const controls = game?.explorationView?.expeditionControls?.find(
      (c) => c.heroId === hero?.id,
    );
    if (!controls) return null;
    const mission = game.explorationView.expeditions?.find(
      (m) =>
        m.kind !== "installation" &&
        m.preparerHeroId === hero.id &&
        ["preparing", "travelling", "resolving", "returning"].includes(
          m.status,
        ) &&
        (m.status === "preparing" || m.heroId === hero.id),
    );
    const sent = (game.explorationView.expeditions ?? []).filter(
      (m) =>
        m.kind !== "installation" &&
        m.preparerHeroId === hero.id &&
        !m.heroId &&
        ["travelling", "resolving", "returning"].includes(m.status),
    );
    const history = (game.explorationView.expeditions ?? []).filter(
      (m) =>
        m.kind !== "installation" &&
        m.preparerHeroId === hero.id &&
        (m.result || ["completed", "cancelled"].includes(m.status)),
    );
    return { game, hero, controls, mission, sent, history };
  }
  function render(force = false) {
    const value = model();
    button.hidden =
      !value ||
      (!value.controls.sites.length &&
        !value.mission &&
        !value.history.length &&
        !value.sent.length);
    button.disabled = pending;
    if (!value || !dialog.open) return;
    const next = JSON.stringify([
      value.controls,
      value.mission,
      value.sent,
      value.history,
      feedback,
      pending,
      originLocationId,
      siteId,
    ]);
    if (!force && next === signature) return;
    signature = next;
    if (value.mission)
      originLocationId = value.mission.originLocationId ?? null;
    dialog.innerHTML = exceptionalExpeditionDialog({
      ...value,
      originLocationId,
      siteId,
      feedback,
      pending,
    });
    dialog.querySelector("[data-exp-close]").onclick = () => dialog.close();
    dialog.querySelector("[data-exp-source]").onchange = (e) => {
      originLocationId = e.target.value || null;
      siteId = dialog.querySelector("[data-exp-site]").value;
      render(true);
    };
    dialog.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      command("prepareExceptionalExpedition");
    };
    for (const [attribute, method] of [
      ["depart", "departExceptionalExpedition"],
      ["cancel", "cancelExceptionalExpedition"],
      ["resolve", "resolveExceptionalExpedition"],
    ]) {
      const el = dialog.querySelector(`[data-exp-${attribute}]`);
      if (el) el.onclick = () => command(method);
    }
    for (const el of dialog.querySelectorAll("[data-exp-claim]"))
      el.onclick = () =>
        command("claimExceptionalExpedition", el.dataset.expClaim);
  }
  async function command(method, missionId = null) {
    const value = model();
    if (!value || pending) return;
    const request = { playerId: value.hero.playerId, heroId: value.hero.id };
    if (value.mission) request.expeditionId = value.mission.id;
    if (missionId) request.expeditionId = missionId;
    if (method === "prepareExceptionalExpedition") {
      request.siteId = dialog.querySelector("[data-exp-site]").value;
      request.originLocationId =
        dialog.querySelector("[data-exp-source]").value || null;
      request.preparation = {
        npcIds: [...dialog.querySelectorAll("[data-exp-npc]:checked")].map(
          (e) => e.value,
        ),
        volunteers: [...dialog.querySelectorAll("[data-exp-volunteer]")].map(
          (e) => ({ unitId: e.dataset.id, quantity: Number(e.value) }),
        ),
        mounts: {},
        equipment: {},
        resources: {},
      };
      for (const input of dialog.querySelectorAll("[data-exp-quantity]"))
        request.preparation[input.dataset.category][input.dataset.id] = Number(
          input.value,
        );
    }
    const revision = epoch;
    pending = true;
    render(true);
    try {
      const result = await value.game[method](request);
      if (revision !== epoch) return;
      feedback = result?.success
        ? (result.message ?? "Préparation enregistrée.")
        : ({
            expedition_already_active:
              "Une expédition est déjà engagée avec ce héros.",
            invalid_expedition_preparation:
              "Les moyens sélectionnés ne sont plus disponibles.",
            hero_bag_full: "Libérez des places : les items restent conservés.",
            expedition_not_at_site:
              "Rejoignez la case du site pour cette action.",
            hero_not_at_origin:
              "Rejoignez le poste de départ pour récupérer les récompenses.",
            site_rewards_unavailable:
              "Récompenses indisponibles pour ce site. Aucune dépense n’a été appliquée.",
            expedition_departure_refused:
              "Départ refusé : vérifiez le site, le score et les moyens disponibles.",
          }[result?.reason] ?? "Expédition indisponible.");
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
      if (!value?.controls.sites.some((s) => s.id === id)) return;
      siteId = id;
      if (!dialog.open) dialog.showModal();
      render(true);
    },
    reset() {
      epoch++;
      pending = false;
      feedback = signature = "";
      originLocationId = siteId = null;
      button.hidden = true;
      if (dialog.open) dialog.close();
    },
  };
}
