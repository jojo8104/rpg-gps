import { closeSheet } from "./bottom-sheet.js";
import { formatInteger } from "./number-format.js";
/** Fiches de rencontre : présentation et transmission des intentions du joueur. */
export function createEncounterView({
  ui,
  session,
  beginAutonomousBattle,
  onEncounterChoice,
}) {
  function showGroup(group, snapshot, { attackRange, ownGroup, canAttack }) {
    const names = {
      army:
        snapshot.factionId === "chaos" ? "Armée du Chaos" : "Armée autonome",
      rogue: "Groupe errant",
      convoy: ownGroup ? "Votre convoi" : "Convoi autonome",
      scout: "Éclaireur du poste de guet",
      messenger: ownGroup ? "Votre messager" : "Messager autonome",
      prospecting: ownGroup
        ? "Votre groupe de prospection"
        : "Groupe de prospection",
    };
    const cargo =
      snapshot.occupiedCargoSlots > 0
        ? ` · ${snapshot.occupiedCargoSlots} slot(s) de cargaison`
        : "";
    ui.sheet.hidden = false;
    ui.sheet.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Groupe autonome détecté</span><h2>${names[snapshot.type] ?? "Groupe autonome"}</h2><p>${snapshot.soldiers} soldats${cargo} · distance ${Math.round(snapshot.distance)}${session.mode === "gps" ? " m" : ""}</p>${ownGroup ? '<p class="sheet-feedback">Ce groupe vous appartient.</p>' : `<div class="sheet-actions"><button data-autonomous-attack ${canAttack ? "" : "disabled"}>Attaquer</button></div>${canAttack ? "" : `<p class="sheet-feedback">Approchez-vous à moins de ${formatInteger(attackRange)}${session.mode === "gps" ? " m" : " unités"}.</p>`}`}`;
    ui.sheet.querySelector(".sheet-close").onclick = () => closeSheet(ui.sheet);
    const attackButton = ui.sheet.querySelector("[data-autonomous-attack]");
    if (attackButton)
      attackButton.onclick = async () => await beginAutonomousBattle(group);
  }
  function renderEncounter() {
    ui.sheet.hidden = false;
    ui.sheet.innerHTML = `<button class="sheet-close" type="button">Fermer</button><span class="sheet-state">Rencontre</span><h2>Ennemi détecté</h2><p>${session.currentEncounter.enemy.name}</p><div class="sheet-actions"><button data-encounter="fight">Combattre</button><button class="secondary-button" data-encounter="avoid">Éviter</button></div>`;
    ui.sheet.querySelector(".sheet-close").onclick = () => closeSheet(ui.sheet);
    ui.sheet.querySelectorAll("[data-encounter]").forEach(
      (button) =>
        (button.onclick = async () => {
          await onEncounterChoice(button.dataset.encounter);
        }),
    );
  }
  return { showGroup, showEncounter: renderEncounter };
}
