import { applyPortraitAdjustments } from "./portrait-adjustments.js";
import { getItemDefinition } from "../core/item-catalog.js";
import {
  dialoguePortraitMarkup,
  portraitLayersMarkup,
  usesComposedPortrait,
} from "./portrait-view.js";

export function renderDialogueView({
  element,
  conversation,
  lines,
  lineIndex,
  showChoices,
  pending = false,
  feedback = "",
  onAdvance,
  onChoose,
  onClose,
}) {
  const currentLine = lines[lineIndex] ?? "";
  const heading = dialogueHeading(conversation);
  element.hidden = false;
  element.classList?.toggle(
    "dialogue-view--composed",
    usesComposedPortrait(conversation),
  );
  element.innerHTML = `
    ${dialoguePortraitMarkup(conversation, escapeAttribute)}
    <div class="dialogue-vignette"></div>
    <header class="dialogue-header">
      <div>${heading.context ? `<small>${escapeHtml(heading.context)}</small>` : ""}<strong>${escapeHtml(heading.name)}</strong></div>
      <button type="button" class="dialogue-close" aria-label="Quitter la conversation">×</button>
    </header>
    <section class="dialogue-panel" aria-live="polite" aria-busy="${pending}">
      ${feedback ? `<p class="dialogue-feedback" role="status">${escapeHtml(feedback)}</p>` : ""}
      ${
        showChoices
          ? `
        <p class="dialogue-prompt">Que souhaitez-vous demander ?</p>
        <div class="dialogue-choices">${
          conversation.options
            .map((option) => {
              const image =
                option.kind === "equipment"
                  ? getItemDefinition(option.itemId)?.image
                  : null;
              const npc = portraitLayersMarkup(option.appearance);
              return `<button type="button" ${pending ? "disabled" : ""} ${image ? 'class="dialogue-equipment-choice"' : npc ? 'class="dialogue-npc-choice"' : ""} data-dialogue-option="${escapeAttribute(option.id)}">${image ? `<img src="${escapeAttribute(image)}" alt="" loading="lazy" decoding="async"><span>${escapeHtml(option.label)}</span>` : npc ? `<span class="dialogue-npc-portrait">${npc}</span><span>${escapeHtml(option.label)}</span>` : escapeHtml(option.label)}</button>`;
            })
            .join("") ||
          '<button type="button" data-dialogue-close>Prendre congé</button>'
        }</div>
      `
          : `
        <button type="button" class="dialogue-line" ${pending && lineIndex + 1 >= lines.length ? "disabled" : ""} aria-label="Continuer le dialogue">
          <span>${escapeHtml(currentLine)}</span>
          <i>${lineIndex + 1 < lines.length ? "Continuer" : "Choisir une réponse"} ›</i>
        </button>
      `
      }
    </section>`;
  applyPortraitAdjustments(element, conversation.portraitEditor);
  element.querySelector(".dialogue-close")?.addEventListener("click", onClose);
  element
    .querySelector("[data-dialogue-close]")
    ?.addEventListener("click", onClose);
  element.querySelector(".dialogue-line")?.addEventListener("click", onAdvance);
  element
    .querySelectorAll("[data-dialogue-option]")
    .forEach((button) =>
      button.addEventListener(
        "click",
        async () => await onChoose(button.dataset.dialogueOption),
      ),
    );
}

export function closeDialogueView(element) {
  element.hidden = true;
  element.classList?.remove("dialogue-view--composed");
  element.innerHTML = "";
}

/** Un seul lieu et un seul nom, sans répéter le rôle dans le bandeau. */
export function dialogueHeading(conversation) {
  const name = String(conversation.name ?? "");
  const split = name.lastIndexOf(" · ");
  if (split > 0)
    return { context: name.slice(split + 3), name: name.slice(0, split) };
  const title = String(conversation.title ?? "");
  return { context: title === name ? "" : title, name };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttribute(value) {
  return escapeHtml(value);
}
