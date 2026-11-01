/** Ouverture et fermeture des panneaux organisateur, sans règle de jeu. */
export function createOrganizerConsoleView({ document, root, onOpen }) {
  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "game-organizer-menu";
  menuButton.textContent = "Organisateur";
  menuButton.hidden = true;
  document
    .querySelector("#landscape-tools")
    .insertBefore(menuButton, document.querySelector("#close-game-menu"));
  const returnButton = document.createElement("button");
  returnButton.type = "button";
  returnButton.className = "organizer-return";
  returnButton.textContent = "Retour au jeu";
  returnButton.hidden = true;
  root.prepend(returnButton);

  function closeMenu() {
    document.querySelector("#close-game-menu").click();
  }
  function open() {
    closeMenu();
    root.hidden = false;
    root.querySelector("#lobby-room").hidden = false;
    root.classList.add("is-organizer-console");
    returnButton.hidden = false;
    onOpen();
  }
  function close() {
    document
      .querySelectorAll(
        ".preparation-map-dialog[open], .qr-scanner-dialog[open], .terrain-map-window[open]",
      )
      .forEach((dialog) => dialog.close());
    root.hidden = true;
    root
      .querySelectorAll("[data-room-page], #lobby-room, #lobby-room-footer")
      .forEach((panel) => {
        panel.hidden = true;
      });
    root.classList.remove(
      "is-organizer-console",
      "is-preparation-editor",
      "is-terrain-editor",
    );
    document.querySelector("#setup-screen").hidden = true;
    returnButton.hidden = true;
    closeMenu();
  }
  menuButton.onclick = open;
  returnButton.onclick = close;
  return { menuButton, returnButton, open, close };
}
