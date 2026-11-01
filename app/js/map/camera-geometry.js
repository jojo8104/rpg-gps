/** Projection visuelle du plan de carte ; aucune règle ni position de jeu. */
const radians = (degrees) => (degrees * Math.PI) / 180;
export const MAX_CAMERA_PITCH = 50;
export const normalizeYaw = (value) => ((value % 360) + 360) % 360;
export const clampPitch = (value) =>
  Math.max(0, Math.min(MAX_CAMERA_PITCH, value));
export const cameraDistance = (size) => Math.max(size.x, size.y, 1) * 2;

export function projectCameraPoint(point, { size, yaw = 0, pitch = 0 }) {
  const dx = point.x - size.x / 2,
    dy = point.y - size.y / 2;
  const angle = radians(-yaw),
    tilt = radians(pitch);
  const x = Math.cos(angle) * dx - Math.sin(angle) * dy;
  const y = Math.sin(angle) * dx + Math.cos(angle) * dy;
  const divisor = 1 - (Math.sin(tilt) * y) / cameraDistance(size);
  return {
    x: size.x / 2 + x / divisor,
    y: size.y / 2 + (Math.cos(tilt) * y) / divisor,
    visible: divisor > 0,
  };
}

export function unprojectCameraPoint(point, { size, yaw = 0, pitch = 0 }) {
  const screenX = point.x - size.x / 2,
    screenY = point.y - size.y / 2;
  const angle = radians(-yaw),
    tilt = radians(pitch);
  const y =
    screenY /
    (Math.cos(tilt) + (screenY * Math.sin(tilt)) / cameraDistance(size));
  const x = screenX * (1 - (Math.sin(tilt) * y) / cameraDistance(size));
  return {
    x: size.x / 2 + Math.cos(angle) * x + Math.sin(angle) * y,
    y: size.y / 2 - Math.sin(angle) * x + Math.cos(angle) * y,
  };
}

export function overviewZoom(
  points,
  { size, yaw = 0, pitch = 0, maxZoom = 20, padding = 24 },
) {
  if (!points.length || size.x < 1 || size.y < 1) return null;
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const center = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
  const margin = Math.min(padding, Math.min(size.x, size.y) / 5);
  const fits = (zoom) =>
    points.every((point) => {
      const p = projectCameraPoint(
        {
          x: size.x / 2 + (point.x - center.x) * 2 ** zoom,
          y: size.y / 2 + (point.y - center.y) * 2 ** zoom,
        },
        { size, yaw, pitch },
      );
      return (
        p.visible &&
        p.x >= margin &&
        p.x <= size.x - margin &&
        p.y >= margin &&
        p.y <= size.y - margin
      );
    });
  let low = -20,
    high = maxZoom;
  for (let index = 0; index < 48; index++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return { zoom: Math.floor(low * 4) / 4, center };
}

export function twoPointerGesture(first, second) {
  return {
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
    angle: (Math.atan2(second.y - first.y, second.x - first.x) * 180) / Math.PI,
  };
}

/** Marge de navigation : laisse chaque frontière atteindre le centre de l'écran. */
export function navigationBounds(points, frame, zoom) {
  const { size } = frame;
  const corners = [
    { x: 0, y: 0 },
    { x: size.x, y: 0 },
    { x: size.x, y: size.y },
    { x: 0, y: size.y },
  ].map((point) => unprojectCameraPoint(point, frame));
  // Leaflet contraint le viewport plat ; couvrir également le plan incliné.
  const marginX =
    (1.25 *
      Math.max(size.x / 2, ...corners.map((p) => Math.abs(p.x - size.x / 2)))) /
    2 ** zoom;
  const marginY =
    (1.25 *
      Math.max(size.y / 2, ...corners.map((p) => Math.abs(p.y - size.y / 2)))) /
    2 ** zoom;
  return [
    {
      x: Math.min(...points.map((p) => p.x)) - marginX,
      y: Math.min(...points.map((p) => p.y)) - marginY,
    },
    {
      x: Math.max(...points.map((p) => p.x)) + marginX,
      y: Math.max(...points.map((p) => p.y)) + marginY,
    },
  ];
}
