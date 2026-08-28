export function renderDialogueView({
  element,
  conversation,
  lines,
  lineIndex,
  showChoices,
  onAdvance,
  onChoose,
  onClose,
}) {
  const currentLine = lines[lineIndex] ?? "";
  element.hidden = false;
  element.innerHTML = `
    <div class="dialogue-art" style="background-image:url('${escapeAttribute(conversation.portrait ?? "")}')" role="img" aria-label="${escapeAttribute(conversation.name)}"></div>
    <div class="dialogue-vignette"></div>
    <header class="dialogue-header">
      <div><small>${escapeHtml(conversation.title)}</small><strong>${escapeHtml(conversation.name)}</strong></div>
      <button type="button" class="dialogue-close" aria-label="Quitter la conversation">×</button>
    </header>
    <section class="dialogue-panel" aria-live="polite">
      ${
        showChoices
          ? `
        <p class="dialogue-prompt">Que souhaitez-vous demander ?</p>
        <div class="dialogue-choices">${conversation.options.map((option) => `<button type="button" data-dialogue-option="${escapeAttribute(option.id)}">${escapeHtml(option.label)}</button>`).join("") || '<button type="button" data-dialogue-close>Prendre congé</button>'}</div>
      `
          : `
        <p class="dialogue-speaker">${escapeHtml(conversation.name)}</p>
        <button type="button" class="dialogue-line" aria-label="Continuer le dialogue">
          <span>${escapeHtml(currentLine)}</span>
          <i>${lineIndex + 1 < lines.length ? "Continuer" : "Choisir une réponse"} ›</i>
        </button>
      `
      }
    </section>`;
  element.querySelector(".dialogue-close")?.addEventListener("click", onClose);
  element
    .querySelector("[data-dialogue-close]")
    ?.addEventListener("click", onClose);
  element.querySelector(".dialogue-line")?.addEventListener("click", onAdvance);
  element
    .querySelectorAll("[data-dialogue-option]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        onChoose(button.dataset.dialogueOption),
      ),
    );
}

export function closeDialogueView(element) {
  element.hidden = true;
  element.innerHTML = "";
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
