export function normalizeHeading(value) {
  if (!Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

export function headingFromOrientation(
  { webkitCompassHeading, alpha, absolute = false },
  screenAngle = 0,
) {
  if (Number.isFinite(webkitCompassHeading))
    return normalizeHeading(webkitCompassHeading);
  if (absolute && Number.isFinite(alpha))
    return normalizeHeading(360 - alpha + screenAngle);
  return null;
}

export function smoothHeading(previous, next, factor = 0.25) {
  const target = normalizeHeading(next);
  if (target === null) return previous;
  if (!Number.isFinite(previous)) return target;
  const delta = ((target - previous + 540) % 360) - 180;
  return normalizeHeading(previous + delta * factor);
}
