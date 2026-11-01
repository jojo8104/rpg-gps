/** Dimensions partagées de la grille affichée dans le jeu et la supervision. */
export function playAreaCellSizeMeters(mode, playArea = null) {
  let size = mode === "simulation" ? 15_000 : 15;
  if (!playArea) return size;
  const latitudes = playArea.polygon.map((point) => point.latitude);
  const longitudes = playArea.polygon.map((point) => point.longitude);
  const height = (Math.max(...latitudes) - Math.min(...latitudes)) * 111_320;
  const averageLatitude =
    latitudes.reduce((sum, value) => sum + value, 0) / latitudes.length;
  const width =
    (Math.max(...longitudes) - Math.min(...longitudes)) *
    111_320 *
    Math.max(0.01, Math.cos((averageLatitude * Math.PI) / 180));
  // Même limite que PlayAreaGrid, y compris pour les aires fictives provisoires.
  while (Math.ceil(height / size) * Math.ceil(width / size) > 20_000)
    size *= Math.max(
      1.01,
      Math.sqrt((Math.ceil(height / size) * Math.ceil(width / size)) / 20_000),
    );
  return size;
}
