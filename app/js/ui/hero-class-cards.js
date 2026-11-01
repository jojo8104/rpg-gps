import { defaultHeroGender } from "../core/hero-gender.js";
import { heroPortrait, heroClassName } from "./hero-appearance.js";
import { formatInteger } from "./number-format.js";
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
/** Même fiche de classe pour le test et les parties partagées. Présentation seulement. */
export function heroClassCards(
  heroClasses,
  {
    name = "hero-class",
    selected = heroClasses[0]?.id,
    disabled = false,
    gender = null,
  } = {},
) {
  const statLabels = {
    attack: "Attaque",
    defense: "Défense",
    morale: "Moral",
    mobility: "Mobilité",
    command: "Commandement",
    health: "Santé",
  };
  const maximums = {
    attack: 5,
    defense: 5,
    morale: 5,
    mobility: 5,
    command: 5,
    health: 25,
  };
  return heroClasses
    .map(
      (heroClass) => `
          <div class="hero-class-card" data-hero-class="${escapeHtml(heroClass.id)}" data-gender="${escapeHtml(gender ?? defaultHeroGender(heroClass.id))}">
            <input id="${escapeHtml(name)}-${escapeHtml(heroClass.id)}" type="radio" name="${escapeHtml(name)}" value="${escapeHtml(heroClass.id)}" ${heroClass.id === selected ? "checked" : ""} ${disabled ? "disabled" : ""}>
            <label for="${escapeHtml(name)}-${escapeHtml(heroClass.id)}" class="hero-class-card__portrait" aria-hidden="true"><img src="${heroPortrait(heroClass.id, gender)}" alt=""></label>
            <span class="hero-class-card__body">
              <strong><label for="${escapeHtml(name)}-${escapeHtml(heroClass.id)}" data-class-name>${escapeHtml(heroClassName(heroClass.id, gender ?? defaultHeroGender(heroClass.id), heroClass.name))}</label></strong>
              <span class="hero-gender-control" role="group" aria-label="Genre du héros">${[
                ["female", "Femme"],
                ["male", "Homme"],
              ]
                .map(
                  ([value, label]) =>
                    `<button type="button" data-hero-gender="${value}" aria-pressed="${(gender ?? defaultHeroGender(heroClass.id)) === value}" ${disabled ? "disabled" : ""}>${label}</button>`,
                )
                .join("")}</span>
              <span class="hero-class-card__advantage">${escapeHtml(heroClass.advantage)}</span>
              <span class="hero-class-card__stats">${Object.entries(
                heroClass.baseStats,
              )
                .map(
                  ([id, value]) =>
                    `<span><small>${escapeHtml(statLabels[id] ?? id)}</small><i><b style="width:${Math.round((value / maximums[id]) * 100)}%"></b></i><em>${formatInteger(value)}</em></span>`,
                )
                .join("")}</span>
            </span>
          </div>`,
    )
    .join("");
}

/** Contenu identique du sélecteur, y compris pendant le chargement du catalogue. */
export function heroClassSelection(heroClasses, options = {}) {
  return (
    '<legend class="sr-only">Classe du héros</legend>' +
    (heroClasses.length
      ? heroClassCards(heroClasses, options)
      : '<p class="setup-hint" role="status">Chargement des héros…</p>')
  );
}
