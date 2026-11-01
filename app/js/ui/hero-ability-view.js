import { formatCooldown } from "./cooldown-format.js";
// Contrôles des capacités sur la carte et lecture des alertes de vigie.
export function createHeroAbilityView({ powerNav, mapElement, actions }) {
  const concealButton = document.createElement("button");
  concealButton.id = "ambush-action";
  concealButton.className = "map-power-action conceal-control";
  concealButton.type = "button";
  concealButton.innerHTML =
    '<span aria-hidden="true">♟</span><small>Embuscade</small>';
  concealButton.hidden = true;
  powerNav.append(concealButton);
  concealButton.onclick = actions.launchPreparedAmbush;
  const watchBeaconButton = document.createElement("button");
  watchBeaconButton.id = "watch-beacon-action";
  watchBeaconButton.className = "map-power-action watch-beacon-control";
  watchBeaconButton.type = "button";
  watchBeaconButton.innerHTML =
    '<span aria-hidden="true">⌖</span><small>Vigie 0/3</small>';
  watchBeaconButton.hidden = true;
  powerNav.append(watchBeaconButton);
  watchBeaconButton.onclick = actions.placeWatchBeacon;
  const divinationButton = document.createElement("button");
  divinationButton.id = "divination-map-action";
  divinationButton.className = "map-power-action mage-power-control";
  divinationButton.type = "button";
  divinationButton.hidden = true;
  divinationButton.innerHTML =
    '<span aria-hidden="true">◉</span><small>Divination</small>';
  powerNav.append(divinationButton);
  divinationButton.onclick = actions.useDivination;
  const astralTravelButton = document.createElement("button");
  astralTravelButton.id = "astral-travel-map-action";
  astralTravelButton.className = "map-power-action mage-power-control";
  astralTravelButton.type = "button";
  astralTravelButton.hidden = true;
  astralTravelButton.innerHTML =
    '<span aria-hidden="true">✧</span><small>Astral</small>';
  powerNav.append(astralTravelButton);
  astralTravelButton.onclick = actions.useAstralTravel;
  const watchMessageButton = document.createElement("button");
  watchMessageButton.type = "button";
  watchMessageButton.className = "watch-message-indicator";
  watchMessageButton.hidden = true;
  watchMessageButton.setAttribute("aria-label", "Lire les messages de vigie");
  watchMessageButton.innerHTML =
    '<img src="assets/icons/watch-message.png" alt=""><span hidden></span>';
  mapElement.append(watchMessageButton);
  watchMessageButton.addEventListener("click", actions.openWatchMessages);
  function renderMessages(count) {
    watchMessageButton.hidden = count === 0;
    watchMessageButton.setAttribute(
      "aria-label",
      count === 1
        ? "Lire le message de vigie"
        : `Lire les ${count} messages de vigie`,
    );
    const badge = watchMessageButton.querySelector("span");
    badge.hidden = count < 2;
    badge.textContent = count > 9 ? "9+" : String(count);
  }
  function render(model) {
    if (!model) {
      for (const button of [
        concealButton,
        watchBeaconButton,
        divinationButton,
        astralTravelButton,
      ])
        button.hidden = true;
      return;
    }
    const {
      hero,
      battle,
      prepared,
      ambushTarget,
      ambushAvailable,
      activeWatchBeacons,
      divinationCooldown,
      astralCooldown,
      classPowerUnavailable,
      targetingMode,
    } = model;
    concealButton.hidden = !ambushAvailable;
    concealButton.disabled = prepared !== null && ambushTarget === null;
    concealButton.classList.toggle("is-active", prepared !== null);
    concealButton.textContent = ambushTarget
      ? "Attaquer en embuscade"
      : prepared
        ? "Embuscade préparée"
        : "Préparer l’embuscade";
    watchBeaconButton.hidden =
      hero.classId !== "ranger" || hero.state !== "active";
    watchBeaconButton.disabled = Boolean(
      battle && battle.status !== "finished",
    );
    watchBeaconButton.title =
      activeWatchBeacons >= 3
        ? "Poser une nouvelle balise et retirer automatiquement la plus ancienne"
        : "Poser une balise de vigie à votre position";
    watchBeaconButton.innerHTML = `<span aria-hidden="true">⌖</span><small>Vigie ${activeWatchBeacons}/3</small>`;
    divinationButton.hidden = hero.classId !== "mage";
    divinationButton.disabled = classPowerUnavailable || divinationCooldown > 0;
    divinationButton.title =
      divinationCooldown > 0
        ? `Recharge : ${formatCooldown(divinationCooldown)}`
        : targetingMode === "target-divination"
          ? "Touchez maintenant une zone de la carte"
          : "Choisir une zone à révéler";
    divinationButton.classList.toggle(
      "is-active",
      targetingMode === "target-divination",
    );
    divinationButton.innerHTML = `<span aria-hidden="true">◉</span><small>${divinationCooldown > 0 ? `Div. ${formatCooldown(divinationCooldown)}` : "Divination"}</small>`;
    astralTravelButton.hidden = hero.classId !== "mage";
    astralTravelButton.disabled = classPowerUnavailable || astralCooldown > 0;
    astralTravelButton.title =
      astralCooldown > 0
        ? `Recharge : ${formatCooldown(astralCooldown)}`
        : "Glisser la projection vers un lieu, un héros ou un GA dans le cercle astral";
    astralTravelButton.innerHTML = `<span aria-hidden="true">✧</span><small>${astralCooldown > 0 ? `Astral ${formatCooldown(astralCooldown)}` : "Astral"}</small>`;
  }
  return { render, renderMessages };
}
export function openWatchMessagesView({ messages, onFocus }) {
  const dialog = document.createElement("dialog");
  dialog.className = "watch-message-dialog";
  const panel = document.createElement("section");
  panel.className = "watch-message-dialog__panel";
  const title = document.createElement("h2");
  title.textContent =
    messages.length === 1 ? "Message de vigie" : "Messages de vigie";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "sheet-close";
  close.textContent = "Fermer";
  close.addEventListener("click", () => dialog.close());
  panel.append(close, title);
  messages.forEach((message) => {
    const entry = document.createElement("article");
    const text = document.createElement("p");
    text.textContent = message.text;
    const focus = document.createElement("button");
    focus.type = "button";
    focus.textContent = "⌖ Centrer sur l’alerte";
    focus.addEventListener("click", () => {
      dialog.close();
      onFocus(message.position);
    });
    entry.append(text, focus);
    panel.append(entry);
  });
  dialog.append(panel);
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.showModal();
  return {
    close: () => {
      dialog.close();
      dialog.remove();
    },
  };
}
