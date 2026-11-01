/** Lieux propres aux offres retenues, plus les lieux permanents du monde. */
export function selectedPreparationLocationIds(preparation, catalog) {
  if (catalog.initialLocationSlotIds)
    return new Set(catalog.initialLocationSlotIds);
  const excluded = new Set(preparation?.excludedQuestIds ?? []);
  const affiliated = new Set(
    catalog.quests.flatMap((q) => q.locationIds ?? []),
  );
  const retained = new Set(
    catalog.quests
      .filter((q) => !excluded.has(q.id))
      .flatMap((q) => q.locationIds ?? []),
  );
  return new Set(
    catalog.locations
      .filter((l) => l.permanent || !affiliated.has(l.id) || retained.has(l.id))
      .map((l) => l.id),
  );
}

export function selectedPreparationCatalog(preparation, catalog) {
  const ids = selectedPreparationLocationIds(preparation, catalog);
  return {
    ...catalog,
    locations: catalog.locations.filter((l) => ids.has(l.id)),
  };
}
