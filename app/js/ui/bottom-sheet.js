export function renderLocationSheet({ element, location, message = "", onClose, onAction, onOpenWorld = null }) {
  element.hidden = false;
  element.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">${location.state}</span><h2>${location.name}</h2><p>${location.type} · ${Math.round(location.distance)} m</p><p>${location.description}</p>${message ? `<p class="sheet-feedback" role="status">${message}</p>` : ""}<div class="sheet-actions">${location.nearby ? location.actions.map((action) => `<button data-action="${action.id}" type="button">${action.label}</button>`).join("") : "Approchez-vous pour interagir."}${onOpenWorld ? '<button class="secondary-button" data-open-world type="button">Voir la fiche complète</button>' : ""}</div>`;
  element.querySelector(".sheet-close").addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); onClose(); });
  element.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); onAction(button.dataset.action); }));
  element.querySelector("[data-open-world]")?.addEventListener("click", () => onOpenWorld());
}
export function closeSheet(element) { element.hidden = true; element.innerHTML = ""; }
