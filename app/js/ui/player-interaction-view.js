import { closeSheet } from "./bottom-sheet.js";
export function renderPlayerInteraction({
  element,
  intel,
  interactionRange,
  onClose,
  onAction,
}) {
  closeSheet(element);
  element.hidden = false;
  element.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">${safePlayerText(intel.relationLabel)} · information ${intel.informationLevel}/3</span><h2>${safePlayerText(intel.name)}</h2><p>${safePlayerText(intel.summary)}</p><div class="sheet-actions">${intel.actions
    .map(
      (action) =>
        `<button type="button" data-player-action="${action.id}" ${action.enabled ? "" : "disabled"}>${action.label}</button>`,
    )
    .join(
      "",
    )}</div>${intel.actions.some((action) => action.enabled) ? "" : `<p class="sheet-feedback">Rapprochez-vous à moins de ${interactionRange} m pour interagir.</p>`}`;
  element.querySelector(".sheet-close").onclick = onClose;
  element.querySelectorAll("[data-player-action]").forEach((button) => {
    button.onclick = async () => await onAction(button.dataset.playerAction);
  });
  const marker = element.firstElementChild;
  return {
    isOpen: () => !element.hidden && element.contains(marker),
    feedback(message) {
      const row = element.ownerDocument.createElement("p");
      row.setAttribute("role", "alert");
      row.textContent = message;
      element.append(row);
    },
  };
}
function safePlayerText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
