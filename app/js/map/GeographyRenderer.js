import { MapLayers } from "./MapLayers.js";
import { drawGeographyLines } from "./geography-lines.js";

const COLORS = {
  grass: "#8caa69",
  forest: "#527447",
  water: "#6ba6b2",
  building: "#b4a68d",
};
const ORDER = {
  grass: 0,
  forest: 1,
  water: 2,
  waterway: 3,
  road: 4,
  building: 5,
};

function terrainPattern(ctx, kind) {
  const tile = document.createElement("canvas");
  tile.width = tile.height = 48;
  const brush = tile.getContext("2d");
  brush.fillStyle = COLORS[kind];
  brush.fillRect(0, 0, 48, 48);
  if (kind === "forest") {
    for (const [x, y] of [
      [0, -4],
      [22, -1],
      [9, 12],
      [31, 16],
      [-4, 28],
      [16, 32],
      [38, 36],
    ]) {
      brush.fillStyle = "#3b5435";
      brush.fillRect(x + 1, y + 14, 17, 5);
      brush.fillStyle = "#775a3d";
      brush.fillRect(x + 7, y + 12, 3, 8);
      brush.fillStyle = "#324f36";
      brush.fillRect(x + 2, y + 5, 14, 10);
      brush.fillStyle = "#648553";
      brush.fillRect(x + 5, y, 8, 6);
      brush.fillStyle = "#466d40";
      brush.fillRect(x, y + 9, 18, 4);
      brush.fillStyle = "#84a764";
      brush.fillRect(x + 5, y + 4, 4, 3);
    }
  } else if (kind === "water") {
    brush.fillStyle = "#80b8be";
    brush.fillRect(5, 12, 12, 2);
    brush.fillRect(27, 35, 14, 2);
  } else if (kind === "grass") {
    brush.fillStyle = "#77975c";
    brush.fillRect(7, 10, 2, 4);
    brush.fillRect(9, 12, 2, 3);
    brush.fillRect(33, 32, 3, 2);
  } else if (kind === "building") {
    brush.fillStyle = "#9b8d76";
    for (let y = 0; y < 48; y += 8) brush.fillRect(0, y, 48, 1);
  }
  return ctx.createPattern(tile, "repeat");
}

/** Tuiles Canvas produites sur le mobile ; aucun téléchargement par tuile/zoom. */
export function createGeographyLayer(
  map,
  packageData,
  { fictional = false, clipPolygon = null } = {},
) {
  const features = [...packageData.features].sort(
    (a, b) => ORDER[a.kind] - ORDER[b.kind],
  );
  // Index de rectangles : écarte les géométries hors tuile avant le dessin.
  const indexed = features.map((feature) => {
    const points =
      feature.geometry.type === "Polygon"
        ? feature.geometry.coordinates.flat()
        : feature.geometry.coordinates;
    return {
      feature,
      bounds: L.latLngBounds(points.map(([lng, lat]) => [lat, lng])),
    };
  });
  const Layer = L.GridLayer.extend({
    onAdd(map) {
      L.GridLayer.prototype.onAdd.call(this, map);
      this.cameraUpdate = () => this._update();
      map.on("camerachange", this.cameraUpdate);
    },
    onRemove(map) {
      map.off("camerachange", this.cameraUpdate);
      L.GridLayer.prototype.onRemove.call(this, map);
    },
    _getTiledPixelBounds(center) {
      return (
        map.getCameraPixelBounds?.(this._tileZoom) ??
        L.GridLayer.prototype._getTiledPixelBounds.call(this, center)
      );
    },
    createTile(coords) {
      const canvas = document.createElement("canvas");
      const size = this.getTileSize();
      canvas.width = size.x;
      canvas.height = size.y;
      canvas.setAttribute("aria-hidden", "true");
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#879c61";
      ctx.fillRect(0, 0, size.x, size.y);
      // Texture pixel légère, déterministe à chaque zoom.
      ctx.fillStyle = "#81975c";
      for (let y = 0; y < size.y; y += 16)
        for (let x = 0; x < size.x; x += 16)
          ctx.fillRect(x + ((y / 16) % 2) * 4, y, 3, 2);
      const origin = L.point(coords.x * size.x, coords.y * size.y);
      const tileBounds = L.latLngBounds(
        map.unproject(origin, coords.z),
        map.unproject(origin.add(size), coords.z),
      ).pad(0.1);
      const project = ([lng, lat]) =>
        map.project([lat, lng], coords.z).subtract(origin);
      const patterns = new Map();
      ctx.save();
      if (clipPolygon?.length >= 3) {
        ctx.beginPath();
        clipPolygon.forEach(({ latitude, longitude }, index) => {
          const p = project([longitude, latitude]);
          if (index === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.clip();
      }
      const lines = [];
      for (const { feature, bounds } of indexed) {
        if (!tileBounds.intersects(bounds)) continue;
        const polygon = feature.geometry.type === "Polygon";
        const paths = polygon
          ? feature.geometry.coordinates
          : [feature.geometry.coordinates];
        ctx.beginPath();
        for (const points of paths) {
          points.forEach((point, index) => {
            const p = project(point);
            if (index === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          if (polygon) ctx.closePath();
        }
        if (polygon) {
          if (!patterns.has(feature.kind))
            patterns.set(feature.kind, terrainPattern(ctx, feature.kind));
          ctx.fillStyle = patterns.get(feature.kind);
          ctx.fill("evenodd");
          ctx.strokeStyle =
            feature.kind === "building" ? "#776958" : COLORS[feature.kind];
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          lines.push(feature);
        }
      }
      drawGeographyLines(
        ctx,
        lines,
        project,
        fictional ? 1 : Math.max(0.8, Math.min(4, 2 ** (coords.z - 17))),
      );
      ctx.restore();
      return canvas;
    },
  });
  return new Layer({
    pane: MapLayers.BASE_MAP,
    tileSize: 256,
    keepBuffer: 1,
    updateWhenIdle: true,
    minZoom: fictional ? -10 : 0,
    maxZoom: fictional ? 2 : 20,
    noWrap: true,
    attribution: fictional
      ? ""
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  });
}
