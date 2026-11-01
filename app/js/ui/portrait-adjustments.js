import {
  parsePortraitEditorState,
  PORTRAIT_EDITOR_GROUPS,
} from "../core/portrait-editor-state.js";

function transform(value) {
  return `translate(${(value.x / 512) * 100}%,${(value.y / 832) * 100}%) scale(${value.scaleX / 100},${value.scaleY / 100})`;
}
export function applyPortraitAdjustments(element, input) {
  if (!input) return;
  let state;
  try {
    state = parsePortraitEditorState(input);
  } catch {
    return;
  }
  if (!element.querySelector?.(".composed-portrait__person")) return;
  const person = element.querySelector(".composed-portrait__person");
  person.style.left = `${50 + state.scene.x}%`;
  person.style.bottom = `${-16 - state.scene.y}%`;
  person.style.transform = `translateX(-50%) scale(${state.scene.scale / 100})`;
  person.style.transformOrigin = "50% 100%";
  for (const image of person.querySelectorAll("[data-portrait-layer]")) {
    const part = image.dataset.portraitLayer;
    const groups = Object.entries(PORTRAIT_EDITOR_GROUPS)
      .filter(([, group]) => group.parts.includes(part))
      .map(([key]) => state.adjustments[key]);
    image.style.transform = groups.map(transform).join(" ");
    image.style.transformOrigin = "50% 35%";
    image.style.opacity =
      image.dataset.portraitBeardPiece === "true"
        ? "1"
        : String(
            groups.reduce(
              (opacity, value) => (opacity * value.opacity) / 100,
              1,
            ),
          );
    image.hidden = groups.some((value) => !value.visible);
  }
}
