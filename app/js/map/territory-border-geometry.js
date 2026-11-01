/** Géométrie d'affichage uniquement : aucun changement des cellules officielles. */
export function territoryOverlayGeometry(edges, simulation = false) {
  if (!edges.length) return null;
  const points = edges.flatMap((edge) => edge.points);
  const south = Math.min(...points.map((p) => p.latitude));
  const north = Math.max(...points.map((p) => p.latitude));
  const west = Math.min(...points.map((p) => p.longitude));
  const east = Math.max(...points.map((p) => p.longitude));
  const spanX = Math.max(east - west, 0.000001),
    spanY = Math.max(north - south, 0.000001);
  const cosine = simulation
    ? 1
    : Math.max(0.01, Math.cos(((north + south) * Math.PI) / 360));
  const scale = 960 / Math.max(spanX * cosine, spanY);
  const width = spanX * cosine * scale + 64,
    height = spanY * scale + 64;
  const project = (p) => ({
    x: 32 + (p.longitude - west) * cosine * scale,
    y: 32 + (north - p.latitude) * scale,
  });
  const byTeam = new Map();
  for (const edge of edges) {
    for (const teamId of [edge.teamId, edge.otherTeamId].filter(Boolean)) {
      const list = byTeam.get(teamId) ?? [];
      list.push(edge.points.map(project));
      byTeam.set(teamId, list);
    }
  }
  return {
    width,
    height,
    bounds: [
      [south - 32 / scale, west - 32 / (scale * cosine)],
      [north + 32 / scale, east + 32 / (scale * cosine)],
    ],
    groups: [...byTeam].map(([teamId, segments]) => ({
      teamId,
      paths: joinSegments(segments).map((loop) => roundedPath(loop)),
    })),
  };
}

export function joinSegments(segments) {
  const key = (p) => `${p.x.toFixed(5)}:${p.y.toFixed(5)}`;
  const adjacency = new Map();
  segments.forEach((segment, index) =>
    segment.forEach((point) => {
      const list = adjacency.get(key(point)) ?? [];
      list.push(index);
      adjacency.set(key(point), list);
    }),
  );
  const used = new Set(),
    paths = [];
  segments.forEach((segment, index) => {
    if (used.has(index)) return;
    used.add(index);
    const path = [...segment];
    while (key(path.at(-1)) !== key(path[0])) {
      const end = path.at(-1);
      const nextIndex = adjacency.get(key(end))?.find((id) => !used.has(id));
      if (nextIndex === undefined) break;
      used.add(nextIndex);
      const next = segments[nextIndex];
      path.push(key(next[0]) === key(end) ? next[1] : next[0]);
    }
    paths.push(path);
  });
  return paths;
}

export function roundedPath(points, radius = 14) {
  const equal = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.00001;
  const closed = points.length > 2 && equal(points[0], points.at(-1));
  if (!closed)
    return points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const vertices = points.slice(0, -1).filter((p, index, all) => {
    const prev = all[(index + all.length - 1) % all.length],
      next = all[(index + 1) % all.length];
    return (
      Math.abs(
        (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x),
      ) > 0.00001
    );
  });
  if (vertices.length < 3) return "";
  const corners = vertices.map((p, index) => {
    const prev = vertices[(index + vertices.length - 1) % vertices.length],
      next = vertices[(index + 1) % vertices.length];
    const before = Math.hypot(prev.x - p.x, prev.y - p.y),
      after = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, before * 0.3, after * 0.3);
    return {
      p,
      start: {
        x: p.x + ((prev.x - p.x) * r) / before,
        y: p.y + ((prev.y - p.y) * r) / before,
      },
      end: {
        x: p.x + ((next.x - p.x) * r) / after,
        y: p.y + ((next.y - p.y) * r) / after,
      },
    };
  });
  return (
    `M${corners[0].start.x},${corners[0].start.y} ` +
    corners
      .map(
        (c, i) =>
          `${i ? `L${c.start.x},${c.start.y} ` : ""}Q${c.p.x},${c.p.y} ${c.end.x},${c.end.y}`,
      )
      .join(" ") +
    " Z"
  );
}
