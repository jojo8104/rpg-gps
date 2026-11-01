/** Miniature de présentation du contour, sans calcul de règle ni téléchargement. */
export function mapCardPreview(geometry = [], polygon = null) {
  const rings = polygon
    ? [polygon.map((p) => [p.longitude, p.latitude])]
    : geometry.flatMap((shape) => shape);
  const valid = rings
    .map((ring) =>
      ring.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
    )
    .filter((ring) => ring.length >= 3);
  const points = valid.flat();
  if (!points.length) return null;
  const xs = points.map(([x]) => x),
    ys = points.map(([, y]) => y);
  const minX = Math.min(...xs),
    maxY = Math.max(...ys);
  const width = Math.max(...xs) - minX,
    height = maxY - Math.min(...ys);
  const scale = 80 / Math.max(width, height, 0.000001);
  const offsetX = (100 - width * scale) / 2,
    offsetY = (100 - height * scale) / 2;
  const paths = valid
    .map(
      (ring) =>
        `<polygon points="${ring.map(([x, y]) => `${(offsetX + (x - minX) * scale).toFixed(2)},${(offsetY + (maxY - y) * scale).toFixed(2)}`).join(" ")}"/>`,
    )
    .join("");
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#112b3a"/><path d="M0 25H100M0 50H100M0 75H100M25 0V100M50 0V100M75 0V100" stroke="#244454" stroke-width=".5"/><g fill="#40cbb933" stroke="#63daca" stroke-width="1.5">${paths}</g></svg>`)}`;
}
