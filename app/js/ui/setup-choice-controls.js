/** Présente les selects existants comme des cartes, sans changer leurs commandes. */
export function mountSetupChoices(root, selectors) {
  selectors.forEach((selector) => {
    const select = root.querySelector(selector);
    const label = select.closest("label");
    const choices = document.createElement("fieldset");
    choices.className = "setup-choice-grid lobby-setting-choices";
    choices.dataset.choiceSelect = select.id;
    const legend = document.createElement("legend");
    legend.textContent = label.firstChild.textContent.trim();
    choices.append(legend);
    [...select.options].forEach((option) => {
      const card = document.createElement("label");
      card.className = "setup-choice";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `${select.id}-choice`;
      radio.value = option.value;
      radio.addEventListener("change", () => {
        select.value = radio.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const text = document.createElement("strong");
      text.textContent = option.textContent.trim();
      card.append(radio, text);
      choices.append(card);
    });
    label.hidden = true;
    label.before(choices);
  });
  refreshSetupChoices(root);
}

export function refreshSetupChoices(root) {
  root.querySelectorAll("[data-choice-select]").forEach((group) => {
    const select = root.querySelector(`#${group.dataset.choiceSelect}`);
    group.querySelectorAll("input").forEach((radio) => {
      radio.checked = radio.value === select.value;
      radio.disabled = select.disabled;
    });
  });
}
