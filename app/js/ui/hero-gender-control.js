import { defaultHeroGender } from "../core/hero-gender.js";
import { heroClassName, heroPortrait } from "./hero-appearance.js";

function refreshCard(card, gender, disabled) {
  const classId = card.dataset.heroClass;
  card.dataset.gender = gender ?? defaultHeroGender(classId);
  card.querySelector("img").src = heroPortrait(classId, card.dataset.gender);
  card.querySelector("[data-class-name]").textContent = heroClassName(
    classId,
    card.dataset.gender,
  );
  card.querySelectorAll("[data-hero-gender]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.heroGender === card.dataset.gender),
    );
    button.disabled = disabled;
  });
}

export function selectedHeroGender(root) {
  return root?.querySelector("input:checked")?.closest("[data-hero-class]")
    ?.dataset.gender;
}

export function syncHeroGenderControl(root, gender, disabled = false) {
  root?.querySelectorAll?.("[data-hero-class]").forEach((card) => {
    const selected = card.querySelector("input").checked;
    refreshCard(card, selected ? gender : null, disabled);
  });
}

/** Événements locaux de présentation ; le lobby confirme ensuite le choix officiel. */
export function mountHeroGenderControl(root, onChange) {
  if (!root?.addEventListener) return;
  root.onHeroGenderChange = onChange;
  if (root.dataset.heroGenderMounted) return;
  root.dataset.heroGenderMounted = "true";
  root.addEventListener("click", (event) => {
    const card = event.target.closest("[data-hero-class]");
    if (!card || !root.contains(card)) return;
    const input = card.querySelector('input[type="radio"]');
    if (input.disabled) return;
    const button = event.target.closest("[data-hero-gender]");
    if (button) {
      event.preventDefault();
      if (!input.checked || button.disabled) return;
      refreshCard(card, button.dataset.heroGender, false);
      root.onHeroGenderChange?.(input.value, button.dataset.heroGender);
    } else if (event.target !== input && !event.target.closest("label")) {
      input.click();
    }
  });
}
