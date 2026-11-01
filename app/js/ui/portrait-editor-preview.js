import { applyPortraitAdjustments } from "./portrait-adjustments.js";
import { parsePortraitEditorState } from "../core/portrait-editor-state.js";
import { renderDialogueView } from "./dialogue-view.js";
const element = document.querySelector("#preview-dialogue");
const editorOrigin = new URL(import.meta.url).origin;
let state;
let lastRenderKey;
function draw(showChoices = state.choices) {
  const conversation = {
    title: state.text.name,
    name: `${state.text.name} · ${state.text.place}`,
    appearance: state.appearance,
    openingLines: [state.text.line],
    options: Array.from({ length: 12 }, (_, i) => ({
      id: `choice-${i}`,
      label: `Choix de contrôle ${i + 1}`,
    })),
  };
  const renderKey = JSON.stringify([
    conversation.appearance,
    state.text,
    showChoices,
  ]);
  if (renderKey !== lastRenderKey) {
    renderDialogueView({
      element,
      conversation,
      lines: conversation.openingLines,
      lineIndex: 0,
      showChoices,
      onAdvance: () => draw(true),
      onChoose: () => draw(false),
      onClose: () => draw(state.choices),
    });
    lastRenderKey = renderKey;
  }
  element.classList.toggle("editor-guides", state.guides);
  element.classList.toggle("editor-transparent", state.transparent);
  applyPortraitAdjustments(element, state);
  parent.postMessage(
    { type: "portrait-editor-ready", message: "Aperçu actualisé" },
    editorOrigin,
  );
}
window.addEventListener("message", (event) => {
  if (
    event.source !== parent ||
    event.origin !== editorOrigin ||
    event.data?.type !== "portrait-editor-preview"
  )
    return;
  try {
    state = parsePortraitEditorState(event.data.state);
    draw();
  } catch {
    parent.postMessage(
      { type: "portrait-editor-error", message: "Réglages incompatibles." },
      editorOrigin,
    );
  }
});
parent.postMessage({ type: "portrait-editor-loaded" }, editorOrigin);
