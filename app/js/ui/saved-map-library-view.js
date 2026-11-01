import { createMapPackageClient } from "../map/map-package-client.js";

/** Panneau à la demande, au-dessus de la carte, sans réduire son espace. */
export function mountSavedMapLibrary({
  window,
  client,
  getArea,
  selectArea,
  canEdit,
  mapClient = createMapPackageClient(),
}) {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.textContent = "Mes cartes";
  toggle.setAttribute("aria-expanded", "false");
  const panel = document.createElement("section");
  panel.className = "saved-map-library";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Mes cartes sauvegardées");
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Revenir à la carte";
  const form = document.createElement("form");
  const label = document.createElement("label");
  label.textContent = "Nom de la carte";
  const input = document.createElement("input");
  input.required = true;
  input.maxLength = 60;
  label.append(input);
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Sauvegarder cette carte";
  form.append(label, save);
  const help = document.createElement("p");
  help.textContent =
    "Vos cartes sauvegardées conservent leurs données géographiques sur le serveur. Les autres téléchargements forment une banque réutilisable, dans la limite de son espace disponible.";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const list = document.createElement("div");
  panel.append(close, form, help, status, list);
  window.header.insertBefore(toggle, window.header.lastChild);
  window.dialog.append(panel);
  let busy = false;
  function hide() {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    toggle.focus();
  }
  async function refresh() {
    const { maps } = await client.listMaps();
    list.replaceChildren();
    if (!maps.length) {
      const empty = document.createElement("p");
      empty.textContent = "Aucune carte sauvegardée.";
      list.append(empty);
    }
    for (const map of maps) {
      const row = document.createElement("div");
      row.className = "saved-map-row";
      const choose = document.createElement("button");
      choose.type = "button";
      choose.textContent = map.name;
      choose.disabled = !canEdit();
      choose.onclick = () => {
        selectArea(map.playArea);
        hide();
      };
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Supprimer";
      remove.setAttribute("aria-label", `Supprimer ${map.name}`);
      remove.onclick = async () => {
        remove.disabled = true;
        try {
          await client.deleteMap(map.id);
          await refresh();
        } catch (error) {
          status.textContent = error.message;
          remove.disabled = false;
        }
      };
      row.append(choose, remove);
      list.append(row);
    }
  }
  toggle.onclick = async () => {
    if (!panel.hidden) return hide();
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    save.disabled = busy || !canEdit();
    status.textContent = "Chargement…";
    try {
      await refresh();
      status.textContent =
        "Choisissez une carte pour afficher son tracé, puis validez la zone.";
    } catch (error) {
      status.textContent = error.message;
    }
  };
  close.onclick = hide;
  window.dialog.addEventListener("close", () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  });
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      hide();
    }
  });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (busy || !canEdit()) return;
    busy = true;
    save.disabled = true;
    let saved = false;
    try {
      const area = getArea();
      await client.saveMap(input.value, area);
      saved = true;
      await refresh();
      status.textContent =
        "Zone sauvegardée. Préparation du fond 2D… vous pouvez revenir à la carte.";
      await mapClient.prepare(area.polygon);
      status.textContent =
        "Carte sauvegardée, fond 2D disponible sur le serveur.";
      input.value = "";
    } catch (error) {
      status.textContent =
        (saved ? "Zone conservée ; fond 2D à compléter. " : "") + error.message;
    } finally {
      busy = false;
      save.disabled = !canEdit();
    }
  };
  return { refresh };
}
