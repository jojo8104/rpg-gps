/** Détecte les entrées et sorties des sites temporaires sans dépendre du DOM. */
export class DynamicSitePresence {
  constructor({ distanceFn, exitMargin = 0 } = {}) {
    if (typeof distanceFn !== "function")
      throw new TypeError("Le calcul de distance est requis.");
    if (!Number.isFinite(exitMargin) || exitMargin < 0)
      throw new RangeError("La marge de sortie doit être positive.");
    this.distanceFn = distanceFn;
    this.exitMargin = exitMargin;
    this.insideIds = new Set();
  }

  update({ position, sites }) {
    if (!Array.isArray(sites))
      throw new TypeError("Les sites doivent être une liste.");
    const events = [];
    const existingIds = new Set(sites.map((site) => site.id));
    for (const id of [...this.insideIds])
      if (!existingIds.has(id)) {
        this.insideIds.delete(id);
        events.push({ type: "SiteExited", siteId: id, reason: "removed" });
      }
    for (const site of sites) {
      const wasInside = this.insideIds.has(site.id);
      const radius = site.interactionRadius + (wasInside ? this.exitMargin : 0);
      const isInside = this.distanceFn(position, site.position) <= radius;
      if (isInside && !wasInside) {
        this.insideIds.add(site.id);
        events.push({ type: "SiteEntered", siteId: site.id });
      } else if (!isInside && wasInside) {
        this.insideIds.delete(site.id);
        events.push({
          type: "SiteExited",
          siteId: site.id,
          reason: "distance",
        });
      }
    }
    return events;
  }
}
