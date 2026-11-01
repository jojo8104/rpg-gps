import { exceptionalSite } from "./exploration-records.js";
import {
  scheduleDisappearanceAnnouncement,
  scheduleVictoryAnnouncement,
} from "./exploration-announcements.js";

export function obsoleteClosedSiteClues(state) {
  const closed = new Set(
    state.sites.filter((s) => s.status !== "active").map((s) => s.id),
  );
  let count = 0;
  for (const clue of state.clues)
    if (clue.status === "active" && closed.has(clue.siteId)) {
      clue.status = "obsolete";
      count++;
    }
  return count;
}
/** Transition terminale unique. Valider avant mutation, conserver la première issue. */
export function closeExceptionalSiteState(
  state,
  siteId,
  resolution,
  status = "disappeared",
  { announce = true } = {},
) {
  const site = state.sites.find((s) => s.id === siteId);
  if (!site || site.status !== "active") return false;
  if (!["won", "disappeared"].includes(status))
    throw new RangeError("Statut de clôture invalide.");
  const validated = exceptionalSite({ ...site, status, resolution });
  if (status === "won" && validated.resolution.expeditionId) {
    const winner = state.expeditions.find(
      (m) => m.id === validated.resolution.expeditionId,
    );
    if (
      !winner ||
      winner.siteId !== site.id ||
      winner.playerId !== validated.resolution.playerId
    )
      throw new RangeError("Expédition gagnante incohérente.");
  }
  site.status = validated.status;
  site.resolution = validated.resolution;
  for (const clue of state.clues)
    if (clue.siteId === siteId && clue.status === "active")
      clue.status = "obsolete";
  if (announce) {
    scheduleDisappearanceAnnouncement(state, site);
    scheduleVictoryAnnouncement(state, site);
  }
  return true;
}
/** Réconciliation sans récompense ni tirage : préparations, trajets et anciens états repris. */
export function reconcileClosedExceptionalSites(game, siteId = null) {
  const state = game.explorationState;
  obsoleteClosedSiteClues(state);
  if (!game.exceptionalSiteResolutionService) return 0;
  const closed = new Map(
    state.sites
      .filter((s) => s.status !== "active" && (!siteId || s.id === siteId))
      .map((s) => [s.id, s]),
  );
  let count = 0;
  for (const mission of state.expeditions) {
    const site = closed.get(mission.siteId);
    if (
      !site ||
      mission.result ||
      !["preparing", "travelling", "resolving"].includes(mission.status) ||
      site.resolution?.expeditionId === mission.id
    )
      continue;
    game.exceptionalSiteResolutionService.abort(mission, "site_unavailable");
    count++;
  }
  return count;
}
export function closeExceptionalSite(
  game,
  siteId,
  resolution,
  status = "disappeared",
  options = {},
) {
  const closed = closeExceptionalSiteState(
    game.explorationState,
    siteId,
    resolution,
    status,
    options,
  );
  // Un rejeu peut également réparer une mission d’une ancienne sauvegarde, sans modifier l’issue.
  if (
    game.explorationState.sites.some(
      (s) => s.id === siteId && s.status !== "active",
    )
  )
    reconcileClosedExceptionalSites(game, siteId);
  return closed;
}
