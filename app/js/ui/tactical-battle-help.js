export function tacticalBattleHelp() {
  return `<dialog class="tactics-help" data-tactics-help aria-labelledby="tactics-help-title"><header><h2 id="tactics-help-title">Comment jouer</h2><button type="button" data-tactics-help-close aria-label="Fermer la notice">×</button></header><p>Sélectionne une carte dans les réserves, puis une case de départ. Sur le terrain, touche une unité puis une destination ou une cible. Touche à nouveau l’unité pour ses techniques.</p><p>Les chiffres et flèches montrent l’ordre d’exécution. Les deux camps jouent simultanément chaque numéro. ✓ valide les ordres ; sans ordre, il fait tenir les positions et passe le tour.</p><p>Les pertes flottantes indiquent les PV perdus, les nouveaux blessés en orange et les morts en rouge. La barre sous le sprite montre les soldats aptes et blessés.</p><p>Un bonus est capturé en restant sur sa case après l’ordre. Attaque et défense durent jusqu’à la fin du tour suivant ; le harcèlement ne capture pas.</p><p>Forêt, colline et rochers : déplacements d’une case et vitesse réduite pendant le déplacement. L’eau réduit la défense de 75 %, sauf sur un pont ; l’infanterie lourde exige un pont.</p><p>Une destination contestée revient au seul survivant opérationnel. Si les deux survivent, chacun reste à son point de départ.</p></dialog>`;
}
export function bindTacticalBattleHelp(element) {
  const dialog = element.querySelector("[data-tactics-help]");
  element
    .querySelector("[data-tactics-info]")
    ?.addEventListener("click", () => dialog?.showModal());
  element
    .querySelector("[data-tactics-help-close]")
    ?.addEventListener("click", () => dialog?.close());
}
