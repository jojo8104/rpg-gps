/** Visuel du catalogue, avec le pictogramme conservé pour les objets sans image. */
export function itemVisual(definition) {
  const image = definition?.visual?.icon ?? definition?.image;
  return image
    ? `<img src="${image}" alt="" loading="lazy" decoding="async">`
    : (definition?.icon ?? "◆");
}
