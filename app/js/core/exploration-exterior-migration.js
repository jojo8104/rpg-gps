import { closeExceptionalSiteState } from "./exceptional-site-closure.js";
/** Clôture les anciens sites intérieurs sans déplacer les cartes ni rejouer de tirage. */
export function retireInteriorExceptionalSites(state) {
  const suppressed = new Set(
    state.cells
      .filter((cell) => cell.suppressedByLocationIds.length)
      .map((cell) => cell.id),
  );
  const retired = new Set();
  for (const site of state.sites) {
    if (
      site.status !== "active" ||
      (!site.hostLocationId && !suppressed.has(site.cellId))
    )
      continue;
    closeExceptionalSiteState(
      state,
      site.id,
      {
        eventId: "exterior-only-migration",
        at: state.generation?.generatedAt ?? 0,
        reason: "interior-sites-removed",
      },
      "disappeared",
      { announce: false },
    );
    retired.add(site.id);
  }
  for (const clue of state.clues) {
    if (retired.has(clue.siteId) && clue.status === "active")
      clue.status = "obsolete";
  }
  return retired.size;
}
