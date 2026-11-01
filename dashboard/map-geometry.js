/** Géométrie de présentation uniquement : ne valide aucune action du jeu. */
export function coordinates(position) {
  return position &&
    Number.isFinite(position.latitude) &&
    Number.isFinite(position.longitude)
    ? [position.latitude, position.longitude]
    : null;
}

export function playAreaPoints(party) {
  return (party.playArea?.polygon ?? []).map(coordinates).filter(Boolean);
}

export function mapFramePoints(party) {
  const polygon = playAreaPoints(party);
  const mode = party.coordinateMode ?? party.configuration.positionMode;
  if (mode !== "simulation" && polygon.length >= 3) return polygon;
  return [
    ...party.locations.map((location) => coordinates(location.position)),
    ...party.players.map((player) => coordinates(player.position)),
  ].filter(Boolean);
}

export function isOutsidePlayArea(party, position) {
  if (
    (party.coordinateMode ?? party.configuration.positionMode) === "simulation"
  )
    return false;
  const polygon = playAreaPoints(party);
  const point = coordinates(position);
  if (polygon.length < 3 || !point) return false;
  const [y, x] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
    if (
      Math.abs(cross) < 1e-12 &&
      x >= Math.min(xi, xj) &&
      x <= Math.max(xi, xj) &&
      y >= Math.min(yi, yj) &&
      y <= Math.max(yi, yj)
    )
      return false;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return !inside;
}
