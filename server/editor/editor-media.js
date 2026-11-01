import { normalizeVisual } from "../../app/js/core/visual-definition.js";
const extensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Lecture des dimensions depuis le fichier, sans faire confiance au navigateur. */
function dimensions(bytes, mime) {
  if (
    mime === "image/png" &&
    bytes.length >= 33 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString("ascii", 12, 16) === "IHDR"
  )
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216) {
    let at = 2;
    while (at + 4 < bytes.length) {
      if (bytes[at++] !== 255) break;
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = bytes.readUInt16BE(at);
      if (length < 2 || at + length > bytes.length) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      )
        return [bytes.readUInt16BE(at + 5), bytes.readUInt16BE(at + 3)];
      at += length;
    }
  }
  if (
    mime === "image/webp" &&
    bytes.length >= 30 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP" &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  ) {
    const kind = bytes.toString("ascii", 12, 16);
    if (kind === "VP8X")
      return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
    if (
      kind === "VP8 " &&
      bytes[23] === 157 &&
      bytes[24] === 1 &&
      bytes[25] === 42
    )
      return [bytes.readUInt16LE(26) & 16383, bytes.readUInt16LE(28) & 16383];
    if (kind === "VP8L" && bytes[20] === 47) {
      const bits = bytes.readUInt32LE(21);
      return [(bits & 16383) + 1, ((bits >>> 14) & 16383) + 1];
    }
  }
  throw new Error("Contenu d’image invalide ou différent du format déclaré.");
}
export function validateProjectMedia(project, error) {
  const images = project.media?.images ?? [],
    normalized = [],
    files = [];
  if (!Array.isArray(images)) {
    error("media.images", "La bibliothèque doit être une liste.");
    return { images: [], files };
  }
  const references = new Set();
  let total = 0;
  for (const [index, image] of images.entries()) {
    try {
      if (
        !image ||
        !/^[a-zA-Z0-9_-]+$/.test(image.id) ||
        typeof image.name !== "string" ||
        image.name.length > 255
      )
        throw new Error("Identifiant ou nom d’image invalide.");
      const ext = extensions[image.mimeType];
      if (
        !ext ||
        typeof image.dataUrl !== "string" ||
        !image.dataUrl.startsWith(`data:${image.mimeType};base64,`)
      )
        throw new Error(
          "Formats acceptés : PNG, JPEG ou WebP encodés en base64.",
        );
      const encoded = image.dataUrl.split(",")[1];
      if (encoded.length > 2_796_204 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
        throw new Error("Image invalide ou supérieure à 2 Mo.");
      const content = Buffer.from(encoded, "base64");
      if (
        content.toString("base64") !== encoded ||
        content.length > 2 * 1024 * 1024
      )
        throw new Error("Encodage ou taille d’image invalide.");
      const [width, height] = dimensions(content, image.mimeType);
      if (width < 1 || height < 1 || width > 4096 || height > 4096)
        throw new Error("Dimensions maximales : 4096 × 4096 pixels.");
      const name = `assets/images/${image.id}.${ext}`;
      if (normalized.some((entry) => entry.id === image.id))
        throw new Error("Identifiant d’image dupliqué.");
      references.add(name);
      total += content.length;
      normalized.push({
        id: image.id,
        name: image.name,
        mimeType: image.mimeType,
        dataUrl: image.dataUrl,
        size: content.length,
        width,
        height,
      });
      files.push({ name, content });
    } catch (issue) {
      error(`media.images.${index}`, issue.message);
    }
  }
  if (total > 8 * 1024 * 1024)
    error("media.images", "La bibliothèque dépasse 8 Mo.");
  const visited = new WeakSet();
  const visit = (value, path) => {
    if (!value || typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    if (value.visual) {
      try {
        for (const ref of Object.values(normalizeVisual(value.visual) ?? {}))
          if (ref.startsWith("assets/") && !references.has(ref))
            error(
              path + ".visual",
              "Image absente de la bibliothèque : " + ref,
            );
      } catch (issue) {
        error(path + ".visual", issue.message);
      }
    }
    for (const [key, entry] of Object.entries(value))
      if (key !== "media") visit(entry, path + "." + key);
  };
  visit(project, "project");
  return { images: normalized, files };
}
