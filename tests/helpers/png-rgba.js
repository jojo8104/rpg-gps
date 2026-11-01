import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

/** Décode les PNG RGBA non entrelacés des calques pour vérifier leurs pixels alpha. */
export function readPngRgba(path) {
  const source = readFileSync(path);
  const width = source.readUInt32BE(16);
  const height = source.readUInt32BE(20);
  if (source[24] !== 8 || source[25] !== 6 || source[28] !== 0)
    throw new Error("PNG RGBA 8 bits non entrelacé requis");
  const chunks = [];
  for (let offset = 8; offset < source.length; ) {
    const size = source.readUInt32BE(offset);
    if (source.toString("ascii", offset + 4, offset + 8) === "IDAT")
      chunks.push(source.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const a = x >= 4 ? pixels[index - 4] : 0;
      const b = y ? pixels[index - stride] : 0;
      const c = y && x >= 4 ? pixels[index - stride - 4] : 0;
      let prediction = 0;
      if (filter === 1) prediction = a;
      else if (filter === 2) prediction = b;
      else if (filter === 3) prediction = Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        prediction = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error("Filtre PNG inconnu");
      pixels[index] = (raw[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  return { width, height, pixels };
}
