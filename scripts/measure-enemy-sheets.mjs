import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { AUTONOMOUS_GROUP_ARCHETYPES } from "../app/js/core/autonomous-group-catalog.js";

// Lecture PNG RGBA 8 bits pour mesurer les poses, sans retoucher les images.
function measure(path) {
  const png = readFileSync(path),
    chunks = [];
  const width = png.readUInt32BE(16),
    height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0)
    throw Error("PNG RGBA 8 bits non entrelacé requis");
  for (let i = 8; i < png.length; ) {
    const size = png.readUInt32BE(i);
    if (png.toString("ascii", i + 4, i + 8) === "IDAT")
      chunks.push(png.subarray(i + 8, i + 8 + size));
    i += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)),
    stride = width * 4;
  let previous = Buffer.alloc(stride),
    offset = 0;
  const bounds = [0, 1].map(() => ({
    x: width,
    y: height,
    right: 0,
    bottom: 0,
  }));
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[offset++],
      row = Buffer.from(raw.subarray(offset, offset + stride));
    offset += stride;
    if (filter > 4) throw Error("Filtre PNG inconnu");
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? row[i - 4] : 0,
        b = previous[i],
        c = i >= 4 ? previous[i - 4] : 0;
      row[i] =
        (row[i] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]) &
        255;
    }
    for (let x = 0; x < width; x++)
      if (row[x * 4 + 3] > 128) {
        const b = bounds[x < width / 2 ? 0 : 1];
        b.x = Math.min(b.x, x);
        b.y = Math.min(b.y, y);
        b.right = Math.max(b.right, x);
        b.bottom = Math.max(b.bottom, y);
      }
    previous = row;
  }
  return {
    width,
    height,
    poses: bounds.map((b) => ({
      x: b.x,
      y: b.y,
      width: b.right - b.x + 1,
      height: b.bottom - b.y + 1,
    })),
  };
}
const sheets = Object.fromEntries(
  AUTONOMOUS_GROUP_ARCHETYPES.map((entry) => [
    entry.id,
    measure(new URL(`../app/assets/groups/${entry.sprite}`, import.meta.url)),
  ]),
);
writeFileSync(
  new URL("../app/js/map/enemy-group-sheets.js", import.meta.url),
  "export const ENEMY_GROUP_SHEETS = " +
    JSON.stringify(sheets, null, 2) +
    ";\n",
);
console.log("Six planches mesurées, pixels et transparence conservés.");
