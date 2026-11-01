/** Affiche les seuls messages officiels reçus, une fois par session d’interface. */
export function createExplorationAnnouncementPresenter({ log }) {
  const displayed = new Set();
  return {
    show(view) {
      for (const cell of view?.cells ?? []) {
        const id = `cell:${cell.id}`;
        if (displayed.has(id)) continue;
        displayed.add(id);
        if (cell.resource !== "none")
          log(
            `Gisement découvert : ${{ wood: "bois", stone: "pierre", iron: "fer", gold: "or", "fertile-land": "terre fertile" }[cell.resource] ?? cell.resource} (ligne ${cell.row + 1}, colonne ${cell.column + 1}).`,
          );
      }
      for (const entry of [
        ...(view?.announcements ?? []),
        ...(view?.rumors ?? []),
        ...(view?.rumorPurchases ?? []),
      ]) {
        if (displayed.has(entry.id)) continue;
        displayed.add(entry.id);
        log(entry.message ?? entry.text);
      }
    },
    reset() {
      displayed.clear();
    },
  };
}
