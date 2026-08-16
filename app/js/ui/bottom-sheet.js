export function renderLocationSheet({ element, location, message = "", onClose, onAction }) {
  element.hidden = false;
  element.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">${location.state}</span><h2>${location.name}</h2><p>${location.type} · ${Math.round(location.distance)} m</p><p>${location.description}</p>${message ? `<p class="sheet-feedback" role="status">${message}</p>` : ""}<div class="sheet-actions">${location.nearby ? location.actions.map((action) => `<button data-action="${action.id}" type="button">${action.label}</button>`).join("") : "Approchez-vous pour interagir."}</div>`;
  element.querySelector(".sheet-close").addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); onClose(); });
  element.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); onAction(button.dataset.action); }));
}
export function closeSheet(element) { element.hidden = true; element.innerHTML = ""; }
