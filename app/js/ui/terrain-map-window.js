/** Agrandit l’éditeur existant sans recréer la carte ni perdre son brouillon. */
export function createTerrainMapWindow(root, { onResize } = {}) {
  const dialog = document.createElement("dialog");
  dialog.className = "terrain-map-window";
  dialog.setAttribute("aria-labelledby", "terrain-map-window-title");
  const header = document.createElement("header");
  const title = document.createElement("h2");
  title.id = "terrain-map-window-title";
  title.textContent = "Votre terrain";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Fermer";
  close.onclick = () => dialog.close();
  header.append(title, close);
  const hint = document.createElement("p");
  hint.textContent =
    "Ajoutez au moins 3 points. Glissez un point pour le déplacer.";
  const status = document.createElement("p");
  status.className = "terrain-map-window-status";
  status.setAttribute("role", "status");
  const controls = root.querySelector("#lobby-terrain-position-controls");
  const open = root.querySelector("#lobby-terrain-open");
  controls.before(open);
  const actions = root.querySelector("#lobby-terrain-edit-actions");
  const extra = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Options du tracé";
  extra.append(summary);
  for (const id of [
    "lobby-exclusion-start",
    "lobby-exclusion-finish",
    "lobby-exclusion-clear",
    "lobby-terrain-clear",
  ])
    extra.append(root.querySelector(`#${id}`));
  const undo = root.querySelector("#lobby-terrain-undo");
  const save = root.querySelector("#lobby-terrain-save");
  actions.append(undo, extra, save);
  dialog.append(
    header,
    hint,
    controls,
    root.querySelector("#lobby-terrain-map"),
    status,
    actions,
  );
  root.append(dialog);
  dialog.addEventListener("close", () => {
    open.focus();
  });
  return {
    dialog,
    header,
    open() {
      if (!dialog.open) dialog.showModal();
      onResize?.();
    },
    close() {
      if (dialog.open) dialog.close();
    },
    setStatus(message) {
      const parts = message.split(" · ");
      status.textContent = [
        ...new Set([
          parts[0],
          parts.find((part) => /m²$/.test(part)),
          parts.at(-1),
        ]),
      ]
        .filter(Boolean)
        .join(" · ");
      status.title = message;
    },
  };
}
