import { closeSheet } from "./bottom-sheet.js";
import { formatInteger } from "./number-format.js";

function panelHandle(element) {
  const marker = element.firstElementChild;
  return { isOpen: () => !element.hidden && element.contains(marker) };
}
export function renderProspectingManager({
  element,
  origin,
  options,
  specialists,
  specialist,
  message,
  onClose,
  onSpecialist,
  onCreate,
}) {
  closeSheet(element);
  const names = {
    specialist_geologist: "Géologue",
    specialist_cartographer: "Cartographe",
    specialist_adventurer: "Aventurier",
    beer: "bière",
    horse: "chevaux",
    exploration_tools: "outils",
  };
  const fixedCosts = Object.entries(options.fixedCost ?? {})
    .map(([id, amount]) => `${formatInteger(amount)} ${names[id] ?? id}`)
    .join(" · ");
  const rows = (options.expeditions ?? [])
    .map(
      (expedition) =>
        `<article class="improvement-option"><div><strong>${names[expedition.specialistId] ?? expedition.specialistId}</strong><span>${expedition.phase} · ${expedition.status}</span></div><p>${expedition.discoveries.length} découverte(s)</p></article>`,
    )
    .join("");
  element.hidden = false;
  element.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Poste de prospection</span><h2>Explorer depuis ${origin.name}</h2>${message ? `<p class="sheet-feedback">${message}</p>` : ""}<p>Le spécialiste parcourt une spirale puis revient. 5 habitants accompagnent le spécialiste puis reviennent. Croissance suspendue pendant leur absence. Coût : 5 vivres et ${fixedCosts || "1 outil"}. Bière : portée ×2 par unité (max. ×4). Chevaux : vitesse +20 % par unité (max. ×3).</p><label>Spécialiste<select data-prospecting-specialist>${specialists.map((entry) => `<option value="${entry.id}" ${entry.id === specialist?.id ? "selected" : ""}>${names[entry.id] ?? entry.id} (${formatInteger(entry.quantity)})</option>`).join("")}</select></label><label>Vivres<input data-prospecting-food type="number" min="5" max="5" readonly step="1" value="5"></label><label>Bière (0–2)<input data-prospecting-beer type="number" min="0" max="2" value="0"></label><label>Chevaux (0–10)<input data-prospecting-horses type="number" min="0" max="10" value="0"></label><div class="sheet-actions"><button type="button" data-create-prospecting ${specialist && specialist.quantity > 0 ? "" : "disabled"}>Lancer l’exploration</button></div><h3>Expéditions</h3>${rows || "<p>Aucune expédition partie de ce poste.</p>"}`;

  element.querySelector(".sheet-close").onclick = onClose;
  element
    .querySelector("[data-prospecting-specialist]")
    ?.addEventListener("change", (event) => onSpecialist(event.target.value));
  element
    .querySelector("[data-create-prospecting]")
    ?.addEventListener("click", () =>
      onCreate({
        food: Number.parseInt(
          element.querySelector("[data-prospecting-food]").value,
          10,
        ),
        beer: Number(element.querySelector("[data-prospecting-beer]").value),
        horses: Number(
          element.querySelector("[data-prospecting-horses]").value,
        ),
      }),
    );
  return panelHandle(element);
}

export function renderTradingConvoyManager({
  element,
  origin,
  options,
  destination,
  resourceId,
  itemDefinitions = {},
  message,
  onClose,
  onDestination,
  onResource,
  onCreate,
  onStop,
}) {
  closeSheet(element);
  const costs = Object.entries(options.cost ?? {})
    .map(
      ([id, amount]) =>
        `${formatInteger(amount)} ${itemDefinitions?.[id]?.name ?? id}`,
    )
    .join(" · ");
  const convoyRows =
    options.convoys
      ?.map((convoy) => {
        const target = convoy.destinationName ?? convoy.destinationLocationId;
        const state = convoy.active
          ? `${convoy.phase === "outbound" ? "aller" : "retour"} · ${convoy.status}`
          : "arrêté";
        return `<article class="improvement-option"><div><strong>${target} · ${convoy.resourceId}</strong><span>${state}</span></div><p>Cargaison : ${convoy.cargo.map((entry) => `${formatInteger(entry.quantity)} ${entry.itemId}`).join(", ") || "vide"}</p><footer><button type="button" class="secondary-button" data-stop-convoy="${convoy.id}" ${convoy.active ? "" : "disabled"}>Arrêter</button></footer></article>`;
      })
      .join("") ?? "";
  element.hidden = false;
  element.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Comptoir de commerce</span><h2>Convois de ${origin.name}</h2>${message ? `<p class="sheet-feedback">${message}</p>` : ""}<p>Coût de création : ${costs || "non configuré"} · capacité ${formatInteger(options.capacitySlots ?? 0)} slots.</p>${options.destinations.length ? `<label>Destination<select data-convoy-destination>${options.destinations.map((item) => `<option value="${item.id}" ${item.id === destination?.id ? "selected" : ""}>${item.name}</option>`).join("")}</select></label><label>Ressource<select data-convoy-resource>${(destination?.resources ?? []).map((id) => `<option value="${id}" ${id === resourceId ? "selected" : ""}>${id}</option>`).join("")}</select></label><div class="sheet-actions"><button type="button" data-create-convoy ${resourceId ? "" : "disabled"}>Créer un convoi</button></div>` : "<p>Aucune localisation productrice vous appartenant n’est éligible.</p>"}<h3>Liaisons</h3>${convoyRows || "<p>Aucun convoi créé depuis ce comptoir.</p>"}`;

  element.querySelector(".sheet-close").onclick = onClose;
  element
    .querySelector("[data-convoy-destination]")
    ?.addEventListener("change", (event) => onDestination(event.target.value));
  element
    .querySelector("[data-convoy-resource]")
    ?.addEventListener("change", (event) => onResource(event.target.value));
  element
    .querySelector("[data-create-convoy]")
    ?.addEventListener("click", onCreate);
  element
    .querySelectorAll("[data-stop-convoy]")
    .forEach((button) =>
      button.addEventListener("click", () => onStop(button.dataset.stopConvoy)),
    );
  return panelHandle(element);
}
