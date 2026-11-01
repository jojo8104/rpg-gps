/** Deux passes par réseau : les contours ne recoupent plus le centre des tronçons. */
export function drawGeographyLines(ctx, features, project, scale) {
  for (const kind of ["waterway", "road"])
    for (const inner of [false, true])
      for (const feature of features.filter((item) => item.kind === kind)) {
        const path = ["path", "footway", "track", "steps"].includes(
          feature.subtype,
        );
        ctx.beginPath();
        feature.geometry.coordinates.forEach((point, index) => {
          const p = project(point);
          if (index === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle =
          kind === "road"
            ? inner
              ? "#c5b285"
              : "#76684e"
            : inner
              ? "#6ba6b2"
              : "#4b8a9b";
        ctx.lineWidth = (inner ? (path ? 1.5 : 4.5) : path ? 3 : 7) * scale;
        ctx.stroke();
      }
}
