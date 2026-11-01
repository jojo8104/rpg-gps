import { projectCameraPoint } from "./camera-geometry.js";
/** Le point bas varie continûment ; aucun sommet n'est choisi comme ancre. */
export function locationCameraLayout(anchor, frame, scale) {
  const center = projectCameraPoint(anchor, frame);
  const bottom = Math.max(
    ...[
      [-17, -28],
      [17, -28],
      [34, 0],
      [17, 28],
      [-17, 28],
      [-34, 0],
    ].map(
      ([x, y]) =>
        projectCameraPoint(
          { x: anchor.x + x * scale, y: anchor.y + y * scale },
          frame,
        ).y,
    ),
  );
  const point = { ...center, y: center.y + (bottom - center.y) * 0.72 };
  return { point, labelY: 64 + (bottom - point.y) / scale + 6, labelX: 32 };
}
