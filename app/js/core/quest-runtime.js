/** Relie les événements du jeu aux objectifs de la phase active du scénario. */
export class QuestRuntime {
  dispatch(event, game) {
    if (game.scenario === null || game.scenarioState === null) return null;
    const phase = game.scenario.getPhase(game.scenarioState.currentPhaseId);
    const state = game.scenarioState.getCurrentPhaseState();
    const completedObjectiveIds = [];
    const appliedEvents = [];

    phase.objectives.forEach((definition) => {
      const objectiveState = state.objectives.find((objective) => objective.id === definition.id);
      if (objectiveState?.state !== "active" || !this.#matches(definition.trigger, event, game)) return;
      if (!game.completeScenarioObjective(definition.id)) return;
      completedObjectiveIds.push(definition.id);
      if (definition.eventId) {
        const applied = game.triggerScenarioEvent(definition.eventId);
        if (applied) appliedEvents.push(applied);
      }
    });

    if (completedObjectiveIds.length === 0) return null;
    const phaseCompleted = state.objectives.every((objective) => objective.state === "completed");
    let nextPhaseId = null;
    let nextQuestId = null;
    if (phaseCompleted && phase.transitions.length === 1) {
      nextPhaseId = phase.transitions[0].nextPhase;
      if (!game.advanceScenario(nextPhaseId)) nextPhaseId = null;
      else {
        const sequence = game.settleQuestSequenceTerminalPhase();
        if (sequence) { nextPhaseId = null; nextQuestId = sequence.nextQuestId; }
      }
    }
    else if (phaseCompleted && phase.transitions.length === 0) {
      game.completeCurrentScenarioPhase();
      const sequence = game.advanceQuestSequence({ outcome: "completed" });
      if (sequence) { nextPhaseId = null; nextQuestId = sequence.nextQuestId; }
    }
    const result = { type: "quest_progressed", phaseId: phase.id, completedObjectiveIds, phaseCompleted, nextPhaseId, nextQuestId, appliedEvents };
    game.eventLog.push({ ...result, at: game.now() });
    return result;
  }

  #matches(trigger, event, game) {
    if (!trigger) return false;
    if (trigger.type === "locationPlaced") return event.type === "LocationPlaced" && event.locationSlotId === trigger.locationSlotId;
    if (trigger.type === "enterLocation") {
      if (event.type !== "LocationEntered") return false;
      const binding = game.scenarioLocationBindings.find((candidate) => candidate.locationId === event.locationId);
      return binding?.locationSlotId === trigger.locationSlotId;
    }
    if (trigger.type === "interactionCompleted") {
      if (event.type !== "InteractionCompleted" || event.interactionId !== trigger.interactionId) return false;
      if (!trigger.locationSlotId) return true;
      const binding = game.scenarioLocationBindings.find((candidate) => candidate.locationId === event.locationId);
      return binding?.locationSlotId === trigger.locationSlotId;
    }
    if (trigger.type === "traceInspected") return event.type === "TraceInspected" && event.traceId === trigger.traceId;
    if (trigger.type === "battleWon") {
      if (event.type !== "BattleWon") return false;
      const binding = game.scenarioLocationBindings.find((candidate) => candidate.locationId === event.locationId);
      return binding?.locationSlotId === trigger.locationSlotId;
    }
    if (trigger.type === "evacuationReady") {
      if (event.type !== "InteractionCompleted" || event.interactionId !== trigger.interactionId) return false;
      const source = game.getLocationForScenarioSlot(trigger.locationSlotId);
      const ready = (source.population ?? 0) === 0 && (source.resources.stock.population ?? 0) === 0 && source.dismantlings.length === 0;
      if (ready && game.evacuationStates[trigger.evacuationId]) { const state = game.evacuationStates[trigger.evacuationId]; state.departedAt = game.now(); state.resourcesRemaining = structuredClone(source.resources.stock); state.structuresRemaining = Object.values(source.infrastructure).reduce((sum, level) => sum + level, 0); }
      return ready;
    }
    if (trigger.type === "resourceDelivery") {
      if (event.type !== "InteractionCompleted" || event.interactionId !== trigger.interactionId) return false;
      const binding = game.scenarioLocationBindings.find((candidate) => candidate.locationId === event.locationId);
      if (binding?.locationSlotId !== trigger.locationSlotId) return false;
      const hero = game.getPlayer(trigger.playerId ?? "local")?.heroIds.map((id) => game.getHero(id)).find((candidate) => candidate !== null) ?? null;
      return hero !== null && hero.getResourceAmount(trigger.resource) >= trigger.amount;
    }
    if (trigger.type === "resourceCollection") {
      if (event.type !== "InteractionCompleted" || event.interactionId !== trigger.interactionId) return false;
      const binding = game.scenarioLocationBindings.find((candidate) => candidate.locationId === event.locationId);
      const source = binding?.locationSlotId === trigger.locationSlotId ? game.getLocation(event.locationId) : null;
      return source !== null && (source.resources.stock[trigger.resource] ?? 0) >= trigger.amount;
    }
    return false;
  }
}
