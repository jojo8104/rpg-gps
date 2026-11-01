/** Filtre visuel des petits écarts GPS ; ne valide aucun déplacement de jeu. */
export function hasHeroMoved(previous, next, mode) {
  if (!previous) return false;
  const dy = next[0] - previous[0];
  const dx = next[1] - previous[1];
  if (mode !== "gps") return Math.hypot(dx, dy) > 0.05;
  const latitude = ((previous[0] + next[0]) * Math.PI) / 360;
  const longitudeDelta = ((dx + 540) % 360) - 180;
  const meters = Math.hypot(dy, longitudeDelta * Math.cos(latitude)) * 111320;
  return meters > 0.8;
}
