import { renderArmyFormation, bindArmyFormation } from "./army-formation-view.js";
import { formatInteger } from "./number-format.js";
import { UNIT_RANKS } from "../core/rank-system.js";
const rankLabel = (ranks, id) =>
  ranks.find((rank) => rank.id === id)?.label ?? id;
import { renderUnitTypeIcon } from "./unit-icon.js";
import { renderUnitHealthBar } from "./unit-health-bar.js";
import { renderUnitExperienceBar } from "./unit-experience-bar.js";
// Présente les unités et leurs actions sans modifier l'armée.
export function renderArmyView({ element, game, hero, expandedArmyUnitId }) {
  const authority = game.getHeroAuthority(hero.id);
  element.innerHTML = `<div class="army-list">${
    hero.army.units
      .map((unit) => {
        const definition = game.unitDefinitions.get(unit.typeId);
        const unitName = unit.name ?? definition?.name ?? unit.typeId;
        const stats = definition?.stats;
        const illustration = renderUnitTypeIcon({
          typeId: unit.typeId,
          tags: definition?.tags ?? [],
          range: stats?.range ?? 1,
        });
        const expanded = expandedArmyUnitId === unit.id;
        const officerButtons = [
          ["officer_drill", "Appliquer l’officier (+40 XP)"],
          ["officer_veteran", "Appliquer le capitaine (+80 XP)"],
        ]
          .filter(([id]) => hero.getResourceAmount(id) > 0)
          .map(
            ([id, label]) =>
              `<button type="button" data-apply-officer="${id}" data-officer-unit="${unit.id}">${label}</button>`,
          )
          .join("");
        return `<article class="army-card${expanded ? " is-expanded" : ""}" data-army-unit="${unit.id}" role="button" tabindex="0" aria-expanded="${expanded}" aria-label="${expanded ? "Réduire" : "Afficher les détails de"} ${unitName}"><div class="army-illustration" aria-hidden="true">${illustration}</div><div class="army-card__content"><p class="eyebrow">${rankLabel(UNIT_RANKS, unit.rank)} · niveau ${unit.level}</p><div class="army-card__heading"><h3>${unitName}</h3><span class="army-card__chevron" aria-hidden="true">⌄</span></div>${renderUnitHealthBar(unit)}<div class="army-card__summary"><strong>${formatInteger(unit.combatantCount)}/${unit.maxQuantity} aptes</strong><button type="button" class="army-formation-pick" data-formation-pick="${unit.id}" aria-pressed="false" ${unit.combatantCount <= 0 ? "disabled" : ""} aria-label="Placer cette troupe dans la formation">⠿ Placer</button></div><div class="army-card__details" ${expanded ? "" : "hidden"}><div class="army-card__stats"><div><span>Effectif :</span><strong>${formatInteger(unit.quantity)}/${unit.maxQuantity}</strong></div><div><span>Aptes :</span><strong>${formatInteger(unit.combatantCount)}</strong></div><div><span>Blessés :</span><strong>${formatInteger(unit.woundedCount)}</strong></div><div><span>Expérience :</span><strong>${formatInteger(unit.experience)}</strong></div>${stats ? `<div><span>Attaque :</span><strong>${formatInteger(stats.attack)}</strong></div><div><span>Défense :</span><strong>${formatInteger(stats.defense)}</strong></div><div><span>Vitesse :</span><strong>${formatInteger(stats.speed)}</strong></div>` : ""}</div><div class="army-card__meta"></div><div class="army-card__actions"><fieldset class="army-formation"><legend>Formation de départ</legend><p>Trois positions prêtes · aucune pénalité de veille pour cet essai.</p>${[
          [null, "Réserve"],
          [0, "Gauche"],
          [1, "Centre"],
          [2, "Droite"],
        ]
          .map(
            ([slot, label]) =>
              `<button type="button" data-army-slot="${slot === null ? "reserve" : slot}" data-formation-unit="${unit.id}" aria-pressed="${(unit.battleSlot ?? null) === slot}" ${slot !== null && (unit.combatantCount <= 0 || hero.army.units.some((other) => other.id !== unit.id && other.battleSlot === slot)) ? "disabled" : ""}>${label}</button>`,
          )
          .join(
            "",
          )}</fieldset>${officerButtons}<button type="button" class="disband-unit-button" data-disband-unit="${unit.id}" aria-label="Dissoudre ${unitName}">Dissoudre</button></div></div></div></article>`;
      })
      .join("") || '<p class="text-muted">Aucune unité.</p>'
  }</div>${renderArmyFormation(hero, game)}`;
  element
    .querySelector(".army-card.is-expanded .army-card__details")
    ?.insertAdjacentHTML(
      "afterbegin",
      '<button type="button" class="army-detail-back secondary-button" data-army-back>← Retour aux armées</button>',
    );
  [...element.querySelectorAll(".army-card")].forEach((card, index) => {
    const unit = hero.army.units[index];
    if (!unit) return;
    card
      .querySelector(".army-card__summary")
      ?.insertAdjacentHTML("afterend", renderUnitExperienceBar(unit));
    const stats = game.unitDefinitions.get(unit.typeId)?.stats;
    if (stats)
      card
        .querySelector(".army-card__stats")
        ?.insertAdjacentHTML(
          "beforeend",
          `<div><strong>${formatInteger(stats.morale)}</strong><span>Moral</span></div>`,
        );
    const currentCost = game.getUnitAuthorityCost(unit);
    const nextCost = unit.nextRank
      ? game.getUnitAuthorityCost(unit, unit.nextRank.id)
      : currentCost;
    card
      .querySelector(".army-card__meta")
      ?.insertAdjacentHTML(
        "beforeend",
        `<span>Autorité ${formatInteger(currentCost)}</span>`,
      );
    if (!unit.canPromote) return;
    const allowed =
      authority.used - currentCost + nextCost <= authority.maximum;
    card
      .querySelector(".army-card__actions")
      ?.insertAdjacentHTML(
        "afterbegin",
        `<button type="button" class="promote-unit-button" data-promote-unit="${unit.id}" ${allowed ? "" : "disabled"}>Promouvoir ${rankLabel(UNIT_RANKS, unit.nextRank.id)} · Autorité ${formatInteger(currentCost)} → ${formatInteger(nextCost)}${allowed ? "" : " · insuffisante"}</button>`,
      );
  });
}

export function bindArmyView(element, actions) {
  bindArmyFormation(element, actions);
  element
    .querySelectorAll("[data-army-slot]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        actions.setFormation?.(
          button.dataset.formationUnit,
          button.dataset.armySlot === "reserve"
            ? null
            : Number(button.dataset.armySlot),
        ),
      ),
    );
  element
    .querySelector("[data-army-back]")
    ?.addEventListener("click", () => actions.selectUnit(null));
  element.querySelectorAll("[data-army-unit]").forEach((card) => {
    const toggle = () =>
      actions.selectUnit(
        card.getAttribute("aria-expanded") === "true"
          ? null
          : card.dataset.armyUnit,
      );
    card.addEventListener("click", (event) => {
      if (!event.target.closest("button")) toggle();
    });
    card.addEventListener("keydown", (event) => {
      if (
        (event.key === "Enter" || event.key === " ") &&
        event.target === card
      ) {
        event.preventDefault();
        toggle();
      }
    });
  });
  element
    .querySelectorAll("[data-disband-unit]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        actions.disband(button.dataset.disbandUnit),
      ),
    );
  element
    .querySelectorAll("[data-apply-officer]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        actions.applyOfficer(
          button.dataset.officerUnit,
          button.dataset.applyOfficer,
        ),
      ),
    );
  element
    .querySelectorAll("[data-promote-unit]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        actions.promote(button.dataset.promoteUnit),
      ),
    );
}
