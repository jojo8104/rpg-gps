// Annonces et fiches des personnages de scénario, avec intentions déléguées.
export function renderQuestBadge({ element, availableQuests }) {
  const questsButton = element;
  const hasAvailableQuest = availableQuests.length > 0;
  questsButton?.classList.toggle("has-notice", hasAvailableQuest);
  if (questsButton) {
    questsButton.dataset.notice = "";
    questsButton.setAttribute(
      "aria-label",
      hasAvailableQuest ? "Quêtes — nouvelle quête disponible" : "Quêtes",
    );
  }
}
export function renderRoyalMessengerNotice({ element, message, onRead }) {
  element.hidden = !message;
  if (!message) {
    element.innerHTML = "";
    return;
  }
  element.innerHTML = `<span aria-hidden="true">➤</span><div><small>Un messager royal vous rejoint</small><strong>${message.title}</strong></div><button type="button">Lire l’ordre</button>`;
  element.querySelector("button").onclick = onRead;
}
export function renderQuestGroupSheet({
  element,
  message,
  canTalk,
  onRead,
  onTalk,
  onClose,
}) {
  element.hidden = false;
  element.innerHTML = message
    ? `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Messager du royaume</span><h2>${message.title}</h2><p>${message.text}</p><div class="sheet-actions"><button data-read-royal-order>Recevoir l’ordre</button></div>`
    : `<button class="sheet-close" type="button">Fermer</button><h2>Le prévôt royal</h2><p>Armée du royaume · infanterie lourde · sergent</p><button data-talk-provost ${canTalk ? "" : "disabled"}>Parler avec le prévôt</button>`;
  element.querySelector(".sheet-close").onclick = onClose;
  element
    .querySelector("[data-read-royal-order]")
    ?.addEventListener("click", onRead);
  element
    .querySelector("[data-talk-provost]")
    ?.addEventListener("click", onTalk);
}
