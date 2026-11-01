export const EXPLORATION_ANNOUNCEMENT_DELAY_MS = 5 * 60_000;

/** File persistante ; aucune temporisation ou décision dans le navigateur. */
export function scheduleDisappearanceAnnouncement(state, site) {
  if (
    site.status !== "disappeared" ||
    state.announcements.some((entry) => entry.siteId === site.id)
  )
    return false;
  const kind = { treasure: "trésor", artifact: "artefact", dungeon: "donjon" }[
    site.type
  ];
  const name =
    site.name ??
    `${kind[0].toUpperCase()}${kind.slice(1)} ${state.sites.indexOf(site) + 1}`;
  state.announcements.push({
    id: `disappearance-${site.id}`,
    siteId: site.id,
    name,
    message: `${site.type === "artifact" ? "L’artefact" : `Le ${kind}`} « ${name} » a été découvert par un explorateur.`,
    dueAt: site.resolution.at + EXPLORATION_ANNOUNCEMENT_DELAY_MS,
    publishedAt: null,
  });
  return true;
}

/** Une victoire est annoncée immédiatement, sans position ni identité du vainqueur. */
export function scheduleVictoryAnnouncement(state, site) {
  if (
    site.status !== "won" ||
    state.announcements.some((entry) => entry.siteId === site.id)
  )
    return false;
  const kind = { treasure: "trésor", artifact: "artefact", dungeon: "donjon" }[
    site.type
  ];
  const name =
    site.name ??
    `${kind[0].toUpperCase()}${kind.slice(1)} ${state.sites.indexOf(site) + 1}`;
  state.announcements.push({
    id: `victory-${site.id}`,
    siteId: site.id,
    name,
    message: `${site.type === "artifact" ? "L’artefact" : `Le ${kind}`} « ${name} » a été remporté.`,
    dueAt: site.resolution.at,
    publishedAt: null,
  });
  return true;
}

export function publishExplorationAnnouncements(state, now) {
  let count = 0;
  for (const entry of state.announcements)
    if (entry.publishedAt === null && entry.dueAt <= now) {
      entry.publishedAt = now;
      count++;
    }
  return count;
}
