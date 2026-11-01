const formatSize = (value) =>
  Number.isFinite(value)
    ? value >= 1048576
      ? `${(value / 1048576).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} Mio`
      : `${(value / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Kio`
    : "—";
/** Administration des sauvegardes ; les suppressions sont validées et persistées côté serveur. */
export function mountSavedGames(
  root,
  { api, confirmAction = (message) => confirm(message) },
) {
  const title = document.createElement("h2");
  title.textContent = "Parties sauvegardées";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.textContent = "Actualiser les sauvegardes";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "saved-games-table-wrap";
  root.append(title, refresh, status, list);
  let authenticated = false,
    busy = false,
    revision = 0;
  async function load() {
    if (!authenticated || busy) return;
    const current = revision;
    busy = true;
    refresh.disabled = true;
    status.textContent = "Lecture des sauvegardes…";
    try {
      const { saves } = await api("/api/dashboard/saves");
      if (current !== revision) return;
      list.replaceChildren();
      status.textContent = saves.length
        ? `${saves.length} sauvegarde(s). Leur suppression conserve les parties déjà chargées et les comptes.`
        : "Aucune partie sauvegardée.";
      const table = document.createElement("table");
      table.className = "saved-games-table";
      const caption = document.createElement("caption");
      caption.textContent = "Sauvegardes de parties sur le serveur";
      const head = document.createElement("thead");
      const headings = document.createElement("tr");
      for (const label of [
        "Partie",
        "Organisateur",
        "Date",
        "Joueurs",
        "Taille JSON",
        "Action",
      ]) {
        const cell = document.createElement("th");
        cell.textContent = label;
        cell.setAttribute("scope", "col");
        if (label === "Taille JSON")
          cell.title =
            "Taille UTF-8 de la sauvegarde sérialisée ; les sauvegardes sont regroupées dans server-state.json.";
        headings.append(cell);
      }
      head.append(headings);
      const body = document.createElement("tbody");
      table.append(caption, head, body);
      if (saves.length) list.append(table);
      for (const save of saves) {
        const row = document.createElement("tr");
        for (const value of [
          save.name,
          save.ownerName,
          new Date(save.savedAt).toLocaleString("fr-FR"),
          `${save.playerCount} · ${save.players.map((p) => p.name).join(", ")}`,
          formatSize(save.sizeBytes),
        ]) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        }
        const action = document.createElement("td");
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Supprimer la sauvegarde";
        remove.onclick = async () => {
          if (
            busy ||
            !authenticated ||
            !confirmAction(
              `Supprimer définitivement la sauvegarde « ${save.name} » ? Les parties déjà chargées et les comptes seront conservés.`,
            )
          )
            return;
          busy = true;
          remove.disabled = refresh.disabled = true;
          let errorMessage = "";
          try {
            await api(`/api/dashboard/save?id=${encodeURIComponent(save.id)}`, {
              method: "DELETE",
              headers: { "X-Dashboard-Confirm": save.id },
            });
          } catch (error) {
            errorMessage = error.message;
          } finally {
            busy = false;
            if (current === revision) {
              await load();
              if (errorMessage) status.textContent = errorMessage;
            }
          }
        };
        action.append(remove);
        row.append(action);
        body.append(row);
      }
    } catch (error) {
      if (current === revision) status.textContent = error.message;
    } finally {
      busy = false;
      if (current === revision) refresh.disabled = false;
    }
  }
  refresh.onclick = load;
  return {
    load,
    setAuthenticated(value) {
      if (authenticated === value) return;
      authenticated = value;
      revision++;
      list.replaceChildren();
      status.textContent = value
        ? "Ouvrez cet onglet pour consulter les sauvegardes."
        : "Connexion requise.";
    },
  };
}
