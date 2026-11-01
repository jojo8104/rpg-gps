export function timeWindow(samples, durationMs = 0, endAt = null) {
  if (!samples.length) return [];
  const end = Math.max(
    samples[0].at,
    Math.min(endAt ?? samples.at(-1).at, samples.at(-1).at),
  );
  const start = durationMs > 0 ? end - durationMs : -Infinity;
  return samples.filter((sample) => sample.at >= start && sample.at <= end);
}

export function resourceSeries(samples, locationId) {
  const rows = samples.map((s) => s.locations.find((l) => l.id === locationId));
  const ids = new Set(
    rows.flatMap((row) => [
      ...Object.keys(row?.production ?? {}),
      ...Object.keys(row?.stock ?? {}),
    ]),
  );
  return [...ids].flatMap((id) => [
    {
      id: `production-${id}`,
      resourceId: id,
      name: `${id} · production/cycle`,
      values: rows.map((row) => (row ? (row.production?.[id] ?? 0) : null)),
    },
    {
      id: `stock-${id}`,
      resourceId: id,
      name: `${id} · stock`,
      kind: "column",
      axis: "right",
      values: rows.map((row) => (row?.stock ? (row.stock[id] ?? 0) : null)),
    },
  ]);
}
