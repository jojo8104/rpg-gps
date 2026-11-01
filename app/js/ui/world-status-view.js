/** État des panneaux et libellés des indicateurs de terrain. */
export function isManagementOpen({ ui, document }) {
  return (
    (!ui.sheet.hidden && !ui.sheet.classList.contains("location-tab")) ||
    Boolean(document.querySelector("dialog[open]")) ||
    Boolean(
      document.querySelector(
        ".view.is-active:not(#map-view):not(#battle-view)",
      ),
    )
  );
}
export function renderGpsAccuracySummary({
  gpsAccuracyLog,
  gpsAccuracyStatus,
}) {
  const summary = gpsAccuracyLog.getSummary();
  gpsAccuracyStatus.textContent = summary.count
    ? `Journal GPS · ${summary.count} relevé(s) · moyenne ±${Math.round(summary.average)} m · min ${Math.round(summary.minimum)} m · max ${Math.round(summary.maximum)} m`
    : "Journal GPS : aucun relevé.";
}
export function renderWorldStatus({ ui, $, session, mapFrame }) {
  const territoryStatus = $("#territory-status");
  if (territoryStatus) {
    const territory = session.game.territoryState?.view;
    territoryStatus.hidden = !territory;
    if (territory) {
      const participant = session.game.setup.participants.find((p) => p.playerId === session.localPlayerId);
      const teamId = participant?.teamId ?? `player:${session.localPlayerId}`;
      const occupation = Math.round((territory.occupation?.[teamId] ?? 0) * 100);
      const progress = territory.progress?.[session.localPlayerId];
      territoryStatus.textContent = `Territoire de l’équipe : ${occupation} %` +
        (progress?.contested ? " · Conquête bloquée : présence adverse" :
          progress?.capturing ? ` · Conquête : ${progress.seconds}/${progress.requiredSeconds} s` : "");
    }
  }
  ui.sitesStatus.textContent = `${session.game.battleSites.length} trace(s) de bataille · ${mapFrame.dynamicSites.length} visible(s)`;
  $("#grid-status").textContent = session.playAreaGrid
    ? `${session.playAreaGrid.cells.length} cellule(s) · ${session.playAreaGrid.cells.filter((cell) => cell.visits > 0).length} visitée(s) · ${session.playAreaGrid.cells.reduce((sum, cell) => sum + cell.visits, 0)} passage(s)`
    : "Aucune grille.";
}
