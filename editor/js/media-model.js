export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_LIBRARY_BYTES = 8 * 1024 * 1024;
export const IMAGE_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
export const imagePath = (image) =>
  `assets/images/${image.id}.${IMAGE_EXTENSIONS[image.mimeType]}`;
export function imagePreview(project, reference) {
  return (
    (project.media?.images ?? []).find(
      (image) => imagePath(image) === reference,
    )?.dataUrl ?? (reference?.startsWith("/editor-media/") ? reference : "")
  );
}
export function addProjectImage(project, image) {
  if (!IMAGE_EXTENSIONS[image.mimeType])
    throw new Error("Formats acceptés : PNG, JPEG ou WebP.");
  if (image.size > MAX_IMAGE_BYTES)
    throw new Error("Image trop volumineuse : maximum 2 Mo.");
  project.media ??= { images: [] };
  if (
    project.media.images.reduce((total, entry) => total + entry.size, 0) +
      image.size >
    MAX_LIBRARY_BYTES
  )
    throw new Error("La bibliothèque est limitée à 8 Mo par projet.");
  const existing = project.media.images.find(
    (entry) => entry.dataUrl === image.dataUrl,
  );
  if (existing) return existing;
  const entry = { ...image, id: `image-${crypto.randomUUID()}` };
  project.media.images.push(entry);
  return entry;
}
export function removeProjectImage(project, id) {
  const image = project.media?.images.find((entry) => entry.id === id);
  if (!image) return;
  const reference = imagePath(image);
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (value.visual && Object.values(value.visual).includes(reference))
      throw new Error(
        "Cette image est encore utilisée. Choisissez une autre apparence avant de la retirer.",
      );
    Object.values(value).forEach(visit);
  };
  visit(project);
  project.media.images = project.media.images.filter(
    (entry) => entry.id !== id,
  );
}
export function imageArchiveFiles(project) {
  return (project.media?.images ?? []).map((image) => ({
    name: imagePath(image),
    content: Uint8Array.from(atob(image.dataUrl.split(",")[1]), (character) =>
      character.charCodeAt(0),
    ),
  }));
}
