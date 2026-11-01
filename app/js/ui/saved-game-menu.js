/** Catalogue de résumés serveur ; le chargement ne démarre qu'après un choix explicite. */
export function createSavedGameMenu({
  client,
  onLoaded,
  document = globalThis.document,
}) {
  const dialog = document.createElement("dialog");
  dialog.className = "saved-game-menu";
  dialog.setAttribute("aria-label", "Charger une partie");
  const heading = document.createElement("h2");
  heading.textContent = "Charger une partie";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Fermer";
  close.onclick = () => dialog.close();
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const list = document.createElement("div");
  dialog.append(heading, close, status, list);
  document.body.append(dialog);
  let busy = false,
    revision = 0;
  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    revision++;
  });
  return {
    async open() {
      if (dialog.open) return;
      dialog.showModal();
      const current = ++revision;
      list.replaceChildren();
      status.textContent = "Lecture des sauvegardes serveur…";
      try {
        const { saves } = await client.listSavedGames();
        if (current !== revision) return;
        status.textContent = saves.length
          ? "Choisissez une partie. Le compte organisateur indiqué sera utilisé pour la reprise."
          : "Aucune partie sauvegardée sur ce serveur.";
        for (const save of saves) {
          const row = document.createElement("article");
          const title = document.createElement("h3");
          title.textContent = save.name;
          const details = document.createElement("p");
          details.textContent = `${save.ownerName} · ${new Date(save.savedAt).toLocaleString("fr-FR")} · ${save.playerCount} joueur(s)`;
          const load = document.createElement("button");
          load.type = "button";
          load.textContent = save.ownerAccountId
            ? "Charger"
            : "Compte organisateur indisponible";
          load.disabled = !save.ownerAccountId;
          load.onclick = async () => {
            if (busy) return;
            busy = true;
            close.disabled = true;
            list.querySelectorAll("button").forEach((button) => {
              button.disabled = true;
            });
            status.textContent = "Chargement de la partie…";
            try {
              await client.selectAccount(save.ownerAccountId);
              const result = await client.openSavedGame(save.id);
              onLoaded(result);
              dialog.close();
            } catch (error) {
              status.textContent = error.message;
            } finally {
              busy = false;
              close.disabled = false;
              list.querySelectorAll("button").forEach((button) => {
                button.disabled = button.dataset.unavailable === "true";
              });
            }
          };
          load.dataset.unavailable = String(!save.ownerAccountId);
          row.append(title, details, load);
          list.append(row);
        }
      } catch (error) {
        if (current === revision) status.textContent = error.message;
      }
    },
  };
}
