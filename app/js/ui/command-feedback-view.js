import { createProgressRewardView } from "./progress-reward-view.js";

// Présente une intention en attente, sans modifier les données officielles.
export function commandFeedbackKind(command, input = {}) {
  if (command === "attemptLocationCapture") return "capture";
  if (command === "playerSocialCommand") return "transfer";
  if (
    command === "acceptAvailableQuest" ||
    (command === "questEngineCommand" && input.type === "accept")
  )
    return "quest";
  if (
    [
      "selectQuestChoice",
      "selectLocationChiefOption",
      "questEngineCommand",
    ].includes(command)
  )
    return "dialogue";
  if (["equipHeroItem", "unequipHeroItem"].includes(command))
    return "equipment";
  if (
    [
      "tradeAtLocation",
      "collectLocationResources",
      "collectLocationTaxes",
      "depositLocationResource",
      "depositLocationItem",
      "transferLocationResource",
      "transferLocationProduction",
      "takeLocationPopulationPackage",
      "assignWagons",
      "returnWagons",
      "collectBattleLoot",
    ].includes(command)
  )
    return "transfer";
  return null;
}

export function createCommandFeedbackView({
  element,
  alerts,
  documentRef = document,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  const rewards = createProgressRewardView({ element, documentRef });
  const active = new Set();
  const timers = new Set();
  const labels = {
    quest: "Quête",
    dialogue: "Choix",
    capture: "Capture",
    equipment: "Équipement",
    transfer: "Transfert",
  };
  function sound(kind) {
    if (kind === "success") alerts?.reward({ kind: "quest" });
    else alerts?.notify(kind === "failure" ? "danger" : "notice");
  }
  return {
    begin(command, args) {
      const kind = commandFeedbackKind(command, args[0]);
      if (!kind) return null;
      if (kind === "equipment") return null;
      if (kind === "quest" || kind === "dialogue") {
        const handle = { remove() {} };
        active.add(handle);
        return {
          finish(result) {
            if (!active.delete(handle) || result == null) return;
            sound(result.success === false ? "failure" : "success");
          },
        };
      }
      const node = documentRef.createElement("div");
      node.className = `command-feedback travel-reward is-hero-level is-${kind}`;
      node.setAttribute("role", "status");
      node.setAttribute("aria-live", "polite");
      const caption = documentRef.createElement("span");
      caption.className = "travel-reward__distance";
      caption.textContent = labels[kind];
      const title = documentRef.createElement("strong");
      title.className = "travel-reward__xp";
      title.textContent = kind === "capture" ? "⚔ ⚔" : "…";
      const status = documentRef.createElement("small");
      status.textContent = "Validation en cours…";
      node.append(caption, title, status);
      element.append(node);
      active.add(node);
      if (kind === "quest" || kind === "dialogue") sound("pending");
      const timer = schedule(() => {
        timers.delete(timer);
        if (!active.has(node)) return;
        status.textContent = "Chargement…";
        if (kind === "quest" || kind === "dialogue") sound("pending");
      }, 700);
      timers.add(timer);
      return {
        finish(result) {
          if (!active.delete(node)) return;
          cancel(timer);
          timers.delete(timer);
          node.remove();
          if (result == null) return;
          const success = result.success !== false;
          if (kind === "quest" || kind === "dialogue")
            sound(success ? "success" : "failure");
          rewards.show({
            caption: labels[kind],
            className: "is-hero-level",
            title: result.unconfirmed
              ? "Non confirmée"
              : success
                ? kind === "quest"
                  ? "Acceptée"
                  : "Confirmé"
                : "Refusée",
          });
        },
      };
    },
    reset() {
      for (const timer of timers) cancel(timer);
      timers.clear();
      for (const node of active) node.remove();
      active.clear();
      rewards.reset();
    },
  };
}
