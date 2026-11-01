// Les intentions narratives restent distinctes des commandes ordinaires des lieux.
export function createScenarioActionController({
  getSession,
  selectChoice,
  openDialogue,
  openBattle,
  prepareInteraction,
  onQuestFeedback,
  onMessage,
  beginAutonomousBattle,
}) {
  async function run(action, locationId) {
    if (
      getSession().game?.questSystemEnabled === false &&
      (/^(repression-|quest-interaction:)/.test(action) ||
        action === "engage-evacuation-vanguard")
    )
      return { handled: true, terminal: true };
    if (action.startsWith("repression-choice:")) {
      await selectChoice(action.slice("repression-choice:".length));
      return { handled: true, terminal: true };
    }
    if (action === "repression-dialogue" || action === "repression-battle") {
      action === "repression-dialogue"
        ? await openDialogue()
        : await openBattle();
      return { handled: true, terminal: true };
    }
    const { game } = getSession();
    if (action.startsWith("quest-interaction:")) {
      if (!game.getLocation(locationId))
        return { handled: true, terminal: true };
      const interactionId = action.slice("quest-interaction:".length);
      prepareInteraction(interactionId);
      const result = await game.dispatchQuestEvent({
        type: "InteractionCompleted",
        interactionId,
        locationId,
      });
      if (result == null) return;
      onMessage(
        result
          ? "Départ enregistré : le bilan des habitants et ressources sauvés sera établi à la capitale."
          : "Cette interaction n'a aucun effet.",
      );
      if (result) await onQuestFeedback(result);
      return { handled: true, terminal: false };
    }
    if (action === "engage-evacuation-vanguard") {
      const vanguard = game.getAutonomousGroup("chaos-column-vanguard");
      if (!vanguard || vanguard.status === "destroyed") {
        onMessage("L’avant-garde a déjà été neutralisée.");
        return { handled: true, terminal: false };
      }
      beginAutonomousBattle(vanguard);
      return { handled: true, terminal: true };
    }
    return { handled: false };
  }
  return { run };
}
