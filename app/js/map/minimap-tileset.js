/** Présentation uniquement : la grille et les objets proviennent de l'état officiel. */
export const BIOMES = ["grass", "forest", "hill", "rock", "water"];
export const STRUCTURES = ["bridge", "tower", "barricade", "village"];
// Rectangles normalisés : l'atlas illustré réserve des marges variables aux objets.
const STRUCTURE_RECTS = [
  [0.02, 0.15, 0.57, 0.23],
  [0.64, 0.05, 0.34, 0.41],
  [0.02, 0.64, 0.48, 0.2],
  [0.51, 0.5, 0.48, 0.47],
];
const assets = new URL("../../assets/map/", import.meta.url);

export async function loadMinimapTileset() {
  const load = (file) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Atlas inaccessible : ${file}`));
      image.src = new URL(file, assets).href;
    });
  const [terrain, structures] = await Promise.all([
    load("tileset-v3/terrain.png"),
    load("tileset-v1/structures.png"),
  ]);
  return { terrain, structures };
}

/** Champ continu : les quatre centres voisins déterminent chaque raccord. */
export function biomeCoverage(grid, biome, x, y) {
  const left = Math.floor(x),
    top = Math.floor(y);
  const fx = x - left,
    fy = y - top;
  const at = (col, row) =>
    grid[Math.max(0, Math.min(grid.length - 1, row))][
      Math.max(0, Math.min(grid[0].length - 1, col))
    ] === biome
      ? 1
      : 0;
  return (
    at(left, top) * (1 - fx) * (1 - fy) +
    at(left + 1, top) * fx * (1 - fy) +
    at(left, top + 1) * (1 - fx) * fy +
    at(left + 1, top + 1) * fx * fy
  );
}

function stamp(ctx, atlas, index, columns, rows, x, y, size) {
  const width = atlas.width / columns,
    height = atlas.height / rows;
  ctx.drawImage(
    atlas,
    (index % columns) * width,
    Math.floor(index / columns) * height,
    width,
    height,
    x,
    y,
    size,
    size,
  );
}

export function renderMinimapTileset(
  canvas,
  atlas,
  grid,
  objects = [],
  { size = 64 } = {},
) {
  if (
    !grid.length ||
    !grid[0].length ||
    grid.some(
      (row) =>
        row.length !== grid[0].length ||
        row.some((biome) => !BIOMES.includes(biome)),
    )
  )
    throw new Error("Grille de biomes invalide");
  canvas.width = grid[0].length * size;
  canvas.height = grid.length * size;
  const ctx = canvas.getContext("2d");
  const layer = document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  const brush = layer.getContext("2d", { willReadFrequently: true });
  const mask = document.createElement("canvas");
  mask.width = canvas.width;
  mask.height = canvas.height;
  const maskBrush = mask.getContext("2d");
  for (const [index, biome] of BIOMES.entries()) {
    brush.clearRect(0, 0, layer.width, layer.height);
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[0].length; col++) {
        stamp(brush, atlas.terrain, index, 3, 2, col * size, row * size, size);
      }
    }
    if (index) {
      const pixels = maskBrush.createImageData(mask.width, mask.height);
      const shore =
        biome === "water" ? ctx.createImageData(mask.width, mask.height) : null;
      for (let y = 0; y < mask.height; y++)
        for (let x = 0; x < mask.width; x++) {
          const field = biomeCoverage(
            grid,
            biome,
            (x + 0.5) / size - 0.5,
            (y + 0.5) / size - 0.5,
          );
          const offset = (y * mask.width + x) * 4;
          pixels.data[offset + 3] = Math.round(
            255 * Math.max(0, Math.min(1, (field - 0.43) / 0.14)),
          );
          if (shore) {
            shore.data[offset] = 176;
            shore.data[offset + 1] = 164;
            shore.data[offset + 2] = 116;
            shore.data[offset + 3] = Math.round(
              200 * Math.max(0, 1 - Math.abs(field - 0.46) / 0.09),
            );
          }
        }
      if (shore) {
        maskBrush.putImageData(shore, 0, 0);
        ctx.drawImage(mask, 0, 0);
      }
      maskBrush.putImageData(pixels, 0, 0);
      brush.globalCompositeOperation = "destination-in";
      brush.drawImage(mask, 0, 0);
      brush.globalCompositeOperation = "source-over";
    }
    ctx.drawImage(layer, 0, 0);
  }
  // Ordre explicite de la couche supérieure ; rotation des ponts et barricades.
  for (const object of objects) {
    const index = STRUCTURES.indexOf(object.kind);
    if (index < 0) continue;
    ctx.save();
    ctx.translate((object.col + 0.5) * size, (object.row + 0.5) * size);
    ctx.rotate(((object.rotation ?? 0) * Math.PI) / 180);
    const [x, y, width, height] = STRUCTURE_RECTS[index];
    const sw = width * atlas.structures.width,
      sh = height * atlas.structures.height;
    const scale = size / Math.max(sw, sh);
    ctx.drawImage(
      atlas.structures,
      x * atlas.structures.width,
      y * atlas.structures.height,
      sw,
      sh,
      (-sw * scale) / 2,
      (-sh * scale) / 2,
      sw * scale,
      sh * scale,
    );
    ctx.restore();
  }
}
