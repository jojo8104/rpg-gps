const ICONS = Object.freeze({
  melee:
    '<path d="M7 5l20 20M23 4l5 5L11 26l-7 2 2-7L23 4Z"/><path d="m5 24 3 3M19 20l7 7"/>',
  ranged:
    '<path d="M9 4c8 5 8 19 0 24M9 4c-5 7-5 17 0 24M4 16h24M23 12l5 4-5 4"/>',
  cavalry:
    '<path d="M8 27c1-7 4-12 9-15l-2-7 7 4 5-1-2 6c3 4 3 9 1 13H8Z"/><path d="M16 20c3 2 6 2 10 1M22 13h.01"/>',
});

export function unitIconKind({ typeId = "", tags = [], range = 1 } = {}) {
  const normalizedId = String(typeId).toLowerCase();
  if (tags.includes("cavalry") || /mounted|caval|horse/.test(normalizedId))
    return "cavalry";
  if (
    tags.includes("ranged") ||
    range > 1 ||
    /archer|ranged/.test(normalizedId)
  )
    return "ranged";
  return "melee";
}

/** Une silhouette SVG commune aux vues Armée et Battle. */
export function renderUnitTypeIcon(unit = {}) {
  const kind = unitIconKind(unit);
  const artwork = {
    militia: "militia-thumbnail.png",
    archer: "archer-thumbnail.png",
  }[String(unit.typeId).toLowerCase()];
  if (artwork)
    return `<img class="unit-art-thumbnail" src="assets/units/${artwork}" alt="" draggable="false">`;
  return `<svg class="unit-type-icon is-${kind}" viewBox="0 0 32 32" aria-hidden="true" focusable="false" data-unit-icon="${kind}">${ICONS[kind]}</svg>`;
}
