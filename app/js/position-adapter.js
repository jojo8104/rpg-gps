export function normalizePosition(position, mode) {
  const latitude = Array.isArray(position) ? position[0] : position?.latitude;
  const longitude = Array.isArray(position) ? position[1] : position?.longitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
    throw new TypeError("La position doit contenir des coordonnées valides.");
  return mode === "simulation"
    ? [latitude, longitude]
    : { latitude, longitude };
}
