const EARTH_RADIUS_METERS = 6_371_000;

export function distanceMeters(first, second) {
  validatePosition(first);
  validatePosition(second);
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const latitudeA = toRadians(first.latitude);
  const latitudeB = toRadians(second.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function validatePosition(position) {
  if (position === null || Array.isArray(position) || typeof position !== "object" || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude) || position.latitude < -90 || position.latitude > 90 || position.longitude < -180 || position.longitude > 180) {
    throw new RangeError("La position GPS est invalide.");
  }
}
