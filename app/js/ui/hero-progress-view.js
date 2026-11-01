import { formatInteger } from "./number-format.js";
import { HERO_COMMAND_RANKS } from "../core/rank-system.js";
// Le contrôleur décide si le choix peut être validé avant de fermer la fenêtre.
export function openHeroProgressView({ hero, progress, pending, onChoose }) {
  const statLabels = {
    attack: "Attaque",
    defense: "Défense",
    morale: "Moral",
    mobility: "Mobilité",
    command: "Commandement",
    health: "Points de vie",
  };
  const grade = pending?.gradeUnlocked
    ? HERO_COMMAND_RANKS.find((item) => item.id === pending.gradeUnlocked)
    : null;
  const dialog = document.createElement("dialog");
  dialog.className = "hero-progress-dialog";
  const content = pending
    ? `<p class="eyebrow">LvL ${pending.level}</p><h2>LEVEL UP</h2><div class="level-up-summary">${grade ? `<p>(Nouveau grade : ${grade.label})</p>` : ""}<strong>Autorité +${pending.authorityIncrease ?? 1}</strong><strong>${statLabels[pending.statIncrease.stat] ?? pending.statIncrease.stat} +${formatInteger(pending.statIncrease.amount)}</strong></div><h3>Choisir une amélioration</h3><div class="level-up-options">${pending.proposals.map((proposal) => `<button type="button" data-level-up="${pending.id}" data-upgrade="${proposal.id}"><strong>${proposal.name} · ${proposal.rank}</strong><span>${proposal.description}</span><small>${proposal.type} · ${proposal.scope}</small></button>`).join("")}</div>`
    : `<p class="eyebrow">LvL ${hero.level}</p><h2>Progression du héros</h2><p>${progress.maximumLevelReached ? "LvL max" : `${formatInteger(progress.currentLevelXp)}/${formatInteger(progress.xpToNextLevel)} XP avant le prochain niveau.`}</p>`;
  dialog.innerHTML = `<form method="dialog" class="hero-progress-dialog__panel"><button class="sheet-close" value="close" aria-label="Fermer">Fermer</button>${content}</form>`;
  document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  let submitting = false;
  dialog.querySelectorAll("[data-level-up]").forEach((button) =>
    button.addEventListener("click", async () => {
      if (submitting) return;
      submitting = true;
      const choices = dialog.querySelectorAll("[data-level-up]");
      choices.forEach((choice) => {
        choice.disabled = true;
      });
      try {
        if (
          !(await onChoose({
            pendingId: button.dataset.levelUp,
            upgradeId: button.dataset.upgrade,
            label: button.querySelector("strong").textContent,
          }))
        )
          return;
        dialog.close();
      } finally {
        submitting = false;
        choices.forEach((choice) => {
          choice.disabled = false;
        });
      }
    }),
  );
  dialog.showModal();
  return {
    close: () => {
      dialog.close();
      dialog.remove();
    },
  };
}
